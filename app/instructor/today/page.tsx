'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student, Lesson, LessonStatus } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type LessonRow = Lesson & { student: { id: string; name: string; lifecycle_stage: string | null } | null }

const HOUR_PX = 48
const DEFAULT_START_HOUR = 7
const DEFAULT_END_HOUR = 21

// --- date helpers (local) ---
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfWeek(d: Date) { const s = startOfDay(d); return addDays(s, -((s.getDay() + 6) % 7)) }
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime()
const minOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }
function endMinOf(l: LessonRow) {
  if (l.ends_at) { const d = new Date(l.ends_at); return d.getHours() * 60 + d.getMinutes() }
  return minOf(l.starts_at) + 60
}
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtTime = (iso: string) => { try { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) } catch { return '' } }
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Assign overlapping events to side-by-side columns (like Google Calendar).
function layoutDay(events: LessonRow[]): { l: LessonRow; col: number; cols: number }[] {
  const sorted = [...events].sort((a, b) => minOf(a.starts_at) - minOf(b.starts_at) || endMinOf(a) - endMinOf(b))
  const out: { l: LessonRow; col: number; cols: number }[] = []
  let cluster: LessonRow[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    const colEnds: number[] = []
    const placed: { l: LessonRow; col: number }[] = []
    for (const e of cluster) {
      let c = colEnds.findIndex(end => minOf(e.starts_at) >= end)
      if (c === -1) { c = colEnds.length; colEnds.push(endMinOf(e)) } else colEnds[c] = endMinOf(e)
      placed.push({ l: e, col: c })
    }
    for (const p of placed) out.push({ ...p, cols: colEnds.length })
    cluster = []
  }
  for (const e of sorted) {
    if (cluster.length && minOf(e.starts_at) >= clusterEnd) flush()
    cluster.push(e); clusterEnd = Math.max(clusterEnd, endMinOf(e))
  }
  flush()
  return out
}

const STATUS_STYLE: Record<LessonStatus, string> = {
  scheduled: 'bg-accent/15 border-accent/40 text-ink',
  attended: 'bg-ok/15 border-ok/50 text-ink',
  no_show: 'bg-warn/10 border-warn/40 text-ink-soft',
  cancelled: 'bg-paper-2 border-rule text-ink-mute line-through',
}

