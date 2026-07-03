'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student, LifecycleStage } from '@/lib/types'
import type { Class, Clip } from '@/lib/classes'
import { weeklyStats, clipScoreSummary, type SessionLike } from '@/lib/trends'
import { canMessageWhatsapp, isDormantAt } from '@/lib/contacts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { JourneyEditor } from '@/components/JourneyEditor'
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
  const [attendedThisWeek, setAttendedThisWeek] = useState(0)
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [tab, setTab] = useState<'plan' | 'clips'>('plan')

  // Access card starts collapsed, but auto-opens ONCE for a brand-new student
  // (no activity yet) — the onboarding moment. The ref guard keeps it from
  // re-opening against the instructor if `student` gets a new object reference.
  const autoExpandedCode = useRef(false)
  useEffect(() => {
    if (student && !student.last_activity_at && !autoExpandedCode.current) {
      autoExpandedCode.current = true
      setShowCode(true)
    }
  }, [student])

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
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const [{ data: s }, { data: cls }, { data: cl }, { data: ps }, { data: lessons }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).single(),
      supabase.from('classes').select('*').eq('student_id', studentId).order('date', { ascending: false }),
      supabase.from('clips').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
      supabase
        .from('practice_sessions')
        .select('clip_id, checkpoint_id, overall_score, date')
        .eq('student_id', studentId)
        .order('date', { ascending: false }),
      supabase.from('lessons').select('id').eq('student_id', studentId).eq('status', 'attended').gte('starts_at', weekAgo),
    ])
    if (s) setStudent(s)
    setClasses(cls ?? [])
    setClips(cl ?? [])
    setSessions((ps as SessionLike[]) ?? [])
    setAttendedThisWeek((lessons ?? []).length)
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
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <p className="text-ink-soft">{t('notFound')}</p>
    </div>
  )

  // Weekly engagement only. We deliberately show whether the student
  // practiced (reliable) and not score/trend chips (the pose-comparison
  // score isn't validated enough to surface as a precise signal yet).
  const trackableIds = clips.map(c => c.id)
  const week = weeklyStats(sessions, trackableIds)

  // Group clips by class. Most-recent class first; clips inside are newest-first
  // (the query orders created_at desc).
  const clipsByClass: Record<string, Clip[]> = {}
  for (const c of clips) {
    if (!c.class_id) continue
    if (!clipsByClass[c.class_id]) clipsByClass[c.class_id] = []
    clipsByClass[c.class_id].push(c)
  }

  const lc: LifecycleStage = student.lifecycle_stage ?? 'active'
  const stageBadge =
    lc === 'active' && isDormantAt(student.last_activity_at)
      ? { label: t('stageDormant'), className: 'border-accent/40 text-accent', dot: 'bg-accent' }
      : lc === 'former'
        ? { label: t('stageFormer'), className: 'border-warn/40 text-warn', dot: 'bg-warn' }
        : lc === 'prospect'
          ? { label: t('stageProspect'), className: 'border-blue/40 text-blue', dot: 'bg-blue' }
          : { label: t('stageActive'), className: 'border-rule text-ink-soft', dot: 'bg-ok' }
  const since = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(student.created_at))

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <Link href="/instructor/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors mb-6">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        {t('backToStudents')}
      </Link>
      {/* Same width frame as the Alumnos list; the ficha stays a readable column
          anchored to the LEFT of that frame, not stretched. */}
      <div className="max-w-3xl">
        {/* Identity — typographic ficha header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('inline-flex items-center gap-1.5 small-caps font-mono text-[11px] px-2 py-0.5 border', stageBadge.className)}>
                <span className={cn('size-1.5 rounded-full', stageBadge.dot)} />
                {stageBadge.label}
              </span>
              {student.level && <span className="small-caps font-mono text-[11px] text-ink-mute">{student.level}</span>}
            </div>
            <h1 className="font-display font-semibold text-3xl md:text-[36px] leading-tight">{student.name}</h1>
            {/* High-level contact line */}
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-sm text-ink-soft">
              {student.email && <span className="truncate">{student.email}</span>}
              {student.phone && (
                <span className="inline-flex items-center gap-1.5 font-mono">
                  {student.phone}
                  {canMessageWhatsapp(student) && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-ok/70" aria-label={t('waReady')}>
                      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4z" />
                    </svg>
                  )}
                </span>
              )}
              <span className="small-caps font-mono text-[11px] text-ink-mute">{t('sinceLabel')} {since}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/instructor/students/${studentId}/edit`}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium border border-rule text-ink-soft hover:border-ink-soft hover:text-ink transition-colors rounded-md"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {t('edit')}
            </Link>
            <button
              onClick={() => setDeleteDialog(true)}
              title={t('deleteAction')}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium border border-rule text-ink-mute hover:border-bad/50 hover:text-bad transition-colors rounded-md"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span className="hidden sm:inline">{t('deleteAction')}</span>
            </button>
          </div>
        </div>

        {/* Access — a clean, photographable card. The student snaps a photo of
            this and signs in calmly from home with the code (no QR, so it
            doesn't yank them out of the lesson). */}
        <div className="mt-6 border border-rule bg-paper-2/40">
          <button
            type="button"
            onClick={() => setShowCode(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-paper-2/60 transition-colors"
          >
            <div className="min-w-0">
              <p className="small-caps font-mono text-[11px] text-accent mb-1">{t('accessTitle')}</p>
              <p className="text-sm text-ink-soft leading-snug">{showCode ? t('accessPhotoHint') : t('showAccessCode')}</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('text-ink-mute shrink-0 transition-transform', showCode && 'rotate-180')}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showCode && (
            <>
          <div className="px-5 py-7 flex flex-col items-center text-center gap-1.5 border-t border-dashed border-rule">
            <p className="text-sm text-ink-soft flex items-center gap-1.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-ink-mute shrink-0">
                <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {t('accessStepWeb')}
            </p>
            <p className="font-display font-semibold text-2xl text-ink mb-4">forat.golf</p>
            <p className="text-sm text-ink-soft">{t('accessStepCode')}</p>
            <p className="font-mono font-semibold text-4xl md:text-5xl tracking-[0.18em] text-ink">{student.access_code}</p>
          </div>

          <div className="px-5 py-3 flex items-center gap-2 border-t border-rule">
            <button onClick={copyCode} className={cn("flex items-center gap-2 px-3 py-1.5 border text-xs font-mono font-medium tracking-[0.06em] transition-colors", copied ? "border-ok text-ok" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {copied ? <polyline points="20 6 9 17 4 12" /> : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
              </svg>
              {copied ? t('copied') : t('copyCodeLabel')}
            </button>
            <button onClick={shareLink} className={cn("flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors", shared ? "border-ok text-ok" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {shared ? <polyline points="20 6 9 17 4 12" /> : <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></>}
              </svg>
              {shared ? t('copied') : t('shareLinkLabel')}
            </button>
          </div>
            </>
          )}
        </div>

        {/* This week — compact engagement strip (secondary; no score signals) */}
        <div className="mt-5 flex items-center gap-x-8 gap-y-1 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="font-display font-semibold text-xl tabular-nums">{attendedThisWeek}</span>
            <span className="small-caps font-mono text-[11px] text-ink-mute">{t('weekAttendedLabel')}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-semibold text-xl tabular-nums text-ink-soft">{week.sessionsCount}</span>
            <span className="small-caps font-mono text-[11px] text-ink-mute">{t('weekRangeLabel')}</span>
          </div>
          {week.lastSessionAt && (
            <span className="small-caps font-mono text-[11px] text-ink-mute sm:ml-auto">{t('weekLastPractice', { when: timeAgo(week.lastSessionAt) })}</span>
          )}
        </div>

        {/* Tabs. Recording lives per-step (below) and as a big fallback button
            at the very bottom — so it's always within reach without crowding here. */}
        <div className="mt-8 flex items-center gap-1">
          {(['plan', 'clips'] as const).map(key => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn('small-caps font-mono text-[11px] px-3 h-9 border transition-colors', tab === key ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-mute hover:text-ink hover:border-ink-soft')}
            >
              {key === 'plan' ? t('tabPlan') : t('tabClips')}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'plan' ? (
            <JourneyEditor studentId={studentId} instructorId={instructor!.id} />
          ) : (
            <>

          {classes.length === 0 ? (
            <div className="border-t border-b border-rule py-12 text-center">
              <p className="text-sm text-ink-soft">{t('classesEmpty')}</p>
            </div>
          ) : (
            <ul className="border-t border-rule">
              {classes.map((cls) => {
                const classClips = clipsByClass[cls.id] ?? []
                const isExpanded = expandedClassId === cls.id
                const date = new Date(cls.date)
                return (
                  <li key={cls.id} className="border-b border-rule">
                    <button
                      type="button"
                      onClick={() => setExpandedClassId(isExpanded ? null : cls.id)}
                      className="w-full flex items-center gap-3 py-4 text-left hover:bg-paper-2/60 transition-colors"
                    >
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={cn("text-accent shrink-0 transition-transform", isExpanded && "rotate-90")}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className="font-display font-medium text-lg">
                        {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}
                      </span>
                      <span className="text-xs text-ink-mute ml-auto">
                        {t('classClipCount', { count: classClips.length })}
                      </span>
                    </button>

                    {isExpanded && classClips.length > 0 && (
                      <ul className="flex flex-col gap-px pb-3 pl-7">
                        {classClips.map((clip) => {
                          const summary = clipScoreSummary(sessions, clip.id)
                          return (
                            <li key={clip.id}>
                              <Link
                                href={`/instructor/students/${studentId}/clips/${clip.id}`}
                                className="flex items-center gap-3 px-3 py-2.5 border border-rule bg-paper-2/40 hover:bg-paper-2 transition-colors"
                              >
                                <ClipStatusDot status={clip.status} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-2">
                                    <p className="text-sm font-medium truncate">{clip.name}</p>
                                    <span className="font-mono text-xs text-ink-mute tabular-nums shrink-0">{formatTimeOfDay(clip.created_at)}</span>
                                  </div>
                                  <p className="text-xs text-ink-mute mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span>{clip.camera_angle === 'face_on' ? t('angleFaceOn') : t('angleDtl')}</span>
                                    {clip.clip_type === 'swing' && <span className="text-ink-mute/60">· swing</span>}
                                    <span className="text-ink-mute/40">·</span>
                                    {summary.sessionCount > 0 && summary.lastDate ? (
                                      <span>{t('clipPracticedCount', { count: summary.sessionCount })} · {timeAgo(summary.lastDate)}</span>
                                    ) : (
                                      <span>{t('clipNoSessions')}</span>
                                    )}
                                  </p>
                                </div>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-mute shrink-0">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
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
            </>
          )}
        </div>

        {/* Fallback record button — big and impossible to miss when you scroll
            down, for a clip that doesn't belong to any step. */}
        <Link
          href={`/instructor/students/${studentId}/clips/new/record`}
          className="mt-10 flex items-center justify-center gap-2 h-14 w-full bg-primary text-primary-foreground text-base font-semibold rounded-md hover:opacity-85 transition-opacity"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.5" /><path d="M19 6h-2.5L15 4h-6L7.5 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
          </svg>
          {t('recordCta')}
        </Link>
        </div>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialogTitle', { name: student.name })}</DialogTitle>
            <DialogDescription>{t('deleteDialogDescription')}</DialogDescription>
          </DialogHeader>
          {clips.length > 0 && (
            <p className="text-sm text-bad bg-bad/10 border border-bad/20 rounded-md px-3 py-2.5">
              {t('deleteDialogCount', { count: clips.length })}
            </p>
          )}
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
  return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}

// Time of day (e.g. "18:42") so the instructor can tell same-named clips apart.
function formatTimeOfDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return ''
  }
}

function ClipStatusDot({ status }: { status: Clip['status'] }) {
  const cls =
    status === 'calibrated' ? 'bg-ok' :
    status === 'archived' ? 'bg-ink-mute/30' :
    'bg-warn animate-pulse'
  return <span className={cn('size-2 rounded-full shrink-0', cls)} />
}
