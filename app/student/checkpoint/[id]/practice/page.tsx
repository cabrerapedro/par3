'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  calculateMetrics, compareToBaseline, baselineOverallStatus,
  generateBaselineSummary, METRICS_BY_ANGLE, isSwingBaseline,
  detectSwingPhases, compareSwingToBaseline, generateSwingSummary,
  PHASE_LABELS
} from '@/lib/baseline'
import { loadMediaPipe, createPose } from '@/lib/mediapipe'
import type { Checkpoint, Baseline, Landmark, SwingBaseline } from '@/lib/types'
import type { BaselineCheck, SwingPhaseCheck } from '@/lib/baseline'
import Link from 'next/link'

type Stage = 'input' | 'recording' | 'processing' | 'results'

interface FrameResult {
  checks: BaselineCheck[]
}

export default function StudentPractice() {
  const { student } = useAuth()
  const router = useRouter()
  const params = useParams()
  const cpId = params.id as string

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pendingStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [stage, setStage] = useState<Stage>('input')
  const [cameraReady, setCameraReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [frameResults, setFrameResults] = useState<FrameResult[]>([])
  const [summary, setSummary] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [error, setError] = useState('')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [recordingVisibleCount, setRecordingVisibleCount] = useState(-1)
  const [swingPhaseChecks, setSwingPhaseChecks] = useState<SwingPhaseCheck[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingSecondsRef = useRef(0)
  const poseCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkpointRef = useRef<Checkpoint | null>(null)

  // Callback ref: auto-attach pending stream when the video element mounts
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (node && pendingStreamRef.current) {
      node.srcObject = pendingStreamRef.current
      node.play().catch(() => {})
      pendingStreamRef.current = null
      setCameraReady(true)
    }
  }, [])

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    loadCheckpoint()
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setHasMultipleCameras(devices.filter(d => d.kind === 'videoinput').length > 1)
    }).catch(() => {})
    return () => cleanupRecording()
  }, [])

  async function loadCheckpoint() {
    const { data } = await supabase.from('checkpoints').select('*').eq('id', cpId).single()
    if (!data?.baseline) { setError('Este ejercicio aún no tiene referencia.'); return }
    setCheckpoint(data)
    checkpointRef.current = data
  }

  async function startRecording(facing: 'user' | 'environment' = 'environment') {
    setFacingMode(facing)
    setCameraReady(false)
    setRecordingSeconds(0)
    recordingSecondsRef.current = 0

    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: facing },
          audio: false,
        })
      } catch {
        if (facing === 'environment') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: 'user' },
            audio: false,
          })
          setFacingMode('user')
        } else {
          throw new Error('No camera')
        }
      }

      streamRef.current = stream

      // Store stream for the callback ref to pick up when video element mounts
      pendingStreamRef.current = stream

      // Setup MediaRecorder (doesn't need the video element)
      chunksRef.current = []
      const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mimeTypeRef.current = recorder.mimeType || mimeType || 'video/webm'
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(100)
      recorderRef.current = recorder

      // Show recording UI — the callback ref will attach the stream to the video element
      setStage('recording')

      // If video element already exists (e.g. re-recording), attach directly
      if (videoRef.current && pendingStreamRef.current) {
        videoRef.current.srcObject = pendingStreamRef.current
        videoRef.current.play().catch(() => {})
        pendingStreamRef.current = null
        setCameraReady(true)
      }

      timerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1
        setRecordingSeconds(s => s + 1)
      }, 1000)

      // Start live visibility checking
      startVisibilityCheck()
    } catch {
      setError('No se pudo acceder a la cámara. Verifica los permisos.')
      setStage('input')
    }
  }

  async function flipCamera() {
    stopVisibilityCheck()
    if (timerRef.current) clearInterval(timerRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    chunksRef.current = []
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    await startRecording(newFacing)
  }

  function stopVisibilityCheck() {
    if (poseCheckIntervalRef.current) {
      clearInterval(poseCheckIntervalRef.current)
      poseCheckIntervalRef.current = null
    }
    setRecordingVisibleCount(-1)
  }

  async function startVisibilityCheck() {
    stopVisibilityCheck()
    const cp = checkpointRef.current
    if (!cp) return
    try {
      await loadMediaPipe()
      const pose = await createPose(() => {})
      pose.onResults((results: any) => {
        if (!results.poseLandmarks) { setRecordingVisibleCount(0); return }
        const metrics = calculateMetrics(results.poseLandmarks, cp.camera_angle)
        const expected = cp.selected_metrics?.length
          ? cp.selected_metrics
          : METRICS_BY_ANGLE[cp.camera_angle] ?? []
        setRecordingVisibleCount(Object.keys(metrics).filter(k => expected.includes(k)).length)
      })
      poseCheckIntervalRef.current = setInterval(async () => {
        if (videoRef.current) {
          try { await pose.send({ image: videoRef.current }) } catch {}
        }
      }, 1000)
    } catch { /* MediaPipe not available */ }
  }

  function cleanupRecording() {
    stopVisibilityCheck()
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  function stopRecording() {
    stopVisibilityCheck()
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = () => processVideo()
      recorderRef.current.stop()
    } else {
      processVideo()
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await analyzeVideoBlob(file)
  }

  async function processVideo() {
    if (!chunksRef.current.length) { setError('No se grabó video.'); return }
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'video/webm' })
    await analyzeVideoBlob(blob)
  }

  async function resolveVideoDuration(video: HTMLVideoElement): Promise<number> {
    await new Promise<void>(res => {
      if (video.readyState >= 1) { res(); return }
      const handler = () => { video.removeEventListener('loadedmetadata', handler); res() }
      video.addEventListener('loadedmetadata', handler)
      setTimeout(res, 5000)
    })

    if (isFinite(video.duration) && video.duration > 0) return video.duration

    // WebM from MediaRecorder has Infinity duration — seek to end to resolve
    await new Promise<void>(res => {
      video.currentTime = 1e10
      const handler = () => { video.removeEventListener('seeked', handler); res() }
      video.addEventListener('seeked', handler)
      setTimeout(res, 3000)
    })

    if (isFinite(video.duration) && video.duration > 0) {
      const dur = video.duration
      await new Promise<void>(res => {
        video.currentTime = 0
        const handler = () => { video.removeEventListener('seeked', handler); res() }
        video.addEventListener('seeked', handler)
        setTimeout(res, 1000)
      })
      return dur
    }

    // Last resort: use the recording timer
    return recordingSecondsRef.current || 10
  }

  async function analyzeVideoBlob(blob: Blob) {
    if (!checkpoint?.baseline) { setError('Sin referencia personal.'); return }
    setStage('processing')
    setProgress(0)
    setSwingPhaseChecks([])

    const isSwingMode = checkpoint.checkpoint_type === 'swing' || isSwingBaseline(checkpoint.baseline)

    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.load()

    const duration = await resolveVideoDuration(video)
    if (duration <= 0) { setError('No se pudo leer el video.'); URL.revokeObjectURL(url); return }

    const fps = 10
    const step = 1 / fps
    const totalFrames = Math.min(Math.floor(duration * fps), 600)

    await loadMediaPipe()
    const pose = await createPose(() => {})

    const results: FrameResult[] = []
    const allLandmarks: Landmark[][] = []
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')!

    let resolveFrame: (() => void) | null = null
    let frameChecks: BaselineCheck[] = []
    pose.onResults((r: any) => {
      frameChecks = []
      if (r.poseLandmarks) {
        if (isSwingMode) {
          // Collect landmarks for phase detection
          allLandmarks.push(r.poseLandmarks.map((lm: any) => ({
            x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility,
          })))
        } else {
          const metrics = calculateMetrics(r.poseLandmarks, checkpoint.camera_angle)
          frameChecks = compareToBaseline(metrics, checkpoint.baseline as Baseline, checkpoint.selected_metrics)
        }
      }
      resolveFrame?.()
      resolveFrame = null
    })

    for (let i = 0; i < totalFrames; i++) {
      video.currentTime = i * step
      await new Promise<void>(res => {
        const handler = () => { video.removeEventListener('seeked', handler); res() }
        video.addEventListener('seeked', handler)
        setTimeout(res, 800)
      })

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      frameChecks = []

      await new Promise<void>(res => {
        resolveFrame = res
        pose.send({ image: canvas }).catch(() => { resolveFrame = null; res() })
        setTimeout(() => { resolveFrame = null; res() }, 1500)
      })

      if (!isSwingMode && frameChecks.length) results.push({ checks: frameChecks })
      setProgress(Math.round((i + 1) / totalFrames * 100))
    }

    if (isSwingMode) {
      // Swing mode: detect phases and compare
      if (allLandmarks.length < 10) {
        setError('No se detectó suficiente pose en el video. Asegúrate de que te veas completo.')
        URL.revokeObjectURL(url)
        return
      }

      const phases = detectSwingPhases(allLandmarks, checkpoint.camera_angle)
      if (!phases) {
        setError('No se detectó un swing en el video. Graba un swing completo de principio a fin.')
        URL.revokeObjectURL(url)
        return
      }

      const swingBaseline = checkpoint.baseline as SwingBaseline
      const phaseChecks = compareSwingToBaseline(phases, swingBaseline, checkpoint.selected_metrics)

      setPreviewUrl(url)
      setSwingPhaseChecks(phaseChecks)
      setSummary(generateSwingSummary(phaseChecks))

      if (student && checkpoint) {
        const allChecks = phaseChecks.flatMap(pc => pc.checks)
        const overall_score = allChecks.length > 0
          ? Math.round(allChecks.filter(c => c.status === 'ok').length / allChecks.length * 100)
          : 0
        const resultsMap = Object.fromEntries(
          phaseChecks.flatMap(pc =>
            pc.checks.map(c => [`${pc.phase}__${c.id}`, { value: 0, deviation: 0, status: c.status }])
          )
        )
        await supabase.from('practice_sessions').insert({
          student_id: student.id,
          checkpoint_id: checkpoint.id,
          date: new Date().toISOString(),
          duration_seconds: Math.round(allLandmarks.length / fps),
          results: resultsMap,
          overall_score,
        })
      }

      setStage('results')
    } else {
      // Position mode: aggregate frame results
      if (!results.length) {
        setError('No se detectó pose en el video. Asegúrate de que te veas completo.')
        URL.revokeObjectURL(url)
        return
      }

      const aggregated = aggregateFrameResults(results)

      setPreviewUrl(url)
      setFrameResults(results)
      setSummary(generateBaselineSummary(aggregated))

      if (student && checkpoint) {
        const overall_score = Math.round(
          aggregated.filter(c => c.status === 'ok').length / aggregated.length * 100
        )
        const resultsMap = Object.fromEntries(
          aggregated.map(c => [c.id, { value: 0, deviation: 0, status: c.status }])
        )
        await supabase.from('practice_sessions').insert({
          student_id: student.id,
          checkpoint_id: checkpoint.id,
          date: new Date().toISOString(),
          duration_seconds: Math.round(results.length / fps),
          results: resultsMap,
          overall_score,
        })
      }

      setStage('results')
    }
  }

  function aggregateFrameResults(frames: FrameResult[]): BaselineCheck[] {
    if (!frames.length) return []
    const total = frames.length
    const keys = frames[0].checks.map(c => c.id)

    return keys.map(key => {
      let ok = 0, warn = 0, bad = 0
      frames.forEach(f => {
        const c = f.checks.find(c => c.id === key)
        if (c?.status === 'ok') ok++
        else if (c?.status === 'warn') warn++
        else bad++
      })
      const badPct = bad / total
      const status = badPct > 0.4 ? 'bad' : ok / total > 0.6 ? 'ok' : 'warn'
      const template = frames[frames.length - 1].checks.find(c => c.id === key)!
      return { ...template, status }
    })
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (error) return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4 text-center">
      <p className="text-muted-foreground">{error}</p>
      <Link href={`/student/checkpoint/${cpId}`} className="text-ok hover:underline text-sm">← Volver</Link>
    </main>
  )

  return (
    <main className="min-h-screen bg-background">
      {stage !== 'recording' && (
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-5 py-4">
          <Link href={`/student/checkpoint/${cpId}`} className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {checkpoint?.name ?? 'Volver'}
          </Link>
        </header>
      )}

      {/* INPUT stage */}
      {stage === 'input' && (
        <div className="max-w-md mx-auto px-5 py-8 flex flex-col gap-4">
          <h1 className="text-xl font-bold text-foreground mb-4">Grabar práctica</h1>

          {/* Phone restriction for recording */}
          <div className="flex md:hidden flex-col items-center text-center gap-3 py-4">
            <div className="w-14 h-14 rounded-2xl bg-blue/10 border border-blue/20 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue">
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <p className="text-foreground font-semibold text-sm">Usa un iPad o tablet para grabar</p>
            <p className="text-muted-foreground text-xs max-w-xs">La grabación funciona mejor en una pantalla grande con trípode.</p>
          </div>

          <button
            onClick={() => startRecording('environment')}
            className="bg-blue/10 border border-blue/30 rounded-2xl p-6 text-left hover:bg-blue/20 transition-all hidden md:block"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <p className="text-foreground font-semibold">Grabar con cámara</p>
            </div>
            <p className="text-muted-foreground text-sm">Coloca el celular en un trípode y graba tu swing</p>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-card border border-border rounded-2xl p-6 text-left hover:bg-secondary hover:border-ok/30 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted-foreground">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-foreground font-semibold">Subir video</p>
            </div>
            <p className="text-muted-foreground text-sm">Selecciona un video ya grabado</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleUpload}
            className="hidden"
          />

          <p className="text-muted-foreground text-xs text-center mt-2">
            Ángulo: {checkpoint?.camera_angle === 'face_on' ? 'de frente' : 'de perfil'} · Captura todo el cuerpo
          </p>
        </div>
      )}

      {/* RECORDING stage */}
      {stage === 'recording' && (
        <div className="flex flex-col h-dvh">
          <div className="relative flex-1 bg-black overflow-hidden" style={{ minHeight: 0 }}>
            <video
              ref={videoCallbackRef}
              className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              playsInline
              muted
            />

            {/* Loading overlay while camera connects */}
            {!cameraReady && (
              <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-blue border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">Iniciando cámara...</p>
              </div>
            )}

            {/* Recording overlays */}
            {cameraReady && (
              <>
                {/* Timer */}
                <div className="absolute top-4 left-4 bg-bad/90 text-foreground text-sm font-mono px-3 py-1.5 rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  {formatTime(recordingSeconds)}
                </div>
                {/* Flip camera */}
                {hasMultipleCameras && (
                <button
                  onClick={flipCamera}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/60 backdrop-blur flex items-center justify-center text-foreground hover:bg-background/80 transition-all"
                  title="Cambiar cámara"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" />
                    <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="m18 22-3-3 3-3" />
                    <path d="m6 2 3 3-3 3" />
                  </svg>
                </button>
                )}
                {/* Visibility warning during recording */}
                {recordingVisibleCount >= 0 && checkpoint && (() => {
                  const expected = checkpoint.selected_metrics?.length
                    ? checkpoint.selected_metrics
                    : METRICS_BY_ANGLE[checkpoint.camera_angle] ?? []
                  if (expected.length > 0 && recordingVisibleCount < expected.length) return (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 bg-warn/90 backdrop-blur rounded-full px-4 py-2 max-w-xs text-center">
                      <span className="text-black text-sm font-medium">
                        Muestra todo el cuerpo — {recordingVisibleCount}/{expected.length} métricas
                      </span>
                    </div>
                  )
                  return null
                })()}
                {/* Angle hint */}
                <div className="absolute bottom-4 left-4 bg-background/60 backdrop-blur text-muted-foreground text-xs px-3 py-1.5 rounded-full">
                  {checkpoint?.camera_angle === 'face_on' ? 'De frente' : 'De perfil'}
                </div>
              </>
            )}
          </div>

          {/* Stop button */}
          <div className="flex-shrink-0 p-4 bg-background">
            <button
              onClick={stopRecording}
              disabled={!cameraReady}
              className="w-full bg-bad text-foreground font-bold text-lg rounded-2xl py-5 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              Detener y analizar
            </button>
          </div>
        </div>
      )}

      {/* PROCESSING stage */}
      {stage === 'processing' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-5 gap-6">
          <div className="w-10 h-10 rounded-full border-2 border-ok border-t-transparent animate-spin" />
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Analizando frames</span>
              <span className="text-ok font-mono">{progress}%</span>
            </div>
            <div className="h-2 bg-card rounded-full overflow-hidden">
              <div className="h-full bg-ok rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <p className="text-muted-foreground text-sm text-center">Comparando con tu referencia personal...</p>
        </div>
      )}

      {/* RESULTS stage */}
      {stage === 'results' && checkpoint && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <h1 className="text-xl font-bold text-foreground mb-6">Resultados</h1>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-80 flex-shrink-0">
              {previewUrl && (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  muted
                  preload="auto"
                  onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 0.1 }}
                  className="w-full rounded-2xl bg-black"
                />
              )}
            </div>

            <div className="flex-1">
              {/* Swing mode results */}
              {swingPhaseChecks.length > 0 && (
                <div className="flex flex-col gap-3 mb-6">
                  {swingPhaseChecks.map(pc => {
                    const okCount = pc.checks.filter(c => c.status === 'ok').length
                    const phaseStatus = pc.checks.every(c => c.status === 'ok') ? 'ok'
                      : pc.checks.some(c => c.status === 'bad') ? 'bad' : 'warn'
                    return (
                      <div key={pc.phase} className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-foreground text-sm font-semibold">{pc.phaseLabel}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            phaseStatus === 'ok' ? 'text-ok bg-ok/10' :
                            phaseStatus === 'bad' ? 'text-bad bg-bad/10' : 'text-warn bg-warn/10'
                          }`}>
                            {phaseStatus === 'ok' ? 'Bien' : phaseStatus === 'bad' ? 'Corregir' : 'Ajustar'}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full ${
                              phaseStatus === 'ok' ? 'bg-ok' : phaseStatus === 'bad' ? 'bg-bad' : 'bg-warn'
                            }`}
                            style={{ width: `${pc.checks.length ? Math.round(okCount / pc.checks.length * 100) : 0}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {pc.checks.map(check => (
                            <span
                              key={check.id}
                              className={`text-xs px-2 py-0.5 rounded-full border ${
                                check.status === 'ok' ? 'text-ok bg-ok/10 border-ok/20' :
                                check.status === 'warn' ? 'text-warn bg-warn/10 border-warn/20' :
                                'text-bad bg-bad/10 border-bad/20'
                              }`}
                            >
                              {check.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Position mode: Warning if some metrics are missing */}
              {frameResults.length > 0 && (() => {
                const expected = checkpoint.selected_metrics?.length
                  ? checkpoint.selected_metrics
                  : METRICS_BY_ANGLE[checkpoint.camera_angle] ?? []
                const detected = aggregateFrameResults(frameResults).map(c => c.id)
                const missing = expected.filter(k => !detected.includes(k))
                if (missing.length > 0) return (
                  <div className="bg-warn/10 border border-warn/20 rounded-xl px-4 py-3 mb-4">
                    <p className="text-warn text-sm font-medium">
                      {detected.length}/{expected.length} métricas detectadas
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Asegúrate de que la cámara capture todo el cuerpo para un análisis completo.
                    </p>
                  </div>
                )
                return null
              })()}
              {frameResults.length > 0 && (
                <div className="flex flex-col gap-2 mb-6">
                  {aggregateFrameResults(frameResults).map(check => {
                    const okPct = Math.round(frameResults.filter(f => f.checks.find(c => c.id === check.id)?.status === 'ok').length / frameResults.length * 100)
                    const warnPct = Math.round(frameResults.filter(f => f.checks.find(c => c.id === check.id)?.status === 'warn').length / frameResults.length * 100)
                    const badPct = 100 - okPct - warnPct

                    return (
                      <div key={check.id} className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-foreground text-sm font-medium">{check.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            check.status === 'ok' ? 'text-ok bg-ok/10' :
                            check.status === 'warn' ? 'text-warn bg-warn/10' : 'text-bad bg-bad/10'
                          }`}>
                            {check.status === 'ok' ? 'Bien' : check.status === 'warn' ? 'Ajustar' : 'Corregir'}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden flex">
                          <div className="h-full bg-ok" style={{ width: `${okPct}%` }} />
                          <div className="h-full bg-warn" style={{ width: `${warnPct}%` }} />
                          <div className="h-full bg-bad" style={{ width: `${badPct}%` }} />
                        </div>
                        <p className="text-muted-foreground text-xs mt-1.5">{okPct}% dentro de tu rango</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {summary && (
                <div className="bg-blue/10 border border-blue/20 rounded-2xl px-4 py-4">
                  <p className="text-xs text-blue/80 uppercase tracking-wide mb-2">Recomendación</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">{summary}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setStage('input'); setFrameResults([]); setSwingPhaseChecks([]); setSummary(''); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl('') } }}
                  className="flex-1 bg-card border border-border text-muted-foreground font-semibold rounded-xl py-3 hover:bg-secondary transition-all text-sm"
                >
                  Volver a grabar
                </button>
                <Link href={`/student/checkpoint/${cpId}`} className="flex-1">
                  <button className="w-full bg-ok text-on-ok font-semibold rounded-xl py-3 hover:opacity-90 transition-all text-sm">
                    Ver ejercicio
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </main>
  )
}
