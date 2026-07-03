'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { MessageLog, Student } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Row = MessageLog & { student: { id: string; name: string; whatsapp_window_expires_at: string | null } | null }

interface Conversation {
  studentId: string
  name: string
  windowOpen: boolean
  last: Row
}

export default function MessagesPage() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.messages')
  const [convos, setConvos] = useState<Conversation[]>([])
  const [fetching, setFetching] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase
      .from('message_log')
      .select('*, student:students(id, name, whatsapp_window_expires_at)')
      .eq('instructor_id', instructor.id)
      .order('created_at', { ascending: false })
      .limit(400)
      .then(({ data }) => {
        // Group by student, keeping the most recent message as the preview.
        const rows = (data as Row[]) ?? []
        const seen = new Set<string>()
        const list: Conversation[] = []
        for (const r of rows) {
          if (!r.student || seen.has(r.student_id)) continue
          seen.add(r.student_id)
          list.push({
            studentId: r.student_id,
            name: r.student.name,
            windowOpen: !!r.student.whatsapp_window_expires_at && Date.parse(r.student.whatsapp_window_expires_at) > Date.now(),
            last: r,
          })
        }
        setConvos(list)
        setFetching(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading])

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="small-caps font-mono text-[11px] text-accent mb-2">{t('kicker')}</p>
          <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight">{t('title')}</h1>
          <p className="text-ink-soft text-sm mt-2">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground font-medium text-sm rounded-md hover:opacity-85 transition-opacity shrink-0"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('newMessage')}
        </button>
      </div>

      {fetching ? (
        <div className="flex justify-center py-16">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : convos.length === 0 ? (
        <p className="text-sm text-ink-soft border-t border-b border-rule py-16 text-center">{t('empty')}</p>
      ) : (
        <div className="border-t border-rule">
          {convos.map(c => (
            <Link key={c.studentId} href={`/instructor/messages/${c.studentId}`}>
              <div className="flex items-center gap-3 py-3.5 border-b border-rule hover:bg-paper-2/60 transition-colors cursor-pointer">
                <div className="size-9 rounded-full bg-paper-2 border border-rule flex items-center justify-center shrink-0 font-display font-semibold text-sm">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-display font-medium truncate">{c.name}</p>
                    {c.windowOpen && (
                      <span className="small-caps font-mono text-[11px] text-ok border border-ok/40 px-1.5 py-0.5 shrink-0">{t('windowOpen')}</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-mute truncate mt-0.5">
                    {c.last.direction === 'outbound' && <span className="text-ink-mute/70">{t('you')}: </span>}
                    {c.last.body}
                  </p>
                </div>
                <span className="small-caps font-mono text-[11px] text-ink-mute shrink-0">{timeShort(c.last.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pickerOpen && instructor && (
        <NewMessageDialog
          instructorId={instructor.id}
          onClose={() => setPickerOpen(false)}
          onPick={id => { setPickerOpen(false); router.push(`/instructor/messages/${id}`) }}
          t={t}
        />
      )}
    </div>
  )
}

// --- New-message student picker (debounced search, like the scheduler) ---
function NewMessageDialog({ instructorId, onClose, onPick, t }: {
  instructorId: string
  onClose: () => void
  onPick: (studentId: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Student[]>([])

  useEffect(() => {
    const id = setTimeout(async () => {
      const q = supabase.from('students').select('*').eq('instructor_id', instructorId)
      const { data } = term.trim()
        ? await q.ilike('name', `%${term.trim()}%`).order('name').limit(8)
        : await q.order('name').limit(8)
      setResults((data as Student[]) ?? [])
    }, 180)
    return () => clearTimeout(id)
  }, [term, instructorId])

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('pickStudent')}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1.5">
          <input value={term} onChange={e => setTerm(e.target.value)} placeholder={t('searchStudent')} autoFocus className="h-11 px-3 bg-paper-2/40 border border-rule rounded-md text-sm focus:outline-none focus:border-ink-soft" />
          {results.length > 0 && (
            <ul className="border border-rule rounded-md divide-y divide-rule max-h-64 overflow-y-auto">
              {results.map(s => (
                <li key={s.id}><button onClick={() => onPick(s.id)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-paper-2/60 transition-colors">{s.name}</button></li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function timeShort(iso: string): string {
  try {
    const d = new Date(iso)
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
    if (days === 0) return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(d)
  } catch { return '' }
}
