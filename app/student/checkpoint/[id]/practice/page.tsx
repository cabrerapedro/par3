'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  calculateMetrics, compareToBaseline, baselineOverallStatus,
  generateBaselineSummary
} from '@/lib/baseline'
import { loadMediaPipe, MP_POSE } from '@/lib/mediapipe'
import type { Checkpoint, Baseline } from '@/lib/types'
import type { BaselineCheck } from '@/lib/baseline'
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

  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [stage, setStage] = useState<Stage>('input')
  const [progress, setProgress] = useState(0)
  const [frameResults, setFrameResults] = useState<FrameResult[]>([])
  const [summary, setSummary] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    loadCheckpoint()
    return () => stopRecording()
  }, [])

  async function loadCheckpoint() {
    const { data } = await supabase.from('checkpoints').select('*').eq('id', cpId).single()
    if (!data?.baseline) { setError('Este ejercicio aún no tiene referencia.'); return }
    setCheckpoint(data)
  }

  async function startRecording() {
    try {
      await loadMediaPipe()

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(100)
      recorderRef.current = recorder

      setStage('recording')
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    } catch {
      setError('No se pudo acceder a la cámara.')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
      recorderRef.current.onstop = () => processVideo()
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
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'video/webm' })
    await analyzeVideoBlob(blob)
  }

  async function analyzeVideoBlob(blob: Blob) {
    if (!checkpoint?.baseline) { setError('Sin referencia personal.'); return }
    setStage('processing')
    setProgress(0)

    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true

    await new Promise<void>(res => { video.onloadedmetadata = () => res() })
    const duration = video.duration
    const fps = 10
    const step = 1 / fps
    const totalFrames = Math.floor(duration * fps)

    await loadMediaPipe()
    const Pose = (window as any).Pose
    const pose = new Pose({ locateFile: (f: string) => `${MP_POSE}/${f}` })
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 })

    const results: FrameResult[] = []
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')!

    // Set onResults once — resolver is updated each iteration
    let resolveFrame: (() => void) | null = null
    let frameChecks: BaselineCheck[] = []
    pose.onResults((r: any) => {
      frameChecks = []
      if (r.poseLandmarks) {
        const metrics = calculateMetrics(r.poseLandmarks, checkpoint.camera_angle)
        frameChecks = compareToBaseline(metrics, checkpoint.baseline as Baseline)
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

      if (frameChecks.length) results.push({ checks: frameChecks })
      setProgress(Math.round((i + 1) / totalFrames * 100))
    }

    URL.revokeObjectURL(url)
    pose.close?.()

    if (!results.length) { setError('No se detectó pose en el video. Asegúrate de que te veas completo.'); return }

    // Aggregate results
    const aggregated = aggregateFrameResults(results)

    // Set preview
    if (previewRef.current) {
      previewRef.current.src = url
    }

    setFrameResults(results)
    setSummary(generateBaselineSummary(aggregated))

    // Save practice session
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
      const okPct = ok / total, badPct = bad / total
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
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-5 py-4">
        <Link href={`/student/checkpoint/${cpId}`} className="text-muted-foreground text-sm hover:text-muted-foreground">
          ← {checkpoint?.name}
        </Link>
      </header>

      {/* INPUT stage */}
      {stage === 'input' && (
        <div className="max-w-md mx-auto px-5 py-8 flex flex-col gap-4">
          <h1 className="text-xl font-bold text-foreground mb-4">Grabar práctica</h1>

          <button
            onClick={startRecording}
            className="bg-blue/10 border border-blue/30 rounded-2xl p-6 text-left hover:bg-blue/20 transition-all"
          >
            <div className="text-blue text-2xl mb-2">⏺</div>
            <p className="text-foreground font-semibold">Grabar con cámara</p>
            <p className="text-muted-foreground text-sm mt-1">Usa la cámara del dispositivo para grabar tu swing</p>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-card border border-border rounded-2xl p-6 text-left hover:bg-secondary hover:border-ok/30 transition-all"
          >
            <div className="text-muted-foreground mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-foreground font-semibold">Subir video</p>
            <p className="text-muted-foreground text-sm mt-1">Selecciona un video ya grabado</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleUpload}
            className="hidden"
          />

          <p className="text-muted-foreground text-xs text-center mt-2">
            Ángulo recomendado: {checkpoint?.camera_angle === 'face_on' ? 'de frente' : 'de perfil'}
          </p>
        </div>
      )}

      {/* RECORDING stage */}
      {stage === 'recording' && (
        <div className="flex flex-col h-[calc(100dvh-56px)]">
          <div className="relative flex-1 bg-black overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" playsInline muted />
            <div className="absolute top-4 left-4 bg-bad/90 text-foreground text-sm font-mono px-3 py-1.5 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              {formatTime(recordingSeconds)}
            </div>
          </div>
          <div className="flex-shrink-0 p-4">
            <button
              onClick={stopRecording}
              className="w-full bg-bad text-foreground font-bold text-lg rounded-2xl py-5 active:scale-[0.98] transition-all"
            >
              ■ Detener y Analizar
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
        <div className="max-w-2xl mx-auto px-5 py-8">
          <h1 className="text-xl font-bold text-foreground mb-6">Resultados</h1>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Video preview */}
            <div className="lg:w-64 flex-shrink-0">
              <video ref={previewRef} controls className="w-full rounded-2xl bg-black" />
            </div>

            {/* Metrics */}
            <div className="flex-1">
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
                  <p className="text-xs text-blue/80 uppercase tracking-wide mb-2">Tu copiloto dice</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">{summary}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setStage('input'); setFrameResults([]); setSummary('') }}
                  className="flex-1 bg-card border border-border text-muted-foreground font-semibold rounded-xl py-3 hover:bg-secondary transition-all text-sm"
                >
                  Volver a grabar
                </button>
                <Link href={`/student/checkpoint/${cpId}`} className="flex-1">
                  <button className="w-full bg-ok text-black font-semibold rounded-xl py-3 hover:opacity-90 transition-all text-sm">
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
