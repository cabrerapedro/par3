'use client'

// Instructor-side clip detail. Minimal first pass: video player with
// annotation markers on the timeline, per-annotation list with audio +
// transcript + strokes count + text note, and a delete action that
// cascades cleanly through the DB (clip_frames, clip_annotations, and
// linked practice_sessions clip_id reference) thanks to the ON DELETE
// CASCADE constraints in schema.sql.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Clip } from '@/lib/classes'
import type { Stroke } from '@/components/AnnotationCanvas'
import { processClip } from '@/lib/processClip'
import { insertClipFrames } from '@/lib/frames'
import { METRICS_BY_ANGLE, buildClipBaseline, clipDetectionRatio, baselineMetricsVersion } from '@/lib/baseline'
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
import { cn } from '@/lib/utils'

interface AnnotationRow {
  id: string
  frame_timestamp_ms: number
  strokes: Stroke[]
  audio_url: string | null
  audio_transcript: string | null
  text_note: string | null
  snapshot_url: string | null
}

interface SessionRow {
  id: string
  date: string
  duration_seconds: number
  overall_score: number
  instructor_feedback?: 'agree' | 'disagree' | null
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ClipDetailPage() {
  const t = useTranslations('instructor.clips.detail')
  const tStudents = useTranslations('instructor.students')
  const params = useParams()
  const router = useRouter()
  const studentId = params.id as string
  const clipId = params.clipId as string
  const { instructor, loading: authLoading } = useAuth()

  const locale = useLocale()
  const [clip, setClip] = useState<Clip | null>(null)
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Edit clip data (name / angle / type). Changing angle or type rebuilds the
  // baseline, so we reuse the retry pipeline.
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAngle, setEditAngle] = useState<'face_on' | 'dtl'>('face_on')
  const [editType, setEditType] = useState<'position' | 'swing'>('position')
  const [savingEdit, setSavingEdit] = useState(false)
  // H7 — orphan-clip recovery: re-run the post-save pipeline for a clip
  // whose initial save was interrupted (browser back, tab close, transient
  // network) and left the row in 'pending' with a video but no baseline.
  const [retrying, setRetrying] = useState(false)
  const [retryPct, setRetryPct] = useState(0)
  const [retryError, setRetryError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!instructor) {
      router.replace('/instructor/login')
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, instructor, clipId])

  async function load() {
    setLoading(true)
    setError(null)
    const [{ data: c, error: cErr }, { data: a }, { data: s }] = await Promise.all([
      supabase.from('clips').select('*').eq('id', clipId).single(),
      supabase
        .from('clip_annotations')
        .select('*')
        .eq('clip_id', clipId)
        .order('frame_timestamp_ms', { ascending: true }),
      supabase
        .from('practice_sessions')
        .select('*')
        .eq('clip_id', clipId)
        .order('date', { ascending: false }),
    ])
    if (cErr || !c) {
      setError(t('loadError'))
      setLoading(false)
      return
    }
    setClip(c as Clip)
    setAnnotations((a ?? []) as AnnotationRow[])
    setSessions((s ?? []) as SessionRow[])
    setLoading(false)
  }

  // The instructor's verdict on an evaluation ("¿refleja lo que ves?").
  // Tapping the active choice again clears it. Optimistic UI with revert —
  // the write can fail if schema.sql hasn't been re-run (missing column).
  async function setSessionFeedback(sessionId: string, value: 'agree' | 'disagree') {
    const prev = sessions
    const current = prev.find((s) => s.id === sessionId)?.instructor_feedback
    const next = current === value ? null : value
    setSessions(prev.map((s) => (s.id === sessionId ? { ...s, instructor_feedback: next } : s)))
    const { error: fbErr } = await supabase
      .from('practice_sessions')
      .update({ instructor_feedback: next })
      .eq('id', sessionId)
    if (fbErr) {
      console.error('instructor_feedback update failed (schema.sql re-run needed?)', fbErr)
      setSessions(prev)
    }
  }

  function seekTo(ms: number) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = ms / 1000
    if (!v.paused) v.pause()
  }

  async function retryProcessing(target?: Clip) {
    const c = target ?? clip
    if (!c || !c.video_url || retrying) return
    setRetrying(true)
    setRetryPct(0)
    setRetryError(null)

    try {
      // 1. Fetch the stored video back from Supabase Storage as a Blob.
      const res = await fetch(c.video_url)
      if (!res.ok) throw new Error(`Couldn't fetch video (HTTP ${res.status})`)
      const blob = await res.blob()

      // 2. Run MediaPipe over the frames (lite model, posture sampled lower for
      // speed). processClip's per-frame timeout cap means a stuck WASM session
      // throws instead of looping for minutes.
      const fps = c.clip_type === 'swing' ? 10 : 5
      const frames = await processClip({
        videoBlob: blob,
        cameraAngle: c.camera_angle,
        fps,
        onProgress: (p) => setRetryPct(Math.round(p * 100)),
      })

      // 3. Detection-ratio sanity check (M4).
      const durationSeconds = blob.size > 0 ? frames.length / fps + 1 : 30
      const detection = clipDetectionRatio(frames.length, durationSeconds, fps)
      if (detection < 0.3) {
        setRetryError(t('lowDetection', { pct: Math.round(detection * 100) }))
        setRetrying(false)
        return
      }

      // 4. Persist frames (best-effort) + rebuild baseline. A recalibration
      // re-inserts the whole frame stream, so clear the previous one first —
      // otherwise every retry duplicates rows in the ML corpus.
      if (frames.length > 0) {
        try {
          await supabase.from('clip_frames').delete().eq('clip_id', c.id)
          await insertClipFrames(c.id, frames)
        } catch {}
      }
      const selectedMetrics = c.selected_metrics?.length
        ? c.selected_metrics
        : METRICS_BY_ANGLE[c.camera_angle] ?? []
      const baseline = buildClipBaseline(frames, c.clip_type, c.camera_angle, selectedMetrics)

      if (!baseline) {
        setRetryError(t('retryNoBaseline'))
        setRetrying(false)
        return
      }

      // 5. Flip the row to calibrated. Skip the AI summary on retry — the
      // student detail page falls back to the on-demand fetch path.
      await supabase
        .from('clips')
        .update({ baseline, status: 'calibrated' })
        .eq('id', c.id)
      // Best-effort framing-quality cue (column may not exist yet).
      await supabase.from('clips').update({ detection_ratio: detection }).eq('id', c.id)

      // 6. Reload to show the new state.
      setRetrying(false)
      await load()
    } catch (e: unknown) {
      setRetrying(false)
      const reason = e instanceof Error ? e.message : String(e)
      setRetryError(`${t('retryFailed')}: ${reason}`)
    }
  }

  function openEdit() {
    if (!clip) return
    setEditName(clip.name)
    setEditAngle(clip.camera_angle)
    setEditType(clip.clip_type)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!clip || savingEdit) return
    setSavingEdit(true)
    const needsRecompute = editAngle !== clip.camera_angle || editType !== clip.clip_type
    const update: {
      name: string
      camera_angle: 'face_on' | 'dtl'
      clip_type: 'position' | 'swing'
      selected_metrics: string[]
      baseline?: null
      status?: Clip['status']
    } = {
      name: editName.trim() || clip.name,
      camera_angle: editAngle,
      clip_type: editType,
      selected_metrics: METRICS_BY_ANGLE[editAngle] ?? [],
    }
    if (needsRecompute) {
      // The baseline was computed for the old angle/type — invalidate it and
      // rebuild from the stored video below.
      update.baseline = null
      update.status = 'pending'
    }
    const { error: upErr } = await supabase.from('clips').update(update).eq('id', clip.id)
    setSavingEdit(false)
    setEditOpen(false)
    if (upErr) {
      setError(t('loadError'))
      return
    }
    const newClip = { ...clip, ...update } as Clip
    setClip(newClip)
    if (needsRecompute) {
      await retryProcessing(newClip)
    }
  }

  async function handleDelete() {
    if (!clip) return
    setDeleting(true)
    // ON DELETE CASCADE on clip_frames + clip_annotations handles the
    // related rows; practice_sessions.clip_id has ON DELETE SET NULL so
    // legacy history rows survive but lose their link.
    await supabase.from('clips').delete().eq('id', clip.id)
    router.replace(`/instructor/students/${studentId}`)
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (error || !clip) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-bad">{error}</p>
        <Link href={`/instructor/students/${studentId}`} className="text-sm text-muted-foreground hover:text-foreground">
          {t('back')}
        </Link>
      </div>
    )
  }

  // Skip internal `_`-prefixed fields (e.g. the `_v` metrics-version stamp).
  const baselineMetricKeys = clip.baseline && typeof clip.baseline === 'object' && !('_type' in (clip.baseline as object))
    ? Object.keys(clip.baseline as Record<string, unknown>).filter(k => !k.startsWith('_'))
    : []

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
          <Link
            href={`/instructor/students/${studentId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('back')}
          </Link>
          <h1 className="text-sm font-semibold truncate">{clip.name}</h1>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={openEdit}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('editCta')}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="text-sm text-muted-foreground hover:text-bad transition-colors"
            >
              {t('deleteCta')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">
        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={clip.status} t={t} />
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
            {clip.camera_angle === 'face_on' ? tStudents('angleFaceOn') : tStudents('angleDtl')}
          </span>
          {clip.clip_type === 'swing' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
              {t('typeSwing')}
            </span>
          )}
          {clip.status === 'calibrated' && baselineMetricKeys.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-ok/10 text-ok border border-ok/30">
              {t('baselineMetricsCount', { count: baselineMetricKeys.length })}
            </span>
          )}
          {/* Calibrated before the v2 (body-normalized) metrics — still works,
              but re-recording upgrades its precision. */}
          {clip.status === 'calibrated' && clip.baseline != null && baselineMetricsVersion(clip.baseline) < 2 && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-warn/10 text-warn border border-warn/30"
              title={t('legacyBaselineHint')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4M12 16h.01" /><circle cx="12" cy="12" r="9" />
              </svg>
              {t('legacyBaseline')}
            </span>
          )}
          {typeof clip.detection_ratio === 'number' && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border',
                clip.detection_ratio >= 0.6
                  ? 'bg-ok/10 text-ok border-ok/30'
                  : 'bg-warn/10 text-warn border-warn/30',
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="12" cy="12" r="4" />
              </svg>
              {clip.detection_ratio >= 0.6 ? t('framingGood') : t('framingFair')}
            </span>
          )}
        </div>

        {/* Pending-state recovery banner — H7 fix. Shown when a clip's save
            was interrupted (no baseline yet) but the video did upload. */}
        {clip.status === 'pending' && clip.video_url && (
          <div className="bg-warn/10 border border-warn/30 rounded-xl px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t('pendingHint')}</p>
              {retryError && <p className="text-xs text-bad">{retryError}</p>}
              {retrying && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden max-w-xs">
                    <div className="h-full bg-warn transition-all duration-200" style={{ width: `${retryPct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{t('retrying', { pct: retryPct })}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => retryProcessing()}
              disabled={retrying}
              className="h-9 px-4 rounded-lg bg-warn text-black text-sm font-semibold hover:bg-warn/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {t('retryCta')}
            </button>
          </div>
        )}

        {/* Video stage. The instructor's drawing is intentionally NOT overlaid
            on the video — the per-annotation snapshots below carry the drawing. */}
        <div className="relative bg-black rounded-md overflow-hidden">
          {clip.video_url ? (
            <video
              ref={videoRef}
              src={clip.video_url}
              controls
              className="w-full max-h-[60vh] object-contain"
              playsInline
            />
          ) : (
            <div className="aspect-video flex items-center justify-center text-muted-foreground text-sm">
              {t('videoUnavailable')}
            </div>
          )}
        </div>

        {/* Annotations list */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {t('annotationsHeader')}
            {annotations.length > 0 && <span className="text-muted-foreground font-normal"> ({annotations.length})</span>}
          </h2>

          {annotations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('annotationsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {annotations.map((a) => (
                <li key={a.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {a.snapshot_url && (
                      <button
                        type="button"
                        onClick={() => seekTo(a.frame_timestamp_ms)}
                        className="shrink-0 self-start"
                        aria-label={t('snapshotAlt')}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.snapshot_url}
                          alt={t('snapshotAlt')}
                          className="w-full sm:w-72 rounded-lg border border-border"
                          loading="lazy"
                        />
                      </button>
                    )}

                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => seekTo(a.frame_timestamp_ms)}
                        className="flex items-center gap-3 text-left"
                      >
                        <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                          {formatTime(a.frame_timestamp_ms)}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.strokes.length > 0 && (
                            <Chip>{t('annotationStrokes', { count: a.strokes.length })}</Chip>
                          )}
                          {a.audio_url && <Chip>{t('annotationAudio')}</Chip>}
                          {a.text_note && <Chip>{t('annotationNote')}</Chip>}
                        </div>
                      </button>

                      {a.audio_transcript && (
                        <p className="text-sm text-muted-foreground italic leading-relaxed">
                          “{a.audio_transcript}”
                        </p>
                      )}
                      {a.text_note && (
                        <p className="text-sm text-foreground leading-relaxed">{a.text_note}</p>
                      )}
                      {a.audio_url && (
                        <audio
                          src={a.audio_url}
                          controls
                          className="w-full h-10 mt-auto"
                          preload="metadata"
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Student practice attempts — the Saturday review surface. The 👍/👎
            is the instructor's verdict on each evaluation; those labels are
            what will let us calibrate the traffic light against the coach's
            eye (measurement-validation loop). */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-1">
            {t('sessionsHeader')}
            {sessions.length > 0 && <span className="text-muted-foreground font-normal"> ({sessions.length})</span>}
          </h2>
          {sessions.length > 0 && (
            <p className="text-xs text-muted-foreground mb-3">{t('sessionsFeedbackHint')}</p>
          )}

          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('sessionsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.id} className="bg-card border border-border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[10rem]">
                    <p className="text-sm text-foreground font-medium capitalize">
                      {new Date(s.date).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
                        weekday: 'long', day: 'numeric', month: 'short',
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('sessionMeta', {
                        duration: s.duration_seconds < 60
                          ? `${s.duration_seconds}s`
                          : `${Math.floor(s.duration_seconds / 60)}m ${s.duration_seconds % 60}s`,
                        score: s.overall_score,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSessionFeedback(s.id, 'agree')}
                      aria-pressed={s.instructor_feedback === 'agree'}
                      title={t('feedbackAgree')}
                      className={cn(
                        'h-10 px-3 rounded-lg border text-sm font-medium transition-colors inline-flex items-center gap-1.5',
                        s.instructor_feedback === 'agree'
                          ? 'bg-ok/15 text-ok border-ok/40'
                          : 'bg-secondary text-muted-foreground border-transparent hover:text-foreground',
                      )}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                      </svg>
                      {t('feedbackAgree')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSessionFeedback(s.id, 'disagree')}
                      aria-pressed={s.instructor_feedback === 'disagree'}
                      title={t('feedbackDisagree')}
                      className={cn(
                        'h-10 px-3 rounded-lg border text-sm font-medium transition-colors inline-flex items-center gap-1.5',
                        s.instructor_feedback === 'disagree'
                          ? 'bg-bad/15 text-bad border-bad/40'
                          : 'bg-secondary text-muted-foreground border-transparent hover:text-foreground',
                      )}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                      </svg>
                      {t('feedbackDisagree')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Edit clip data */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('editTitle')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('editNameLabel')}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={clip.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('editAngleLabel')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <SegBtn active={editAngle === 'face_on'} onClick={() => setEditAngle('face_on')}>{tStudents('angleFaceOn')}</SegBtn>
                <SegBtn active={editAngle === 'dtl'} onClick={() => setEditAngle('dtl')}>{tStudents('angleDtl')}</SegBtn>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('editTypeLabel')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <SegBtn active={editType === 'position'} onClick={() => setEditType('position')}>{t('typePosition')}</SegBtn>
                <SegBtn active={editType === 'swing'} onClick={() => setEditType('swing')}>{t('typeSwing')}</SegBtn>
              </div>
            </div>
            {(editAngle !== clip.camera_angle || editType !== clip.clip_type) && (
              <p className="text-xs text-warn leading-snug">{t('editRecomputeHint')}</p>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1">
              {t('editCancel')}
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="flex-1">
              {savingEdit ? t('editSaving') : t('editSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="flex-1">
              {t('deleteConfirmCancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1">
              {t('deleteConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status, t }: { status: Clip['status']; t: ReturnType<typeof useTranslations> }) {
  const cfg = {
    pending: { label: t('statusPending'), className: 'bg-warn/10 text-warn border-warn/30' },
    calibrated: { label: t('statusCalibrated'), className: 'bg-ok/10 text-ok border-ok/30' },
    archived: { label: t('statusArchived'), className: 'bg-muted-foreground/10 text-muted-foreground border-border' },
  } as const
  const c = cfg[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border', c.className)}>
      {status === 'pending' && (
        <span className="size-1.5 rounded-full bg-warn animate-pulse" />
      )}
      {c.label}
    </span>
  )
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-10 rounded-lg text-sm font-medium border transition-colors',
        active
          ? 'bg-ok/15 text-ok border-ok/40'
          : 'bg-secondary text-muted-foreground hover:text-foreground border-transparent',
      )}
    >
      {children}
    </button>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
      {children}
    </span>
  )
}
