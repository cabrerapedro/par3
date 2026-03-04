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
  const poseRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const landmarkBufferRef = useRef<Landmark[][]>([])
  const stageRef = useRef<Stage>('loading')
  const marksRef = useRef<CalibrationMark[]>([])

  const recognitionRef = useRef<any>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStreamRef = useRef<MediaStream | null>(null)

  // Video recording refs
  const videoRecorderRef = useRef<MediaRecorder | null>(null)
  const skeletonRecorderRef = useRef<MediaRecorder | null>(null)
  const videoChunksRef = useRef<Blob[]>([])
  const skeletonChunksRef = useRef<Blob[]>([])
  const recordingStartedRef = useRef(false)
  const recordingStartTimeRef = useRef<number>(0)

  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [marks, setMarks] = useState<CalibrationMark[]>([])
  const [poseDetected, setPoseDetected] = useState(false)
  const [saveNote, setSaveNote] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [error, setError] = useState('')
  const [markNoteIndex, setMarkNoteIndex] = useState<number | null>(null)
  const [markDictating, setMarkDictating] = useState(false)
  const [markNoteText, setMarkNoteText] = useState('')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const markRecognitionRef = useRef<any>(null)

  // Sync stage to ref for use in callbacks
  const setStageSync = (s: Stage) => { stageRef.current = s; setStage(s) }
  const setMarksSync = (m: CalibrationMark[]) => { marksRef.current = m; setMarks(m) }

  useEffect(() => {
    if (!instructor) { router.replace('/instructor/login'); return }
    loadCheckpoint()
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      const cameras = devices.filter(d => d.kind === 'videoinput')
      setHasMultipleCameras(cameras.length > 1)
    }).catch(() => {})
    return () => { stopCamera(); recognitionRef.current?.stop(); markRecognitionRef.current?.stop(); audioStreamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Warn before leaving with unsaved marks
  useEffect(() => {
    const hasUnsavedWork = marks.length > 0 && stage !== 'done' && stage !== 'saving'
    if (!hasUnsavedWork) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [marks.length, stage])

  async function loadCheckpoint() {
    const { data } = await supabase.from('checkpoints').select('*').eq('id', checkpointId).single()
    if (!data) { setError('Ejercicio no encontrado.'); return }
    setCheckpoint(data)
    setSaveNote(data.instructor_note ?? '')
    if (data.calibration_marks?.length) {
      setMarksSync(data.calibration_marks)
    }
    await initMediaPipe('environment')
    setStageSync('ready')
  }

  async function initMediaPipe(facing: 'user' | 'environment' = 'environment') {
    try {
      await loadMediaPipe()
      // createPose is a singleton — safe to call multiple times (HMR, re-mount)
      poseRef.current = createPose(onResults)
      await startCamera(facing)
    } catch (e: any) {
      if (e?.message === 'RELOAD_REQUIRED') {
        setError('RELOAD_REQUIRED')
        return
      }
      setError('Error al iniciar la cámara. Verifica los permisos.')
    }
  }

  async function startCamera(facing: 'user' | 'environment') {
    if (!videoRef.current) return
    cameraRef.current?.stop()
    recordingStartedRef.current = false
    const onFrame = async () => {
      if (poseRef.current && videoRef.current) {
        await poseRef.current.send({ image: videoRef.current })
      }
    }
    try {
      const cam = createCamera(videoRef.current, onFrame, facing)
      cameraRef.current = cam
      await cam.start()
    } catch {
      // Fallback: environment camera not available (e.g. desktop) → try user
      if (facing === 'environment') {
        setFacingMode('user')
        const cam = createCamera(videoRef.current, onFrame, 'user')
        cameraRef.current = cam
        await cam.start()
      } else {
        throw new Error('No camera available')
      }
    }
  }

  async function flipCamera() {
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacing)
    stopVideoRecording()
    await startCamera(newFacing)
  }

  function tryStartRecording(stream: MediaStream, recorderRef: React.MutableRefObject<MediaRecorder | null>, chunksRef: React.MutableRefObject<Blob[]>) {
    try {
      const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      chunksRef.current = []
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.start(1000)
      recorderRef.current = rec
    } catch { /* not supported on this device */ }
  }

  function stopVideoRecording() {
    if (videoRecorderRef.current?.state !== 'inactive') videoRecorderRef.current?.stop()
    if (skeletonRecorderRef.current?.state !== 'inactive') skeletonRecorderRef.current?.stop()
  }

  function getBlobFromChunks(chunks: Blob[]): Blob | null {
    if (chunks.length === 0) return null
    return new Blob(chunks, { type: chunks[0].type || 'video/webm' })
  }

  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    // Start recording on first frame after camera is confirmed running
    if (!recordingStartedRef.current) {
      recordingStartedRef.current = true
      recordingStartTimeRef.current = Date.now()
      const rawStream = video.srcObject as MediaStream
      if (rawStream) tryStartRecording(rawStream, videoRecorderRef, videoChunksRef)
      try {
        const skelStream = canvas.captureStream(15)
        tryStartRecording(skelStream, skeletonRecorderRef, skeletonChunksRef)
      } catch { /* captureStream not supported */ }
    }

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

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

  // Per-mark dictation
  function saveMarkNote() {
    if (markNoteIndex === null) return
    const text = markNoteText.trim()
    if (text) {
      const updated = [...marksRef.current]
      if (updated[markNoteIndex]) {
        updated[markNoteIndex] = { ...updated[markNoteIndex], note: text }
        setMarksSync(updated)
      }
    }
  }

  function stopMarkDictation() {
    markRecognitionRef.current?.stop()
    markRecognitionRef.current = null
    setMarkDictating(false)
  }

  function startMarkDictation() {
    stopMarkDictation()
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const r = new SR()
    r.lang = 'es-MX'
    r.continuous = true
    r.interimResults = false
    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .filter((res: any) => res.isFinal)
        .map((res: any) => res[0].transcript)
        .join(' ')
      if (transcript) setMarkNoteText(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    r.onend = () => setMarkDictating(false)
    markRecognitionRef.current = r
    r.start()
    setMarkDictating(true)
  }

  function toggleMarkDictation() {
    if (markDictating) stopMarkDictation()
    else startMarkDictation()
  }

  function dismissMarkNote() {
    stopMarkDictation()
    saveMarkNote()
    setMarkNoteIndex(null)
    setMarkNoteText('')
  }

  function stopCamera() {
    stopVideoRecording()
    cameraRef.current?.stop()
  }

  function handleBien() {
    if (!checkpoint || landmarkBufferRef.current.length === 0) return

    // Save note from previous mark if active
    if (markNoteIndex !== null) {
      stopMarkDictation()
      saveMarkNote()
    }

    // Average last up to 6 frames
    const frames = landmarkBufferRef.current.slice(-6)
    const avgLandmarks = averageLandmarks(frames)
    const metrics = calculateMetrics(avgLandmarks, checkpoint.camera_angle)

    const mark: CalibrationMark = {
      timestamp_ms: Date.now(),
      relative_ms: recordingStartTimeRef.current > 0
        ? Date.now() - recordingStartTimeRef.current
        : undefined,
      landmarks: avgLandmarks,
      metrics,
    }

    const newMarks = [...marksRef.current, mark]
    setMarksSync(newMarks)

    // Show note input for this new mark
    setMarkNoteIndex(newMarks.length - 1)
    setMarkNoteText('')

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
    // Save any pending mark note
    if (markNoteIndex !== null) {
      stopMarkDictation()
      saveMarkNote()
      setMarkNoteIndex(null)
    }
    setStageSync('saving')

    const baseline = calculateBaseline(marks, checkpoint.selected_metrics)

    // Stop video recordings and collect blobs
    stopVideoRecording()
    // Wait briefly for onstop to fire
    await new Promise(r => setTimeout(r, 300))
    const videoBlob = getBlobFromChunks(videoChunksRef.current)
    const skeletonBlob = getBlobFromChunks(skeletonChunksRef.current)

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

    // Upload raw video
    let videoUrl: string | null = null
    if (videoBlob) {
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const path = `${checkpointId}/video-${Date.now()}.${ext}`
      const { data: vUp } = await supabase.storage
        .from('calibration-videos')
        .upload(path, videoBlob, { contentType: videoBlob.type, upsert: true })
      if (vUp) {
        const { data: { publicUrl } } = supabase.storage.from('calibration-videos').getPublicUrl(path)
        videoUrl = publicUrl
      }
    }

    // Upload skeleton video
    let skeletonUrl: string | null = null
    if (skeletonBlob) {
      const ext = skeletonBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const path = `${checkpointId}/skeleton-${Date.now()}.${ext}`
      const { data: sUp } = await supabase.storage
        .from('calibration-videos')
        .upload(path, skeletonBlob, { contentType: skeletonBlob.type, upsert: true })
      if (sUp) {
        const { data: { publicUrl } } = supabase.storage.from('calibration-videos').getPublicUrl(path)
        skeletonUrl = publicUrl
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
        ...(videoUrl && { calibration_video_url: videoUrl }),
        ...(skeletonUrl && { calibration_skeleton_url: skeletonUrl }),
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
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4 text-center">
      {error === 'RELOAD_REQUIRED' ? (
        <>
          <p className="text-foreground font-semibold">La cámara necesita reiniciarse</p>
          <p className="text-muted-foreground text-sm max-w-xs">Esto puede pasar después de una actualización. Recarga la página para continuar.</p>
          <button onClick={() => window.location.reload()} className="bg-ok text-on-ok font-semibold text-sm rounded-xl px-5 py-2.5 hover:bg-ok/90 transition-all">
            Recargar página
          </button>
        </>
      ) : (
        <>
          <p className="text-bad">{error}</p>
          <Link href={`/instructor/students/${studentId}/checkpoints/${checkpointId}`} className="text-ok hover:underline text-sm">
            ← Volver al ejercicio
          </Link>
        </>
      )}
    </main>
  )

  if (stage === 'done') return <SavedScreen studentId={studentId} checkpointId={checkpointId} marks={marks} checkpoint={checkpoint} />

  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-background/90 backdrop-blur">
        <Link href={checkpoint?.status === 'calibrated' ? `/instructor/students/${studentId}/checkpoints/${checkpointId}` : `/instructor/students/${studentId}`} className="flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {checkpoint?.name ?? 'Calibración'}
        </Link>
        <div className="flex items-center gap-2">
          {stage !== 'loading' && (
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              poseDetected
                ? 'text-ok border-ok/30 bg-ok/10'
                : 'text-warn border-warn/30 bg-warn/10'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${poseDetected ? 'bg-ok' : 'bg-warn animate-pulse'}`} />
              {poseDetected ? 'Pose detectada' : 'Sin persona en cámara'}
            </div>
          )}
          {stage !== 'loading' && hasMultipleCameras && (
            <button
              onClick={flipCamera}
              title="Cambiar cámara"
              className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-ok/30 transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" />
                <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                <circle cx="12" cy="12" r="3" />
                <path d="m18 22-3-3 3-3" />
                <path d="m6 2 3 3-3 3" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Camera + Controls wrapper — stacked on mobile, side-by-side on desktop */}
      <div className="flex-1 flex flex-col lg:flex-row" style={{ minHeight: 0 }}>

      {/* Camera + Canvas */}
      <div className="relative flex-1 bg-black overflow-hidden" style={{ minHeight: 0 }}>
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
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
            <p className="text-foreground">Calculando referencia personal...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 bg-background border-t lg:border-t-0 lg:border-l border-border px-4 py-4 lg:w-80 lg:overflow-y-auto">
        {stage === 'saving' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="w-8 h-8 rounded-full border-2 border-ok border-t-transparent animate-spin" />
            <p className="text-foreground text-sm font-medium">Calculando referencia personal...</p>
            <p className="text-muted-foreground text-xs">{marks.length} marca{marks.length !== 1 ? 's' : ''}</p>
          </div>
        ) : stage === 'recording' ? (
          <div className="flex flex-col gap-3">
            {/* Mark list — scrollable */}
            {marks.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {marks.map((mark, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all ${
                      markNoteIndex === i
                        ? 'bg-card border border-ok/20'
                        : 'bg-secondary/50'
                    }`}
                  >
                    <span className="text-xs font-mono text-ok shrink-0 w-6">#{i + 1}</span>
                    {mark.relative_ms != null && (
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {Math.floor(mark.relative_ms / 60000)}:{String(Math.floor((mark.relative_ms / 1000) % 60)).padStart(2, '0')}
                      </span>
                    )}
                    {markNoteIndex === i ? (
                      <input
                        type="text"
                        value={markNoteText}
                        onChange={e => setMarkNoteText(e.target.value)}
                        placeholder="Nota..."
                        autoFocus
                        className="flex-1 text-xs bg-transparent text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-w-0"
                      />
                    ) : (
                      <span className="flex-1 text-xs text-muted-foreground truncate">
                        {mark.note || '—'}
                      </span>
                    )}
                    {markNoteIndex === i && (
                      <>
                        <button
                          onClick={toggleMarkDictation}
                          className={`shrink-0 w-7 h-7 rounded-md border flex items-center justify-center transition-all ${
                            markDictating
                              ? 'bg-bad/20 border-bad/40 text-bad animate-pulse'
                              : 'bg-secondary border-border text-muted-foreground hover:border-ok/40 hover:text-ok'
                          }`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="2" width="6" height="11" rx="3" />
                            <path d="M5 10a7 7 0 0 0 14 0" />
                            <line x1="12" y1="19" x2="12" y2="22" />
                          </svg>
                        </button>
                        <button
                          onClick={dismissMarkNote}
                          className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* BIEN button */}
            <button
              onPointerDown={handleBien}
              className="w-full bg-ok text-on-ok font-bold text-xl rounded-2xl active:scale-[0.96] transition-transform select-none"
              style={{ minHeight: 88 }}
            >
              ✓ Bien
            </button>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={marks.length < 1}
                className="flex-1 bg-secondary border border-ok/30 text-ok font-semibold text-sm rounded-xl py-3 hover:bg-ok/10 transition-all disabled:opacity-40"
              >
                Guardar ({marks.length})
              </button>
              <button
                onClick={() => { dismissMarkNote(); setStageSync('ready') }}
                className="bg-card border border-border text-muted-foreground text-sm rounded-xl px-4 py-3 hover:border-bad/40 hover:text-bad transition-all"
              >
                Cancelar
              </button>
            </div>
            <p className="text-muted-foreground/60 text-xs text-center">2–5 marcas ideal</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {marks.length > 0 && (
              <div className="bg-card border border-ok/20 rounded-xl px-4 py-3 text-center">
                <p className="text-ok text-sm font-semibold">{marks.length} marca{marks.length !== 1 ? 's' : ''} guardada{marks.length !== 1 ? 's' : ''}</p>
                <p className="text-muted-foreground text-xs mt-0.5">Puedes añadir más marcas o guardar el ejercicio</p>
              </div>
            )}

            {/* Voice / text note */}
            <div className="bg-card border border-border rounded-xl px-3 py-3">
              <div className="flex items-center justify-between mb-2">
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
                  rows={4}
                  className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-ok/40"
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
              className="w-full bg-ok text-on-ok font-bold text-lg rounded-2xl py-5 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {stage === 'loading' ? 'Iniciando cámara...' : marks.length > 0 ? '+ Añadir más marcas' : 'Iniciar calibración'}
            </button>
            {marks.length >= 1 && (
              <button
                onClick={handleSave}
                className="w-full bg-card border border-ok/30 text-ok font-semibold rounded-xl py-3.5 hover:bg-ok/10 transition-all"
              >
                Guardar referencia ({marks.length} marca{marks.length !== 1 ? 's' : ''})
              </button>
            )}
          </div>
        )}
      </div>

      </div>{/* end Camera + Controls wrapper */}
    </main>
  )
}

function SavedScreen({ studentId, checkpointId, marks, checkpoint }: {
  studentId: string
  checkpointId: string
  marks: CalibrationMark[]
  checkpoint: Checkpoint | null
}) {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 text-center">
      <div
        className="w-20 h-20 rounded-[20px] bg-ok/10 border border-ok/20 flex items-center justify-center mb-6"
        style={{ animation: 'fade-up 0.8s ease-out both' }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" className="text-ok">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div style={{ animation: 'fade-up 0.8s ease-out 100ms both' }}>
        <h1 className="text-2xl font-bold text-foreground mb-2">Ejercicio calibrado</h1>
        <p className="text-muted-foreground mb-1">
          {marks.length} posición{marks.length !== 1 ? 'es' : ''} buena{marks.length !== 1 ? 's' : ''} capturada{marks.length !== 1 ? 's' : ''}
        </p>
        <p className="text-muted-foreground text-sm mb-8">La referencia personal de este alumno está guardada</p>
      </div>
      <div
        className="flex flex-col gap-3 w-full max-w-xs"
        style={{ animation: 'fade-up 0.8s ease-out 200ms both' }}
      >
        <button
          onClick={() => router.replace(`/instructor/students/${studentId}/checkpoints/${checkpointId}`)}
          className="h-12 bg-ok text-on-ok font-semibold rounded-xl hover:bg-ok/90 transition-all duration-300"
        >
          Ver ejercicio
        </button>
        <button
          onClick={() => router.replace(`/instructor/students/${studentId}`)}
          className="h-12 bg-card border border-border text-foreground font-medium rounded-xl hover:bg-secondary transition-all duration-300"
        >
          Ver todos los ejercicios
        </button>
      </div>
    </main>
  )
}
