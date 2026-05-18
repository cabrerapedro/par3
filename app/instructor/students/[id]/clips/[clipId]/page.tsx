'use client'

// Instructor-side clip detail. Minimal first pass: video player with
// annotation markers on the timeline, per-annotation list with audio +
// transcript + strokes count + text note, and a delete action that
// cascades cleanly through the DB (clip_frames, clip_annotations, and
// linked practice_sessions clip_id reference) thanks to the ON DELETE
// CASCADE constraints in schema.sql.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Clip } from '@/lib/classes'
import { SVGAnnotationOverlay } from '@/components/SVGAnnotationOverlay'
import type { Stroke } from '@/components/AnnotationCanvas'
import { processClip } from '@/lib/processClip'
import { insertClipFrames } from '@/lib/frames'
import { METRICS_BY_ANGLE, buildClipBaseline, clipDetectionRatio } from '@/lib/baseline'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AnnotationRow {
  id: string
  frame_timestamp_ms: number
  strokes: Stroke[]
  audio_url: string | null
  audio_transcript: string | null
  text_note: string | null
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

  const [clip, setClip] = useState<Clip | null>(null)
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // H7 — orphan-clip recovery: re-run the post-save pipeline for a clip
  // whose initial save was interrupted (browser back, tab close, transient
  // network) and left the row in 'pending' with a video but no baseline.
  const [retrying, setRetrying] = useState(false)
  const [retryPct, setRetryPct] = useState(0)
  const [retryError, setRetryError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [paused, setPaused] = useState(true)
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null)

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
    const [{ data: c, error: cErr }, { data: a }] = await Promise.all([
      supabase.from('clips').select('*').eq('id', clipId).single(),
      supabase
        .from('clip_annotations')
        .select('id, frame_timestamp_ms, strokes, audio_url, audio_transcript, text_note')
        .eq('clip_id', clipId)
        .order('frame_timestamp_ms', { ascending: true }),
    ])
    if (cErr || !c) {
      setError(t('loadError'))
      setLoading(false)
      return
    }
    setClip(c as Clip)
    setAnnotations((a ?? []) as AnnotationRow[])
    setLoading(false)
  }

  // The closest annotation in time — when the video is paused on or near a
  // marked moment, render its strokes over the frame as a preview.
  const activeAnnotation = useMemo(() => {
    if (!paused || annotations.length === 0) return null
    return annotations.find(
      (a) => Math.abs(a.frame_timestamp_ms - currentTime) < 250,
    )
  }, [annotations, currentTime, paused])

  function seekTo(ms: number) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = ms / 1000
    setCurrentTime(ms)
    if (!v.paused) v.pause()
  }

  function captureStageSize() {
    const v = videoRef.current
    if (!v) return
    const rect = v.getBoundingClientRect()
    setStageSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
  }

  async function retryProcessing() {
    if (!clip || !clip.video_url || retrying) return
    setRetrying(true)
    setRetryPct(0)
    setRetryError(null)

    try {
      // 1. Fetch the stored video back from Supabase Storage as a Blob.
      const res = await fetch(clip.video_url)
      if (!res.ok) throw new Error(`Couldn't fetch video (HTTP ${res.status})`)
      const blob = await res.blob()

      // 2. Run MediaPipe over every frame. processClip's per-frame timeout
      // cap (H5 fix) means a stuck WASM session will throw instead of
      // looping for minutes.
      const frames = await processClip({
        videoBlob: blob,
        cameraAngle: clip.camera_angle,
        fps: 10,
        onProgress: (p) => setRetryPct(Math.round(p * 100)),
      })

      // 3. Detection-ratio sanity check (M4).
      const durationSeconds = blob.size > 0 ? frames.length / 10 + 1 : 30
      const detection = clipDetectionRatio(frames.length, durationSeconds, 10)
      if (detection < 0.3) {
        setRetryError(t('lowDetection', { pct: Math.round(detection * 100) }))
        setRetrying(false)
        return
      }

      // 4. Persist frames (best-effort) + rebuild baseline.
      if (frames.length > 0) {
        try { await insertClipFrames(clip.id, frames) } catch {}
      }
      const selectedMetrics = clip.selected_metrics?.length
        ? clip.selected_metrics
        : METRICS_BY_ANGLE[clip.camera_angle] ?? []
      const baseline = buildClipBaseline(frames, clip.clip_type, clip.camera_angle, selectedMetrics)

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
        .eq('id', clip.id)

      // 6. Reload to show the new state.
      setRetrying(false)
      await load()
    } catch (e: unknown) {
      setRetrying(false)
      const reason = e instanceof Error ? e.message : String(e)
      setRetryError(`${t('retryFailed')}: ${reason}`)
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

  const duration = clip.video_url ? null : null // we only know after metadata
  const baselineMetricKeys = clip.baseline && typeof clip.baseline === 'object' && !('_type' in (clip.baseline as object))
    ? Object.keys(clip.baseline as Record<string, unknown>)
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
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="text-sm text-muted-foreground hover:text-bad transition-colors"
          >
            {t('deleteCta')}
          </button>
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
              swing
            </span>
          )}
          {clip.status === 'calibrated' && baselineMetricKeys.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-ok/10 text-ok border border-ok/30">
              {t('baselineMetricsCount', { count: baselineMetricKeys.length })}
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
              onClick={retryProcessing}
              disabled={retrying}
              className="h-9 px-4 rounded-lg bg-warn text-black text-sm font-semibold hover:bg-warn/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {t('retryCta')}
            </button>
          </div>
        )}

        {/* Video stage with annotation marker timeline */}
        <div ref={stageRef} className="relative bg-black rounded-md overflow-hidden">
          {clip.video_url ? (
            <video
              ref={videoRef}
              src={clip.video_url}
              controls
              className="w-full max-h-[60vh] object-contain"
              onLoadedMetadata={captureStageSize}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime * 1000)}
              onPlay={() => setPaused(false)}
              onPause={() => setPaused(true)}
              onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime * 1000)}
              playsInline
            />
          ) : (
            <div className="aspect-video flex items-center justify-center text-muted-foreground text-sm">
              {t('videoUnavailable')}
            </div>
          )}

          {/* Overlay strokes when paused near an annotation */}
          {activeAnnotation && stageSize && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <SVGAnnotationOverlay
                width={stageSize.width}
                height={stageSize.height}
                strokes={activeAnnotation.strokes}
              />
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
                <li key={a.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
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
                    <audio src={a.audio_url} controls className="w-full h-10 mt-1" preload="metadata" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
      {children}
    </span>
  )
}
