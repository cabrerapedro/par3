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

// ─── Constants ──────────────────────────────────────────────────────────────

// MediaPipe Pose connections (fallback if global not available)
const POSE_CONN: [number, number][] = [
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
  [27,29],[29,31],[28,30],[30,32],
  [15,17],[15,19],[15,21],[16,18],[16,20],[16,22],
]

// Where to draw each metric annotation on the body
const METRIC_ANCHOR: Record<string, { lm: number[]; dx: number; dy: number }> = {
  head_lateral:   { lm: [0],          dx: 25,  dy: -15 },
  arm_angle:      { lm: [13, 14],     dx: 35,  dy: 0 },
  shoulder_level: { lm: [11, 12],     dx: 0,   dy: -18 },
  hip_sway:       { lm: [23, 24],     dx: 30,  dy: 5 },
  stance_width:   { lm: [27, 28],     dx: 0,   dy: 18 },
  weight_shift:   { lm: [11, 12],     dx: -35, dy: -18 },
  spine_angle:    { lm: [11, 12, 23, 24], dx: 35, dy: 0 },
  knee_flex:      { lm: [25, 26],     dx: 35,  dy: 0 },
  head_forward:   { lm: [0],          dx: 25,  dy: -15 },
  hip_hinge:      { lm: [23, 24],     dx: 35,  dy: 0 },
  trail_arm:      { lm: [13, 14],     dx: -35, dy: 0 },
  head_height:    { lm: [0],          dx: 0,   dy: -25 },
}

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
    else break
  }
  return best
}

const SMOOTH_WINDOW = 4

function smoothLandmarks(buffer: Landmark[][], incoming: Landmark[]): Landmark[] {
  buffer.push(incoming)
  if (buffer.length > SMOOTH_WINDOW) buffer.shift()
  const n = buffer.length
  return incoming.map((_, i) => ({
    x: buffer.reduce((s, f) => s + (f[i]?.x ?? 0), 0) / n,
    y: buffer.reduce((s, f) => s + (f[i]?.y ?? 0), 0) / n,
    z: buffer.reduce((s, f) => s + (f[i]?.z ?? 0), 0) / n,
    visibility: buffer.reduce((s, f) => s + (f[i]?.visibility ?? 0), 0) / n,
  }))
}

// ─── Confidence-based color ─────────────────────────────────────────────────
function confidenceColor(visibility: number): string {
  if (visibility >= 0.8) return '#34d178'       // bright green
  if (visibility >= 0.6) return '#6ee7a0'       // medium green
  if (visibility >= 0.4) return '#94a3b8'       // slate gray
  return '#475569'                               // dark gray
}

function avgVisibility(lm: Landmark[], indices: number[]): number {
  const vals = indices.map(i => lm[i]?.visibility ?? 0)
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// ─── Drawing ────────────────────────────────────────────────────────────────
function drawSkeletonFull(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  metrics: Record<string, number>,
  angle: CameraAngle,
  cw: number,
  ch: number,
) {
  const connections = ((window as any).POSE_CONNECTIONS as [number, number][]) ?? POSE_CONN

  // Draw connections with confidence coloring
  for (const [a, b] of connections) {
    const la = landmarks[a], lb = landmarks[b]
    if (!la || !lb) continue
    const vis = ((la.visibility ?? 0) + (lb.visibility ?? 0)) / 2
    ctx.strokeStyle = confidenceColor(vis)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(la.x * cw, la.y * ch)
    ctx.lineTo(lb.x * cw, lb.y * ch)
    ctx.stroke()
  }

  // Draw landmarks with confidence coloring
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i]
    if (!lm) continue
    const vis = lm.visibility ?? 0
    const color = confidenceColor(vis)
    ctx.fillStyle = color
    ctx.strokeStyle = '#060a08'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(lm.x * cw, lm.y * ch, 4, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()
  }

  // Draw metric annotations
  const keys = METRICS_BY_ANGLE[angle] ?? []
  const fontSize = Math.max(11, Math.min(14, cw / 80))
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textBaseline = 'middle'

  for (const key of keys) {
    const value = metrics[key]
    if (value === undefined) continue
    const anchor = METRIC_ANCHOR[key]
    if (!anchor) continue

    // Compute anchor position: average of landmark positions
    let ax = 0, ay = 0, count = 0
    for (const idx of anchor.lm) {
      const lm = landmarks[idx]
      if (lm) { ax += lm.x; ay += lm.y; count++ }
    }
    if (!count) continue
    ax = (ax / count) * cw + anchor.dx
    ay = (ay / count) * ch + anchor.dy

    // Format value
    const info = METRIC_INFO[key]
    let label: string
    if (info?.unit === 'grados') label = `${value.toFixed(1)}°`
    else if (info?.unit === 'ratio') label = value.toFixed(2)
    else label = (value * 100).toFixed(1)

    // Draw pill background
    const textW = ctx.measureText(label).width
    const pad = 4
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.beginPath()
    const r = (fontSize / 2) + pad
    const rx = ax - pad, ry = ay - r, rw = textW + pad * 2, rh = r * 2
    ctx.roundRect(rx, ry, rw, rh, 4)
    ctx.fill()

    // Draw text
    const vis = avgVisibility(landmarks, anchor.lm)
    ctx.fillStyle = confidenceColor(vis)
    ctx.fillText(label, ax, ay)
  }
}

