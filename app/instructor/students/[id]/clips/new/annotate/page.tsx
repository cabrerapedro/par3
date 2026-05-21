'use client'

// Section 4 step 2: review and annotate.
//
// Reads the recorded clip from the layout context, lets the instructor scrub
// the video, pause at meaningful moments, and overlay AnnotationCanvas to
// draw + record audio + jot a note. Each saved annotation is anchored at the
// pause-time of the video.
//
// Save flow is wired in the next commit; this page renders the UI and
// collects the AnnotationDraft state.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AnnotationCanvas, type AnnotationDraft, type AnnotationCanvasHandle, type Stroke, type StrokeColor } from '@/components/AnnotationCanvas'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getOrCreateTodayClass } from '@/lib/classes'
import { processClip } from '@/lib/processClip'
import { insertClipFrames } from '@/lib/frames'
import { METRICS_BY_ANGLE, buildClipBaseline, clipDetectionRatio } from '@/lib/baseline'
import { useClipFlow } from '../layout'

type CameraAngle = 'face_on' | 'dtl'
type ClipType = 'position' | 'swing'

interface DraftAnnotation extends AnnotationDraft {
  // Local-only fields; the persisted shape (clip_annotations rows) is built
  // from these at save time in the next commit.
  id: string
  frame_timestamp_ms: number
  // A composited still (video frame + strokes) captured at annotation time,
  // uploaded on save so the clip detail can show the drawing as a photo.
  snapshot_blob?: Blob
}

