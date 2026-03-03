'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { ProgressChart } from '@/components/ProgressChart'
import { METRIC_LABELS } from '@/lib/baseline'
import type { Checkpoint, PracticeSession } from '@/lib/types'
import Link from 'next/link'

export default function PracticeHistory() {
  const { student } = useAuth()
  const router = useRouter()
  const params = useParams()
  const cpId = params.id as string

  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    loadData()
  }, [student])

  async function loadData() {
    const [{ data: cp }, { data: ss }] = await Promise.all([
      supabase.from('checkpoints').select('name, camera_angle').eq('id', cpId).single(),
      supabase.from('practice_sessions')
        .select('*')
        .eq('checkpoint_id', cpId)
        .eq('student_id', student!.id)
        .order('date', { ascending: true }),
    ])
    if (cp) setCheckpoint(cp as any)
    setSessions(ss ?? [])
    setLoading(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
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
      <div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" />
    </main>
  )

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-5 py-4">
        <Link href={`/student/checkpoint/${cpId}`} className="text-muted-foreground text-sm hover:text-muted-foreground">
          ← {checkpoint?.name}
        </Link>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-8">

        {/* Header stats */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Tu evolución</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{sessions.length} sesión{sessions.length !== 1 ? 'es' : ''} grabada{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          {improvement !== null && (
            <div className={`text-right px-4 py-2 rounded-2xl border ${
              improvement > 0 ? 'bg-ok/10 border-ok/20' :
              improvement < 0 ? 'bg-bad/10 border-bad/20' :
              'bg-card border-border'
            }`}>
              <p className={`text-2xl font-bold font-mono ${
                improvement > 0 ? 'text-ok' : improvement < 0 ? 'text-bad' : 'text-muted-foreground'
              }`}>
                {improvement > 0 ? '+' : ''}{improvement}%
              </p>
              <p className="text-muted-foreground text-xs">desde el inicio</p>
            </div>
          )}
        </div>

        {/* Chart */}
        {sessions.length >= 2 ? (
          <div className="bg-card border border-border rounded-2xl px-4 pt-4 pb-3 mb-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Puntuación por sesión</p>
            <ProgressChart data={chartData} height={130} />
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-px bg-ok inline-block" />
                <span>80% — bueno</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-px bg-warn inline-block" />
                <span>50% — regular</span>
              </span>
            </div>
          </div>
        ) : sessions.length === 1 ? (
          <div className="bg-card border border-border rounded-2xl px-4 py-4 mb-6 text-center">
            <p className="text-muted-foreground text-sm">Graba una segunda sesión para ver tu evolución en el gráfico</p>
          </div>
        ) : null}

        {/* Session list */}
        {sessions.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl text-muted-foreground">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-muted-foreground mb-1">Sin sesiones todavía</p>
            <p className="text-sm">Graba tu primera práctica para empezar a ver tu progreso</p>
            <Link href={`/student/checkpoint/${cpId}/practice`} className="inline-block mt-4">
              <button className="bg-ok text-black text-sm font-semibold rounded-xl px-4 py-2.5 hover:opacity-90 transition-all">
                Grabar práctica
              </button>
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Sesiones</p>
            <ul className="flex flex-col gap-3">
              {[...sessions].reverse().map((session, i) => {
                const metricEntries = Object.entries(session.results ?? {})
                const okCount = metricEntries.filter(([, v]) => (v as any).status === 'ok').length
                const isLatest = i === 0
                const prevSession = i < sessions.length - 1 ? [...sessions].reverse()[i + 1] : null
                const delta = prevSession ? session.overall_score - prevSession.overall_score : null

                return (
                  <li key={session.id}>
                    <div className={`bg-card rounded-2xl px-5 py-4 border ${isLatest ? 'border-ok/30' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-foreground font-semibold">{formatDate(session.date)}</p>
                            {isLatest && (
                              <span className="text-xs text-ok bg-ok/10 border border-ok/20 rounded-full px-2 py-0.5">
                                Última
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
                          <p className="text-muted-foreground text-xs">en rango</p>
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
                          {metricEntries.map(([key, val]) => (
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
                              {METRIC_LABELS[key] ?? key}
                            </span>
                          ))}
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
