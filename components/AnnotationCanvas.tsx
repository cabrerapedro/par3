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
// Drawing model — the common core of V1 Golf / OnForm / Hudl / CoachNow:
// line, arrow, circle, rectangle (press-drag-release), angle ("la V": drag
// vertex→arm 1, lift, drag arm 2 — the degrees follow the Pencil live), and
// freehand (pressure-sensitive with a Pencil). Stroke shapes and rendering
// live in lib/strokes.ts, shared with the snapshot and the viewers.
//
// Apple Pencil: pointer events already deliver it; what makes it feel like a
// Pencil is (1) palm rejection — finger touches are ignored while the pen is
// down or just lifted, so a resting hand doesn't draw — (2) pressure → stroke
// width in freehand, (3) a hover ring when the tip approaches the glass.
//
// All coordinates are normalized 0..1 against the canvas (which equals the
// video display size), so saved strokes anchor correctly on student playback.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { reencodeAudioToWav } from '@/lib/media'
import { pickAudioMime, resolveRecordedMime, RECORDER_TIMESLICE_MS } from '@/lib/recorder'
import { drawStrokes, drawStroke, angleDegrees, STROKE_COLOR_HEX } from '@/lib/strokes'
import type { Stroke, StrokeColor, StrokeKind } from '@/lib/strokes'

// ---------- Public shape ----------
// The stroke model is defined in lib/strokes.ts; re-exported for existing
// importers.
export type { Stroke, StrokeColor, StrokeKind } from '@/lib/strokes'

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

const TOOLS: StrokeKind[] = ['line', 'arrow', 'circle', 'angle', 'freehand', 'rect']
const MIN_LINE_DIST_SQ = 0.0006 // normalized; throws away accidental zero-length strokes
const FREEHAND_MIN_STEP_SQ = 0.00002 // normalized; drop sub-pixel jitter points
// After the pen lifts, finger touches stay ignored this long — the palm
// usually lands just before/after the tip.
const PALM_GRACE_MS = 1500

