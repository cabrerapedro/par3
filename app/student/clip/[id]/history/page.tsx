'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { PracticeSession } from '@/lib/types'
import type { Clip } from '@/lib/classes'
import Link from 'next/link'

// History is engagement-only: how often and when the student practiced, and for
// how long. We deliberately do NOT surface the pose-comparison score/percentages
// here — the measurement isn't validated enough to show as a precise signal, and
// a wrong "you got worse" number breaks trust in the coach. (See project memory:
// measurement-not-validated.)
export default function ClipPracticeHistory() {
  const { student, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.clipHistory')
  const locale = useLocale()
  const dateLocale = locale === 'en' ? 'en-US' : 'es-MX'

  const [clip, setClip] = useState<Pick<Clip, 'name' | 'clip_type'> | null>(null)
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!student) { router.replace('/student/login'); return }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, authLoading])

  async function loadData() {
    const [{ data: c }, { data: ss }] = await Promise.all([
      supabase.from('clips').select('name, clip_type').eq('id', clipId).single(),
      supabase.from('practice_sessions')
        .select('*')
        .eq('clip_id', clipId)
        .eq('student_id', student!.id)
        .order('date', { ascending: true }),
    ])
    if (c) setClip(c as Pick<Clip, 'name' | 'clip_type'>)
    setSessions(ss ?? [])
    setLoading(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'short' })
  }
  function formatDuration(s: number) {
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  }

  if (loading) return (
    <main className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </main>
  )

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-5 py-4">
          <Link href={`/student/clip/${clipId}`} className="text-muted-foreground text-sm hover:text-foreground">
            {t('backToCheckpoint', { name: clip?.name ?? '' })}
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-display font-semibold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('sessionsCount', { count: sessions.length })}</p>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-md text-muted-foreground">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-muted-foreground/40">
              <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" />
            </svg>
            <p className="text-muted-foreground mb-1">{t('emptyTitle')}</p>
            <p className="text-sm">{t('emptyDesc')}</p>
            <Link
              href={clip?.clip_type === 'swing' ? `/student/clip/${clipId}/practice` : `/student/clip/${clipId}/mirror`}
              className="inline-block mt-4"
            >
              <button className="bg-primary text-primary-foreground text-sm font-semibold rounded-xl px-4 py-2.5 hover:opacity-90 transition-all">
                {clip?.clip_type === 'swing' ? t('recordPractice') : t('practice')}
              </button>
            </Link>
          </div>
        ) : (
          <ul className="border-t border-border">
            {[...sessions].reverse().map((session, i) => {
              const isLatest = i === 0
              return (
                <li key={session.id} className="flex items-center gap-3 py-4 border-b border-border">
                  <div className="size-9 rounded-full bg-ok/10 border border-ok/20 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ok">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-foreground font-medium capitalize truncate">{formatDate(session.date)}</p>
                      {isLatest && (
                        <span className="text-xs text-ok bg-ok/10 border border-ok/20 rounded-full px-2 py-0.5 shrink-0">{t('latest')}</span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs mt-0.5">{formatDuration(session.duration_seconds)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
