'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AnnotationSnapshot } from '@/components/AnnotationSnapshot'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Clip } from '@/lib/classes'
import type { Stroke } from '@/components/AnnotationCanvas'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

// AI "practice card": the coach's voice/note distilled into a focus + checklist
// (see /api/practice-card). Always grounded in what the coach said.
interface PracticeCard {
  focus: string
  checklist: string[]
}

interface ClipAnnotation {
  id: string
  clip_id: string
  frame_timestamp_ms: number
  strokes: Stroke[]
  audio_url: string | null
  audio_transcript: string | null
  text_note: string | null
  snapshot_url: string | null
  practice_card?: PracticeCard | null
  created_at: string
}

export default function ClipDetail() {
  const { student, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.clip')
  const locale = useLocale()

  const [clip, setClip] = useState<Clip | null>(null)
  const [annotations, setAnnotations] = useState<ClipAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  // Practice cards generated on demand (focus + checklist), keyed by annotation
  // id, for annotations that don't have one persisted yet.
  const [cards, setCards] = useState<Record<string, PracticeCard | null>>({})
  // Angle degrees drawn by the instructor are shown by default; the student
  // can hide them (their choice, remembered on this device).
  const [showDegrees, setShowDegrees] = useState(true)
  useEffect(() => {
    try { setShowDegrees(localStorage.getItem('forat_show_degrees') !== '0') } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('forat_show_degrees', showDegrees ? '1' : '0') } catch {}
  }, [showDegrees])
  const hasDegrees = annotations.some((a) => Array.isArray(a.strokes) && a.strokes.some((s) => s?.type === 'angle' && typeof s.degrees === 'number'))

  useEffect(() => {
    // Wait for auth to hydrate from localStorage before deciding. On a hard
    // load (refresh, direct URL, PWA cold start) this effect runs before the
    // AuthProvider populates `student`; without the gate we'd bounce a
    // logged-in student to /student/login.
    if (authLoading) return
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
  }, [student, authLoading, clipId, router])

  // Generate a practice card (focus + checklist) for each annotation that has
  // coach content (transcript/note) but no card yet. The API persists it, so
  // this is a one-time cost. Falls back silently — never invents.
  useEffect(() => {
    if (!clip || annotations.length === 0) return
    let cancelled = false
    annotations.forEach((ann) => {
      if (ann.practice_card || cards[ann.id] !== undefined) return
      if (!ann.audio_transcript && !ann.text_note) return
      fetch('/api/practice-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: ann.audio_transcript,
          textNote: ann.text_note,
          clipName: clip.name,
          cameraAngle: clip.camera_angle,
          clipType: clip.clip_type,
          annotationId: ann.id,
          locale,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled) setCards((prev) => ({ ...prev, [ann.id]: d?.card ?? null })) })
        .catch(() => { if (!cancelled) setCards((prev) => ({ ...prev, [ann.id]: null })) })
    })
    return () => { cancelled = true }
    // `cards` intentionally omitted — we guard per-id with cards[ann.id].
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, clip?.id])

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
  // `_`-prefixed keys are internal (metrics-version stamp), not real content.
  const hasBaseline = clip.baseline != null && typeof clip.baseline === 'object'
    && Object.keys(clip.baseline as object).some(k => !k.startsWith('_'))

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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {/* Tell the truth: a clip still uploading/being analyzed used
                    to announce itself as "Calibrado" to the student. */}
                {clip.status === 'calibrated' ? (
                  <Badge variant="outline" className="text-ok border-ok/20 bg-ok/10 text-xs">
                    {t('statusCalibrated')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-warn border-warn/20 bg-warn/10 text-xs">
                    {t('statusPreparing')}
                  </Badge>
                )}
                <Badge variant="outline" className="text-muted-foreground border-border text-xs">
                  {clip.camera_angle === 'face_on' ? t('angleFaceOn') : t('angleDtl')}
                </Badge>
                {isSwing && (
                  <Badge variant="outline" className="text-ink-soft border-rule bg-paper-2 text-xs">
                    {t('swingBadge')}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-display font-semibold">{clip.name}</h1>
              {hasBaseline && (
                <p className="text-muted-foreground text-sm mt-1">
                  {isSwing ? t('swingsCalibratedSummary', { count: annotations.length }) : t('positionsCalibratedSummary', { count: annotations.length })}
                </p>
              )}
            </div>

            {/* Practicar/Espejo now live in the plan (per step). This page is the
                reference + the student's attempt history. */}
            {hasBaseline && (
              <div className="flex flex-wrap items-center gap-2.5 shrink-0 sm:justify-end">
              <Link
                href={`/student/clip/${clipId}/history`}
                className="inline-flex items-center justify-center gap-2 h-12 px-5 text-sm font-medium rounded-xl border border-border bg-card text-foreground hover:border-foreground/30 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                {t('historyAction')}
              </Link>
              </div>
            )}
          </div>
        </div>

        {/* Video still uploading from the instructor's iPad — explain the
            blank instead of rendering nothing. */}
        {!clip.video_url && (
          <div className="mb-6 bg-paper-2 border border-rule rounded-md px-4 py-4">
            <p className="text-foreground text-sm font-medium">{t('videoPreparingTitle')}</p>
            <p className="text-muted-foreground text-xs mt-1">{t('videoPreparingHint')}</p>
          </div>
        )}

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
            {hasDegrees && (
              <button
                type="button"
                onClick={() => setShowDegrees((v) => !v)}
                className="text-xs font-medium text-primary hover:underline underline-offset-2"
              >
                {showDegrees ? t('hideDegrees') : t('showDegrees')}
              </button>
            )}
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
              {annotations.map((ann, i) => {
                const card = ann.practice_card ?? cards[ann.id] ?? null
                return (
                <div key={ann.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {ann.snapshot_url && (
                      <AnnotationSnapshot
                        src={ann.snapshot_url}
                        alt={t('snapshotAlt')}
                        strokes={ann.strokes}
                        showDegrees={showDegrees}
                        className="w-full sm:w-72 shrink-0 self-start"
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

                      {/* Focus + checklist distilled from the coach (Layer 2).
                          No card → fall back to the coach's raw note/transcript.
                          Never invents — the card only exists if the coach spoke. */}
                      {card ? (
                        <div className="rounded-lg bg-ok/5 border border-ok/15 px-3 py-2.5">
                          <p className="small-caps font-mono text-[11px] text-ok mb-1">{t('focusLabel')}</p>
                          <p className="text-foreground text-base font-medium leading-snug">{card.focus}</p>
                          {card.checklist.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1">
                              {card.checklist.map((item, j) => (
                                <li key={j} className="text-sm text-muted-foreground flex gap-2 leading-snug">
                                  <span className="text-ok/60 shrink-0">·</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <>
                          {ann.text_note && (
                            <p className="text-foreground text-sm leading-relaxed">{ann.text_note}</p>
                          )}
                          {ann.audio_transcript && (
                            <p className="text-muted-foreground text-sm leading-relaxed italic">&ldquo;{ann.audio_transcript}&rdquo;</p>
                          )}
                        </>
                      )}

                      {ann.audio_url && (
                        <div className="mt-auto">
                          <p className="small-caps font-mono text-[11px] text-muted-foreground mb-1">{t('listenCoach')}</p>
                          <audio
                            src={ann.audio_url}
                            controls
                            className="w-full h-9"
                            style={{ accentColor: '#60a5fa' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )
              })}
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
