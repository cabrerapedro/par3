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
import { Label } from '@/components/ui/label'
import { AnnotationCanvas, type AnnotationDraft, type AnnotationCanvasHandle, type Stroke, type StrokeColor } from '@/components/AnnotationCanvas'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getOrCreateTodayClass } from '@/lib/classes'
import { ensureAdHocStep } from '@/lib/journeySteps'
import { METRICS_BY_ANGLE } from '@/lib/baseline'
import { enqueueClipSave } from '@/lib/clipSaveQueue'
import { withTimeout, retry, sbCall } from '@/lib/net'
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

// The save is short now: class + clip row + annotations. The heavy work
// (video upload, MediaPipe, baseline) runs in lib/clipSaveQueue afterwards.
type SaveStage = 'idle' | 'saving'

export default function ClipAnnotatePage() {
  const t = useTranslations('instructor.clips.annotate')
  const params = useParams()
  const router = useRouter()
  const studentId = params.id as string
  const { instructor } = useAuth()

  const { recorded, hydrated, getVideoUrl, reset } = useClipFlow()

  const [saveStage, setSaveStage] = useState<SaveStage>('idle')

  // Set when we intentionally leave (after save or discard). Without this, the
  // reset() that clears the recorded blob would make `recorded` null and trip
  // the guard below, bouncing the instructor back to the record screen instead
  // of the student profile.
  const leavingRef = useRef(false)

  // ---- Guard: no recording → bounce back to /record ---------------
  // Wait for `hydrated` so we don't bounce while the layout is still reading
  // the clip back from IndexedDB after a re-mount.
  useEffect(() => {
    if (hydrated && !recorded && !leavingRef.current) {
      router.replace(`/instructor/students/${studentId}/clips/new/record`)
    }
  }, [hydrated, recorded, router, studentId])

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
  // Pre-filled from the angle the instructor chose on the record screen.
  const [angle, setAngle] = useState<CameraAngle>(() => recorded?.angle ?? 'face_on')
  const [clipType, setClipType] = useState<ClipType>('position')
  const [annotations, setAnnotations] = useState<DraftAnnotation[]>([])
  const [error, setError] = useState<string | null>(null)
  // Optional clip name so clips in the same class don't all read "Posición".
  const [clipName, setClipName] = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const [backOpen, setBackOpen] = useState(false)

  // Recorded from a plan step? Pre-fill the clip name with that step's title.
  // Saves typing, and if the wrong step was picked the mismatch is obvious in
  // the name field before saving. Only fills when the name is still empty.
  useEffect(() => {
    const stepId = recorded?.journeyItemId
    if (!stepId) return
    let cancelled = false
    supabase.from('journey_items').select('title').eq('id', stepId).single().then(({ data }) => {
      const title = (data as { title?: string } | null)?.title
      if (!cancelled && title) setClipName(prev => prev || title)
    })
    return () => { cancelled = true }
  }, [recorded])

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

  // On the rehydrate path `recorded` arrives after mount, so the useState
  // initializer above ran with it still null. Seed the angle once it's known
  // (only once, so we never clobber a manual change).
  const angleSeededRef = useRef(false)
  useEffect(() => {
    if (!angleSeededRef.current && recorded?.angle) {
      setAngle(recorded.angle)
      angleSeededRef.current = true
    }
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
  // we still keep the strokes + transcript text. Returns true if the core
  // annotation row (strokes + audio + note) persisted, false if it was lost.
  const persistAnnotation = useCallback(
    async (clipId: string, draft: DraftAnnotation): Promise<boolean> => {
      let audioUrl: string | null = null
      let transcript: string | null = null

      if (draft.audio_blob) {
        const m = draft.audio_mime ?? ''
        const ext = m.includes('wav') ? 'wav' : m.includes('mp4') ? 'm4a' : 'webm'
        const path = `${clipId}/${crypto.randomUUID()}.${ext}`
        // Timeout + one retry: audio blobs are small (hundreds of KB), so a
        // stall here is a connection hiccup, not a size problem.
        try {
          await retry(
            () => sbCall(
              supabase.storage.from('clip-annotations-audio').upload(path, draft.audio_blob!, {
                contentType: draft.audio_mime || 'audio/webm',
              }),
              'audio upload',
              30_000,
            ),
            { tries: 2, label: 'annotation audio' },
          )
          audioUrl = supabase.storage.from('clip-annotations-audio').getPublicUrl(path).data.publicUrl
        } catch { /* keep strokes + note without audio */ }

        // Best-effort transcribe, with a hard timeout so Whisper being slow
        // never stalls the save. No text ≠ lost audio.
        try {
          const fd = new FormData()
          fd.append('audio', draft.audio_blob, `audio.${ext}`)
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: fd,
            signal: AbortSignal.timeout(20_000),
          })
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
        try {
          await retry(
            () => sbCall(
              supabase.storage.from('clip-videos').upload(snapPath, draft.snapshot_blob!, {
                contentType: 'image/jpeg',
              }),
              'snapshot upload',
              30_000,
            ),
            { tries: 2, label: 'annotation snapshot' },
          )
          snapshotUrl = supabase.storage.from('clip-videos').getPublicUrl(snapPath).data.publicUrl
        } catch { /* snapshot is a nice-to-have */ }
      }

      // Insert the core annotation first — strokes, audio and note must never
      // be lost over a snapshot problem.
      const inserted = await retry(async () => {
        const { data, error: insErr } = await withTimeout(
          Promise.resolve(
            supabase
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
              .single(),
          ),
          20_000,
          'insert annotation',
        )
        if (insErr || !data) throw insErr ?? new Error('no row returned')
        return data
      }, { tries: 2, label: 'annotation insert' }).catch(() => null)

      // The core row is what the instructor's drawing/voice note lives in — if
      // it didn't persist, report the failure so we can warn them.
      if (!inserted) return false

      // Attach the snapshot URL as a best-effort follow-up. If the
      // detection_ratio/snapshot_url column isn't there yet, this just no-ops.
      if (snapshotUrl) {
        await supabase
          .from('clip_annotations')
          .update({ snapshot_url: snapshotUrl })
          .eq('id', inserted.id)
      }
      return true
    },
    [studentId],
  )

  // Analysis + baseline live in lib/clipSaveQueue now (background). The
  // orphan-clip retry path on the detail page keeps its own pipeline via
  // lib/baseline's buildClipBaseline.

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

    const finalName = clipName.trim() || defaultName
    const selectedMetrics = METRICS_BY_ANGLE[angle] ?? []

    try {
      // 1. Class for today (creates one if 24h since the last).
      setSaveStage('saving')
      const cls = await withTimeout(
        getOrCreateTodayClass(studentId, instructor.id),
        15_000,
        'create class',
      )

      // 2. Decide the video's storage path now — the actual upload happens in
      // the background queue (resumable TUS), so a slow hotspot never blocks
      // the instructor mid-lesson. Path namespaced by student + class so we
      // don't collide and a single cascading delete cleans up.
      const ext = recorded.mime.includes('webm') ? 'webm' : recorded.mime.includes('mp4') ? 'mp4' : 'bin'
      const videoPath = `${studentId}/${cls.id}/${crypto.randomUUID()}.${ext}`

      // 3. Insert the clip row (video_url arrives when the upload finishes),
      // linked to the step it was recorded into ("abre el paso y graba"). An
      // ad-hoc clip (no step) gets a fresh step created and linked AFTER the
      // insert succeeds (step 3b) — so a failed save can never leave an
      // orphan step/plan behind on retry.
      const { data: clip, error: clipErr } = await withTimeout(
        Promise.resolve(
          supabase
            .from('clips')
            .insert({
              class_id: cls.id,
              journey_item_id: recorded.journeyItemId ?? null,
              student_id: studentId,
              instructor_id: instructor.id,
              name: finalName,
              camera_angle: angle,
              clip_type: clipType,
              video_url: null,
              selected_metrics: selectedMetrics,
              status: 'pending',
            })
            .select()
            .single(),
        ),
        20_000,
        'insert clip',
      )
      if (clipErr || !clip) throw clipErr ?? new Error('Failed to insert clip')

      // 3b. Ad-hoc recording (no step chosen): now that the clip exists, append a
      // step to the student's last plan and link it. Best-effort — a link failure
      // leaves the clip in the Clips tab rather than blocking the save.
      if (!recorded.journeyItemId) {
        const stepId = await ensureAdHocStep(studentId, instructor.id, finalName, t('defaultPlanName'))
        if (stepId) await supabase.from('clips').update({ journey_item_id: stepId }).eq('id', clip.id)
      }

      // 4. Persist annotations one by one. Each is best-effort; we don't
      // want a flaky single audio upload to bury the whole clip. But if any
      // annotation's core row is lost, the instructor must be told — a clip
      // that "saved" while dropping drawings/voice notes is worse than a warning.
      let annotationsFailed = false
      for (const a of allAnnotations) {
        try {
          const ok = await persistAnnotation(clip.id, a)
          if (!ok) annotationsFailed = true
        } catch {
          annotationsFailed = true
        }
      }

      // 5. Hand the heavy work (resumable video upload, MediaPipe analysis,
      // baseline) to the background queue. The blob is persisted in IndexedDB
      // by the queue, so it survives a relaunch; the sync pill in the
      // instructor layout shows progress and surfaces anything that needs
      // review (angle mismatch, failed calibration).
      await enqueueClipSave({
        clipId: clip.id,
        studentId,
        clipName: finalName,
        blob: recorded.blob,
        mime: recorded.mime,
        durationMs: recorded.durationMs,
        cameraAngle: angle,
        clipType,
        selectedMetrics,
        videoPath,
        createdAt: Date.now(),
      })

      // 6. If any annotation was lost, don't slip away silently — the clip is
      // saved, but the instructor's drawings/voice notes may be incomplete.
      // Keep them on the page with a visible warning so they can check.
      if (annotationsFailed) {
        setSaveStage('idle')
        setError(t('annotationsSaveWarning'))
        return
      }

      // 7. Done here. Clean the handoff blob (the queue holds its own copy)
      // and get the instructor back to the class.
      leavingRef.current = true
      reset()
      router.replace(`/instructor/students/${studentId}`)
    } catch (e: unknown) {
      // Show a plain, reassuring message; keep the technical reason in the
      // console for debugging instead of scaring the instructor mid-lesson.
      console.error('clip save failed:', e)
      setSaveStage('idle')
      setError(t('saveErrorFriendly'))
    }
  }

  const handleDiscard = () => {
    leavingRef.current = true
    reset()
    router.replace(`/instructor/students/${studentId}`)
  }

  // Top-left "back / re-record". If there's unsaved work, ask first so Steve
  // never loses a clip by reflexively tapping back; otherwise just go.
  const hasUnsavedWork = annotations.length > 0 || canvasOpen
  // Preserve the step when re-recording, so the retake stays linked to the same
  // plan step instead of silently becoming an ad-hoc clip.
  const goToRecord = () => router.push(`/instructor/students/${studentId}/clips/new/record${recorded?.journeyItemId ? `?step=${recorded.journeyItemId}` : ''}`)
  const handleBack = () => {
    if (hasUnsavedWork) setBackOpen(true)
    else goToRecord()
  }
  const handleBackRerecord = () => {
    setBackOpen(false)
    goToRecord()
  }
  const handleBackSave = () => {
    setBackOpen(false)
    void handleSave()
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back')}
        </button>
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
        {/* Video stage — wider on lg+; full width when stacked (portrait iPad) */}
        <div className="lg:basis-2/3 flex flex-col gap-3">
          <div className="flex justify-center">
            {/* inline-block so the stage hugs the video exactly — the canvas
                overlays at inset-0 and its normalized coords stay aligned. */}
            <div ref={videoStageRef} className="relative inline-block bg-black rounded-md overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                className="block max-h-[64vh] max-w-full"
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
              className="self-start inline-flex items-center gap-2.5 min-h-[48px] px-5 py-3 rounded-xl bg-ok/15 text-ok border border-ok/30 hover:bg-ok/20 transition-colors font-semibold text-base"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Right panel — narrower on lg+; stacks below the video in portrait */}
        <aside className="lg:basis-1/3 flex flex-col gap-4">
          {/* Metadata form */}
          <div className="bg-card border border-border rounded-md p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clipName" className="text-sm">{t('nameLabel')}</Label>
              <input
                id="clipName"
                value={clipName}
                onChange={e => setClipName(e.target.value)}
                placeholder={defaultName}
                className="h-10 px-3 bg-secondary border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
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

          {/* While annotating, the single green CTA is "Guardar anotación" in
              the canvas controls — so this drops to a muted style to avoid two
              competing primaries. It still works (it rescues the open drawing). */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`h-12 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              canvasOpen
                ? 'bg-secondary text-muted-foreground border border-border hover:bg-secondary/70'
                : 'bg-primary text-primary-foreground hover:opacity-85'
            }`}
          >
            {t('save')}
          </button>
        </aside>
      </div>

      {/* Saving overlay — short now: clip row + annotations only. The video
          upload + analysis continue in the background queue (sync pill). */}
      {saveStage !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="bg-card border border-border rounded-md px-7 py-7 max-w-sm w-full flex flex-col items-center gap-4 text-center">
            <span className="size-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-display font-semibold text-lg">{t('savingTitle')}</p>
            <p className="text-xs text-muted-foreground leading-snug">{t('savingBackgroundNote')}</p>
          </div>
        </div>
      )}

      {/* Back / re-record confirmation — only shown when there's unsaved work */}
      <Dialog open={backOpen} onOpenChange={setBackOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('backConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('backConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleBackSave} className="w-full">
              {t('backConfirmSave')}
            </Button>
            <Button variant="outline" onClick={handleBackRerecord} className="w-full border-border">
              {t('backConfirmRerecord')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