const PLAYBACK_SPEEDS = [1, 0.5, 0.25] as const
type Speed = (typeof PLAYBACK_SPEEDS)[number]

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const tenths = Math.floor((ms % 1000) / 100)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${tenths}`
}

type SaveStage = 'idle' | 'upload' | 'insert' | 'frames' | 'baseline'

export default function ClipAnnotatePage() {
  const t = useTranslations('instructor.clips.annotate')
  const params = useParams()
  const router = useRouter()
  const studentId = params.id as string
  const { instructor } = useAuth()

  const { recorded, getVideoUrl, reset } = useClipFlow()

  const [saveStage, setSaveStage] = useState<SaveStage>('idle')
  const [framesPct, setFramesPct] = useState(0)

  // Set when we intentionally leave (after save or discard). Without this, the
  // reset() that clears the recorded blob would make `recorded` null and trip
  // the guard below, bouncing the instructor back to the record screen instead
  // of the student profile.
  const leavingRef = useRef(false)

  // ---- Guard: no recording → bounce back to /record ---------------
  useEffect(() => {
    if (!recorded && !leavingRef.current) {
      router.replace(`/instructor/students/${studentId}/clips/new/record`)
    }
  }, [recorded, router, studentId])

  const videoUrl = recorded ? getVideoUrl() : null

  // ---- Video element state ----------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoStageRef = useRef<HTMLDivElement | null>(null)
  const annotationRef = useRef<AnnotationCanvasHandle>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(1)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)

  // ---- Clip metadata + annotations local state --------------------
  const [name, setName] = useState('')
  // Pre-filled from the angle the instructor chose on the record screen.
  const [angle, setAngle] = useState<CameraAngle>(() => recorded?.angle ?? 'face_on')
  const [clipType, setClipType] = useState<ClipType>('position')
  const [annotations, setAnnotations] = useState<DraftAnnotation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)

  // Keep <video>.playbackRate in sync.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  // Seed the duration from the recorded length immediately. MediaRecorder
  // webm blobs frequently report video.duration === Infinity until the whole
  // file is buffered, which broke the timeline (Infinity:NaN, and a scrubber
  // that snapped straight to 100%). The record step measured the real length,
  // so we trust that and only override it if the element reports a finite one.
  useEffect(() => {
    if (recorded?.durationMs) setDuration(recorded.durationMs)
  }, [recorded])

  // ---- Video event handlers ---------------------------------------

  const onLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    if (Number.isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration * 1000)
    } else if (recorded?.durationMs) {
      setDuration(recorded.durationMs)
    }
  }

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime * 1000)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const onPlay = () => setPlaying(true)
  const onPause = () => setPlaying(false)
  const onEnded = () => setPlaying(false)

  const seek = (ms: number) => {
    const v = videoRef.current
    if (!v) return
    const clamped = Math.max(0, Math.min(duration, ms))
    v.currentTime = clamped / 1000
    setCurrentTime(clamped)
  }

  // ---- Annotate button --------------------------------------------

  const openCanvas = () => {
    const stage = videoStageRef.current
    const v = videoRef.current
    if (!stage || !v) return
    // The canvas must match the displayed video pixel-for-pixel so saved
    // strokes anchor correctly when the student replays the clip.
    const rect = v.getBoundingClientRect()
    setCanvasSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
    setCanvasOpen(true)
  }

  const handleCanvasSave = async (draft: AnnotationDraft) => {
    const snapshot = videoRef.current
      ? await captureSnapshot(videoRef.current, draft.strokes, canvasSize?.width ?? 0, canvasSize?.height ?? 0)
      : null
    setAnnotations((prev) => [
      ...prev,
      {
        ...draft,
        id: crypto.randomUUID(),
        frame_timestamp_ms: Math.round(currentTime),
        snapshot_blob: snapshot ?? undefined,
      },
    ])
    setCanvasOpen(false)
  }

  const handleCanvasCancel = () => setCanvasOpen(false)

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }

  const jumpToAnnotation = (a: DraftAnnotation) => {
    seek(a.frame_timestamp_ms)
    const v = videoRef.current
    if (v && !v.paused) v.pause()
  }

  // ---- Save / discard ---------------------------------------------

  // The name is optional now — in-class, the instructor just records, draws and
  // moves on. If left blank we fall back to the clip type as a sensible label
  // so the student can still tell clips apart.
  const defaultName = clipType === 'swing' ? t('typeSwing') : t('typePosition')
  const canSave = saveStage === 'idle'

  // Persist a single annotation row. Best-effort on each piece — if Whisper
  // is down we still keep the audio file + drawing; if audio upload fails
  // we still keep the strokes + transcript text. Returns void.
  const persistAnnotation = useCallback(
    async (clipId: string, draft: DraftAnnotation): Promise<void> => {
      let audioUrl: string | null = null
      let transcript: string | null = null

      if (draft.audio_blob) {
        const m = draft.audio_mime ?? ''
        const ext = m.includes('wav') ? 'wav' : m.includes('mp4') ? 'm4a' : 'webm'
        const path = `${clipId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('clip-annotations-audio')
          .upload(path, draft.audio_blob, {
            contentType: draft.audio_mime || 'audio/webm',
          })
        if (!upErr) {
          audioUrl = supabase.storage.from('clip-annotations-audio').getPublicUrl(path).data.publicUrl
        }

        // Fire-and-forget transcribe. If Whisper is unavailable we just
        // keep the audio without text — the row still persists.
        try {
          const fd = new FormData()
          fd.append('audio', draft.audio_blob, `audio.${ext}`)
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
          if (res.ok) {
            const data = (await res.json()) as { transcript?: string }
            transcript = data.transcript ?? null
          }
        } catch {
          /* leave transcript null */
        }
      }

      // Upload the composited snapshot (frame + drawing). Reuses the public
      // clip-videos bucket under the student's folder so the existing RLS +
      // public-read policies apply without a new bucket.
      let snapshotUrl: string | null = null
      if (draft.snapshot_blob) {
        const snapPath = `${studentId}/snapshots/${clipId}/${crypto.randomUUID()}.jpg`
        const { error: snapErr } = await supabase.storage
          .from('clip-videos')
          .upload(snapPath, draft.snapshot_blob, { contentType: 'image/jpeg' })
        if (!snapErr) {
          snapshotUrl = supabase.storage.from('clip-videos').getPublicUrl(snapPath).data.publicUrl
        }
      }

      // Insert the core annotation first — strokes, audio and note must never
      // be lost over a snapshot problem.
      const { data: inserted } = await supabase
        .from('clip_annotations')
        .insert({
          clip_id: clipId,
          frame_timestamp_ms: draft.frame_timestamp_ms,
          strokes: draft.strokes,
          audio_url: audioUrl,
          audio_transcript: transcript,
          text_note: draft.text_note ?? null,
        })
        .select('id')
        .single()

      // Attach the snapshot URL as a best-effort follow-up. If the
      // detection_ratio/snapshot_url column isn't there yet, this just no-ops.
      if (inserted && snapshotUrl) {
        await supabase
          .from('clip_annotations')
          .update({ snapshot_url: snapshotUrl })
          .eq('id', inserted.id)
      }
    },
    [studentId],
  )

  // Build-baseline logic lives in lib/baseline as buildClipBaseline now so the
  // orphan-clip retry path on the detail page can reuse the same logic.

  const handleSave = async () => {
    if (saveStage !== 'idle') return
    if (!recorded || !instructor) {
      setError(t('missingVideo'))
      return
    }

    setError(null)

    // If the instructor hits "Save clip" while still annotating, rescue that
    // open annotation instead of dropping it.
    let pendingAnnotation: DraftAnnotation | null = null
    if (canvasOpen && annotationRef.current) {
      const draft = await annotationRef.current.flush()
      if (draft) {
        const snapshot = videoRef.current
          ? await captureSnapshot(videoRef.current, draft.strokes, canvasSize?.width ?? 0, canvasSize?.height ?? 0)
          : null
        pendingAnnotation = {
          ...draft,
          id: crypto.randomUUID(),
          frame_timestamp_ms: Math.round(currentTime),
          snapshot_blob: snapshot ?? undefined,
        }
      }
      setCanvasOpen(false)
    }
    const allAnnotations = pendingAnnotation ? [...annotations, pendingAnnotation] : annotations

    const finalName = name.trim() || defaultName
    const selectedMetrics = METRICS_BY_ANGLE[angle] ?? []

    try {
      // 1. Class for today (creates one if 24h since the last).
      setSaveStage('upload')
      const cls = await getOrCreateTodayClass(studentId, instructor.id)

      // 2. Upload the video to clip-videos. Path namespaced by student + class
      // so we don't collide and so a single cascading delete cleans up.
      const ext = recorded.mime.includes('webm') ? 'webm' : recorded.mime.includes('mp4') ? 'mp4' : 'bin'
      const videoPath = `${studentId}/${cls.id}/${crypto.randomUUID()}.${ext}`
      const { error: vidErr } = await supabase.storage
        .from('clip-videos')
        .upload(videoPath, recorded.blob, {
          contentType: recorded.mime,
          upsert: false,
        })
      if (vidErr) throw vidErr
      const videoUrl = supabase.storage.from('clip-videos').getPublicUrl(videoPath).data.publicUrl

      // 3. Insert the clip row.
      setSaveStage('insert')
      const { data: clip, error: clipErr } = await supabase
        .from('clips')
        .insert({
          class_id: cls.id,
          student_id: studentId,
          instructor_id: instructor.id,
          name: finalName,
          camera_angle: angle,
          clip_type: clipType,
          video_url: videoUrl,
          selected_metrics: selectedMetrics,
          status: 'pending',
        })
        .select()
        .single()
      if (clipErr || !clip) throw clipErr ?? new Error('Failed to insert clip')

      // 4. Persist annotations one by one. Each is best-effort; we don't
      // want a flaky single audio upload to bury the whole clip.
      for (const a of allAnnotations) {
        try {
          await persistAnnotation(clip.id, a)
        } catch {
          /* skip this annotation, keep going */
        }
      }

      // 5. Run MediaPipe over every frame and write to clip_frames.
      setSaveStage('frames')
      setFramesPct(0)
      // Posture is static, so a low sample rate is plenty and much faster on an
      // iPad; a swing needs more temporal resolution to find its phases.
      const fps = clipType === 'swing' ? 10 : 5
      const frames = await processClip({
        videoBlob: recorded.blob,
        cameraAngle: angle,
        fps,
        durationMs: recorded.durationMs,
        onProgress: (p) => setFramesPct(Math.round(p * 100)),
      })
      if (frames.length > 0) {
        try {
          await insertClipFrames(clip.id, frames)
        } catch {
          /* frames are nice-to-have for ML; don't fail the save */
        }
      }

      // 6. Build the baseline and flip the clip to calibrated.
      setSaveStage('baseline')

      // Detection-ratio sanity check (M4). If MediaPipe lost the person for
      // most of the clip the baseline would be garbage — surface that and
      // leave the clip in 'pending' so the instructor can re-record.
      const detection = clipDetectionRatio(frames.length, recorded.durationMs / 1000, fps)
      // Store the framing-quality cue. Best-effort + separate so a missing
      // detection_ratio column never blocks the save.
      await supabase.from('clips').update({ detection_ratio: detection }).eq('id', clip.id)
      if (detection < 0.3) {
        await supabase
          .from('clips')
          .update({ status: 'pending' })
          .eq('id', clip.id)
        setSaveStage('idle')
        setError(t('lowDetection', { pct: Math.round(detection * 100) }))
        return
      }

      const baseline = buildClipBaseline(frames, clipType, angle, selectedMetrics)

      // Generate the personal-reference summary string once, here, so the
      // student detail page doesn't have to hit Claude on every page load
      // (review H6). Non-blocking: a failed summary just leaves the field
      // null and the student page falls back to the on-demand fetch path.
      let baselineSummary: string | null = null
      if (baseline) {
        try {
          const res = await fetch('/api/baseline-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseline,
              cameraAngle: angle,
              checkpointName: finalName,
              instructorNote: null,
              selectedMetrics,
              marksCount: frames.length,
              checkpointType: clipType,
            }),
          })
          if (res.ok) {
            const data = (await res.json()) as { summary?: string }
            baselineSummary = data.summary ?? null
          }
        } catch {
          /* leave null */
        }
      }

      await supabase
        .from('clips')
        .update({
          baseline,
          baseline_summary: baselineSummary,
          status: baseline ? 'calibrated' : 'pending',
        })
        .eq('id', clip.id)

      // 7. Done. Clean the in-memory blob and bounce to the student profile.
      leavingRef.current = true
      reset()
      router.replace(`/instructor/students/${studentId}`)
    } catch (e: unknown) {
      setSaveStage('idle')
      const reason = e instanceof Error ? e.message : String(e)
      setError(`${t('saveErrorTitle')}: ${reason}`)
    }
  }

  const handleDiscard = () => {
    leavingRef.current = true
    reset()
    router.replace(`/instructor/students/${studentId}`)
  }

  // ---- Render ------------------------------------------------------

  if (!recorded || !videoUrl) {
    // The guard useEffect will bounce; show a brief loading state in the
    // meantime instead of flashing an empty page.
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
      </div>
    )
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  // Map the save stage to a 3-step stepper (save → analyze → reference).
  const currentStep =
    saveStage === 'upload' || saveStage === 'insert' ? 0 :
    saveStage === 'frames' ? 1 :
    saveStage === 'baseline' ? 2 : -1

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Link
          href={`/instructor/students/${studentId}/clips/new/record`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back')}
        </Link>
        <h1 className="text-sm font-semibold">{t('title')}</h1>
        <button
          type="button"
          onClick={() => setDiscardOpen(true)}
          className="text-sm text-muted-foreground hover:text-bad transition-colors"
        >
          {t('discard')}
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6">
        {/* Video stage — 60% on lg+ */}
        <div className="lg:basis-3/5 flex flex-col gap-3">
          <div className="flex justify-center">
            {/* inline-block so the stage hugs the video exactly — the canvas
                overlays at inset-0 and its normalized coords stay aligned. */}
            <div ref={videoStageRef} className="relative inline-block bg-black rounded-md overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                className="block max-h-[60vh] max-w-full"
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={onTimeUpdate}
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}
                playsInline
              />
              {/* The drawing surface is portaled here by AnnotationCanvas. */}
            </div>
          </div>

          {/* Playback controls — hidden while annotating a frozen frame */}
          {!canvasOpen && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? t('pause') : t('play')}
              className="size-11 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors"
            >
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
              )}
            </button>

            {/* Scrubber */}
            <div className="flex-1 min-w-[160px] flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.max(1, duration)}
                step={50}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-ok"
                style={{ background: `linear-gradient(to right, var(--ok) ${progressPct}%, var(--secondary) ${progressPct}%)` }}
              />
              <span className="text-xs font-mono text-muted-foreground tabular-nums min-w-[64px] text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Speed selector */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              {PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                    speed === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Annotate button — only when paused (otherwise the canvas would drift) */}
          {!playing && !canvasOpen && (
            <button
              type="button"
              onClick={openCanvas}
              className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ok/15 text-ok border border-ok/30 hover:bg-ok/20 transition-colors font-medium text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              {t('annotateMoment')}
            </button>
          )}

          {/* Annotation controls — rendered below the video, surface portals over it */}
          {canvasOpen && canvasSize && (
            <AnnotationCanvas
              ref={annotationRef}
              width={canvasSize.width}
              height={canvasSize.height}
              surfaceEl={videoStageRef.current}
              header={formatTime(currentTime)}
              onSave={handleCanvasSave}
              onCancel={handleCanvasCancel}
            />
          )}
        </div>

        {/* Right panel — 40% on lg+ */}
        <aside className="lg:basis-2/5 flex flex-col gap-4">
          {/* Metadata form */}
          <div className="bg-card border border-border rounded-md p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clip-name" className="text-sm">
                {t('nameLabel')} <span className="font-normal text-muted-foreground">{t('nameOptional')}</span>
              </Label>
              <Input
                id="clip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholderOptional', { default: defaultName })}
                className="bg-secondary border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">{t('angleLabel')}</Label>
              <div className="flex gap-2">
                <SegBtn active={angle === 'face_on'} onClick={() => setAngle('face_on')}>{t('angleFaceOn')}</SegBtn>
                <SegBtn active={angle === 'dtl'} onClick={() => setAngle('dtl')}>{t('angleDtl')}</SegBtn>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">{t('typeLabel')}</Label>
              <div className="flex gap-2">
                <SegBtn active={clipType === 'position'} onClick={() => setClipType('position')}>{t('typePosition')}</SegBtn>
                <SegBtn active={clipType === 'swing'} onClick={() => setClipType('swing')}>{t('typeSwing')}</SegBtn>
              </div>
            </div>
          </div>

          {/* Annotations list */}
          <div className="bg-card border border-border rounded-md p-4 flex flex-col gap-3 min-h-[140px]">
            <h2 className="text-sm font-semibold text-foreground">
              {t('annotationsTitle')} {annotations.length > 0 && <span className="text-muted-foreground font-normal">({annotations.length})</span>}
            </h2>

            {annotations.length === 0 ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{t('annotationsEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...annotations]
                  .sort((a, b) => a.frame_timestamp_ms - b.frame_timestamp_ms)
                  .map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => jumpToAnnotation(a)}
                        className="flex-1 text-left flex items-center gap-3"
                      >
                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                          {formatTime(a.frame_timestamp_ms)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-foreground">
                          {a.strokes.length > 0 && <Badge>✎ {a.strokes.length}</Badge>}
                          {a.audio_blob && <Badge>🎙</Badge>}
                          {a.text_note && <Badge>✉</Badge>}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAnnotation(a.id)}
                        aria-label={t('deleteAnnotation')}
                        className="size-7 rounded-md text-muted-foreground hover:text-bad hover:bg-bad/10 flex items-center justify-center transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                        </svg>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Save */}
          {error && (
            <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-2.5 leading-snug">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="h-12 rounded-xl bg-primary text-primary-foreground hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {t('save')}
          </button>
        </aside>
      </div>

      {/* Saving overlay — a plain-language stepper so the long save reads as
          progress, not a frozen spinner. */}
      {saveStage !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="bg-card border border-border rounded-md px-7 py-7 max-w-sm w-full flex flex-col gap-5">
            <p className="font-display font-semibold text-lg">{t('savingTitle')}</p>

            <ol className="flex flex-col gap-3.5">
              <SaveStep state={stepState(0, currentStep)} label={t('stepSave')} />
              <SaveStep
                state={stepState(1, currentStep)}
                label={t('stepAnalyze')}
                pct={currentStep === 1 ? framesPct : undefined}
              />
              <SaveStep state={stepState(2, currentStep)} label={t('stepReference')} />
            </ol>

            <p className="text-xs text-muted-foreground leading-snug">{t('savingReassure')}</p>
          </div>
        </div>
      )}

      {/* Discard confirmation */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('discardConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('discardConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setDiscardOpen(false)} className="flex-1 border-border">
              {t('discardConfirmCancel')}
            </Button>
            <Button variant="destructive" onClick={handleDiscard} className="flex-1">
              {t('discardConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Tiny presentational helpers ---

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-ok/15 text-ok border border-ok/40'
          : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded bg-background/60 text-[10px]">{children}</span>
}

// --- Save stepper ---

type StepState = 'done' | 'active' | 'pending'

function stepState(index: number, current: number): StepState {
  if (index < current) return 'done'
  if (index === current) return 'active'
  return 'pending'
}

function SaveStep({ state, label, pct }: { state: StepState; label: string; pct?: number }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">
        {state === 'done' ? (
          <span className="size-5 rounded-full bg-ok text-black flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
        ) : state === 'active' ? (
          <span className="size-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        ) : (
          <span className="size-5 rounded-full border-2 border-rule" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
          {label}
          {state === 'active' && typeof pct === 'number' && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums"> · {pct}%</span>
          )}
        </p>
        {state === 'active' && typeof pct === 'number' && (
          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-1.5">
            <div className="h-full bg-ok transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </li>
  )
}

// --- Snapshot compositing ---
// Draw the frozen video frame + the strokes onto an offscreen canvas and
// export a JPEG. The source video is a same-origin blob URL, so the canvas is
// not tainted and toBlob() works.

const SNAPSHOT_COLOR_HEX: Record<StrokeColor, string> = {
  red: '#f04848',
  yellow: '#e8b930',
  green: '#34d178',
  white: '#ffffff',
}

async function captureSnapshot(
  video: HTMLVideoElement,
  strokes: Stroke[],
  fallbackW: number,
  fallbackH: number,
): Promise<Blob | null> {
  try {
    const w = video.videoWidth || fallbackW
    const h = video.videoHeight || fallbackH
    if (!w || !h) return null
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)

    const lineW = Math.max(3, Math.round(w / 200))
    const dotR = Math.max(4, Math.round(w / 130))
    for (const s of strokes) {
      const hex = SNAPSHOT_COLOR_HEX[s.color] ?? '#f04848'
      ctx.strokeStyle = hex
      ctx.fillStyle = hex
      ctx.lineWidth = lineW
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const [a, b] = s.points
      const ax = a[0] * w, ay = a[1] * h
      const bx = b[0] * w, by = b[1] * h
      if (s.type === 'circle') {
        ctx.beginPath()
        ctx.arc(ax, ay, Math.hypot(bx - ax, by - ay), 0, Math.PI * 2)
        ctx.stroke()
        continue
      }
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      if (s.type === 'arrow') {
        const angle = Math.atan2(by - ay, bx - ax)
        const head = lineW * 3.5
        const left = angle + Math.PI - Math.PI / 7
        const right = angle + Math.PI + Math.PI / 7
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + head * Math.cos(left), by + head * Math.sin(left))
        ctx.lineTo(bx + head * Math.cos(right), by + head * Math.sin(right))
        ctx.closePath()
        ctx.fill()
      } else {
        for (const [px, py] of [[ax, ay], [bx, by]]) {
          ctx.beginPath()
          ctx.arc(px, py, dotR, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
    )
  } catch {
    return null
  }
}
