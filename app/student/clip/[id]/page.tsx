'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Clip } from '@/lib/classes'
import type { Stroke } from '@/components/AnnotationCanvas'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface ClipAnnotation {
  id: string
  clip_id: string
  frame_timestamp_ms: number
  strokes: Stroke[]
  audio_url: string | null
  audio_transcript: string | null
  text_note: string | null
  snapshot_url: string | null
  created_at: string
}

export default function ClipDetail() {
  const { student } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.clip')

  const [clip, setClip] = useState<Clip | null>(null)
  const [annotations, setAnnotations] = useState<ClipAnnotation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    let cancelled = false
    Promise.all([
      supabase.from('clips').select('*').eq('id', clipId).single(),
      supabase.from('clip_annotations').select('*').eq('clip_id', clipId).order('frame_timestamp_ms', { ascending: true }),
    ]).then(([{ data: clipData }, { data: annotationData }]) => {
      if (cancelled) return
      if (clipData) setClip(clipData as Clip)
      setAnnotations((annotationData ?? []) as ClipAnnotation[])
      setLoading(false)
    })
    return () => { cancelled = true }
    // clipId comes from params and changes on route navigation; make it
    // explicit so the effect re-runs if Next ever re-uses the page instance.
  }, [student, clipId, router])

  if (loading) return <LoadingScreen />
  if (!clip) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">{t('notFound')}</p>
    </div>
  )
  if (clip.status === 'archived') return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-5">
      <p className="text-foreground font-medium">{t('archivedTitle')}</p>
      <p className="text-muted-foreground text-sm text-center">{t('archivedDesc')}</p>
      <Link href="/student/journey" className="text-ok text-sm font-medium hover:underline mt-2">{t('backToJourneyLink')}</Link>
    </div>
  )

  const isSwing = clip.clip_type === 'swing'
  const isPosition = clip.clip_type === 'position'
  const hasBaseline = clip.baseline != null && typeof clip.baseline === 'object' && Object.keys(clip.baseline as object).length > 0

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-14 flex items-center gap-3">
          <Link href="/student/journey" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            {t('backToJourney')}
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-10">
        {/* Title + badges + action buttons */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-ok border-ok/20 bg-ok/10 text-xs">
                {t('statusCalibrated')}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground border-border text-xs">
                {clip.camera_angle === 'face_on' ? t('angleFaceOn') : t('angleDtl')}
              </Badge>
              {isSwing && (
                <Badge variant="outline" className="text-ink-soft border-rule bg-paper-2 text-xs">
                  {t('swingBadge')}
                </Badge>
              )}
            </div>
            {/* Action buttons — always visible when baseline exists */}
            {hasBaseline ? (
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/student/clip/${clipId}/history`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground transition-all"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  {t('historyAction')}
                </Link>
                {isPosition && (
                  <Link
                    href={`/student/clip/${clipId}/mirror`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground transition-all"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="12" y1="3" x2="12" y2="21" />
                    </svg>
                    {t('mirror')}
                  </Link>
                )}
                <Link
                  href={`/student/clip/${clipId}/practice`}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                    isSwing
                      ? "bg-primary text-primary-foreground border-primary hover:opacity-85"
                      : "bg-primary text-primary-foreground hover:opacity-85"
                  )}
                >
                  {isSwing ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  )}
                  {isSwing ? t('recordPractice') : t('practice')}
                </Link>
              </div>
            ) : null}
          </div>
          <h1 className="text-2xl font-display font-semibold">{clip.name}</h1>
          {hasBaseline && (
            <p className="text-muted-foreground text-sm mt-1">
              {isSwing ? t('swingsCalibratedSummary', { count: annotations.length }) : t('positionsCalibratedSummary', { count: annotations.length })}
            </p>
          )}
        </div>

        {/* Reference video — full width */}
        {clip.video_url && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('instructorReferenceTitle')}</p>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <video
                src={clip.video_url}
                controls
                playsInline
                preload="metadata"
                className="w-full bg-black"
              />
            </div>
          </div>
        )}

        {/* Annotations list */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('annotationsTitle')}</p>
            {annotations.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('annotationsCount', { count: annotations.length })}
              </p>
            )}
          </div>
          {annotations.length === 0 ? (
            <div className="bg-card border border-border rounded-xl px-4 py-6 text-center">
              <p className="text-muted-foreground text-sm">{t('annotationsEmpty')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {annotations.map((ann, i) => (
                <div key={ann.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {ann.snapshot_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ann.snapshot_url}
                        alt={t('snapshotAlt')}
                        className="w-full sm:w-72 shrink-0 self-start rounded-lg border border-border"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-ok/10 border border-ok/20 text-ok">
                          #{i + 1}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {t('annotationAtTime', { time: formatTime(ann.frame_timestamp_ms / 1000) })}
                        </span>
                        {ann.strokes.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            · {t('annotationStrokes', { count: ann.strokes.length })}
                          </span>
                        )}
                      </div>
                      {ann.text_note && (
                        <p className="text-foreground text-sm leading-relaxed">{ann.text_note}</p>
                      )}
                      {ann.audio_transcript && (
                        <p className="text-muted-foreground text-sm leading-relaxed italic">&ldquo;{ann.audio_transcript}&rdquo;</p>
                      )}
                      {ann.audio_url && (
                        <audio
                          src={ann.audio_url}
                          controls
                          className="w-full h-9 mt-auto"
                          style={{ accentColor: '#60a5fa' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}

function formatTime(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
