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
        <div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" />
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

        {/* Video stage with annotation marker timeline */}
        <div ref={stageRef} className="relative bg-black rounded-2xl overflow-hidden">
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
