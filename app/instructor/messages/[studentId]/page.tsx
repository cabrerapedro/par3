'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { MessageLog, Student } from '@/lib/types'
import { canMessageWhatsapp } from '@/lib/contacts'
import { cn } from '@/lib/utils'

const STATUS_KEY: Record<string, string> = {
  queued: 'statusQueued', sent: 'statusSent', delivered: 'statusDelivered',
  read: 'statusRead', failed: 'statusFailed',
}

export default function MessageThread() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.studentId as string
  const t = useTranslations('instructor.messages')

  const [student, setStudent] = useState<Student | null>(null)
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [fetching, setFetching] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading, studentId])

  async function load() {
    setFetching(true)
    const [{ data: s }, { data: msgs }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).single(),
      supabase.from('message_log').select('*').eq('student_id', studentId).order('created_at', { ascending: true }),
    ])
    setStudent((s as Student) ?? null)
    setMessages((msgs as MessageLog[]) ?? [])
    setFetching(false)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const windowOpen = !!student?.whatsapp_window_expires_at &&
    Date.parse(student.whatsapp_window_expires_at) > Date.now()
  const canMessage = student ? canMessageWhatsapp(student) : false

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch('/api/messages/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ studentId, text: body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'failed')
      setMessages(prev => [...prev, json.message as MessageLog])
      setText('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed'
      setError(msg === 'window_closed' ? t('windowClosedNote') : msg === 'no_consent' ? t('noConsent') : msg)
    } finally {
      setSending(false)
    }
  }

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      {/* Thread header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-rule">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/instructor/messages" className="text-ink-soft hover:text-ink transition-colors shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <div className="min-w-0">
            <p className="font-display font-semibold text-lg truncate">{student?.name}</p>
            {windowOpen && <span className="small-caps font-mono text-[11px] text-ok">{t('windowOpen')}</span>}
          </div>
        </div>
        <Link href={`/instructor/students/${studentId}`} className="small-caps font-mono text-[11px] text-ink-mute hover:text-ink transition-colors shrink-0">
          {t('viewProfile')}
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 py-6 flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-mute text-center py-10">{t('emptyThread')}</p>
        ) : (
          messages.map(m => {
            const out = m.direction === 'outbound'
            return (
              <div key={m.id} className={cn('flex', out ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5',
                  out ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-paper-2 border border-rule rounded-bl-sm'
                )}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn('text-[10px] mt-1 flex items-center gap-1', out ? 'text-primary-foreground/70 justify-end' : 'text-ink-mute')}>
                    {timeShort(m.created_at)}
                    {out && m.status && STATUS_KEY[m.status] && <span>· {t(STATUS_KEY[m.status])}</span>}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="border-t border-rule pt-3 sticky bottom-0 bg-paper pb-2">
        {!canMessage ? (
          <p className="text-xs text-warn bg-warn/5 border border-warn/30 rounded-md px-3 py-2">{t('noConsent')}</p>
        ) : (
          <>
            {!windowOpen && (
              <p className="text-[11px] text-ink-mute mb-2 leading-snug">{t('windowClosedNote')}</p>
            )}
            <p className="text-[11px] text-ink-mute mb-2 leading-snug">{t('dryRunNote')}</p>
            <form onSubmit={send} className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('composePlaceholder')}
                rows={1}
                className="flex-1 min-h-[44px] max-h-32 bg-paper-2/40 border border-rule rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:border-ink-soft"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="h-11 px-5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-85 transition-opacity disabled:opacity-50 shrink-0"
              >
                {sending ? t('sending') : t('send')}
              </button>
            </form>
            {error && <p className="text-xs text-bad mt-2">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}

function timeShort(iso: string): string {
  try { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) }
  catch { return '' }
}
