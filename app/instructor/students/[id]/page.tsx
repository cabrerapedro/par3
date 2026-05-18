'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student } from '@/lib/types'
import type { Class, Clip } from '@/lib/classes'
import { weeklyStats, clipTrend, clipScoreSummary, type SessionLike, type ClipTrend } from '@/lib/trends'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import Link from 'next/link'

function useTimeAgo() {
  const t = useTranslations('instructor.students')
  return (date: Date) => {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000)
    if (days === 0) return t('timeToday')
    if (days === 1) return t('timeYesterday')
    if (days < 7) return t('timeDaysAgo', { days })
    if (days < 30) return t('timeWeeksAgo', { weeks: Math.floor(days / 7) })
    return t('timeMonthsAgo', { months: Math.floor(days / 30) })
  }
}

export default function StudentProfile() {
  const { instructor, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const t = useTranslations('instructor.students')
  const timeAgo = useTimeAgo()

  const [student, setStudent] = useState<Student | null>(null)
  const [classes, setClasses] = useState<Class[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [sessions, setSessions] = useState<SessionLike[]>([])
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    loadData()
    // loadData reads `studentId` from the closure; including it in the dep
    // array makes the lint rule + the intent match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, studentId, instructor])

  async function loadData() {
    setLoading(true)
    const [{ data: s }, { data: cls }, { data: cl }, { data: ps }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).single(),
      supabase.from('classes').select('*').eq('student_id', studentId).order('date', { ascending: false }),
      supabase.from('clips').select('*').eq('student_id', studentId).order('created_at'),
      supabase
        .from('practice_sessions')
        .select('clip_id, checkpoint_id, overall_score, date')
        .eq('student_id', studentId)
        .order('date', { ascending: false }),
    ])
    if (s) setStudent(s)
    setClasses(cls ?? [])
    setClips(cl ?? [])
    setSessions((ps as SessionLike[]) ?? [])
    // Default-expand the most recent class so the instructor lands on the
    // class they were just working on.
    if (cls && cls.length > 0) setExpandedClassId(cls[0].id)
    setLoading(false)
  }

  async function copyCode() {
    if (!student) return
    await navigator.clipboard.writeText(student.access_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function shareLink() {
    if (!student) return
    const url = `${window.location.origin}/student/login?code=${student.access_code}`
    const shareData = {
      title: t('shareTitle'),
      text: t('shareText', { name: student.name }),
      url,
    }
    if (navigator.share) {
      try { await navigator.share(shareData); return } catch {}
    }
    await navigator.clipboard.writeText(url)
    setShared(true)
    setTimeout(() => setShared(false), 1500)
  }

  async function deleteStudent() {
    setDeleting(true)
    await supabase.from('students').delete().eq('id', studentId)
    router.replace('/instructor/dashboard')
  }

  if (loading) return <LoadingScreen />
  if (!student) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">{t('notFound')}</p>
    </div>
  )

  // Weekly stats fed by every clip the student owns. Legacy checkpoint IDs
  // are no longer in play — the data migration moves them into clips.
  const trackableIds = clips.map(c => c.id)
  const week = weeklyStats(sessions, trackableIds)

  // Group clips by class. Most-recent class first; clips inside follow their
  // created_at order from the query.
  const clipsByClass: Record<string, Clip[]> = {}
  for (const c of clips) {
    if (!c.class_id) continue
    if (!clipsByClass[c.class_id]) clipsByClass[c.class_id] = []
    clipsByClass[c.class_id].push(c)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center gap-3">
          <Link href="/instructor/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            {t('backToStudents')}
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-10">
        <div className="flex items-start gap-5 mb-10">
          <Avatar className="size-16 shrink-0">
            <AvatarFallback className="bg-secondary text-muted-foreground text-xl font-semibold">
              {student.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-semibold">{student.name}</h1>
            {student.email && <p className="text-muted-foreground text-sm mt-0.5">{student.email}</p>}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={copyCode} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all", copied ? "bg-ok/10 border-ok/30 text-ok" : "bg-secondary border-border text-muted-foreground hover:border-ok/30 hover:text-foreground")}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {copied ? <polyline points="20 6 9 17 4 12" /> : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
                    </svg>
                    {copied ? t('copied') : student.access_code}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{t('copyCodeTooltip')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={shareLink} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all", shared ? "bg-ok/10 border-ok/30 text-ok" : "bg-secondary border-border text-muted-foreground hover:border-primary hover:text-foreground")}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {shared ? <polyline points="20 6 9 17 4 12" /> : <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></>}
                    </svg>
                    {shared ? t('copied') : t('shareLinkLabel')}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{t('shareLinkTooltip')}</TooltipContent>
              </Tooltip>
              {clips.length > 0 && (
                <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                  {t('clipsCount', { count: clips.length })}
                </Badge>
              )}
            </div>
          </div>
          {/* Edit / Delete — right-aligned, vertically aligned with + Ejercicio */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href={`/instructor/students/${studentId}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-ink hover:bg-paper-3 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {t('edit')}
            </Link>
            <button
              onClick={() => setDeleteDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:border-bad/40 hover:text-bad hover:bg-bad/5 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              {t('deleteAction')}
            </button>
          </div>
        </div>

        {/* "Esta semana" — replaces the old all-time practice stats */}
        <Separator className="mb-6" />
        <section className="bg-card border border-border rounded-md px-5 py-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('weekTitle')}</h2>
            {week.lastSessionAt && (
              <span className="text-xs text-muted-foreground">
                {t('weekLastPractice', { when: timeAgo(week.lastSessionAt) })}
              </span>
            )}
          </div>

          {week.sessionsCount === 0 && week.improvedClipIds.length === 0 && week.stagnantClipIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('weekNothingYet')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border",
                week.sessionsCount > 0 ? "bg-paper-3 border-primary text-ink" : "bg-secondary border-border text-muted-foreground"
              )}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t('weekSessions', { count: week.sessionsCount })}
              </span>
              {week.improvedClipIds.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-ok/10 border-ok/30 text-ok">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 10 12 4 18 10" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                  {t('weekImproved', { count: week.improvedClipIds.length })}
                </span>
              )}
              {week.stagnantClipIds.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-warn/10 border-warn/30 text-warn">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t('weekStagnant', { count: week.stagnantClipIds.length })}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Classes + Clips — primary surface after data migration */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">{t('classesTitle')}</h2>
            <Link
              href={`/instructor/students/${studentId}/clips/new/record`}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-85 transition-opacity"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M19 6h-2.5L15 4h-6L7.5 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
              </svg>
              {t('addClip')}
            </Link>
          </div>

          {classes.length === 0 ? (
            <div className="border border-dashed border-border rounded-md py-10 text-center">
              <p className="text-sm text-muted-foreground">{t('classesEmpty')}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {classes.map((cls) => {
                const classClips = clipsByClass[cls.id] ?? []
                const isExpanded = expandedClassId === cls.id
                const date = new Date(cls.date)
                return (
                  <li key={cls.id} className="bg-card border border-border rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedClassId(isExpanded ? null : cls.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">
                          {t('classDateLabel', {
                            date: new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date),
                          })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t('classClipCount', { count: classClips.length })}
                        </span>
                      </div>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={cn("text-muted-foreground transition-transform", isExpanded && "rotate-90")}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>

                    {isExpanded && classClips.length > 0 && (
                      <ul className="flex flex-col gap-2 px-3 pb-3">
                        {classClips.map((clip) => {
                          const summary = clipScoreSummary(sessions, clip.id)
                          const trend = clipTrend(sessions, clip.id)
                          return (
                            <li key={clip.id}>
                              <Link
                                href={`/instructor/students/${studentId}/clips/${clip.id}`}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/40 hover:bg-secondary transition-colors"
                              >
                                <ClipStatusDot status={clip.status} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{clip.name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                    <span>
                                      {clip.camera_angle === 'face_on' ? t('angleFaceOn') : t('angleDtl')}
                                    </span>
                                    {clip.clip_type === 'swing' && (
                                      <span className="text-muted-foreground/60">· swing</span>
                                    )}
                                    {summary.lastScore !== null && summary.lastDate && (
                                      <>
                                        <span className="text-muted-foreground/40">·</span>
                                        <span className="font-mono text-foreground/80">{summary.lastScore}%</span>
                                        <span className="text-muted-foreground/40">·</span>
                                        <span>{timeAgo(summary.lastDate)}</span>
                                      </>
                                    )}
                                  </p>
                                </div>
                                {summary.sessionCount > 0 ? <TrendChip trend={trend} t={t} /> : (
                                  <span className="text-xs text-muted-foreground">{t('clipNoSessions')}</span>
                                )}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

      </div>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialogTitle', { name: student.name })}</DialogTitle>
            <DialogDescription>{t('deleteDialogDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>{t('deleteCancel')}</Button>
            <Button variant="destructive" onClick={deleteStudent} disabled={deleting}>{deleting ? t('deleting') : t('deleteConfirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}

function ClipStatusDot({ status }: { status: Clip['status'] }) {
  const cls =
    status === 'calibrated' ? 'bg-ok' :
    status === 'archived' ? 'bg-muted-foreground/30' :
    'bg-warn animate-pulse'
  return <span className={cn('size-2 rounded-full shrink-0', cls)} />
}

function TrendChip({ trend, t }: { trend: ClipTrend; t: ReturnType<typeof useTranslations> }) {
  if (trend === 'noData') return null
  const cfg: Record<Exclude<ClipTrend, 'noData'>, { label: string; className: string }> = {
    improved: { label: t('clipTrendImproved'), className: 'bg-ok/10 text-ok border-ok/30' },
    declining: { label: t('clipTrendDeclining'), className: 'bg-bad/10 text-bad border-bad/30' },
    stagnant: { label: t('clipTrendStagnant'), className: 'bg-warn/10 text-warn border-warn/30' },
    newish: { label: t('clipTrendNewish'), className: 'bg-paper-3 text-ink border-primary' },
  }
  const { label, className } = cfg[trend]
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border whitespace-nowrap', className)}>
      {label}
    </span>
  )
}
