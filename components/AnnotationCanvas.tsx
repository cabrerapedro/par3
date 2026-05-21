'use client'

// AnnotationCanvas — the instructor's "annotate this moment" tool.
//
// Layout: the *drawing surface* (a transparent canvas) is portaled on top of
// the frozen, sharp video frame so the instructor sees the whole frame
// unobstructed. Every control — draw tools, voice status, note, save, cancel —
// lives in a panel BELOW the video, never covering it.
//
// Voice (product decision #7: audio + drawing are simultaneous, not separate
// steps): the mic starts automatically when this overlay opens. The instructor
// just talks while drawing; a discreet "Recording your voice · 0:05" row shows
// it's live, with a control to drop the audio for this annotation. The blob is
// finalized on save. If mic permission is denied, drawing + note still work.
//
// Drawing model (lines only): tap once to drop the start point, tap again to
// set the end — like the line tool in golf-coaching apps. Each line gets a dot
// at both ends. Arrows/circles were removed from authoring; SVGAnnotationOverlay
// still renders legacy arrow/circle strokes for clips saved before this change.
//
// All coordinates are normalized 0..1 against the canvas (which equals the
// video display size), so saved strokes anchor correctly on student playback.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { patchWebmDuration, reencodeAudioToWav } from '@/lib/media'

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
  /** The (relative, video-sized) element to portal the drawing surface into. */
  surfaceEl: HTMLElement | null
  /** Timestamp label of the frozen frame, shown in the header (e.g. "0:02.3"). */
  header?: string
  onSave: (draft: AnnotationDraft) => void
  onCancel: () => void
}

export interface AnnotationCanvasHandle {
  /**
   * Finalize whatever is in progress (commit strokes, stop + attach audio,
   * keep the note) and return it as a draft — or null if there's nothing
   * worth keeping. Lets the parent rescue an open annotation when the
   * instructor saves the whole clip without tapping "Save annotation" first.
   */
  flush: () => Promise<AnnotationDraft | null>
}

type MicState = 'recording' | 'off' | 'denied'

const COLOR_HEX: Record<StrokeColor, string> = {
  red: '#f04848',
  yellow: '#e8b930',
  green: '#34d178',
  white: '#ffffff',
}

