'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  analyzeFaceOn, analyzeDownLine, aggregateResults, generateSummary,
  type Check, type AggregatedCheck,
} from '@/lib/poseAnalysis'

type Stage = 'input' | 'processing' | 'results'
type View = 'face-on' | 'down-the-line'

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function initPose(view: View, onFrame: (checks: Check[]) => void): Promise<any> {
  await loadScript(`${CDN}/pose/pose.js`)
  await loadScript(`${CDN}/drawing_utils/drawing_utils.js`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  const pose = new w.Pose({
    locateFile: (file: string) => `${CDN}/pose/${file}`,
  })
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: false,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  pose.onResults((results: { poseLandmarks?: { x: number; y: number; z: number }[] }) => {
    if (results.poseLandmarks) {
      const checks = view === 'face-on'
        ? analyzeFaceOn(results.poseLandmarks)
        : analyzeDownLine(results.poseLandmarks)
      onFrame(checks)
    }
  })
  return pose
}

export default function AnalysisPage() {
  const [stage, setStage] = useState<Stage>('input')
  const [view, setView] = useState<View>('face-on')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<AggregatedCheck[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const previewVideoRef = useRef<HTMLVideoElement>(null)

  async function processVideo(blob: Blob | File) {
    setStage('processing')
    setProgress(0)
    setError(null)

    const frameResults: Check[][] = []

    try {
      const pose = await initPose(view, (checks) => frameResults.push(checks))
      const url = URL.createObjectURL(blob)

      const vid = document.createElement('video')
      vid.src = url
      vid.muted = true
      vid.preload = 'auto'
      vid.playsInline = true  // required for iOS to allow offscreen seek

      await new Promise<void>((resolve, reject) => {
        vid.onloadedmetadata = () => resolve()
        vid.onerror = () => reject(new Error('Error al cargar el vídeo'))
        // Trigger load on iOS (doesn't start loading until appended or played)
        vid.load()
      })

      const duration = vid.duration
      const FPS = 10
      const totalFrames = Math.floor(duration * FPS)

      // Helper: seek with a 600ms timeout fallback (iOS seeked can be slow)
      function seekTo(t: number): Promise<void> {
        return new Promise(r => {
          const done = () => { clearTimeout(timer); r() }
          const timer = setTimeout(done, 600)
          vid.addEventListener('seeked', done, { once: true })
          vid.currentTime = t
        })
      }

      for (let i = 0; i < totalFrames; i++) {
        await seekTo(i / FPS)
        await pose.send({ image: vid })
        setProgress(Math.round((i + 1) / totalFrames * 100))
      }

      setResults(aggregateResults(frameResults))
      setVideoUrl(url)
      setStage('results')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar el vídeo')
      setStage('input')
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processVideo(file)
  }

  async function startRecording() {
    // Check API availability (missing on some old iOS/Android browsers)
    if (typeof MediaRecorder === 'undefined') {
      setError('Tu navegador no soporta grabación. Sube un vídeo directamente.')
      return
    }

    // Pick the first MIME type the browser accepts (iOS needs mp4, desktop works with webm)
    const mimeType = [
      'video/mp4',
      'video/mp4;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find(t => MediaRecorder.isTypeSupported(t)) ?? ''

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream
        // play() can throw on mobile if called outside user-gesture context
        previewVideoRef.current.play().catch(() => {})
      }

      chunksRef.current = []
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      // timeslice=250ms is required on iOS: without it ondataavailable never fires
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        if (previewVideoRef.current) previewVideoRef.current.srcObject = null
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/mp4' })
        processVideo(blob)
      }
      recorder.onerror = () => {
        setError('Error durante la grabación. Intenta subir un vídeo.')
        setRecording(false)
      }

      recorder.start(250)
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.name === 'NotAllowedError') setError('Permiso de cámara denegado.')
        else if (e.name === 'NotFoundError') setError('No se encontró ninguna cámara.')
        else setError(`Error de cámara: ${e.message}`)
      } else {
        setError('No se pudo acceder a la cámara.')
      }
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function reset() {
    setStage('input')
    setProgress(0)
    setResults([])
    setVideoUrl(null)
    setError(null)
  }

  const summary = generateSummary(results)

  return (
    <div className="bg-bg flex flex-col lg:h-screen lg:overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border flex-shrink-0">
        <Link href="/" className="text-dim hover:text-txt transition-colors" onClick={reset}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <span className="font-bold text-lg">Sweep</span>
        {stage === 'results' ? (
          <button onClick={reset} className="font-mono text-xs text-dim hover:text-txt transition-colors">
            Nuevo vídeo
          </button>
        ) : <div className="w-20" />}
      </header>

      {/* Stage: input */}
      {stage === 'input' && (
        <div className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8 gap-5 sm:gap-6">
          <div className="text-center mb-2">
            <h2 className="text-txt text-xl font-semibold mb-1">Análisis de Video</h2>
            <p className="text-dim text-sm">Selecciona el ángulo de cámara y sube tu vídeo</p>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-s1 border border-border rounded-xl p-1">
            {(['face-on', 'down-the-line'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg font-mono text-xs font-medium transition-all duration-150 ${
                  view === v ? 'bg-s3 text-blue border border-blue/20' : 'text-dim hover:text-muted'
                }`}
              >
                {v === 'face-on' ? 'De frente' : 'De lado'}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-bad/10 border border-bad/30 rounded-xl px-4 py-3 text-bad text-sm max-w-md">
              {error}
            </div>
          )}

          {/* Input cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-lg">
            {/* Upload */}
            <label className="bg-s1 border border-border rounded-2xl p-5 sm:p-7 hover:border-blue/50 hover:bg-s2 transition-all duration-200 cursor-pointer flex flex-col items-center gap-3 text-center">
              <div className="text-blue">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="3" y="3" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M16 22V10M10 16l6-6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-txt mb-0.5">Subir vídeo</p>
                <p className="text-dim text-xs">MP4, MOV, WebM</p>
              </div>
              <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
            </label>

            {/* Record */}
            <div
              className={`bg-s1 border rounded-2xl p-5 sm:p-7 transition-all duration-200 cursor-pointer flex flex-col items-center gap-3 text-center relative ${
                recording ? 'border-bad/50 bg-bad/5' : 'border-border hover:border-ok/50 hover:bg-s2'
              }`}
              onClick={recording ? stopRecording : startRecording}
            >
              {recording ? (
                <>
                  <div className="text-bad">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="11" y="11" width="10" height="10" rx="2" fill="currentColor" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-bad mb-0.5">Detener grabación</p>
                    <p className="text-dim text-xs">Toca para finalizar</p>
                  </div>
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-bad animate-pulse" />
                </>
              ) : (
                <>
                  <div className="text-ok">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="16" cy="16" r="5" fill="currentColor" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-txt mb-0.5">Grabar ahora</p>
                    <p className="text-dim text-xs">Usa la cámara</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Camera preview during recording */}
          {recording && (
            <div className="w-full max-w-lg">
              <video
                ref={previewVideoRef}
                playsInline muted
                className="w-full rounded-2xl border border-bad/30 bg-s1 object-cover scale-x-[-1] aspect-video"
              />
            </div>
          )}
        </div>
      )}

      {/* Stage: processing */}
      {stage === 'processing' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
          <div className="text-ok">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="animate-spin" style={{ animationDuration: '1.5s' }}>
              <circle cx="28" cy="28" r="23" stroke="currentColor" strokeWidth="3" strokeDasharray="72 72" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-txt font-semibold text-lg mb-1">Analizando postura</h2>
            <p className="text-muted text-sm">Procesando frame a frame con MediaPipe...</p>
          </div>
          <div className="w-full max-w-sm">
            <div className="flex justify-between font-mono text-xs text-dim mb-2">
              <span>Progreso</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-s2 rounded-full overflow-hidden">
              <div
                className="h-full bg-ok rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stage: results */}
      {stage === 'results' && (
        /*
          Mobile  : column — video on top, results below, page scrolls
          Desktop : row    — video left (flex-1), results panel right (fixed width)
        */
        <div className="flex flex-col lg:flex-row lg:flex-1 lg:overflow-hidden">

          {/* Video playback */}
          <div className="flex items-center justify-center p-4 sm:p-6 bg-s1/30 lg:flex-1">
            {videoUrl && (
              <video
                src={videoUrl}
                controls
                className="rounded-2xl border border-border bg-s1 w-full lg:w-auto"
                style={{ maxHeight: 'min(50vh, 360px)' }}
              />
            )}
          </div>

          {/* Results panel */}
          <aside className="border-t lg:border-t-0 lg:border-l border-border lg:w-96 lg:flex-shrink-0 lg:overflow-y-auto bg-bg">
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              <p className="font-mono text-xs text-dim uppercase tracking-widest">Resultados por checkpoint</p>

              {results.map(r => (
                <ResultCard key={r.id} result={r} />
              ))}

              {/* Copilot summary */}
              {summary && (
                <div className="relative border border-blue/25 bg-blue/5 rounded-xl overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue" />
                  <div className="pl-5 pr-4 py-4">
                    <p className="font-mono text-xs text-blue uppercase tracking-widest mb-2">Copiloto Sweep</p>
                    <p className="text-sm text-txt leading-relaxed">{summary}</p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function ResultCard({ result }: { result: AggregatedCheck }) {
  const isOk = result.status === 'ok'
  const isWarn = result.status === 'warn'
  const stripColor = isOk ? 'bg-ok' : isWarn ? 'bg-warn' : 'bg-bad'
  const cardBg = isOk ? 'border-ok/25 bg-ok/5' : isWarn ? 'border-warn/25 bg-warn/5' : 'border-bad/25 bg-bad/5'
  const pctColor = isOk ? 'text-ok' : isWarn ? 'text-warn' : 'text-bad'

  return (
    <div className={`relative border rounded-xl overflow-hidden ${cardBg}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${stripColor}`} />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="font-semibold text-base text-txt">{result.label}</span>
          <span className={`font-mono text-xl font-bold leading-none flex-shrink-0 ${pctColor}`}>
            {result.okPct}<span className="text-xs font-medium">%</span>
          </span>
        </div>

        {/* Stacked bar */}
        <div className="h-2 bg-s2 rounded-full overflow-hidden flex mb-1 gap-px">
          {result.okPct > 0 && <div className="h-full bg-ok rounded-l-full" style={{ width: `${result.okPct}%` }} />}
          {result.warnPct > 0 && <div className="h-full bg-warn" style={{ width: `${result.warnPct}%` }} />}
          {result.badPct > 0 && <div className="h-full bg-bad rounded-r-full" style={{ width: `${result.badPct}%` }} />}
        </div>

        {/* Legend */}
        <div className="flex gap-3 mb-3">
          {result.okPct > 0 && <span className="font-mono text-xs text-ok">{result.okPct}% correcto</span>}
          {result.warnPct > 0 && <span className="font-mono text-xs text-warn">{result.warnPct}% ajustar</span>}
          {result.badPct > 0 && <span className="font-mono text-xs text-bad">{result.badPct}% corregir</span>}
        </div>

        <p className="text-sm text-muted leading-relaxed">{result.message}</p>
      </div>
    </div>
  )
}