const dist2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
// Pen pressure → 0.15..1 (a Pencil reports real pressure; fingers report a
// constant 0.5, which we don't treat as pressure at all).
const pressureOf = (evt: React.PointerEvent) =>
  evt.pointerType === 'pen' ? Math.min(1, Math.max(0.15, evt.pressure || 0.5)) : 0.5

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
  const [tool, setTool] = useState<StrokeKind>('line')
  const [color, setColor] = useState<StrokeColor>('red')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  // In-progress gesture: first point of a drag (line/arrow/circle/rect, or
  // the vertex of an angle's first arm) + the live pointer position.
  const [start, setStart] = useState<[number, number] | null>(null)
  const [preview, setPreview] = useState<[number, number] | null>(null)
  // Angle ("la V"): vertex + first arm committed, waiting for the second arm.
  const [pendingAngle, setPendingAngle] = useState<{ vertex: [number, number]; arm1: [number, number] } | null>(null)
  // Freehand path being drawn (mutable for per-move perf; tick re-renders).
  const freehandRef = useRef<{ points: [number, number][]; widths: number[]; pen: boolean } | null>(null)
  const [freehandTick, setFreehandTick] = useState(0)
  // Pointer bookkeeping: which pointer owns the gesture; Pencil palm rejection.
  const activePointerRef = useRef<number | null>(null)
  const activePointerTypeRef = useRef<string>('')
  const penDownRef = useRef(false)
  const lastPenAtRef = useRef(0)
  const [penSeen, setPenSeen] = useState(false)
  const [hover, setHover] = useState<[number, number] | null>(null)
  const aspect = height > 0 ? width / height : 16 / 9
  // Optional typed note (voice is primary, but sometimes a word is easier).
  const [note, setNote] = useState('')

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

  // The live preview of the gesture in progress.
  const draft = useMemo<Stroke | null>(() => {
    if (tool === 'freehand') {
      const f = freehandRef.current
      return f && f.points.length > 1
        ? { type: 'freehand', color, points: f.points, widths: f.pen ? f.widths : undefined }
        : null
    }
    if (tool === 'angle') {
      if (pendingAngle) {
        // Between the two drags only the first arm exists — no third point,
        // no degrees (a degenerate "0°" is not feedback).
        if (!preview) return { type: 'angle', color, points: [pendingAngle.vertex, pendingAngle.arm1] }
        return {
          type: 'angle', color,
          points: [pendingAngle.vertex, pendingAngle.arm1, preview],
          degrees: angleDegrees(pendingAngle.vertex, pendingAngle.arm1, preview, aspect),
        }
      }
      return start && preview ? { type: 'angle', color, points: [start, preview] } : null
    }
    return start && preview ? { type: tool, color, points: [start, preview] } : null
    // freehandTick forces re-evaluation while the mutable path grows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, color, start, preview, pendingAngle, freehandTick, aspect])

  // ---------- Render the canvas whenever strokes / draft / hover change ----------

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    drawStrokes(ctx, w, h, strokes, { labels: true })
    if (draft) drawStroke(ctx, w, h, draft, { draft: true, labels: true })
    // Hover ring whenever no gesture is in progress (a pending angle's first
    // arm is a draft too, but the Pencil is free — the ring must still guide it).
    if (hover && activePointerRef.current === null) {
      // Pencil hover ring: shows where the tip will land before it touches.
      ctx.save()
      ctx.strokeStyle = STROKE_COLOR_HEX[color]
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(hover[0] * w, hover[1] * h, 9, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
  }, [strokes, draft, hover, color, width, height])

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
        const rawMime = resolveRecordedMime(recorder, audioChunksRef.current, mime, 'audio')
        const raw = new Blob(audioChunksRef.current, { type: rawMime })
        // Re-encode the voice note to WAV (clean playback + exact duration).
        // Fall back to the raw recording if decoding isn't possible.
        void (async () => {
          const wav = await reencodeAudioToWav(raw)
          const finalBlob = wav ?? raw
          const finalMime = wav ? 'audio/wav' : rawMime
          setAudioBlob(finalBlob)
          setAudioMime(finalMime)
          stopResolverRef.current?.({ blob: finalBlob, mime: finalMime })
          stopResolverRef.current = null
        })()
      }
      // Timeslice: iOS/WebKit needs periodic dataavailable to capture
      // reliably. The WAV re-encode on stop handles any webm quirks anyway.
      recorder.start(RECORDER_TIMESLICE_MS)
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

  // Palm rejection: while a Pencil is down (or just lifted), finger touches
  // on the canvas are the resting hand, not a drawing.
  const isPalm = (evt: React.PointerEvent) =>
    evt.pointerType === 'touch' && (penDownRef.current || Date.now() - lastPenAtRef.current < PALM_GRACE_MS)
  const notePen = (evt: React.PointerEvent) => {
    if (evt.pointerType !== 'pen') return
    // Hovering (iPad shows the tip before contact) must not arm palm
    // rejection: an instructor holding the Pencil while drawing with a
    // finger would get their finger ignored.
    if (evt.type === 'pointermove' && evt.buttons === 0) return
    lastPenAtRef.current = Date.now()
    if (!penSeen) setPenSeen(true)
  }

  const resetGesture = () => {
    setStart(null)
    setPreview(null)
    freehandRef.current = null
    activePointerRef.current = null
    activePointerTypeRef.current = ''
  }

  const onPointerDown = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    notePen(evt)
    if (isPalm(evt)) return
    if (activePointerRef.current !== null) {
      // The palm often lands BEFORE the tip. If a finger owns the gesture and
      // the Pencil arrives, the Pencil wins: drop the palm's gesture.
      if (evt.pointerType === 'pen' && activePointerTypeRef.current === 'touch') {
        try { canvasRef.current?.releasePointerCapture(activePointerRef.current) } catch { /* ignore */ }
        resetGesture()
      } else {
        return
      }
    }
    evt.preventDefault()
    if (evt.pointerType === 'pen') penDownRef.current = true
    setHover(null)
    activePointerRef.current = evt.pointerId
    activePointerTypeRef.current = evt.pointerType
    try { canvasRef.current?.setPointerCapture(evt.pointerId) } catch { /* ignore */ }
    const p = toNormalized(evt)

    if (tool === 'freehand') {
      freehandRef.current = { points: [p], widths: [pressureOf(evt)], pen: evt.pointerType === 'pen' }
      setFreehandTick((n) => n + 1)
      return
    }
    if (tool === 'angle' && pendingAngle) {
      // Second arm grows from the vertex; where the press lands is irrelevant.
      setPreview(p)
      return
    }
    setStart(p)
    setPreview(p)
  }

  const onPointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    notePen(evt)
    if (isPalm(evt)) return
    const p = toNormalized(evt)
    if (activePointerRef.current === null) {
      // Pencil hovering above the glass (iPad shows the tip before contact).
      if (evt.pointerType === 'pen') setHover(p)
      return
    }
    if (activePointerRef.current !== evt.pointerId) return
    evt.preventDefault()
    if (tool === 'freehand' && freehandRef.current) {
      const f = freehandRef.current
      if (dist2(f.points[f.points.length - 1], p) > FREEHAND_MIN_STEP_SQ) {
        f.points.push(p)
        f.widths.push(pressureOf(evt))
        setFreehandTick((n) => n + 1)
      }
      return
    }
    setPreview(p)
  }

  const onPointerUp = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    notePen(evt)
    if (evt.pointerType === 'pen') penDownRef.current = false
    if (activePointerRef.current !== evt.pointerId) return
    evt.preventDefault()
    try { canvasRef.current?.releasePointerCapture(evt.pointerId) } catch { /* ignore */ }
    const p = toNormalized(evt)

    if (tool === 'freehand') {
      const f = freehandRef.current
      if (f && f.points.length > 2) {
        setStrokes((prev) => [...prev, { type: 'freehand', color, points: f.points, widths: f.pen ? f.widths : undefined }])
      }
      resetGesture()
      setFreehandTick((n) => n + 1)
      return
    }

    if (tool === 'angle') {
      if (pendingAngle) {
        // Too short = an accidental touch near the vertex: keep waiting for
        // the real second arm instead of throwing the first one away.
        if (dist2(pendingAngle.vertex, p) > MIN_LINE_DIST_SQ) {
          setStrokes((prev) => [...prev, {
            type: 'angle', color,
            points: [pendingAngle.vertex, pendingAngle.arm1, p],
            degrees: angleDegrees(pendingAngle.vertex, pendingAngle.arm1, p, aspect),
          }])
          setPendingAngle(null)
        }
      } else if (start && dist2(start, p) > MIN_LINE_DIST_SQ) {
        setPendingAngle({ vertex: start, arm1: p })
      }
      resetGesture()
      return
    }

    if (start && dist2(start, p) > MIN_LINE_DIST_SQ) {
      setStrokes((prev) => [...prev, { type: tool, color, points: [start, p] }])
    }
    resetGesture()
  }

  const onPointerCancel = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    notePen(evt)
    if (evt.pointerType === 'pen') penDownRef.current = false
    if (activePointerRef.current !== evt.pointerId) return
    try { canvasRef.current?.releasePointerCapture(evt.pointerId) } catch { /* ignore */ }
    // The system cut the gesture short — nothing the instructor decided.
    resetGesture()
    setFreehandTick((n) => n + 1)
  }

  const onPointerLeave = () => setHover(null)

  const selectTool = (next: StrokeKind) => {
    setTool(next)
    setPendingAngle(null)
    resetGesture()
  }

  const undo = () => {
    if (pendingAngle) { setPendingAngle(null); resetGesture(); return }
    if (start || freehandRef.current) { resetGesture(); return }
    setStrokes((prev) => prev.slice(0, -1))
  }

  const clearAll = () => {
    setStrokes([])
    setPendingAngle(null)
    resetGesture()
  }

  // ---------- Save / cancel ----------

  // A half-drawn angle is visible on the canvas; on save it must not vanish
  // silently — it persists as the line the instructor actually drew.
  const effectiveStrokes: Stroke[] = pendingAngle
    ? [...strokes, { type: 'line', color, points: [pendingAngle.vertex, pendingAngle.arm1] }]
    : strokes
  const canSave =
    effectiveStrokes.length > 0 ||
    audioBlob !== null ||
    note.trim().length > 0 ||
    (micState === 'recording' && audioMs > 1000)

  // Finalize the in-progress annotation into a draft (or null if there's
  // nothing worth keeping). Always stops the mic.
  const buildDraft = async (): Promise<AnnotationDraft | null> => {
    const hasContent = canSave
    const audio = await finalizeAudio()
    if (!hasContent) return null
    return {
      strokes: effectiveStrokes,
      audio_blob: audio?.blob,
      audio_mime: audio?.mime,
      text_note: note.trim() || undefined,
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


  // ---------- Render ----------

  const surface = (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 w-full h-full touch-none cursor-crosshair z-10"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
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

        {/* Tool selector — one row, ≥48px targets for a fingertip or a Pencil */}
        <div className="grid grid-cols-6 gap-1.5">
          {TOOLS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => selectTool(k)}
              aria-pressed={tool === k}
              aria-label={t(TOOL_LABEL_KEY[k])}
              className={`flex flex-col items-center justify-center gap-1 h-14 rounded-md border text-[11px] font-medium transition-colors ${
                tool === k
                  ? 'bg-ok/15 text-ok border-ok/40'
                  : 'bg-secondary text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              <ToolIcon kind={k} />
              <span className="leading-none">{t(TOOL_LABEL_KEY[k])}</span>
            </button>
          ))}
        </div>

        {/* One-line hint for the current gesture (+ the Pencil badge once a
            Pencil has been seen — palm rejection is on) */}
        <div className="flex items-center gap-2 min-h-[20px]">
          <p className="text-sm text-muted-foreground leading-snug flex-1">
            {pendingAngle ? t('hintAngleSecond') : t(TOOL_HINT_KEY[tool])}
            {pendingAngle && draft?.degrees !== undefined && (
              <span className="ml-2 font-mono text-foreground">{draft.degrees}°</span>
            )}
          </p>
          {penSeen && (
            <span className="shrink-0 small-caps font-mono text-[10px] px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20">
              {t('pencilActive')}
            </span>
          )}
        </div>

        {/* Colors — sized for a fingertip / Pencil tap (>=48px) */}
        <div className="flex items-center justify-center gap-3">
          {(['red', 'yellow', 'green', 'white'] as StrokeColor[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t('colorLabel', { color: c })}
              aria-pressed={color === c}
              className={`size-12 rounded-full border-[3px] transition-transform ${
                color === c ? 'border-foreground scale-110' : 'border-border hover:scale-105'
              }`}
              style={{ background: STROKE_COLOR_HEX[c] }}
            />
          ))}
        </div>

        {/* Undo / clear — big, since drawing with a Pencil means lots of retries */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={strokes.length === 0 && !start && !pendingAngle}
            className="flex-1 h-12 rounded-md text-sm font-medium text-foreground bg-secondary hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('undo')}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={strokes.length === 0 && !start && !pendingAngle}
            className="flex-1 h-12 rounded-md text-sm font-medium text-bad/90 bg-bad/10 hover:bg-bad/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('clearAll')}
          </button>
        </div>

        {/* Optional typed note */}
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('notePlaceholder')}
          className="h-12 rounded-md bg-secondary border border-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border"
        />

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="h-12 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {t('save')}
        </button>
      </div>
    </>
  )
})

// ---------------------------------------------------------------------------
// Tool chrome
// ---------------------------------------------------------------------------

const TOOL_LABEL_KEY: Record<StrokeKind, string> = {
  line: 'toolLine', arrow: 'toolArrow', circle: 'toolCircle',
  angle: 'toolAngle', freehand: 'toolFreehand', rect: 'toolRect',
}
const TOOL_HINT_KEY: Record<StrokeKind, string> = {
  line: 'lineHint', arrow: 'hintShape', circle: 'hintShape',
  angle: 'hintAngle', freehand: 'hintFreehand', rect: 'hintShape',
}

function ToolIcon({ kind }: { kind: StrokeKind }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'line': return <svg {...common}><line x1="5" y1="19" x2="19" y2="5" /></svg>
    case 'arrow': return <svg {...common}><line x1="5" y1="19" x2="19" y2="5" /><polyline points="11 5 19 5 19 13" /></svg>
    case 'circle': return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>
    case 'angle': return <svg {...common}><polyline points="19 6 6 18 20 18" /><path d="M10 18a4 4 0 0 0-1.2-2.8" /></svg>
    case 'freehand': return <svg {...common}><path d="M4 17c3-6 5 4 8-2s4 6 8-2" /></svg>
    case 'rect': return <svg {...common}><rect x="4" y="6" width="16" height="12" rx="1.5" /></svg>
  }
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
