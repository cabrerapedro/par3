'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student } from '@/lib/types'
import type { Class, Clip } from '@/lib/classes'
import { weeklyStats, clipScoreSummary, type SessionLike } from '@/lib/trends'
import { Button } from '@/components/ui/button'
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
  const [statusSaving, setStatusSaving] = useState(false)

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
      supabase.from('clips').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
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

  async function toggleStatus() {
    if (!student || statusSaving) return
    const next = (student.status ?? 'active') === 'inactive' ? 'active' : 'inactive'
    setStatusSaving(true)
    const { error } = await supabase.from('students').update({ status: next }).eq('id', student.id)
    setStatusSaving(false)
    if (!error) setStudent({ ...student, status: next })
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

  const isActiveStudent = (student.status ?? 'active') !== 'inactive'

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
          <Link href="/instructor/dashboard" className="text-sm text-ink-soft hover:text-ink transition-colors flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            {t('backToStudents')}
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        {/* Identity — typographic ficha header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="small-caps font-mono text-[10px] text-accent mb-2">
              Alumno · {t('clipsCount', { count: clips.length })}
            </p>
            <h1 className="font-display font-semibold text-3xl md:text-[36px] leading-tight">{student.name}</h1>
            {student.email && <p className="text-ink-soft text-sm mt-1">{student.email}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleStatus}
              disabled={statusSaving}
              title={t('statusHint')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-50",
                isActiveStudent
                  ? "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
                  : "border-warn/50 text-warn hover:border-warn"
              )}
            >
              <span className={cn("size-1.5 rounded-full", isActiveStudent ? "bg-ok" : "bg-warn")} />
              {isActiveStudent ? t('statusActive') : t('statusInactive')}
            </button>
            <Link
              href={`/instructor/students/${studentId}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule text-ink-soft hover:border-ink-soft hover:text-ink transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {t('edit')}
            </Link>
            <button
              onClick={() => setDeleteDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule text-ink-soft hover:border-bad hover:text-bad transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              {t('deleteAction')}
            </button>
          </div>
        </div>

        {/* Access code + share link */}
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          <button onClick={copyCode} className={cn("flex items-center gap-2 px-3 py-1.5 border text-xs font-mono font-medium tracking-[0.06em] transition-colors", copied ? "border-ok text-ok" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {copied ? <polyline points="20 6 9 17 4 12" /> : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
            </svg>
            {copied ? t('copied') : student.access_code}
          </button>
          <button onClick={shareLink} className={cn("flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors", shared ? "border-ok text-ok" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {shared ? <polyline points="20 6 9 17 4 12" /> : <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></>}
            </svg>
            {shared ? t('copied') : t('shareLinkLabel')}
          </button>
        </div>

        {/* "Esta semana" — engagement only (did they practice), no score signals */}
        <div className="border-t border-rule mt-10 pt-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="small-caps font-mono text-[10px] text-accent">{t('weekTitle')}</p>
            {week.lastSessionAt && (
              <span className="small-caps font-mono text-[10px] text-ink-mute">
                {t('weekLastPractice', { when: timeAgo(week.lastSessionAt) })}
              </span>
            )}
          </div>
          <p className="font-display font-semibold text-2xl mt-3">
            {t('weekSessions', { count: week.sessionsCount })}
          </p>
        </div>

        {/* Classes + clips */}
        <div className="border-t border-rule mt-10 pt-8">
          <div className="flex items-center justify-between mb-5">
            <p className="small-caps font-mono text-[10px] text-accent">{t('classesTitle')}</p>
            <Link
              href={`/instructor/students/${studentId}/clips/new/record`}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-85 transition-opacity"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M19 6h-2.5L15 4h-6L7.5 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
              </svg>
              {t('addClip')}
            </Link>
          </div>

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
        </div>

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
