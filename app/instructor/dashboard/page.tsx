'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student, LifecycleStage } from '@/lib/types'
import { canMessageWhatsapp, isDormantAt, dormantCutoffISO } from '@/lib/contacts'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type StudentRow = Student & { clips?: { id: string; status: string }[] }
type StageFilter = 'all' | 'active' | 'dormant' | 'former' | 'prospect'

const PAGE_SIZE = 25
const FILTERS: StageFilter[] = ['all', 'active', 'dormant', 'former', 'prospect']

export default function InstructorDashboard() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.dashboard')
  const tContacts = useTranslations('instructor.contacts')

  const [students, setStudents] = useState<StudentRow[]>([])
  const [count, setCount] = useState(0)
  const [fetching, setFetching] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [stage, setStage] = useState<StageFilter>('active')
  const [copied, setCopied] = useState<string | null>(null)

  // Debounce the search box so we hit the server only after typing settles.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(id)
  }, [search])

  // (Re)load page 0 whenever the filter or search changes.
  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading, debounced, stage])

  // q is a Supabase filter builder; its type narrows awkwardly, so we cast.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  function applyFilters(q: any): any {
    let b = q
    const term = debounced.trim()
    if (term) b = b.ilike('name', `%${term}%`)
    if (stage === 'active') b = b.eq('lifecycle_stage', 'active')
    else if (stage === 'former') b = b.eq('lifecycle_stage', 'former')
    else if (stage === 'prospect') b = b.eq('lifecycle_stage', 'prospect')
    else if (stage === 'dormant') {
      b = b.eq('lifecycle_stage', 'active')
        .or(`last_activity_at.is.null,last_activity_at.lt.${dormantCutoffISO()}`)
    }
    return b
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async function load(reset: boolean) {
    if (!instructor) return
    if (reset) setFetching(true); else setLoadingMore(true)
    const from = reset ? 0 : students.length
    const base = supabase
      .from('students')
      .select('*, clips(id, status)', { count: 'exact' })
      .eq('instructor_id', instructor.id)
    const { data, count: total } = await applyFilters(base)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    const rows = (data as StudentRow[]) ?? []
    setStudents(prev => (reset ? rows : [...prev, ...rows]))
    setCount(total ?? 0)
    if (reset) setFetching(false); else setLoadingMore(false)
  }

  async function copyCode(code: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    await navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  async function shareLink(s: StudentRow, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const url = `${window.location.origin}/student/login?code=${s.access_code}`
    const shareData = { title: t('shareTitle'), text: t('shareText', { name: s.name }), url }
    if (navigator.share) { try { await navigator.share(shareData); return } catch {} }
    await navigator.clipboard.writeText(url)
    setCopied(`link-${s.access_code}`)
    setTimeout(() => setCopied(null), 1500)
  }

  // One badge per row reflecting the most relevant state.
  function stageBadge(s: StudentRow): { label: string; className: string; dot: string } {
    const lc: LifecycleStage = s.lifecycle_stage ?? 'active'
    if (lc === 'active' && isDormantAt(s.last_activity_at)) {
      return { label: t('statusDormant'), className: 'border-accent/40 text-accent', dot: 'bg-accent' }
    }
    if (lc === 'former') return { label: t('stageFormer'), className: 'border-warn/40 text-warn', dot: 'bg-warn' }
    if (lc === 'prospect') return { label: t('stageProspect'), className: 'border-blue/40 text-blue', dot: 'bg-blue' }
    return { label: t('stageActive'), className: 'border-rule text-ink-soft', dot: 'bg-ok' }
  }

  const liveClips = (s: StudentRow) => (s.clips ?? []).filter(c => c.status !== 'archived')

  if (loading || !instructor) return <LoadingScreen />

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <div className="mb-8">
        <p className="small-caps font-mono text-[11px] text-accent mb-2">
          {t('greeting', { name: instructor.name.split(' ')[0] })}
        </p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight">{t('title')}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/instructor/students/import"
              className="inline-flex items-center gap-1.5 h-10 px-4 border border-rule text-ink-soft font-medium text-sm tracking-[0.01em] rounded-md hover:border-ink-soft hover:text-ink transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {tContacts('importLink')}
            </Link>
            <Link
              href="/instructor/students/new"
              className="inline-flex items-center gap-1.5 h-10 px-5 bg-primary text-primary-foreground font-medium text-sm tracking-[0.01em] rounded-md hover:opacity-85 transition-opacity"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('newStudent')}
            </Link>
          </div>
        </div>
      </div>

      {/* Search + stage filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
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
        <div className="flex items-center gap-1 sm:ml-auto shrink-0 flex-wrap">
          {FILTERS.map(key => (
            <button
              key={key}
              onClick={() => setStage(key)}
              className={cn(
                'small-caps font-mono text-[11px] px-3 h-8 border transition-colors',
                stage === key
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink'
              )}
            >
              {t(
                key === 'active' ? 'filterActive'
                : key === 'dormant' ? 'filterDormant'
                : key === 'former' ? 'filterFormer'
                : key === 'prospect' ? 'filterProspect'
                : 'filterAll'
              )}
            </button>
          ))}
        </div>
      </div>

      {fetching ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : students.length === 0 ? (
        debounced || stage !== 'active' ? (
          <div className="text-center py-16 text-ink-soft text-sm border-t border-rule">
            {debounced ? t('noResultsFor', { query: debounced }) : t('emptyTitle')}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center border-t border-b border-rule">
            <p className="small-caps font-mono text-[11px] text-ink-mute">{t('emptyTitle')}</p>
            <p className="font-display font-semibold text-xl mt-2 max-w-sm">{t('emptyDescription')}</p>
            <div className="flex items-center gap-2 mt-6">
              <Link href="/instructor/students/import" className="inline-flex items-center h-11 px-6 border border-rule text-ink font-medium text-sm rounded-md hover:border-ink-soft transition-colors">
                {tContacts('importLink')}
              </Link>
              <Link href="/instructor/students/new" className="inline-flex items-center h-11 px-6 bg-primary text-primary-foreground font-medium text-sm rounded-md hover:opacity-85 transition-opacity">
                {t('createFirst')}
              </Link>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="border-t border-rule">
            <div className="hidden md:grid grid-cols-[1fr_120px_130px_120px_60px] gap-6 py-3 border-b border-rule">
              <span className="small-caps font-mono text-[11px] text-ink-mute">{t('colName')}</span>
              <span className="small-caps font-mono text-[11px] text-ink-mute">{t('colCode')}</span>
              <span className="small-caps font-mono text-[11px] text-ink-mute">{t('colStatus')}</span>
              <span className="small-caps font-mono text-[11px] text-ink-mute">{t('colExercises')}</span>
              <span />
            </div>

            {students.map(s => {
              const live = liveClips(s)
              const total = live.length
              const cal = live.filter(c => c.status === 'calibrated').length
              const badge = stageBadge(s)
              return (
                <Link key={s.id} href={`/instructor/students/${s.id}`}>
                  <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_130px_120px_60px] gap-3 md:gap-6 items-center py-4 border-b border-rule hover:bg-paper-2/60 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-display font-medium text-lg truncate">{s.name}</p>
                        {canMessageWhatsapp(s) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-ok/70 shrink-0" aria-label={t('waReady')}>
                                <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm4.3 9.9c-.2-.1-1.3-.7-1.5-.7-.2-.1-.3-.1-.5.1l-.7.8c-.1.2-.2.2-.4.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.3.1-.4l.3-.4.2-.4c0-.1 0-.2 0-.3l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.4c-.1 0-.3 0-.5.2s-.7.7-.7 1.7.7 2 .8 2.1c.1.2 1.5 2.3 3.6 3.1 1.4.6 2 .6 2.7.5.4 0 1.3-.5 1.5-1 .2-.5.2-1 .1-1z" />
                              </svg>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs">{t('waReady')}</TooltipContent>
                          </Tooltip>
                        )}
                        {/* Mobile-only inline stage tag; desktop uses the Estado column */}
                        <span className={cn('md:hidden small-caps font-mono text-[11px] px-1.5 py-0.5 border shrink-0', badge.className)}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-ink-mute mt-0.5 md:hidden">
                        {total === 0 ? t('noExercises') : t('exerciseSummary', { calibrated: cal, total })}
                      </p>
                    </div>

                    <div className="hidden md:flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={e => copyCode(s.access_code, e)}
                            className={cn(
                              'font-mono text-xs px-2.5 py-1 border transition-colors tracking-[0.06em]',
                              copied === s.access_code ? 'border-ok text-ok' : 'border-rule text-ink-soft hover:border-ink-soft hover:text-ink'
                            )}
                          >
                            {copied === s.access_code ? t('copied') : s.access_code}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">{t('copyCodeTooltip')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={e => shareLink(s, e)}
                            className={cn(
                              'size-7 border flex items-center justify-center transition-colors',
                              copied === `link-${s.access_code}` ? 'border-ok text-ok' : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink'
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
                        <TooltipContent side="left" className="text-xs">{t('shareLinkTooltip')}</TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="hidden md:flex items-center">
                      <span className={cn('inline-flex items-center gap-1.5 small-caps font-mono text-[11px] px-2 py-1 border', badge.className)}>
                        <span className={cn('size-1.5 rounded-full', badge.dot)} />
                        {badge.label}
                      </span>
                    </div>

                    <div className="hidden md:block">
                      <span className="font-display font-medium text-lg tabular-nums">{cal}</span>
                      <span className="font-mono text-xs text-ink-mute"> / {total}</span>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ink-mute justify-self-end">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-4 mt-6">
            <p className="small-caps font-mono text-[11px] text-ink-mute">
              {t('showingCount', { shown: students.length, total: count })}
            </p>
            {students.length < count && (
              <button
                onClick={() => load(false)}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 h-10 px-5 border border-rule text-ink font-medium text-sm rounded-md hover:border-ink-soft transition-colors disabled:opacity-50"
              >
                {loadingMore && <span className="w-4 h-4 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />}
                {t('loadMore')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}