export default function TodayAgenda() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.today')

  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()))
  const [view, setView] = useState<'day' | 'week'>('week')
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [fetching, setFetching] = useState(true)
  const [schedule, setSchedule] = useState<Date | null>(null) // prefilled slot → opens scheduler
  const [selected, setSelected] = useState<LessonRow | null>(null)
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })
  const scrollRef = useRef<HTMLDivElement>(null)

  const weekStart = startOfWeek(viewDate)
  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [viewDate]
  const rangeStart = view === 'week' ? weekStart : startOfDay(viewDate)
  const rangeEnd = view === 'week' ? addDays(weekStart, 7) : addDays(startOfDay(viewDate), 1)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading, rangeStart.getTime(), rangeEnd.getTime()])

  // Keep the "now" line roughly live.
  useEffect(() => {
    const id = setInterval(() => { const n = new Date(); setNowMin(n.getHours() * 60 + n.getMinutes()) }, 60_000)
    return () => clearInterval(id)
  }, [])

  async function load() {
    if (!instructor) return
    setFetching(true)
    const { data } = await supabase
      .from('lessons')
      .select('*, student:students(id, name, lifecycle_stage)')
      .eq('instructor_id', instructor.id)
      .gte('starts_at', rangeStart.toISOString())
      .lt('starts_at', rangeEnd.toISOString())
      .order('starts_at', { ascending: true })
    setLessons((data as LessonRow[]) ?? [])
    setFetching(false)
  }

  // Grid vertical range: default 7–21, expanded to fit any lesson.
  const [startHour, endHour] = useMemo(() => {
    let lo = DEFAULT_START_HOUR, hi = DEFAULT_END_HOUR
    for (const l of lessons) {
      lo = Math.min(lo, Math.floor(minOf(l.starts_at) / 60))
      hi = Math.max(hi, Math.ceil(endMinOf(l) / 60))
    }
    return [Math.max(0, lo), Math.min(24, hi)]
  }, [lessons])
  const gridHeight = (endHour - startHour) * HOUR_PX
  const topFor = (min: number) => ((min - startHour * 60) / 60) * HOUR_PX

  // Scroll to ~current hour (today) or 8am on first paint.
  useEffect(() => {
    if (fetching || !scrollRef.current) return
    const target = days.some(d => sameDay(d, new Date())) ? nowMin / 60 - 1 : 8 - startHour
    scrollRef.current.scrollTop = Math.max(0, (target - startHour) * HOUR_PX)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetching, view, startHour])

  async function mark(lesson: LessonRow, status: LessonStatus) {
    setLessons(prev => prev.map(l => (l.id === lesson.id ? { ...l, status } : l)))
    setSelected(s => (s && s.id === lesson.id ? { ...s, status } : s))
    const { error } = await supabase.from('lessons').update({ status }).eq('id', lesson.id)
    // Don't let the UI lie: if the write failed, resync from the DB.
    if (error) { load(); return }
    if (status === 'attended' && lesson.student?.lifecycle_stage === 'prospect') {
      await supabase.from('students').update({ lifecycle_stage: 'active' }).eq('id', lesson.student_id)
    }
  }
  async function removeLesson(lesson: LessonRow) {
    setSelected(null)
    setLessons(prev => prev.filter(l => l.id !== lesson.id))
    const { error } = await supabase.from('lessons').delete().eq('id', lesson.id)
    if (error) load() // resync — the deleted lesson reappears if the write failed
  }

  function openSlot(day: Date, e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const raw = startHour * 60 + (y / HOUR_PX) * 60
    const snapped = Math.round(raw / 30) * 30
    const d = new Date(day)
    d.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0)
    setSchedule(d)
  }

  if (loading || !instructor) {
    return <div className="flex items-center justify-center py-24"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
  }

  const title = view === 'week'
    ? `${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(weekStart)} – ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(addDays(weekStart, 6))}`
    : new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(viewDate)

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 flex flex-col" style={{ height: 'calc(100dvh - 3.5rem)' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button aria-label={t('prevDay')} onClick={() => setViewDate(d => addDays(d, view === 'week' ? -7 : -1))} className="size-9 flex items-center justify-center border border-rule rounded-md text-ink-soft hover:text-ink hover:border-ink-soft transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button onClick={() => setViewDate(startOfDay(new Date()))} className="h-9 px-3 border border-rule rounded-md small-caps font-mono text-[11px] text-ink-soft hover:text-ink hover:border-ink-soft transition-colors">{t('todayBtn')}</button>
            <button aria-label={t('nextDay')} onClick={() => setViewDate(d => addDays(d, view === 'week' ? 7 : 1))} className="size-9 flex items-center justify-center border border-rule rounded-md text-ink-soft hover:text-ink hover:border-ink-soft transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <h1 className="font-display font-semibold text-lg md:text-xl capitalize ml-1 hidden sm:block">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {(['day', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn('small-caps font-mono text-[11px] px-3 h-9 border transition-colors', view === v ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-mute hover:text-ink hover:border-ink-soft')}>
                {v === 'day' ? t('viewDay') : t('viewWeek')}
              </button>
            ))}
          </div>
          <button onClick={() => { const d = new Date(viewDate); const n = new Date(); d.setHours(n.getHours() + 1, 0, 0, 0); setSchedule(d) }} className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground font-medium text-sm rounded-md hover:opacity-85 transition-opacity">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {t('add')}
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="flex border-b border-rule shrink-0" style={{ paddingLeft: 44 }}>
        {days.map(d => {
          const today = sameDay(d, new Date())
          return (
            <button key={d.toISOString()} onClick={() => { setViewDate(d); setView('day') }} className={cn('flex-1 py-1.5 text-center border-l border-rule first:border-l-0', today && 'bg-accent/[0.04]')}>
              <span className="small-caps font-mono text-[11px] text-ink-mute block capitalize">{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d)}</span>
              <span className={cn('font-display font-semibold text-base tabular-nums', today ? 'text-accent' : 'text-ink')}>{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      {/* Scrollable grid */}
      {fetching ? (
        <div className="flex-1 flex justify-center pt-16"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="flex" style={{ height: gridHeight }}>
            {/* Hour gutter */}
            <div className="w-11 shrink-0 relative">
              {Array.from({ length: endHour - startHour }, (_, i) => startHour + i).map(h => (
                <div key={h} className="absolute right-1.5 -translate-y-1/2 small-caps font-mono text-[11px] text-ink-mute" style={{ top: topFor(h * 60) }}>
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {/* Day columns */}
            {days.map(day => {
              const dayLessons = lessons.filter(l => sameDay(new Date(l.starts_at), day))
              const laid = layoutDay(dayLessons)
              const today = sameDay(day, new Date())
              return (
                <div
                  key={day.toISOString()}
                  onClick={e => openSlot(day, e)}
                  className="flex-1 relative border-l border-rule first:border-l-0 cursor-pointer"
                >
                  {/* Hour lines */}
                  {Array.from({ length: endHour - startHour }, (_, i) => (
                    <div key={i} className="absolute left-0 right-0 border-t border-rule/60" style={{ top: i * HOUR_PX }} />
                  ))}
                  {/* Now line */}
                  {today && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: topFor(nowMin) }}>
                      <div className="h-px bg-bad" /><div className="absolute -left-0.5 -top-1 size-2 rounded-full bg-bad" />
                    </div>
                  )}
                  {/* Events */}
                  {laid.map(({ l, col, cols }) => {
                    const top = topFor(minOf(l.starts_at))
                    const height = Math.max(18, ((endMinOf(l) - minOf(l.starts_at)) / 60) * HOUR_PX - 2)
                    return (
                      <button
                        key={l.id}
                        onClick={e => { e.stopPropagation(); setSelected(l) }}
                        className={cn('absolute rounded-md border px-1.5 py-1 text-left overflow-hidden transition-shadow hover:shadow-md z-10', STATUS_STYLE[l.status])}
                        style={{ top, height, left: `${(col / cols) * 100}%`, width: `calc(${100 / cols}% - 2px)` }}
                      >
                        <p className="font-mono text-[10px] tabular-nums leading-none opacity-70">{fmtTime(l.starts_at)}</p>
                        <p className="text-[11px] font-medium leading-tight truncate mt-0.5">{l.student?.name ?? '—'}</p>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {schedule && (
        <SchedulerDialog
          open={!!schedule}
          onClose={() => setSchedule(null)}
          instructorId={instructor.id}
          initial={schedule}
          onSaved={() => { setSchedule(null); load() }}
          t={t}
        />
      )}
      {selected && (
        <LessonDialog lesson={selected} onClose={() => setSelected(null)} onMark={mark} onDelete={removeLesson} onSaved={() => { setSelected(null); load() }} t={t} />
      )}
    </div>
  )
}

// --- Lesson detail dialog (tap an event) ---
function LessonDialog({ lesson, onClose, onMark, onDelete, onSaved, t }: {
  lesson: LessonRow; onClose: () => void
  onMark: (l: LessonRow, s: LessonStatus) => void; onDelete: (l: LessonRow) => void
  onSaved: () => void; t: ReturnType<typeof useTranslations>
}) {
  const [editing, setEditing] = useState(false)
  const [when, setWhen] = useState(() => toLocalInput(new Date(lesson.starts_at)))
  const [durationMin, setDurationMin] = useState(() => {
    if (lesson.ends_at) return Math.max(30, Math.round((new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000))
    return 60
  })
  const [note, setNote] = useState(lesson.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function saveEdit() {
    if (saving) return
    setSaving(true); setError('')
    const start = new Date(when)
    const end = new Date(start.getTime() + durationMin * 60_000)
    const { error: e } = await supabase.from('lessons').update({ starts_at: start.toISOString(), ends_at: end.toISOString(), note: note.trim() || null }).eq('id', lesson.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  const whenLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(lesson.starts_at))

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{lesson.student?.name ?? '—'}</span>
            {!editing && (
              <button onClick={() => setEditing(true)} title={t('editLesson')} className="text-ink-mute hover:text-ink transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="flex flex-col gap-3">
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="h-11 px-3 bg-paper-2/40 border border-rule rounded-md text-sm focus:outline-none focus:border-ink-soft" />
            <div className="flex items-center gap-1">
              {([['min30', 30], ['min60', 60], ['min90', 90]] as const).map(([key, m]) => (
                <button key={m} type="button" onClick={() => setDurationMin(m)} className={cn('flex-1 h-9 border rounded-md small-caps font-mono text-[11px] transition-colors', durationMin === m ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink')}>{t(key)}</button>
              ))}
            </div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('notePlaceholder')} className="h-11 px-3 bg-paper-2/40 border border-rule rounded-md text-sm focus:outline-none focus:border-ink-soft" />
            <div className="flex items-center gap-2">
              <button onClick={saveEdit} disabled={saving} className="flex-1 h-11 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-85 transition-opacity disabled:opacity-50">{saving ? t('saving') : t('scheduleCta')}</button>
              <button onClick={() => setEditing(false)} className="h-11 px-4 border border-rule text-ink-soft rounded-md hover:border-ink-soft transition-colors">{t('cancel')}</button>
            </div>
            {error && <p className="text-xs text-bad font-mono break-words">{error}</p>}
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-soft capitalize -mt-1">{whenLabel}</p>
            {lesson.note && <p className="text-sm text-ink-soft border-l-2 border-rule pl-2">{lesson.note}</p>}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={() => onMark(lesson, 'attended')} className={cn('h-10 border rounded-md small-caps font-mono text-[11px] transition-colors', lesson.status === 'attended' ? 'border-ok bg-ok/10 text-ok' : 'border-ok/50 text-ok hover:bg-ok/10')}>{t('markAttended')}</button>
              <button onClick={() => onMark(lesson, 'no_show')} className={cn('h-10 border rounded-md small-caps font-mono text-[11px] transition-colors', lesson.status === 'no_show' ? 'border-warn bg-warn/10 text-warn' : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink')}>{t('markNoShow')}</button>
            </div>
            <Link href={`/instructor/students/${lesson.student_id}/clips/new/record`} className="h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-85 transition-opacity">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.5" /><path d="M19 6h-2.5L15 4h-6L7.5 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" /></svg>
              {t('recordCta')}
            </Link>
            <div className="flex items-center justify-between pt-1">
              <Link href={`/instructor/students/${lesson.student_id}`} className="small-caps font-mono text-[11px] text-ink-mute hover:text-ink transition-colors">{t('viewProfile')}</Link>
              <button onClick={() => onDelete(lesson)} className="small-caps font-mono text-[11px] text-ink-mute hover:text-bad transition-colors">{t('deleteLesson')}</button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Scheduler dialog (create a lesson; student can be created inline) ---
function SchedulerDialog({ open, onClose, instructorId, initial, onSaved, t }: {
  open: boolean; onClose: () => void; instructorId: string; initial: Date
  onSaved: () => void; t: ReturnType<typeof useTranslations>
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Student[]>([])
  const [picked, setPicked] = useState<Student | null>(null)
  const [when, setWhen] = useState(() => toLocalInput(initial))
  const [durationMin, setDurationMin] = useState(60)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (picked) return
    const id = setTimeout(async () => {
      const q = supabase.from('students').select('*').eq('instructor_id', instructorId)
      const { data } = term.trim()
        ? await q.ilike('name', `%${term.trim()}%`).order('name').limit(6)
        : await q.order('last_activity_at', { ascending: false, nullsFirst: false }).limit(6)
      setResults((data as Student[]) ?? [])
    }, 180)
    return () => clearTimeout(id)
  }, [term, instructorId, picked])

  async function createStudent() {
    const name = term.trim()
    if (!name || saving) return
    setSaving(true); setError('')
    const { data, error: e } = await supabase.from('students')
      .insert({ instructor_id: instructorId, name, access_code: generateCode(), lifecycle_stage: 'prospect' })
      .select().single()
    setSaving(false)
    if (e) { setError(e.message); return }
    if (data) setPicked(data as Student)
  }

  async function save(status: LessonStatus) {
    if (!picked || saving) return
    setSaving(true); setError('')
    const start = new Date(when)
    const end = new Date(start.getTime() + durationMin * 60_000)
    const { error: e } = await supabase.from('lessons').insert({
      instructor_id: instructorId,
      student_id: picked.id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status,
      note: note.trim() || null,
    })
    if (e) { setSaving(false); setError(e.message); return }
    if (status === 'attended' && (picked.lifecycle_stage ?? 'active') === 'prospect') {
      await supabase.from('students').update({ lifecycle_stage: 'active' }).eq('id', picked.id)
    }
    setSaving(false)
    onSaved()
  }

  const exactMatch = results.some(s => s.name.toLowerCase() === term.trim().toLowerCase())

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('newLessonTitle')}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          {/* Student picker with inline create */}
          <div className="flex flex-col gap-1.5">
            <label className="small-caps font-mono text-[11px] text-ink-mute">{t('studentLabel')}</label>
            {picked ? (
              <div className="flex items-center justify-between h-11 px-3 border border-ink rounded-md">
                <span className="font-medium">{picked.name}</span>
                <button onClick={() => { setPicked(null); setTerm('') }} className="text-ink-mute hover:text-ink">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ) : (
              <>
                <input value={term} onChange={e => setTerm(e.target.value)} placeholder={t('studentSearch')} autoFocus className="h-11 px-3 bg-paper-2/40 border border-rule rounded-md text-sm focus:outline-none focus:border-ink-soft" />
                {(results.length > 0 || term.trim()) && (
                  <ul className="border border-rule rounded-md divide-y divide-rule max-h-52 overflow-y-auto">
                    {results.map(s => (
                      <li key={s.id}><button onClick={() => setPicked(s)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-paper-2/60 transition-colors">{s.name}</button></li>
                    ))}
                    {term.trim() && !exactMatch && (
                      <li>
                        <button onClick={createStudent} disabled={saving} className="w-full text-left px-3 py-2.5 hover:bg-paper-2/60 transition-colors">
                          <span className="text-sm text-accent font-medium">{t('createStudent', { name: term.trim() })}</span>
                          <span className="block text-xs text-ink-mute">{t('createStudentHint')}</span>
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* When */}
          <div className="flex flex-col gap-1.5">
            <label className="small-caps font-mono text-[11px] text-ink-mute">{t('whenLabel')}</label>
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="h-11 px-3 bg-paper-2/40 border border-rule rounded-md text-sm focus:outline-none focus:border-ink-soft" />
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-1.5">
            <label className="small-caps font-mono text-[11px] text-ink-mute">{t('durationLabel')}</label>
            <div className="flex items-center gap-1">
              {([['min30', 30], ['min60', 60], ['min90', 90]] as const).map(([key, m]) => (
                <button key={m} type="button" onClick={() => setDurationMin(m)} className={cn('flex-1 h-9 border rounded-md small-caps font-mono text-[11px] transition-colors', durationMin === m ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink')}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('notePlaceholder')} className="h-11 px-3 bg-paper-2/40 border border-rule rounded-md text-sm focus:outline-none focus:border-ink-soft" />

          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => save('scheduled')} disabled={!picked || saving} className="flex-1 h-11 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-85 transition-opacity disabled:opacity-50">
              {saving ? t('saving') : t('scheduleCta')}
            </button>
            <button onClick={() => save('attended')} disabled={!picked || saving} className="h-11 px-4 border border-ok/50 text-ok font-medium rounded-md hover:bg-ok/10 transition-colors disabled:opacity-50">
              {t('cameNowCta')}
            </button>
          </div>
          {error && <p className="text-xs text-bad font-mono break-words">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