const STROKE_WIDTH_PX = 4
const ENDPOINT_RADIUS_PX = 6
const MIN_LINE_DIST_SQ = 0.0006 // normalized; throws away accidental zero-length lines

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

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(function AnnotationCanvas(
  { width, height, surfaceEl, header, onSave, onCancel },
  ref,
) {
  const t = useTranslations('components.annotationCanvas')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Drawing state ----------------------------------------------------------
  const [color, setColor] = useState<StrokeColor>('red')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  // Tap-tap: `start` holds the first point until the second tap commits the line.
  const [start, setStart] = useState<[number, number] | null>(null)
  const [preview, setPreview] = useState<[number, number] | null>(null)
  const [textNote, setTextNote] = useState('')

  // Audio state (auto-recording) ------------------------------------------
  const [micState, setMicState] = useState<MicState>('off')
  const [audioMs, setAudioMs] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioMime, setAudioMime] = useState<string | undefined>()
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const discardingRef = useRef(false)
  const savingRef = useRef(false)
  // Resolver used by handleSave to await the final blob after recorder.stop().
  const stopResolverRef = useRef<((v: { blob: Blob; mime?: string } | null) => void) | null>(null)

  // The live preview line (start → current pointer), drawn while waiting for
  // the second tap.
  const draftLine = useMemo<Stroke | null>(
    () => (start && preview ? { type: 'line', color, points: [start, preview] } : null),
    [start, preview, color],
  )

  // ---------- Render the canvas whenever strokes / draft change ----------

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawAll(ctx, canvas.width, canvas.height, strokes, draftLine)
  }, [strokes, draftLine, width, height])

  // ---------- Audio: start the mic automatically on open ----------

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Without these, recording on a laptop without headphones picks up the
        // speakers and the voice note comes out echoey / doubled.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const mime = pickAudioMime()
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((tr) => tr.stop())
        streamRef.current = null
        if (discardingRef.current) {
          // The instructor turned audio off — drop everything captured.
          discardingRef.current = false
          audioChunksRef.current = []
          stopResolverRef.current?.(null)
          stopResolverRef.current = null
          return
        }
        const rawMime = recorder.mimeType || mime || 'audio/webm'
        const raw = new Blob(audioChunksRef.current, { type: rawMime })
        const durationMs = Math.max(0, Date.now() - startedAtRef.current)
        // Re-encode the voice note to WAV (clean playback + exact duration).
        // Fall back to a duration-patched webm if decoding isn't possible.
        void (async () => {
          const wav = await reencodeAudioToWav(raw)
          const finalBlob = wav ?? (await patchWebmDuration(raw, rawMime, durationMs))
          const finalMime = wav ? 'audio/wav' : rawMime
          setAudioBlob(finalBlob)
          setAudioMime(finalMime)
          stopResolverRef.current?.({ blob: finalBlob, mime: finalMime })
          stopResolverRef.current = null
        })()
      }
      // No timeslice: a single dataavailable on stop yields one clean blob
      // (chunked recording can produce glitchy/stuttery webm).
      recorder.start()
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      setAudioBlob(null)
      setAudioMs(0)
      setMicState('recording')
    } catch {
      setMicState('denied')
    }
  }, [])

  // Auto-start on mount; release the mic on unmount.
  useEffect(() => {
    startMic()
    return () => {
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') {
        try { rec.stop() } catch {}
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tick the recording timer.
  useEffect(() => {
    if (micState !== 'recording') return
    const id = setInterval(() => setAudioMs(Date.now() - startedAtRef.current), 200)
    return () => clearInterval(id)
  }, [micState])

  const turnOffAudio = () => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      discardingRef.current = true
      rec.stop()
    }
    setAudioBlob(null)
    setAudioMime(undefined)
    setAudioMs(0)
    setMicState('off')
  }

  // Stop the recorder and resolve with the finalized blob (or null).
  const finalizeAudio = (): Promise<{ blob: Blob; mime?: string } | null> =>
    new Promise((resolve) => {
      const rec = recorderRef.current
      if (micState !== 'recording' || !rec || rec.state === 'inactive') {
        resolve(audioBlob ? { blob: audioBlob, mime: audioMime } : null)
        return
      }
      stopResolverRef.current = resolve
      rec.stop()
    })

  // ---------- Pointer handlers (tap-tap) ----------

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
    if (!start) {
      setStart(p)
      setPreview(p)
      return
    }
    const distSq = (start[0] - p[0]) ** 2 + (start[1] - p[1]) ** 2
    if (distSq > MIN_LINE_DIST_SQ) {
      setStrokes((prev) => [...prev, { type: 'line', color, points: [start, p] }])
    }
    setStart(null)
    setPreview(null)
  }

  const onPointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!start) return
    evt.preventDefault()
    setPreview(toNormalized(evt))
  }

  const undo = () => {
    if (start) {
      setStart(null)
      setPreview(null)
      return
    }
    setStrokes((prev) => prev.slice(0, -1))
  }

  // ---------- Save / cancel ----------

  const canSave =
    strokes.length > 0 ||
    textNote.trim().length > 0 ||
    audioBlob !== null ||
    (micState === 'recording' && audioMs > 1000)

  // Finalize the in-progress annotation into a draft (or null if there's
  // nothing worth keeping). Always stops the mic.
  const buildDraft = async (): Promise<AnnotationDraft | null> => {
    const hasContent = canSave
    const audio = await finalizeAudio()
    if (!hasContent) return null
    return {
      strokes,
      audio_blob: audio?.blob,
      audio_mime: audio?.mime,
      text_note: textNote.trim() || undefined,
    }
  }

  // Re-created every render so flush() always closes over the latest state.
  useImperativeHandle(ref, () => ({ flush: buildDraft }))

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    const draft = await buildDraft()
    if (draft) onSave(draft)
    else onCancel()
  }

  const showHint = strokes.length === 0 && !start

  // ---------- Render ----------

  const surface = (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 w-full h-full touch-none cursor-crosshair z-10"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      aria-label={t('canvasAria')}
    />
  )

  return (
    <>
      {surfaceEl && createPortal(surface, surfaceEl)}

      {/* Controls — always below the video, never covering it */}
      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="small-caps font-mono text-[11px] text-accent">
            {t('annotatingLabel')}{header ? ` · ${header}` : ''}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('cancel')}
          </button>
        </div>

        {/* Voice status — automatic */}
        {micState === 'recording' && (
          <div className="flex items-center gap-2.5 h-11 px-3 rounded-md bg-bad/10 border border-bad/25">
            <span className="size-2.5 rounded-full bg-bad animate-pulse shrink-0" />
            <span className="text-sm font-medium text-bad">{t('audioRecording')}</span>
            <span className="font-mono text-sm text-bad/80 tabular-nums">{fmt(audioMs)}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={turnOffAudio}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-bad/90 hover:bg-bad/10 transition-colors"
            >
              <MicOffIcon />
              {t('audioTurnOff')}
            </button>
          </div>
        )}

        {micState === 'off' && (
          <button
            type="button"
            onClick={startMic}
            className="flex items-center gap-2 h-11 px-3 rounded-md bg-secondary border border-border text-foreground hover:bg-secondary/70 transition-colors"
          >
            <MicIcon />
            <span className="text-sm font-medium">{t('audioTurnOn')}</span>
            <span className="text-xs text-muted-foreground">· {t('audioOff')}</span>
          </button>
        )}

        {micState === 'denied' && (
          <div className="flex items-center gap-2 h-11 px-3 rounded-md bg-secondary/60 border border-border text-sm text-muted-foreground">
            <MicOffIcon />
            <span className="leading-snug">{t('audioDenied')}</span>
            <div className="flex-1" />
            <button type="button" onClick={startMic} className="text-xs font-medium text-foreground hover:underline">
              {t('audioRetry')}
            </button>
          </div>
        )}

        {showHint && (
          <p className="text-sm text-muted-foreground leading-snug">{t('lineHint')}</p>
        )}

        {/* Draw tools */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {(['red', 'yellow', 'green', 'white'] as StrokeColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={t('colorLabel', { color: c })}
                aria-pressed={color === c}
                className={`size-7 rounded-full border-2 transition-transform ${
                  color === c ? 'border-foreground scale-110' : 'border-border hover:scale-105'
                }`}
                style={{ background: COLOR_HEX[c] }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={undo}
            disabled={strokes.length === 0 && !start}
            className="h-9 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            {t('undo')}
          </button>
        </div>

        {/* Optional text note */}
        <textarea
          value={textNote}
          onChange={(e) => setTextNote(e.target.value)}
          placeholder={t('notePlaceholder')}
          rows={2}
          className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-primary resize-none"
        />

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="h-11 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {t('save')}
        </button>
      </div>
    </>
  )
})

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function drawAll(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strokes: Stroke[],
  draft: Stroke | null,
) {
  ctx.clearRect(0, 0, w, h)
  for (const s of strokes) drawStroke(ctx, w, h, s)
  if (draft) drawStroke(ctx, w, h, draft, true)
}

function drawStroke(ctx: CanvasRenderingContext2D, w: number, h: number, s: Stroke, isDraft = false) {
  ctx.strokeStyle = COLOR_HEX[s.color]
  ctx.fillStyle = COLOR_HEX[s.color]
  ctx.lineWidth = STROKE_WIDTH_PX
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const [a, b] = s.points
  const ax = a[0] * w, ay = a[1] * h
  const bx = b[0] * w, by = b[1] * h

  if (s.type === 'line' || s.type === 'arrow') {
    if (isDraft) ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    ctx.setLineDash([])

    if (s.type === 'arrow') {
      drawArrowHead(ctx, ax, ay, bx, by)
    } else {
      drawDot(ctx, ax, ay)
      drawDot(ctx, bx, by)
    }
    return
  }

  if (s.type === 'circle') {
    const radius = Math.hypot(bx - ax, by - ay)
    ctx.beginPath()
    ctx.arc(ax, ay, radius, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath()
  ctx.arc(x, y, ENDPOINT_RADIUS_PX, 0, Math.PI * 2)
  ctx.fill()
}

function drawArrowHead(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  const angle = Math.atan2(by - ay, bx - ax)
  const head = 14
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

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M17 11a5 5 0 0 1-.54 2.26M5 11a7 7 0 0 0 11 5.66" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}
