'use client'

import { useEffect, useRef, useState } from 'react'
import { loadMediaPipe, createPose } from '@/lib/mediapipe'
import { calculateMetrics, METRICS_BY_ANGLE, METRIC_INFO } from '@/lib/baseline'
import type { Landmark, CameraAngle } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────
interface ProcessedFrame {
  time: number
  landmarks: Landmark[] | null
  metrics: Record<string, number>
}

interface VideoSlot {
  file: File
  angle: CameraAngle
  objectUrl: string
  frames: ProcessedFrame[]
  duration: number
  width: number
  height: number
}

type Stage = 'upload' | 'processing' | 'playback'

// ─── Helpers ────────────────────────────────────────────────────────────────
async function resolveVideoDuration(video: HTMLVideoElement): Promise<number> {
  await new Promise<void>(res => {
    if (video.readyState >= 1) { res(); return }
    const h = () => { video.removeEventListener('loadedmetadata', h); res() }
    video.addEventListener('loadedmetadata', h)
    setTimeout(res, 5000)
  })
  if (isFinite(video.duration) && video.duration > 0) return video.duration
  await new Promise<void>(res => {
    video.currentTime = 1e10
    const h = () => { video.removeEventListener('seeked', h); res() }
    video.addEventListener('seeked', h)
    setTimeout(res, 3000)
  })
  if (isFinite(video.duration) && video.duration > 0) {
    const dur = video.duration
    await new Promise<void>(res => {
      video.currentTime = 0
      const h = () => { video.removeEventListener('seeked', h); res() }
      video.addEventListener('seeked', h)
      setTimeout(res, 1000)
    })
    return dur
  }
  return 10
}

function waitSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise(res => {
    const h = () => { video.removeEventListener('seeked', h); res() }
    video.addEventListener('seeked', h)
    setTimeout(res, 800)
  })
}

function findNearestFrame(frames: ProcessedFrame[], time: number): ProcessedFrame | null {
  if (!frames.length) return null
  let best = frames[0]
  let bestDist = Math.abs(best.time - time)
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].time - time)
    if (d < bestDist) { best = frames[i]; bestDist = d }
    else break // frames are sorted by time
  }
  return best
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  color = '#34d178'
) {
  const dc = (window as any).drawConnectors
  const dl = (window as any).drawLandmarks
  const PC = (window as any).POSE_CONNECTIONS
  if (dc && PC) {
    dc(ctx, landmarks, PC, { color, lineWidth: 3 })
  }
  if (dl) {
    dl(ctx, landmarks, { color: '#060a08', fillColor: color, lineWidth: 1, radius: 4 })
  }
}