function formatMetricValue(key: string, value: number): string {
  const info = METRIC_INFO[key]
  if (!info) return value.toFixed(2)
  if (info.unit === 'grados') return `${value.toFixed(1)}°`
  if (info.unit === 'ratio') return value.toFixed(2)
  return (value * 100).toFixed(1)
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function DemoPage() {
  const [stage, setStage] = useState<Stage>('upload')
  const [slots, setSlots] = useState<VideoSlot[]>([])
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [currentMetrics, setCurrentMetrics] = useState<Record<string, number>[]>([{}, {}])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportSlotIdx, setExportSlotIdx] = useState(0)
  const [error, setError] = useState('')

  // Refs for up to 2 video panels
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null])
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null])
  const bufferRefs = useRef<Landmark[][][]>([[], []])
  const rafRef = useRef<number>(0)
  const slotsRef = useRef<VideoSlot[]>([])

  useEffect(() => { slotsRef.current = slots }, [slots])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      slotsRef.current.forEach(s => URL.revokeObjectURL(s.objectUrl))
    }
  }, [])

  // ─── Upload handlers ────────────────────────────────────────────────────
  const pendingFiles = useRef<{ file: File; angle: CameraAngle }[]>([])

  function handleFile(file: File, angle: CameraAngle) {
    const existing = pendingFiles.current.filter(f => f.angle !== angle)
    existing.push({ file, angle })
    pendingFiles.current = existing
    setSlots(prev => {
      const old = prev.find(s => s.angle === angle)
      if (old) URL.revokeObjectURL(old.objectUrl)
      const filtered = prev.filter(s => s.angle !== angle)
      return [...filtered, {
        file, angle,
        objectUrl: URL.createObjectURL(file),
        frames: [], duration: 0, width: 0, height: 0,
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
      setStage('playback')
    } catch (err: any) {
      setError(`Error al procesar: ${err.message}`)
      setStage('upload')
    }
  }

  // ─── Playback ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'playback' || !slots.length) return

    bufferRefs.current = [[], []]
    setCurrentMetrics([{}, {}])
    setIsPlaying(false)

    // Load each video
    slots.forEach((slot, i) => {
      const video = videoRefs.current[i]
      if (!video) return
      video.src = slot.objectUrl
      video.load()
      video.addEventListener('loadeddata', () => {
        video.currentTime = 0
        video.addEventListener('seeked', () => renderFrame(i), { once: true })
      }, { once: true })
    })

    return () => { cancelAnimationFrame(rafRef.current) }
  }, [stage, slots])

  function renderFrame(idx: number) {
    const video = videoRefs.current[idx]
    const canvas = canvasRefs.current[idx]
    const slot = slotsRef.current[idx]
    if (!video || !canvas || !slot) return

    const cw = video.videoWidth || slot.width
    const ch = video.videoHeight || slot.height
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, cw, ch)

    const frame = findNearestFrame(slot.frames, video.currentTime)
    if (frame?.landmarks) {
      const smoothed = smoothLandmarks(bufferRefs.current[idx], frame.landmarks)
      drawSkeletonFull(ctx, smoothed, frame.metrics, slot.angle, cw, ch)
      setCurrentMetrics(prev => { const n = [...prev]; n[idx] = frame.metrics; return n })
    } else {
      setCurrentMetrics(prev => { const n = [...prev]; n[idx] = {}; return n })
    }
  }

  function renderAllFrames() {
    slotsRef.current.forEach((_, i) => renderFrame(i))
  }

  function startPlaybackLoop() {
    function loop() {
      renderAllFrames()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function togglePlay() {
    const videos = slotsRef.current.map((_, i) => videoRefs.current[i]).filter(Boolean) as HTMLVideoElement[]
    if (!videos.length) return
    if (videos[0].paused) {
      videos.forEach(v => v.play())
    } else {
      videos.forEach(v => v.pause())
      renderAllFrames()
    }
  }

  function handlePlay() {
    setIsPlaying(true)
    startPlaybackLoop()
  }

  function handlePause() {
    setIsPlaying(false)
    cancelAnimationFrame(rafRef.current)
  }

  function handleEnded() {
    setIsPlaying(false)
    cancelAnimationFrame(rafRef.current)
    renderAllFrames()
  }

  function handleSeeked(idx: number) {
    renderFrame(idx)
    // Sync the other video to match
    const thisVideo = videoRefs.current[idx]
    if (!thisVideo) return
    slotsRef.current.forEach((_, i) => {
      if (i !== idx) {
        const other = videoRefs.current[i]
        if (other && Math.abs(other.currentTime - thisVideo.currentTime) > 0.1) {
          other.currentTime = thisVideo.currentTime
        }
      }
    })
  }

  // ─── Export / Download ──────────────────────────────────────────────────
  async function exportVideo(slotIdx: number) {
    const slot = slotsRef.current[slotIdx]
    if (!slot || isExporting) return

    setIsExporting(true)
    setExportProgress(0)
    setExportSlotIdx(slotIdx)

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
      const mimeType = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      const fps = 30
      const totalFrames = Math.floor(slot.duration * fps)
      const exportBuffer: Landmark[][] = []

      // Draw first frame before starting recorder
      video.currentTime = 0
      await waitSeek(video)
      ctx.drawImage(video, 0, 0, w, h)
      const firstFrame = findNearestFrame(slot.frames, 0)
      if (firstFrame?.landmarks) {
        drawSkeletonFull(ctx, smoothLandmarks(exportBuffer, firstFrame.landmarks), firstFrame.metrics, slot.angle, w, h)
      }

      recorder.start()

      for (let i = 0; i < totalFrames; i++) {
        video.currentTime = i / fps
        await waitSeek(video)

        ctx.drawImage(video, 0, 0, w, h)

        const frame = findNearestFrame(slot.frames, i / fps)
        if (frame?.landmarks) {
          drawSkeletonFull(ctx, smoothLandmarks(exportBuffer, frame.landmarks), frame.metrics, slot.angle, w, h)
        }

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <DropZone
              label="De frente" sublabel="Face-on" angle="face_on"
              file={faceOnSlot?.file ?? null}
              onDrop={handleDrop('face_on')}
              onInputChange={handleInputChange('face_on')}
              onRemove={() => removeSlot('face_on')}
            />
            <DropZone
              label="De perfil" sublabel="Down the line" angle="dtl"
              file={dtlSlot?.file ?? null}
              onDrop={handleDrop('dtl')}
              onInputChange={handleInputChange('dtl')}
              onRemove={() => removeSlot('dtl')}
            />
          </div>

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
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-border" />
            <div className="absolute inset-0 rounded-full border-4 border-ok border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-ok font-mono text-sm font-bold">{progress}%</span>
            </div>
          </div>
          <p className="text-foreground font-medium mb-2">{progressLabel || 'Procesando...'}</p>
          <div className="w-full bg-border rounded-full h-2 overflow-hidden">
            <div className="bg-ok h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-muted-foreground text-sm mt-3">Detectando pose con MediaPipe AI</p>
        </div>
      </div>
    )
  }

  // ─── Render: Playback ───────────────────────────────────────────────────
  const isDual = slots.length === 2

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

        <div className="flex items-center gap-2">
          {/* Download buttons */}
          {slots.map((s, i) => (
            <button
              key={s.angle}
              onClick={() => exportVideo(i)}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ok text-black font-medium text-sm hover:bg-ok/90 disabled:opacity-50 transition-all"
            >
              {isExporting && exportSlotIdx === i ? (
                <><SpinnerIcon />{exportProgress}%</>
              ) : (
                <>
                  <DownloadIcon />
                  {isDual ? (s.angle === 'face_on' ? 'Frente' : 'Perfil') : 'Descargar'}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video area(s) */}
        <div className={`flex-1 flex ${isDual ? 'flex-row' : ''} bg-black overflow-hidden`}>
          {slots.map((slot, i) => (
            <div
              key={slot.angle}
              className={`relative flex items-center justify-center ${isDual ? 'flex-1 w-1/2' : 'flex-1'} ${isDual && i === 0 ? 'border-r border-border/30' : ''}`}
            >
              {/* Angle label for dual view */}
              {isDual && (
                <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded bg-black/60 backdrop-blur-sm text-ok text-xs font-semibold">
                  {slot.angle === 'face_on' ? 'FRENTE' : 'PERFIL'}
                </div>
              )}

              <div className="relative max-w-full max-h-full">
                <video
                  ref={el => { videoRefs.current[i] = el }}
                  className={`block max-w-full ${isDual ? 'max-h-[calc(100vh-56px)]' : 'max-h-[calc(100vh-56px)]'}`}
                  playsInline
                  muted
                  onSeeked={() => handleSeeked(i)}
                  onEnded={handleEnded}
                  onPlay={handlePlay}
                  onPause={handlePause}
                />
                <canvas
                  ref={el => { canvasRefs.current[i] = el }}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Metrics panel */}
        <div className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto">
          <div className="p-4">
            {slots.map((slot, si) => {
              const metricKeys = METRICS_BY_ANGLE[slot.angle] ?? []
              const metrics = currentMetrics[si] ?? {}

              return (
                <div key={slot.angle} className={si > 0 ? 'mt-6 pt-4 border-t border-border' : ''}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {slot.angle === 'face_on' ? 'De frente' : 'De perfil'}
                  </h2>

                  <div className="space-y-2">
                    {metricKeys.map(key => {
                      const info = METRIC_INFO[key]
                      const value = metrics[key]
                      const hasValue = value !== undefined

                      return (
                        <div
                          key={key}
                          className={`rounded-lg border p-3 transition-all ${
                            hasValue ? 'border-ok/30 bg-ok/5' : 'border-border bg-secondary/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">
                              {info?.label ?? key}
                            </span>
                            <span className={`font-mono text-lg font-bold ${hasValue ? 'text-ok' : 'text-muted-foreground'}`}>
                              {hasValue ? formatMetricValue(key, value) : '—'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Detection indicator */}
            <div className="mt-6 pt-4 border-t border-border">
              {slots.map((slot, si) => {
                const count = Object.keys(currentMetrics[si] ?? {}).length
                return (
                  <div key={slot.angle} className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${count > 0 ? 'bg-ok animate-pulse' : 'bg-muted-foreground'}`} />
                    <span className="text-xs text-muted-foreground">
                      {slot.angle === 'face_on' ? 'Frente' : 'Perfil'}: {count > 0 ? `${count} métricas` : 'sin pose'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Export progress */}
            {isExporting && (
              <div className="mt-4 p-3 rounded-lg bg-ok/10 border border-ok/30">
                <p className="text-sm text-ok font-medium mb-2">Exportando video...</p>
                <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                  <div className="bg-ok h-full rounded-full transition-all" style={{ width: `${exportProgress}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Play/Pause + speed controls overlay */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        {[0.25, 0.5, 1].map(speed => (
          <button
            key={speed}
            onClick={() => {
              slotsRef.current.forEach((_, i) => {
                const v = videoRefs.current[i]
                if (v) v.playbackRate = speed
              })
            }}
            className="px-2 py-1 rounded bg-black/60 backdrop-blur-sm text-white text-xs font-mono hover:bg-black/80 transition-colors"
          >
            {speed}x
          </button>
        ))}
      </div>

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-bad/10 border border-bad/30 text-bad rounded-lg p-3 text-sm z-20">
          {error}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DropZone({
  label, sublabel, angle, file, onDrop, onInputChange, onRemove,
}: {
  label: string; sublabel: string; angle: CameraAngle; file: File | null
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
        dragOver ? 'border-ok bg-ok/5' : 'border-border hover:border-muted-foreground bg-card'
      }`}
    >
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onInputChange} />
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
