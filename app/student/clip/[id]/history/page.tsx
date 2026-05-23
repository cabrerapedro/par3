'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { ProgressChart } from '@/components/ProgressChart'
import { getMetricLabel, getPhaseLabel } from '@/lib/baseline'
import type { SwingPhaseName, PracticeSession } from '@/lib/types'
import type { Clip } from '@/lib/classes'
import Link from 'next/link'

export default function ClipPracticeHistory() {
  const { student, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.clipHistory')
  const tMetrics = useTranslations('metrics.labels')
  const tPhases = useTranslations('metrics.phases')
  const locale = useLocale()
  const dateLocale = locale === 'en' ? 'en-US' : 'es-MX'

  const [clip, setClip] = useState<Pick<Clip, 'name' | 'camera_angle' | 'selected_metrics' | 'clip_type'> | null>(null)
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Wait for auth to hydrate before redirecting (avoids bouncing a
    // logged-in student to login on a hard load / PWA cold start).
    if (authLoading) return
    if (!student) { router.replace('/student/login'); return }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, authLoading])

  async function loadData() {
    const [{ data: c }, { data: ss }] = await Promise.all([
      supabase.from('clips').select('name, camera_angle, selected_metrics, clip_type').eq('id', clipId).single(),
      supabase.from('practice_sessions')
        .select('*')
        .eq('clip_id', clipId)
        .eq('student_id', student!.id)
        .order('date', { ascending: true }),
    ])
    if (c) setClip(c as any)
    setSessions(ss ?? [])
    setLoading(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })
  }

  function formatDuration(s: number) {
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  }

  const chartData = sessions.map(s => ({
    date: s.date,
    score: s.overall_score,
  }))

  const latestScore = sessions.length ? sessions[sessions.length - 1].overall_score : null
  const firstScore = sessions.length >= 2 ? sessions[0].overall_score : null
  const improvement = latestScore !== null && firstScore !== null ? latestScore - firstScore : null

  if (loading) return (
    <main className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </main>
  )

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-5 py-4">
          <Link href={`/student/clip/${clipId}`} className="text-muted-foreground text-sm hover:text-muted-foreground">
            {t('backToCheckpoint', { name: clip?.name ?? '' })}
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-5 py-8">

        {/* Header stats */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-display font-semibold">{t('title')}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{t('sessionsCount', { count: sessions.length })}</p>
          </div>
          {improvement !== null && (
            <div className={`text-right px-4 py-2 rounded-md border ${
              improvement > 0 ? 'bg-ok/10 border-ok/20' :
              improvement < 0 ? 'bg-bad/10 border-bad/20' :
              'bg-card border-border'
            }`}>
              <p className={`text-2xl font-bold font-mono ${
                improvement > 0 ? 'text-ok' : improvement < 0 ? 'text-bad' : 'text-muted-foreground'
              }`}>
                {improvement > 0 ? '+' : ''}{improvement}%
              </p>
              <p className="text-muted-foreground text-xs">{t('sinceStart')}</p>
            </div>
          )}
        </div>

        {/* Chart */}
        {sessions.length >= 2 ? (
          <div className="bg-card border border-border rounded-md px-4 pt-4 pb-3 mb-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">{t('scorePerSession')}</p>
            <ProgressChart data={chartData} height={130} />
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-px bg-ok inline-block" />
                <span>{t('thresholdGood')}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-px bg-warn inline-block" />
                <span>{t('thresholdAverage')}</span>
              </span>
            </div>
          </div>
        ) : sessions.length === 1 ? (
          <div className="bg-card border border-border rounded-md px-4 py-4 mb-6 text-center">
            <p className="text-muted-foreground text-sm">{t('secondSessionHint')}</p>
          </div>
        ) : null}

        {/* Session list */}
        {sessions.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-md text-muted-foreground">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-muted-foreground/40">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <p className="text-muted-foreground mb-1">{t('emptyTitle')}</p>
            <p className="text-sm">{t('emptyDesc')}</p>
            <Link
              href={clip?.clip_type === 'swing'
                ? `/student/clip/${clipId}/practice`
                : `/student/clip/${clipId}/mirror`
              }
              className="inline-block mt-4"
            >
              <button className="bg-primary text-primary-foreground text-sm font-semibold rounded-xl px-4 py-2.5 hover:opacity-90 transition-all">
                {clip?.clip_type === 'swing' ? t('recordPractice') : t('practice')}
              </button>
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">{t('sessionsHeader')}</p>
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[...sessions].reverse().map((session, i) => {
                const metricEntries = Object.entries(session.results ?? {})
                  .filter(([key]) => {
                    if (!clip?.selected_metrics?.length) return true
                    const baseKey = key.includes('__') ? key.split('__')[1] : key
                    return clip.selected_metrics.includes(baseKey)
                  })
                const isLatest = i === 0
                const prevSession = i < sessions.length - 1 ? [...sessions].reverse()[i + 1] : null
                const delta = prevSession ? session.overall_score - prevSession.overall_score : null

                return (
                  <li key={session.id}>
                    <div className={`bg-card rounded-md px-5 py-4 border ${isLatest ? 'border-ok/30' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-foreground font-semibold">{formatDate(session.date)}</p>
                            {isLatest && (
                              <span className="text-xs text-ok bg-ok/10 border border-ok/20 rounded-full px-2 py-0.5">
                                {t('latest')}
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {formatDuration(session.duration_seconds)}
                            {delta !== null && (
                              <span className={`ml-2 ${delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-muted-foreground'}`}>
                                {delta > 0 ? `↑ +${delta}%` : delta < 0 ? `↓ ${delta}%` : '→'}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold font-mono ${
                            session.overall_score >= 80 ? 'text-ok' :
                            session.overall_score >= 50 ? 'text-warn' : 'text-bad'
                          }`}>
                            {session.overall_score}%
                          </div>
                          <p className="text-muted-foreground text-xs">{t('inRange')}</p>
                        </div>
                      </div>

                      {/* Score bar */}
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
                        <div
                          className={`h-full rounded-full ${
                            session.overall_score >= 80 ? 'bg-ok' :
                            session.overall_score >= 50 ? 'bg-warn' : 'bg-bad'
                          }`}
                          style={{ width: `${session.overall_score}%`, transition: 'width 0.4s' }}
                        />
                      </div>

                      {/* Per-metric pills */}
                      {metricEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {metricEntries.map(([key, val]) => {
                            let label: string
                            if (key.includes('__')) {
                              const [phase, metric] = key.split('__')
                              label = `${getPhaseLabel(phase as SwingPhaseName, tPhases)}: ${getMetricLabel(metric, tMetrics)}`
                            } else {
                              label = getMetricLabel(key, tMetrics)
                            }
                            return (
                              <span
                                key={key}
                                className={`text-xs px-2 py-0.5 rounded-full border ${
                                  (val as any).status === 'ok'
                                    ? 'text-ok bg-ok/10 border-ok/20'
                                    : (val as any).status === 'warn'
                                      ? 'text-warn bg-warn/10 border-warn/20'
                                      : 'text-bad bg-bad/10 border-bad/20'
                                }`}
                              >
                                {label}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}