function formatMetricValue(key: string, value: number): string {
  const info = METRIC_INFO[key]
  if (!info) return value.toFixed(2)
  if (info.unit === 'grados') return `${value.toFixed(1)}°`
  if (info.unit === 'ratio') return value.toFixed(2)
  // distance: multiply by 100 for readability
  return (value * 100).toFixed(1)
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function DemoPage() {
  const [stage, setStage] = useState<Stage>('upload')
  const [slots, setSlots] = useState<VideoSlot[]>([])
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [currentMetrics, setCurrentMetrics] = useState<Record<string, number>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [error, setError] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const slotsRef = useRef<VideoSlot[]>([])
  const activeTabRef = useRef(0)

  // Keep refs in sync
  useEffect(() => { slotsRef.current = slots }, [slots])
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      slotsRef.current.forEach(s => URL.revokeObjectURL(s.objectUrl))
    }
  }, [])

  // ─── Upload handlers ────────────────────────────────────────────────────
  const pendingFiles = useRef<{ file: File; angle: CameraAngle }[]>([])

  function handleFile(file: File, angle: CameraAngle) {
    // Replace if same angle already exists
    const existing = pendingFiles.current.filter(f => f.angle !== angle)
    existing.push({ file, angle })
    pendingFiles.current = existing
    setSlots(prev => {
      // Revoke old URL for this angle to prevent memory leak
      const old = prev.find(s => s.angle === angle)
      if (old) URL.revokeObjectURL(old.objectUrl)
      const filtered = prev.filter(s => s.angle !== angle)
      return [...filtered, {
        file,
        angle,
        objectUrl: URL.createObjectURL(file),
        frames: [],
        duration: 0,
        width: 0,
        height: 0,
      }]
    })
  }

  function handleDrop(angle: CameraAngle) {
    return (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer.files[0]
      if (file?.type.startsWith('video/')) handleFile(file, angle)
    }
  }

  function handleInputChange(angle: CameraAngle) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file, angle)
    }
  }

  function removeSlot(angle: CameraAngle) {
    pendingFiles.current = pendingFiles.current.filter(f => f.angle !== angle)
    setSlots(prev => {
      const removed = prev.find(s => s.angle === angle)
      if (removed) URL.revokeObjectURL(removed.objectUrl)
      return prev.filter(s => s.angle !== angle)
    })
  }

  // ─── Processing ─────────────────────────────────────────────────────────
  async function startProcessing() {
    if (!slots.length) return
    setStage('processing')
    setProgress(0)
    setError('')

    try {
      await loadMediaPipe()
      const pose = await createPose(() => {})

      const totalSlots = slots.length
      const updatedSlots: VideoSlot[] = []

      for (let si = 0; si < totalSlots; si++) {
        const slot = slots[si]
        setProgressLabel(`Analizando video ${si + 1} de ${totalSlots}${totalSlots > 1 ? ` (${slot.angle === 'face_on' ? 'frente' : 'perfil'})` : ''}...`)

        const video = document.createElement('video')
        video.src = slot.objectUrl
        video.muted = true
        video.playsInline = true
        video.preload = 'auto'
        video.load()

        const duration = await resolveVideoDuration(video)
        const w = video.videoWidth || 1280
        const h = video.videoHeight || 720

        const fps = 15
        const totalFrames = Math.min(Math.floor(duration * fps), 900)
        const step = 1 / fps

        const offCanvas = document.createElement('canvas')
        offCanvas.width = w
        offCanvas.height = h
        const offCtx = offCanvas.getContext('2d')!

        let resolveFrame: (() => void) | null = null
        let frameLandmarks: Landmark[] | null = null

        pose.onResults((r: any) => {
          frameLandmarks = r.poseLandmarks
            ? r.poseLandmarks.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility }))
            : null
          resolveFrame?.()
          resolveFrame = null
        })

        const frames: ProcessedFrame[] = []

        for (let i = 0; i < totalFrames; i++) {
          video.currentTime = i * step
          await waitSeek(video)

          offCtx.drawImage(video, 0, 0, w, h)
          frameLandmarks = null

          await new Promise<void>(res => {
            resolveFrame = res
            pose.send({ image: offCanvas }).catch(() => { resolveFrame = null; res() })
            setTimeout(() => { resolveFrame = null; res() }, 1500)
          })

          const metrics = frameLandmarks ? calculateMetrics(frameLandmarks, slot.angle) : {}
          frames.push({ time: i * step, landmarks: frameLandmarks, metrics })

          const overallProgress = ((si * totalFrames + i + 1) / (totalSlots * totalFrames)) * 100
          setProgress(Math.round(overallProgress))
        }

        updatedSlots.push({ ...slot, frames, duration, width: w, height: h })
      }

      slotsRef.current = updatedSlots
      setSlots(updatedSlots)
      setActiveTab(0)
      setStage('playback')
    } catch (err: any) {
      setError(`Error al procesar: ${err.message}`)
      setStage('upload')
    }
  }

  // ─── Playback ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'playback' || !slots.length) return

    const slot = slots[activeTab]
    if (!slot || !videoRef.current) return

    const video = videoRef.current
    video.src = slot.objectUrl
    video.load()
    setIsPlaying(false)
    setCurrentMetrics({})

    // Draw first frame once loaded
    const onLoaded = () => {
      video.currentTime = 0
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        renderCurrentFrame()
      }
      video.addEventListener('seeked', onSeeked)
    }
    video.addEventListener('loadeddata', onLoaded, { once: true })

    return () => {
      video.removeEventListener('loadeddata', onLoaded)
      cancelAnimationFrame(rafRef.current)
    }
  }, [stage, activeTab, slots])

  function renderCurrentFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    const slot = slotsRef.current[activeTabRef.current]
    if (!video || !canvas || !slot) return

    canvas.width = video.videoWidth || slot.width
    canvas.height = video.videoHeight || slot.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const frame = findNearestFrame(slot.frames, video.currentTime)
    if (frame?.landmarks) {
      drawSkeleton(ctx, frame.landmarks)
      setCurrentMetrics(frame.metrics)
    } else {
      setCurrentMetrics({})
    }
  }

  function startPlaybackLoop() {
    function loop() {
      renderCurrentFrame()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    // play()/pause() trigger onPlay/onPause handlers which manage the RAF loop
    if (video.paused) {
      video.play()
    } else {
      video.pause()
      renderCurrentFrame()
    }
  }

  function handleVideoSeeked() {
    renderCurrentFrame()
  }

  function handleVideoEnded() {
    setIsPlaying(false)
    cancelAnimationFrame(rafRef.current)
    renderCurrentFrame()
  }

  // ─── Export / Download ──────────────────────────────────────────────────
  async function exportVideo() {
    const slot = slotsRef.current[activeTabRef.current]
    if (!slot || isExporting) return

    setIsExporting(true)
    setExportProgress(0)

    try {
      const video = document.createElement('video')
      video.src = slot.objectUrl
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.load()
      await resolveVideoDuration(video)

      const w = slot.width
      const h = slot.height
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = w
      exportCanvas.height = h
      const ctx = exportCanvas.getContext('2d')!

      const stream = exportCanvas.captureStream(30)
      // Prefer MP4 so the file is playable everywhere (iOS, WhatsApp, etc.)
      const mimeType = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.start()

      const fps = 30
      const totalFrames = Math.floor(slot.duration * fps)

      for (let i = 0; i < totalFrames; i++) {
        video.currentTime = i / fps
        await waitSeek(video)

        // Draw video frame
        ctx.drawImage(video, 0, 0, w, h)

        // Draw skeleton overlay
        const frame = findNearestFrame(slot.frames, i / fps)
        if (frame?.landmarks) {
          drawSkeleton(ctx, frame.landmarks)
        }

        // Pace for captureStream
        await new Promise(r => setTimeout(r, 1000 / fps))
        setExportProgress(Math.round((i + 1) / totalFrames * 100))
      }

      recorder.stop()
      await new Promise<void>(r => { recorder.onstop = () => r() })

      const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const angleLabel = slot.angle === 'face_on' ? 'frente' : 'perfil'
      a.download = `golf-analysis-${angleLabel}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(`Error al exportar: ${err.message}`)
    } finally {
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  // ─── Render: Upload ─────────────────────────────────────────────────────
  if (stage === 'upload') {
    const faceOnSlot = slots.find(s => s.angle === 'face_on')
    const dtlSlot = slots.find(s => s.angle === 'dtl')

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Golf Pose <span className="text-ok">Analysis</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Sube un video para visualizar los ejes del cuerpo con inteligencia artificial
            </p>
          </div>

          {error && (
            <div className="bg-bad/10 border border-bad/30 text-bad rounded-lg p-3 mb-6 text-sm text-center">
              {error}
            </div>
          )}

          {/* Drop zones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Face-on */}
            <DropZone
              label="De frente"
              sublabel="Face-on"
              angle="face_on"
              file={faceOnSlot?.file ?? null}
              onDrop={handleDrop('face_on')}
              onInputChange={handleInputChange('face_on')}
              onRemove={() => removeSlot('face_on')}
            />
            {/* Down the line */}
            <DropZone
              label="De perfil"
              sublabel="Down the line"
              angle="dtl"
              file={dtlSlot?.file ?? null}
              onDrop={handleDrop('dtl')}
              onInputChange={handleInputChange('dtl')}
              onRemove={() => removeSlot('dtl')}
            />
          </div>

          {/* Start button */}
          <div className="flex justify-center">
            <button
              onClick={startProcessing}
              disabled={!slots.length}
              className="px-8 py-3 rounded-lg font-semibold text-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-ok text-black hover:bg-ok/90"
            >
              Analizar {slots.length === 2 ? 'videos' : 'video'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: Processing ─────────────────────────────────────────────────
  if (stage === 'processing') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          {/* Spinner */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-border" />
            <div className="absolute inset-0 rounded-full border-4 border-ok border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-ok font-mono text-sm font-bold">{progress}%</span>
            </div>
          </div>
          <p className="text-foreground font-medium mb-2">{progressLabel || 'Procesando...'}</p>
          {/* Progress bar */}
          <div className="w-full bg-border rounded-full h-2 overflow-hidden">
            <div
              className="bg-ok h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-muted-foreground text-sm mt-3">
            Detectando pose con MediaPipe AI
          </p>
        </div>
      </div>
    )
  }

  // ─── Render: Playback ───────────────────────────────────────────────────
  const activeSlot = slots[activeTab]
  const metricKeys = activeSlot ? METRICS_BY_ANGLE[activeSlot.angle] : []

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { cancelAnimationFrame(rafRef.current); setStage('upload') }}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Volver
          </button>
          <h1 className="text-lg font-semibold text-foreground">
            Pose <span className="text-ok">Analysis</span>
          </h1>
        </div>

        {/* Tabs if 2 videos */}
        {slots.length > 1 && (
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {slots.map((s, i) => (
              <button
                key={s.angle}
                onClick={() => {
                  cancelAnimationFrame(rafRef.current)
                  setActiveTab(i)
                }}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  activeTab === i
                    ? 'bg-ok text-black'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.angle === 'face_on' ? 'Frente' : 'Perfil'}
              </button>
            ))}
          </div>
        )}

        {/* Download */}
        <button
          onClick={exportVideo}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ok text-black font-medium text-sm hover:bg-ok/90 disabled:opacity-50 transition-all"
        >
          {isExporting ? (
            <>
              <SpinnerIcon />
              {exportProgress}%
            </>
          ) : (
            <>
              <DownloadIcon />
              Descargar
            </>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          <div className="relative max-w-full max-h-full">
            <video
              ref={videoRef}
              className="block max-w-full max-h-[calc(100vh-56px)]"
              playsInline
              muted
              onSeeked={handleVideoSeeked}
              onEnded={handleVideoEnded}
              onPlay={() => { setIsPlaying(true); startPlaybackLoop() }}
              onPause={() => { setIsPlaying(false); cancelAnimationFrame(rafRef.current) }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          </div>

          {/* Play/Pause overlay button */}
          <button
            onClick={togglePlay}
            className="absolute bottom-4 left-4 w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Speed controls */}
          <div className="absolute bottom-4 right-4 flex gap-1">
            {[0.25, 0.5, 1].map(speed => (
              <button
                key={speed}
                onClick={() => { if (videoRef.current) videoRef.current.playbackRate = speed }}
                className="px-2 py-1 rounded bg-black/60 backdrop-blur-sm text-white text-xs font-mono hover:bg-black/80 transition-colors"
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Metrics panel */}
        <div className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Ejes del cuerpo
              {activeSlot && (
                <span className="ml-2 text-ok font-normal normal-case">
                  ({activeSlot.angle === 'face_on' ? 'de frente' : 'de perfil'})
                </span>
              )}
            </h2>

            <div className="space-y-3">
              {metricKeys.map(key => {
                const info = METRIC_INFO[key]
                const value = currentMetrics[key]
                const hasValue = value !== undefined

                return (
                  <div
                    key={key}
                    className={`rounded-lg border p-3 transition-all ${
                      hasValue
                        ? 'border-ok/30 bg-ok/5'
                        : 'border-border bg-secondary/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {info?.label ?? key}
                      </span>
                      <span className={`font-mono text-lg font-bold ${
                        hasValue ? 'text-ok' : 'text-muted-foreground'
                      }`}>
                        {hasValue ? formatMetricValue(key, value) : '—'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {info?.description ?? ''}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Pose detection indicator */}
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  Object.keys(currentMetrics).length > 0 ? 'bg-ok animate-pulse' : 'bg-muted-foreground'
                }`} />
                <span className="text-xs text-muted-foreground">
                  {Object.keys(currentMetrics).length > 0
                    ? `${Object.keys(currentMetrics).length} métricas detectadas`
                    : 'Sin pose detectada en este frame'}
                </span>
              </div>
            </div>

            {/* Export progress overlay */}
            {isExporting && (
              <div className="mt-4 p-3 rounded-lg bg-ok/10 border border-ok/30">
                <p className="text-sm text-ok font-medium mb-2">Exportando video...</p>
                <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-ok h-full rounded-full transition-all"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Renderizando skeleton sobre el video
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-bad/10 border border-bad/30 text-bad rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DropZone({
  label,
  sublabel,
  angle,
  file,
  onDrop,
  onInputChange,
  onRemove,
}: {
  label: string
  sublabel: string
  angle: CameraAngle
  file: File | null
  onDrop: (e: React.DragEvent) => void
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  if (file) {
    return (
      <div className="relative rounded-xl border border-ok/30 bg-ok/5 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ok/20 flex items-center justify-center">
            <VideoIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{label} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
          <button onClick={onRemove} className="text-muted-foreground hover:text-bad transition-colors">
            <XIcon />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDrop={(e) => { setDragOver(false); onDrop(e) }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
        dragOver
          ? 'border-ok bg-ok/5'
          : 'border-border hover:border-muted-foreground bg-card'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onInputChange}
      />
      <UploadIcon />
      <p className="text-foreground font-medium mt-3">{label}</p>
      <p className="text-muted-foreground text-xs mt-1">{sublabel}</p>
      <p className="text-muted-foreground text-xs mt-2">Arrastra o toca para seleccionar</p>
    </div>
  )
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="w-8 h-8 mx-auto text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg className="w-5 h-5 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
