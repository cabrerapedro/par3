'use client'

// Section 6 — Student home: "Practicá esto hoy" + most-recent class +
// optional previous-classes drawer + legacy-checkpoint fallback.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Class, Clip } from '@/lib/classes'
import { pickTopClipsForToday } from '@/lib/prioritization'
import {
  clipScoreSummary,
  clipTrend,
  type SessionLike,
  type ClipTrend,
} from '@/lib/trends'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { Wordmark } from '@/components/Wordmark'
import { cn } from '@/lib/utils'
import Link from 'next/link'

function useTimeAgo() {
  const t = useTranslations('instructor.students')
  return (date: Date) => {
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
    if (days === 0) return t('timeToday')
    if (days === 1) return t('timeYesterday')
    if (days < 7) return t('timeDaysAgo', { days })
    if (days < 30) return t('timeWeeksAgo', { weeks: Math.floor(days / 7) })
    return t('timeMonthsAgo', { months: Math.floor(days / 30) })
  }
}

export default function StudentJourney() {
  const { student, logout, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('student.journey')
  const timeAgo = useTimeAgo()

  const [classes, setClasses] = useState<Class[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [sessions, setSessions] = useState<SessionLike[]>([])
  const [fetching, setFetching] = useState(true)
  const [previousOpen, setPreviousOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!student) {
      router.replace('/student/login')
      return
    }
    void load(student.id)
  }, [student, loading, router])

  async function load(studentId: string) {
    setFetching(true)
    const [{ data: cls }, { data: cl }, { data: ps }] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('student_id', studentId)
        .order('date', { ascending: false }),
      supabase
        .from('clips')
        .select('*')
        .eq('student_id', studentId)
        .neq('status', 'archived')
        .order('created_at'),
      supabase
        .from('practice_sessions')
        .select('clip_id, checkpoint_id, overall_score, date')
        .eq('student_id', studentId)
        .order('date', { ascending: false }),
    ])
    setClasses(cls ?? [])
    setClips(cl ?? [])
    setSessions((ps as SessionLike[]) ?? [])
    setFetching(false)
  }

  // Only calibrated clips are eligible for priority — a 'pending' clip has
  // no baseline to compare against yet.
  const calibratedClips = useMemo(
    () => clips.filter((c) => c.status === 'calibrated'),
    [clips],
  )

  const topToday = useMemo(
    () => pickTopClipsForToday(calibratedClips, sessions, 2),
    [calibratedClips, sessions],
  )

  // Group clips by class for the "Tu última clase" + "Clases anteriores" sections.
  const clipsByClass = useMemo(() => {
    const m: Record<string, Clip[]> = {}
    for (const c of clips) {
      if (!c.class_id) continue
      if (!m[c.class_id]) m[c.class_id] = []
      m[c.class_id].push(c)
    }
    return m
  }, [clips])

  const mostRecentClass = classes[0] ?? null
  const previousClasses = classes.slice(1)

  if (loading || !student) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
        <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <Link href="/" aria-label="Parell — inicio">
            <Wordmark size="md" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu
              name={student.name}
              role="student"
              avatarUrl={student.avatar_url}
              profileHref="/student/profile"
              onLogout={() => {
                logout()
                router.replace('/')
              }}
            />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <div className="mb-10">
          <p className="small-caps font-mono text-[11px] text-accent mb-2">{t('greeting', { name: student.name.split(' ')[0] })}</p>
          <h1 className="font-display font-semibold text-2xl md:text-[40px] leading-tight">{t('title')}</h1>
        </div>

        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 border-t border-b border-rule text-center">
            <p className="small-caps font-mono text-[11px] text-ink-mute">{t('emptyTitle')}</p>
            <p className="font-display font-semibold text-xl mt-2 max-w-sm">{t('emptyDescription')}</p>
          </div>
        ) : (
          <>
            {/* Practicá esto hoy */}
            {topToday.length > 0 && (
              <section className="mb-12">
                <div className="mb-5 border-t border-rule pt-6">
                  <p className="small-caps font-mono text-[10px] text-accent">{t('todaySubtitle')}</p>
                  <h2 className="font-display font-semibold text-2xl mt-1">{t('todayTitle')}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {topToday.map((clip) => (
                    <PriorityCard key={clip.id} clip={clip} timeAgo={timeAgo} t={t} />
                  ))}
                </div>
              </section>
            )}

            {/* Tu última clase */}
            {mostRecentClass && (
              <section className="mb-12 border-t border-rule pt-6">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="font-display font-semibold text-2xl">{t('lastClassTitle')}</h2>
                  <span className="small-caps font-mono text-[10px] text-ink-mute">
                    {t('lastClassDate', {
                      date: new Intl.DateTimeFormat(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(mostRecentClass.date)),
                    })}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {(clipsByClass[mostRecentClass.id] ?? []).map((clip) => (
                    <ClipRow key={clip.id} clip={clip} sessions={sessions} timeAgo={timeAgo} t={t} />
                  ))}
                </ul>
              </section>
            )}

            {/* Clases anteriores (collapsible) */}
            {previousClasses.length > 0 && (
              <section className="mb-10">
                <button
                  type="button"
                  onClick={() => setPreviousOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-secondary/40 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">
                    {previousOpen ? t('previousClassesHide') : t('previousClassesShow')}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn('text-muted-foreground transition-transform', previousOpen && 'rotate-180')}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {previousOpen && (
                  <ul className="flex flex-col gap-4 mt-4">
                    {previousClasses.map((cls) => (
                      <li key={cls.id} className="bg-card border border-border rounded-xl p-3">
                        <div className="text-xs text-muted-foreground mb-2">
                          {t('lastClassDate', {
                            date: new Intl.DateTimeFormat(undefined, {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            }).format(new Date(cls.date)),
                          })}
                        </div>
                        <ul className="flex flex-col gap-2">
                          {(clipsByClass[cls.id] ?? []).map((clip) => (
                            <ClipRow key={clip.id} clip={clip} sessions={sessions} timeAgo={timeAgo} t={t} />
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

          </>
        )}
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}

// --- Subcomponents ----

interface PriorityCardProps {
  clip: Clip
  timeAgo: (d: Date) => string
  t: ReturnType<typeof useTranslations>
}

function PriorityCard({ clip, timeAgo, t }: PriorityCardProps) {
  // Pulled fresh from prioritization output stored on the clip object.
  // We can also recompute here, but we already have the summary inline.
  return (
    <Link
      href={`/student/clip/${clip.id}`}
      className="group block bg-card border border-border rounded-md overflow-hidden hover:border-primary hover:bg-secondary/40 transition-all"
    >
      <div className="aspect-video bg-black flex items-center justify-center relative overflow-hidden">
        {clip.video_url ? (
          // Use the video element itself as a poster (paused first-frame).
          // Cheaper than generating thumbnails server-side for MVP.
          <video
            src={clip.video_url}
            preload="metadata"
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        <span className="absolute bottom-3 left-3 text-white text-sm font-semibold drop-shadow">
          {clip.name}
        </span>
      </div>

      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {clip.camera_angle === 'face_on' ? t('angleFaceOn') : t('angleDtl')}
            {clip.clip_type === 'swing' && <span> · {t('typeSwing')}</span>}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium group-hover:opacity-85 transition-opacity">
          {t('practiceCta')}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

interface ClipRowProps {
  clip: Clip
  sessions: SessionLike[]
  timeAgo: (d: Date) => string
  t: ReturnType<typeof useTranslations>
}

function ClipRow({ clip, sessions, timeAgo, t }: ClipRowProps) {
  const summary = clipScoreSummary(sessions, clip.id)
  const trend = clipTrend(sessions, clip.id)
  const ready = clip.status === 'calibrated'

  return (
    <Link
      href={ready ? `/student/clip/${clip.id}` : '#'}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
        ready
          ? 'border-border bg-card hover:bg-secondary/40 cursor-pointer'
          : 'border-border bg-card/50 opacity-60 pointer-events-none',
      )}
    >
      <ClipStatusDot status={clip.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{clip.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {clip.camera_angle === 'face_on' ? t('angleFaceOn') : t('angleDtl')}
          {summary.lastScore !== null && summary.lastDate && (
            <>
              <span className="text-muted-foreground/40"> · </span>
              <span className="font-mono">{t('currentScore', { score: summary.lastScore })}</span>
              <span className="text-muted-foreground/40"> · </span>
              <span>{t('lastPracticed', { when: timeAgo(summary.lastDate) })}</span>
            </>
          )}
        </p>
      </div>
      {summary.sessionCount === 0 ? (
        <Badge variant="outline" className="text-xs text-muted-foreground border-border">
          {t('chipNoSessions')}
        </Badge>
      ) : (
        <TrendBadge trend={trend} t={t} />
      )}
    </Link>
  )
}

function ClipStatusDot({ status }: { status: Clip['status'] }) {
  const cls =
    status === 'calibrated' ? 'bg-ok' :
    status === 'archived' ? 'bg-muted-foreground/30' :
    'bg-warn animate-pulse'
  return <span className={cn('size-2 rounded-full shrink-0', cls)} />
}

function TrendBadge({ trend, t }: { trend: ClipTrend; t: ReturnType<typeof useTranslations> }) {
  if (trend === 'noData' || trend === 'newish') {
    return (
      <Badge variant="outline" className="text-xs text-ink-soft border-rule bg-paper-2">
        {t('chipNew')}
      </Badge>
    )
  }
  const cfg: Record<Exclude<ClipTrend, 'noData' | 'newish'>, { label: string; cls: string }> = {
    improved: { label: t('chipImproved'), cls: 'text-ok border-ok/30 bg-ok/10' },
    declining: { label: t('chipDeclining'), cls: 'text-bad border-bad/30 bg-bad/10' },
    stagnant: { label: t('chipStagnant'), cls: 'text-warn border-warn/30 bg-warn/10' },
  }
  const c = cfg[trend]
  return (
    <Badge variant="outline" className={cn('text-xs', c.cls)}>
      {c.label}
    </Badge>
  )
}
