'use client'

// AnnotationCanvas — Section 9 of PROMPT_CLAUDE_CODE.md.
//
// Vector-drawing overlay used by the instructor's "annotate this moment"
// flow. The parent freezes a video frame and renders this component on top
// of it, sized to match the video. The instructor draws strokes (arrows,
// lines, circles), optionally records voice + types a note, then either
// saves or cancels.
//
// All coordinates are normalized to 0..1 so saved annotations render
// correctly at any video size on the student's playback.
//
// Audio: we capture a Blob and hand it to the parent. The parent posts to
// /api/transcribe on save — keeps this component focused on UI, not API
// orchestration.
//
// TODO(i18n): the toolbar labels and aria-labels below are still inline
// Spanish. Move them into messages/{es,en}.json under `annotationCanvas`
// once the bulk i18n migration lands. Component shape and props won't
// change; only string literals.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// ---------- Public shape ----------

export type StrokeKind = 'arrow' | 'line' | 'circle'
export type StrokeColor = 'red' | 'yellow' | 'green' | 'white'

export interface Stroke {
  type: StrokeKind
  color: StrokeColor
  // Normalized coordinates (0..1).
  //   arrow/line: [start, end]
  //   circle:     [center, pointOnRadius] — radius derived as distance.
  points: [[number, number], [number, number]]
}

export interface AnnotationDraft {
  strokes: Stroke[]
  audio_blob?: Blob
  audio_mime?: string
  text_note?: string
}

interface AnnotationCanvasProps {
  width: number
  height: number
  onSave: (draft: AnnotationDraft) => void
  onCancel: () => void
}

const COLOR_HEX: Record<StrokeColor, string> = {
  red: '#f04848',
  yellow: '#e8b930',
  green: '#34d178',
  white: '#ffffff',
}

const STROKE_WIDTH_PX = 4
const ARROW_HEAD_PX = 14

// Pick the best MIME type the browser supports for MediaRecorder. Order
// matters: webm/opus first because that's what Chrome/Edge/Firefox use,
// then mp4/aac for Safari.
const PREFERRED_AUDIO_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
]

function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const mime of PREFERRED_AUDIO_MIMES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return undefined
}

