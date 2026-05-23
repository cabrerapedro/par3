'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { Wordmark } from '@/components/Wordmark'
import { cn } from '@/lib/utils'

type StudentWithClips = Student & { clips: { id: string; status: string }[] }

export default function InstructorDashboard() {
  const { instructor, logout, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.dashboard')
  const [students, setStudents] = useState<StudentWithClips[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    // loadStudents is a stable function declaration (hoisted, never reassigned).
    // eslint-disable-next-line react-hooks/immutability
    loadStudents()
  }, [instructor, loading])

  async function loadStudents() {
    setFetching(true)
    const { data } = await supabase
      .from('students')
      .select('*, clips(id, status)')
      .eq('instructor_id', instructor!.id)
      .order('created_at', { ascending: false })
    setStudents((data as StudentWithClips[]) ?? [])
    setFetching(false)
  }

  async function copyCode(code: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  async function shareLink(s: StudentWithClips, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const url = `${window.location.origin}/student/login?code=${s.access_code}`
    const shareData = {
      title: t('shareTitle'),
      text: t('shareText', { name: s.name }),
      url,
    }
    if (navigator.share) {
      try { await navigator.share(shareData); return } catch {}
    }
    await navigator.clipboard.writeText(url)
    setCopied(`link-${s.access_code}`)
    setTimeout(() => setCopied(null), 1500)
  }

  const isActive = (s: Student) => (s.status ?? 'active') !== 'inactive'

  const inactiveCount = useMemo(
    () => students.filter(s => !isActive(s)).length,
    [students]
  )

  const filtered = useMemo(() =>
    students.filter(s => {
      const matchesSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.access_code.toLowerCase().includes(search.toLowerCase())
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? isActive(s) : !isActive(s))
      return matchesSearch && matchesStatus
    }), [students, search, statusFilter])

  // Exercises = the student's clips (the old "checkpoints" model is gone).
  // Archived clips don't count toward the totals.
  const liveClips = (s: StudentWithClips) => (s.clips ?? []).filter(c => c.status !== 'archived')
  const totalCalibrated = students.reduce((sum, s) =>
    sum + liveClips(s).filter(c => c.status === 'calibrated').length, 0)
  const totalClips = students.reduce((sum, s) => sum + liveClips(s).length, 0)

  if (loading || !instructor) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <Link href="/instructor/dashboard" aria-label="Parell — inicio">
            <Wordmark size="md" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu
              name={instructor.name}
              email={instructor.email}
              role="instructor"
              profileHref="/instructor/profile"
              onLogout={() => { logout(); router.replace('/') }}
            />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-10">
        <div className="mb-10">
          <p className="small-caps font-mono text-[11px] text-accent mb-2">
            {t('greeting', { name: instructor.name.split(' ')[0] })}
          </p>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight">{t('title')}</h1>
            <Link
              href="/instructor/students/new"
              className="inline-flex items-center gap-1.5 h-10 px-5 bg-primary text-primary-foreground font-medium text-sm tracking-[0.01em] rounded-md hover:opacity-85 transition-opacity shrink-0"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('newStudent')}
            </Link>
          </div>
        </div>

        {students.length > 0 && !fetching && (
          <div className="grid grid-cols-3 gap-0 mb-8 border-t border-b border-rule">
            {[
              { label: t('statStudents'), value: students.length },
              { label: t('statExercises'), value: totalClips },
              { label: t('statCalibrated'), value: totalCalibrated },
            ].map((stat, i) => (
              <div key={stat.label} className={cn('px-5 py-4', i > 0 && 'border-l border-rule')}>
                <p className="small-caps font-mono text-[10px] text-ink-mute">{stat.label}</p>
                <p className="font-display font-semibold text-2xl tabular-nums mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {students.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            {students.length > 2 && (
              <div className="relative flex-1 max-w-md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="pl-9 h-10"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 sm:ml-auto shrink-0">
              {(['active', 'all', 'inactive'] as const).map(key => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    'small-caps font-mono text-[10px] px-3 h-8 border transition-colors',
                    statusFilter === key
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink'
                  )}
                >
                  {key === 'active' ? t('filterActive') : key === 'inactive' ? t('filterInactive') : t('filterAll')}
                  {key === 'inactive' && inactiveCount > 0 && <span className="ml-1 tabular-nums">({inactiveCount})</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-t border-b border-rule">
            <p className="small-caps font-mono text-[11px] text-ink-mute">{t('emptyTitle')}</p>
            <p className="font-display font-semibold text-xl mt-2 max-w-sm">
              {t('emptyDescription')}
            </p>
            <Link
              href="/instructor/students/new"
              className="inline-flex items-center h-11 px-6 mt-6 bg-primary text-primary-foreground font-medium text-sm tracking-[0.01em] rounded-md hover:opacity-85 transition-opacity"
            >
              {t('createFirst')}
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-ink-soft text-sm">
            {t('noResultsFor', { query: search })}
          </div>
        ) : (
          <div className="border-t border-rule">
            {/* Header row */}
            <div className="hidden md:grid grid-cols-[1fr_120px_110px_140px_60px] gap-6 py-3 border-b border-rule">
              <span className="small-caps font-mono text-[10px] text-ink-mute">{t('colName')}</span>
              <span className="small-caps font-mono text-[10px] text-ink-mute">{t('colCode')}</span>
              <span className="small-caps font-mono text-[10px] text-ink-mute">{t('colStatus')}</span>
              <span className="small-caps font-mono text-[10px] text-ink-mute">{t('colExercises')}</span>
              <span />
            </div>

            {filtered.map(s => {
              const live = liveClips(s)
              const total = live.length
              const cal = live.filter(c => c.status === 'calibrated').length
              return (
                <Link key={s.id} href={`/instructor/students/${s.id}`}>
                  <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_110px_140px_60px] gap-3 md:gap-6 items-center py-4 border-b border-rule hover:bg-paper-2/60 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className={cn('font-display font-medium text-lg truncate', !isActive(s) && 'text-ink-mute')}>{s.name}</p>
                        {/* Mobile-only inline tag; desktop uses the Estado column */}
                        {!isActive(s) && (
                          <span className="md:hidden small-caps font-mono text-[9px] text-warn border border-warn/40 px-1.5 py-0.5 shrink-0">
                            {t('statusInactive')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-mute mt-0.5 md:hidden">
                        {total === 0
                          ? t('noExercises')
                          : t('exerciseSummary', { calibrated: cal, total })}
                      </p>
                    </div>

                    <div className="hidden md:flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={e => copyCode(s.access_code, e)}
                            className={cn(
                              "font-mono text-xs px-2.5 py-1 border transition-colors tracking-[0.06em]",
                              copied === s.access_code
                                ? "border-ok text-ok"
                                : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
                            )}
                          >
                            {copied === s.access_code ? t('copied') : s.access_code}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          {t('copyCodeTooltip')}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={e => shareLink(s, e)}
                            className={cn(
                              "size-7 border flex items-center justify-center transition-colors",
                              copied === `link-${s.access_code}`
                                ? "border-ok text-ok"
                                : "border-rule text-ink-mute hover:border-ink-soft hover:text-ink"
                            )}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              {copied === `link-${s.access_code}`
                                ? <polyline points="20 6 9 17 4 12" />
                                : <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></>
                              }
                            </svg>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          {t('shareLinkTooltip')}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="hidden md:flex items-center">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 small-caps font-mono text-[10px] px-2 py-1 border",
                        isActive(s)
                          ? "border-rule text-ink-soft"
                          : "border-warn/40 text-warn"
                      )}>
                        <span className={cn("size-1.5 rounded-full", isActive(s) ? "bg-ok" : "bg-warn")} />
                        {isActive(s) ? t('statusActive') : t('statusInactive')}
                      </span>
                    </div>

                    <div className="hidden md:block">
                      <span className="font-display font-medium text-lg tabular-nums">{cal}</span>
                      <span className="font-mono text-xs text-ink-mute"> / {total}</span>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ink-mute">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
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
