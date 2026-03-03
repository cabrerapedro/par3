'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { calculateMetrics, averageLandmarks, calculateBaseline } from '@/lib/baseline'
import { loadMediaPipe, createPose, createCamera } from '@/lib/mediapipe'
import type { Checkpoint, CalibrationMark, Landmark } from '@/lib/types'
import Link from 'next/link'

type Stage = 'loading' | 'ready' | 'recording' | 'saving' | 'done'

export default function CalibratePage() {
  const { instructor } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const checkpointId = params.checkpointId as string

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const poseRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const landmarkBufferRef = useRef<Landmark[][]>([])
  const stageRef = useRef<Stage>('loading')
  const marksRef = useRef<CalibrationMark[]>([])

  const recognitionRef = useRef<any>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStreamRef = useRef<MediaStream | null>(null)

  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [marks, setMarks] = useState<CalibrationMark[]>([])
  const [poseDetected, setPoseDetected] = useState(false)
  const [saveNote, setSaveNote] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [error, setError] = useState('')

  // Sync stage to ref for use in callbacks
  const setStageSync = (s: Stage) => { stageRef.current = s; setStage(s) }
  const setMarksSync = (m: CalibrationMark[]) => { marksRef.current = m; setMarks(m) }

  useEffect(() => {
    if (!instructor) { router.replace('/instructor/login'); return }
    loadCheckpoint()
    return () => { stopCamera(); recognitionRef.current?.stop(); audioStreamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  async function loadCheckpoint() {
    const { data } = await supabase.from('checkpoints').select('*').eq('id', checkpointId).single()
    if (!data) { setError('Checkpoint no encontrado.'); return }
    setCheckpoint(data)
    setSaveNote(data.instructor_note ?? '')
    if (data.calibration_marks?.length) {
      setMarksSync(data.calibration_marks)
    }
    await initMediaPipe()
    setStageSync('ready')
  }

  async function initMediaPipe() {
    try {
      await loadMediaPipe()
      const pose = createPose(onResults)
      poseRef.current = pose

      if (videoRef.current) {
        const cam = createCamera(videoRef.current, async () => {
          if (poseRef.current && videoRef.current) {
            await poseRef.current.send({ image: videoRef.current })
          }
        })
        cameraRef.current = cam
        await cam.start()
      }
    } catch (e) {
      setError('Error al iniciar la cámara. Verifica los permisos.')
    }
  }

  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const lm = results.poseLandmarks
    if (lm) {
      setPoseDetected(true)
      landmarkBufferRef.current.push(lm)
      if (landmarkBufferRef.current.length > 30) landmarkBufferRef.current.shift()

      const drawConnectors = (window as any).drawConnectors
      const drawLandmarks = (window as any).drawLandmarks
      const POSE_CONNECTIONS = (window as any).POSE_CONNECTIONS

      if (drawConnectors && POSE_CONNECTIONS) {
        drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: '#34d178', lineWidth: 2 })
        drawLandmarks(ctx, lm, { color: '#060a08', fillColor: '#34d178', lineWidth: 1, radius: 4 })
      }
    } else {
      setPoseDetected(false)
      landmarkBufferRef.current = []
    }
  }, [])

  async function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    // Start audio recording for saving
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      audioStreamRef.current = stream
      audioChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start(100)
      audioRecorderRef.current = recorder
    } catch { /* mic access denied — transcription only */ }

    // Start transcription
    const r = new SR()
    r.lang = 'es-MX'
    r.continuous = true
    r.interimResults = false
    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .filter((res: any) => res.isFinal)
        .map((res: any) => res[0].transcript)
        .join(' ')
      if (transcript) setSaveNote(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    r.onend = () => setIsVoiceRecording(false)
    recognitionRef.current = r
    r.start()
    setIsVoiceRecording(true)
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    setIsVoiceRecording(false)

    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      audioRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: audioChunksRef.current[0]?.type || 'audio/webm',
        })
        setAudioBlob(blob)
      }
      audioRecorderRef.current.stop()
    }
    audioStreamRef.current?.getTracks().forEach(t => t.stop())
  }

  function stopCamera() {
    cameraRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  function handleBien() {
    if (!checkpoint || landmarkBufferRef.current.length === 0) return

    // Average last up to 6 frames
    const frames = landmarkBufferRef.current.slice(-6)
    const avgLandmarks = averageLandmarks(frames)
    const metrics = calculateMetrics(avgLandmarks, checkpoint.camera_angle)

    const mark: CalibrationMark = {
      timestamp_ms: Date.now(),
      landmarks: avgLandmarks,
      metrics,
    }

    const newMarks = [...marksRef.current, mark]
    setMarksSync(newMarks)

    // Brief visual flash
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = 'rgba(52, 209, 120, 0.25)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        setTimeout(() => ctx.clearRect(0, 0, canvas.width, canvas.height), 200)
      }
    }
  }

  async function handleSave() {
    if (!checkpoint || marks.length === 0) return
    setStageSync('saving')

    const baseline = calculateBaseline(marks)

    // Upload audio note if recorded
    let audioUrl: string | null = null
    if (audioBlob) {
      const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm'
      const path = `${checkpointId}/note-${Date.now()}.${ext}`
      const { data: up } = await supabase.storage
        .from('instructor-notes')
        .upload(path, audioBlob, { contentType: audioBlob.type, upsert: true })
      if (up) {
        const { data: { publicUrl } } = supabase.storage.from('instructor-notes').getPublicUrl(path)
        audioUrl = publicUrl
      }
    }

    const { error: updateErr } = await supabase
      .from('checkpoints')
      .update({
        calibration_marks: marks,
        baseline,
        status: 'calibrated',
        instructor_note: saveNote || null,
        instructor_audio_url: audioUrl,
      })
      .eq('id', checkpointId)

    if (updateErr) {
      setError('Error al guardar. Intenta de nuevo.')
      setStageSync('recording')
      return
    }

    stopCamera()
    setStageSync('done')
  }

  if (error) return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4">
      <p className="text-bad">{error}</p>
      <Link href={`/instructor/students/${studentId}`} className="text-ok hover:underline text-sm">
        ← Volver al alumno
      </Link>
    </main>
  )

  if (stage === 'done') return <SavedScreen studentId={studentId} marks={marks} checkpoint={checkpoint} />

  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-background/90 backdrop-blur">
        <Link href={`/instructor/students/${studentId}`} className="text-muted-foreground text-sm hover:text-muted-foreground">
          ← {checkpoint?.name ?? 'Calibración'}
        </Link>
        <div className="flex items-center gap-3">
          {!poseDetected && stage !== 'loading' && (
            <span className="text-warn text-xs">Buscando pose...</span>
          )}
          {poseDetected && (
            <span className="text-ok text-xs">● Pose detectada</span>
          )}
        </div>
      </header>

      {/* Camera + Canvas */}
      <div className="relative flex-1 bg-black overflow-hidden" style={{ minHeight: 0 }}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
        />

        {/* Mark counter */}
        {marks.length > 0 && (
          <div className="absolute top-4 right-4 bg-background/80 backdrop-blur border border-ok/30 rounded-xl px-3 py-2 text-center">
            <p className="text-ok font-bold text-2xl leading-none">{marks.length}</p>
            <p className="text-muted-foreground text-xs mt-0.5">marcas</p>
          </div>
        )}

        {/* Saving overlay */}
        {stage === 'saving' && (
          <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-ok border-t-transparent animate-spin" />
            <p className="text-foreground">Calculando baseline...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 bg-background border-t border-border px-4 py-4">
        {stage === 'recording' ? (
          <div className="flex flex-col gap-3">
            {/* BIEN button */}
            <button
              onPointerDown={handleBien}
              className="w-full bg-ok text-black font-bold text-xl rounded-2xl active:scale-[0.96] transition-transform select-none"
              style={{ minHeight: 88 }}
            >
              ✓ Bien
            </button>
            <div className="flex gap-3">
              <div className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-center">
                <p className="text-muted-foreground text-xs">Marcas mínimas: 2</p>
                <p className="text-muted-foreground text-xs">recomendadas: 3-5</p>
              </div>
              <button
                onClick={() => {
                  if (marks.length === 0) { setStageSync('ready'); return }
                  setStageSync('ready')
                }}
                className="bg-card border border-border text-muted-foreground text-sm rounded-xl px-4 py-2.5 hover:border-bad/40 hover:text-bad transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={marks.length < 1}
                className="bg-secondary border border-ok/30 text-ok font-semibold text-sm rounded-xl px-4 py-2.5 hover:bg-ok/10 transition-all disabled:opacity-40"
              >
                Guardar ({marks.length})
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {marks.length > 0 && (
              <div className="bg-card border border-ok/20 rounded-xl px-4 py-3 text-center">
                <p className="text-ok text-sm font-semibold">{marks.length} marca{marks.length !== 1 ? 's' : ''} guardada{marks.length !== 1 ? 's' : ''}</p>
                <p className="text-muted-foreground text-xs mt-0.5">Puedes añadir más o guardar el checkpoint</p>
              </div>
            )}

            {/* Voice / text note */}
            <div className="bg-card border border-border rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted-foreground">Nota para el alumno</p>
                {audioBlob && (
                  <span className="text-xs text-ok flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
                    Audio guardado
                  </span>
                )}
              </div>
              <div className="flex gap-2 items-start">
                <textarea
                  value={saveNote}
                  onChange={e => setSaveNote(e.target.value)}
                  placeholder="Dicta o escribe una nota..."
                  rows={2}
                  className="flex-1 bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-ok/40"
                />
                <button
                  onPointerDown={isVoiceRecording ? stopVoice : startVoice}
                  title={isVoiceRecording ? 'Detener dictado' : 'Dictar nota'}
                  className={`flex-shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
                    isVoiceRecording
                      ? 'bg-bad/20 border-bad/40 text-bad animate-pulse'
                      : 'bg-secondary border-border text-muted-foreground hover:border-ok/40 hover:text-ok'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="11" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="8" y1="22" x2="16" y2="22" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              onClick={() => setStageSync('recording')}
              disabled={!poseDetected || stage === 'loading'}
              className="w-full bg-ok text-black font-bold text-lg rounded-2xl py-5 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {stage === 'loading' ? 'Iniciando cámara...' : marks.length > 0 ? '+ Añadir más marcas' : 'Iniciar calibración'}
            </button>
            {marks.length >= 1 && (
              <button
                onClick={handleSave}
                className="w-full bg-card border border-ok/30 text-ok font-semibold rounded-xl py-3.5 hover:bg-ok/10 transition-all"
              >
                Guardar baseline ({marks.length} marca{marks.length !== 1 ? 's' : ''})
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function SavedScreen({ studentId, marks, checkpoint }: {
  studentId: string
  marks: CalibrationMark[]
  checkpoint: Checkpoint | null
}) {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 text-center">
      <div className="text-ok text-5xl mb-4">✓</div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Checkpoint calibrado</h1>
      <p className="text-muted-foreground mb-1">{marks.length} momento{marks.length !== 1 ? 's' : ''} buenos capturado{marks.length !== 1 ? 's' : ''}</p>
      <p className="text-muted-foreground text-sm mb-8">El baseline personal de este alumno está guardado</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => router.push(`/instructor/students/${studentId}`)}
          className="bg-ok text-black font-semibold rounded-xl py-3.5 hover:opacity-90 transition-all"
        >
          Ver journey del alumno
        </button>
      </div>
    </main>
  )
}
