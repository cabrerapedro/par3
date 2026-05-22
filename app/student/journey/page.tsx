'use client'

// Section 6 — Student home. Deliberately rustic and transparent: a plain
// chronological list of the instructor's clips grouped by class (= a date,
// which is how the student remembers it). No app-chosen "practice this" — the
// student picks, practices as many times as they want (or not), and we just
// track it. A real journey will be co-designed with instructors later.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Class, Clip } from '@/lib/classes'
import { clipScoreSummary, type SessionLike } from '@/lib/trends'
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

function formatClassDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
  } catch {
    return ''
  }
}

export default function StudentJourney() {
  const { student, logout, loading, updateStudent } = useAuth()
  const router = useRouter()
  const t = useTranslations('student.journey')
  const timeAgo = useTimeAgo()

  const [classes, setClasses] = useState<Class[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [sessions, setSessions] = useState<SessionLike[]>([])
  const [fetching, setFetching] = useState(true)

  // Optional email capture: a non-blocking nudge shown while the student has no
  // email on file, so they can later sign in by email instead of the code.
  const [emailInput, setEmailInput] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailDone, setEmailDone] = useState(false)
  const [emailDismissed, setEmailDismissed] = useState(false)
  const [emailErr, setEmailErr] = useState(false)

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault()
    const clean = emailInput.trim().toLowerCase()
    if (!clean.includes('@')) return
    setEmailSaving(true)
    setEmailErr(false)
    const { error } = await updateStudent({ email: clean })
    setEmailSaving(false)
    if (error) { setEmailErr(true); return }
    setEmailDone(true)
  }

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

  // Group clips by class so we can render newest class first, all visible.
  const clipsByClass = useMemo(() => {
    const m: Record<string, Clip[]> = {}
    for (const c of clips) {
      if (!c.class_id) continue
      if (!m[c.class_id]) m[c.class_id] = []
      m[c.class_id].push(c)
    }
    return m
  }, [clips])

  if (loading || !student) return <LoadingScreen />

  const classesWithClips = classes.filter((cls) => (clipsByClass[cls.id] ?? []).length > 0)

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
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

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="mb-8">
          <p className="small-caps font-mono text-[11px] text-accent mb-2">{t('greeting', { name: student.name.split(' ')[0] })}</p>
          <h1 className="font-display font-semibold text-2xl md:text-[40px] leading-tight">{t('title')}</h1>
        </div>

        {/* Optional email — save your access so you can sign in without the code */}
        {((!student.email && !emailDismissed) || emailDone) && (
          <div className="mb-8 border border-rule bg-paper-2/40 p-4 md:p-5">
            {emailDone ? (
              <p className="text-sm text-ok flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                {t('emailPromptSaved')}
              </p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="small-caps font-mono text-[10px] text-accent mb-1">{t('emailPromptTitle')}</p>
                    <p className="text-sm text-ink-soft leading-snug">{t('emailPromptBody')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailDismissed(true)}
                    className="text-xs text-ink-mute hover:text-ink transition-colors shrink-0"
                  >
                    {t('emailPromptDismiss')}
                  </button>
                </div>
                <form onSubmit={saveEmail} className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    inputMode="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={t('emailPromptPlaceholder')}
                    className="flex-1 h-11 px-3 bg-paper border border-rule text-ink placeholder:text-ink-mute/60 focus:outline-none focus:border-accent text-base"
                  />
                  <button
                    type="submit"
                    disabled={emailSaving || !emailInput.includes('@')}
                    className="h-11 px-5 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {t('emailPromptSave')}
                  </button>
                </form>
                {emailErr && <p className="text-xs text-bad mt-2">{t('emailPromptError')}</p>}
              </>
            )}
          </div>
        )}

        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : classesWithClips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 border-t border-b border-rule text-center">
            <p className="small-caps font-mono text-[11px] text-ink-mute">{t('emptyTitle')}</p>
            <p className="font-display font-semibold text-xl mt-2 max-w-sm">{t('emptyDescription')}</p>
          </div>
        ) : (
          <>
          <p className="text-ink-soft text-base md:text-lg leading-snug mb-8 max-w-[46ch]">{t('homeIntro')}</p>
          <ul className="flex flex-col gap-9">
            {classesWithClips.map((cls) => (
              <li key={cls.id}>
                <h2 className="font-display font-semibold text-xl border-t border-rule pt-4 mb-4">
                  {t('lastClassDate', { date: formatClassDate(cls.date) })}
                </h2>
                <ul className="flex flex-col gap-3">
                  {(clipsByClass[cls.id] ?? []).map((clip) => (
                    <ClipRow key={clip.id} clip={clip} sessions={sessions} timeAgo={timeAgo} t={t} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}

// --- Subcomponents ----

interface ClipRowProps {
  clip: Clip
  sessions: SessionLike[]
  timeAgo: (d: Date) => string
  t: ReturnType<typeof useTranslations>
}

function ClipRow({ clip, sessions, timeAgo, t }: ClipRowProps) {
  const summary = clipScoreSummary(sessions, clip.id)
  const ready = clip.status === 'calibrated'
  const practiced = ready && summary.sessionCount > 0

  return (
    <Link
      href={ready ? `/student/clip/${clip.id}` : '#'}
      className={cn(
        'flex items-center gap-3.5 p-3 rounded-xl border transition-colors',
        ready
          ? 'border-rule bg-paper-2/40 hover:bg-paper-2 active:bg-paper-2 cursor-pointer'
          : 'border-rule bg-paper-2/20 opacity-70 pointer-events-none',
      )}
    >
      {/* Thumbnail — the video's first frame, so it's recognizable at a glance */}
      <div className="w-24 aspect-video bg-black rounded-md overflow-hidden shrink-0">
        {clip.video_url ? (
          <video src={clip.video_url} preload="metadata" muted playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-mute/40 text-xs">—</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-ink truncate">{clip.name}</p>
        {practiced && summary.lastDate && (
          <p className="text-xs text-ink-mute mt-0.5">{t('lastPracticed', { when: timeAgo(summary.lastDate) })}</p>
        )}
      </div>

      {!ready ? (
        <Badge variant="outline" className="text-xs text-warn border-warn/30 bg-warn/10 shrink-0">
          {t('chipPreparing')}
        </Badge>
      ) : practiced ? (
        <Badge variant="outline" className="text-xs text-ok border-ok/30 bg-ok/10 shrink-0">
          {t('chipPracticed')}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-xs text-ink-soft border-rule shrink-0">
          {t('chipNoSessions')}
        </Badge>
      )}

      {ready && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-mute shrink-0">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </Link>
  )
}