export function AnnotationCanvas({ width, height, onSave, onCancel }: AnnotationCanvasProps) {
  const t = useTranslations('components.annotationCanvas')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Drawing state ----------------------------------------------------------
  const [tool, setTool] = useState<StrokeKind>('arrow')
  const [color, setColor] = useState<StrokeColor>('red')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [drafting, setDrafting] = useState<Stroke | null>(null)
  const [textNote, setTextNote] = useState('')

  // Audio state ------------------------------------------------------------
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioMime, setAudioMime] = useState<string | undefined>()
  const [recorderError, setRecorderError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // ---------- Render the canvas whenever strokes or drafting change ----

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawAll(ctx, canvas.width, canvas.height, strokes, drafting)
  }, [strokes, drafting, width, height])

  // ---------- Pointer handlers ----------

  // Convert a pointer event to normalized [0..1] coords relative to the canvas.
  const toNormalized = useCallback((evt: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    const x = (evt.clientX - rect.left) / rect.width
    const y = (evt.clientY - rect.top) / rect.height
    return [clamp01(x), clamp01(y)]
  }, [])

  const onPointerDown = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    evt.preventDefault()
    const p = toNormalized(evt)
    setDrafting({ type: tool, color, points: [p, p] })
    canvasRef.current?.setPointerCapture(evt.pointerId)
  }

  const onPointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drafting) return
    evt.preventDefault()
    const p = toNormalized(evt)
    setDrafting({ ...drafting, points: [drafting.points[0], p] })
  }

  const onPointerUp = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drafting) return
    evt.preventDefault()
    canvasRef.current?.releasePointerCapture(evt.pointerId)

    // Throw away degenerate strokes (a tap that didn't move).
    const [a, b] = drafting.points
    const distSq = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
    if (distSq > 0.0005) {
      setStrokes((prev) => [...prev, drafting])
    }
    setDrafting(null)
  }

  const eraseLast = () => {
    setStrokes((prev) => prev.slice(0, -1))
  }

  // ---------- Audio handlers ----------

  const startRecording = async () => {
    setRecorderError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickAudioMime()
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || mime || 'audio/webm' })
        setAudioBlob(blob)
        setAudioMime(recorder.mimeType || mime)
        // Release the mic.
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start(250) // small timeslice so we get data even if the user stops fast
      recorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      setRecorderError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado'
          : 'No se pudo iniciar el micrófono',
      )
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    setRecording(false)
  }

  const clearAudio = () => {
    setAudioBlob(null)
    setAudioMime(undefined)
  }

  // Stop the recorder and release the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop() } catch {}
      }
    }
  }, [])

  // ---------- Save / cancel ----------

  const handleSave = () => {
    onSave({
      strokes,
      audio_blob: audioBlob ?? undefined,
      audio_mime: audioMime,
      text_note: textNote.trim() || undefined,
    })
  }

  const canSave = useMemo(() => {
    return strokes.length > 0 || audioBlob !== null || textNote.trim().length > 0
  }, [strokes.length, audioBlob, textNote])

  // ---------- Layout ----------

  // The toolbar lives at the bottom of the canvas. The canvas itself takes
  // the parent-provided width/height so it overlays the video pixel-perfect.

  return (
    <div className="relative flex flex-col gap-3" style={{ width }}>
      <div className="relative" style={{ width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="absolute inset-0 touch-none select-none cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Lienzo de anotación"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap rounded-2xl bg-card/95 backdrop-blur border border-border px-3 py-2.5">
        {/* Tool group */}
        <div className="flex items-center gap-1">
          <ToolButton active={tool === 'arrow'} onClick={() => setTool('arrow')} label={t('toolArrow')}>
            <ArrowIcon />
          </ToolButton>
          <ToolButton active={tool === 'line'} onClick={() => setTool('line')} label={t('toolLine')}>
            <LineIcon />
          </ToolButton>
          <ToolButton active={tool === 'circle'} onClick={() => setTool('circle')} label={t('toolCircle')}>
            <CircleIcon />
          </ToolButton>
        </div>

        <Divider />

        {/* Color group */}
        <div className="flex items-center gap-1.5">
          {(['red', 'yellow', 'green', 'white'] as StrokeColor[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t('colorLabel', { color: c })}
              className={`size-7 rounded-full border-2 transition-transform ${
                color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
              }`}
              style={{ background: COLOR_HEX[c] }}
            />
          ))}
        </div>

        <Divider />

        <button
          type="button"
          onClick={eraseLast}
          disabled={strokes.length === 0}
          className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
        >
          {t('undo')}
        </button>

        <div className="flex-1" />

        {/* Audio */}
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`h-11 px-4 rounded-xl flex items-center gap-2 font-semibold transition-all ${
            recording
              ? 'bg-bad/15 text-bad border border-bad/40 animate-pulse'
              : audioBlob
                ? 'bg-ok/10 text-ok border border-ok/30 hover:bg-ok/15'
                : 'bg-secondary text-foreground border border-border hover:bg-secondary/70'
          }`}
          aria-pressed={recording}
        >
          <MicIcon recording={recording} />
          {recording ? t('audioStop') : audioBlob ? t('audioReady') : t('audioStart')}
        </button>

        {audioBlob && !recording && (
          <button
            type="button"
            onClick={clearAudio}
            className="h-9 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Descartar audio"
          >
            ✕
          </button>
        )}
      </div>

      {recorderError && (
        <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-2.5">
          {recorderError}
        </div>
      )}

      {/* Optional text note */}
      <textarea
        value={textNote}
        onChange={(e) => setTextNote(e.target.value)}
        placeholder={t('notePlaceholder')}
        rows={2}
        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-ok/50 resize-y"
      />

      {/* Save / cancel */}
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 px-5 rounded-xl text-foreground bg-secondary hover:bg-secondary/70 transition-colors font-medium"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="h-11 px-6 rounded-xl bg-ok text-black font-semibold hover:bg-ok/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {t('save')}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function drawAll(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strokes: Stroke[],
  drafting: Stroke | null,
) {
  ctx.clearRect(0, 0, w, h)
  for (const s of strokes) drawStroke(ctx, w, h, s)
  if (drafting) drawStroke(ctx, w, h, drafting)
}

function drawStroke(ctx: CanvasRenderingContext2D, w: number, h: number, s: Stroke) {
  ctx.strokeStyle = COLOR_HEX[s.color]
  ctx.fillStyle = COLOR_HEX[s.color]
  ctx.lineWidth = STROKE_WIDTH_PX
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const [a, b] = s.points
  const ax = a[0] * w, ay = a[1] * h
  const bx = b[0] * w, by = b[1] * h

  if (s.type === 'line' || s.type === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()

    if (s.type === 'arrow') drawArrowHead(ctx, ax, ay, bx, by)
    return
  }

  if (s.type === 'circle') {
    const dx = bx - ax, dy = by - ay
    const radius = Math.hypot(dx, dy)
    ctx.beginPath()
    ctx.arc(ax, ay, radius, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
}

function drawArrowHead(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  const angle = Math.atan2(by - ay, bx - ax)
  const head = ARROW_HEAD_PX
  const left = angle + Math.PI - Math.PI / 7
  const right = angle + Math.PI + Math.PI / 7
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.lineTo(bx + head * Math.cos(left), by + head * Math.sin(left))
  ctx.lineTo(bx + head * Math.cos(right), by + head * Math.sin(right))
  ctx.closePath()
  ctx.fill()
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

// ---------------------------------------------------------------------------
// Tiny presentational helpers
// ---------------------------------------------------------------------------

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`size-10 rounded-lg flex items-center justify-center transition-colors ${
        active
          ? 'bg-ok/15 text-ok border border-ok/40'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-6 bg-border" />
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="19" x2="19" y2="5" />
      <polyline points="13 5 19 5 19 11" />
    </svg>
  )
}

function LineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  )
}

function CircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="7.5" />
    </svg>
  )
}

function MicIcon({ recording }: { recording: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={recording ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  )
}
