'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student } from '@/lib/types'
import { isDormantAt, canMessageWhatsapp, DORMANT_DAYS } from '@/lib/contacts'
import { cn } from '@/lib/utils'

type Segment = 'dormant' | 'active' | 'all'
type Phase = 'idle' | 'previewing' | 'previewed' | 'sending' | 'sent'

type StudentRow = Student

interface Preview {
  studentId: string
  name: string
  locale: 'es' | 'en'
  daysAway: number | null
  topic: string | null
  message: string
  error?: string | null
}

interface SendResult {
  simulated: boolean
  counts: { total: number; queued: number; sentReal: number; failed: number }
  sent: { studentId: string; name: string; status: string; error?: string | null }[]
}

export default function Campaigns() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.campaigns')

  const [students, setStudents] = useState<StudentRow[]>([])
  const [fetching, setFetching] = useState(true)
  const [segment, setSegment] = useState<Segment>('dormant')
  const [phase, setPhase] = useState<Phase>('idle')
  const [previews, setPreviews] = useState<Preview[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase
      .from('students')
      .select('*')
      .eq('instructor_id', instructor.id)
      .then(({ data }) => {
        setStudents((data as StudentRow[]) ?? [])
        setFetching(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading])

  // Same segmentation as the reactivation API + dashboard/stats: uses
  // lifecycle_stage + last_activity_at (never the legacy `status`, never a
  // divergent "dormant"). Prospects (never came) are NEVER reactivation targets.
  const inSeg = (s: StudentRow, seg: Segment) => {
    const stage = s.lifecycle_stage ?? 'active'
    if (seg === 'dormant') return stage === 'active' && isDormantAt(s.last_activity_at)
    if (seg === 'active') return stage === 'active'
    return stage === 'active' || stage === 'former' // 'all'
  }

  const pool = useMemo(() => students.filter(s => inSeg(s, segment)), [students, segment])
  const messageable = useMemo(() => pool.filter(canMessageWhatsapp), [pool])
  const blocked = useMemo(() => pool.filter(s => !canMessageWhatsapp(s)), [pool])

  const segmentCount = (seg: Segment) =>
    students.filter(s => inSeg(s, seg)).filter(canMessageWhatsapp).length

  async function authHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function generate() {
    setError('')
    setResult(null)
    setPhase('previewing')
    try {
      const res = await fetch('/api/campaigns/reactivation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          mode: 'preview',
          segment,
          studentIds: messageable.map(s => s.id),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'failed')
      const pv: Preview[] = json.previews ?? []
      setPreviews(pv)
      setEdited(Object.fromEntries(pv.map(p => [p.studentId, p.message])))
      setPhase('previewed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
      setPhase('idle')
    }
  }

  async function send() {
    setError('')
    setPhase('sending')
    try {
      const res = await fetch('/api/campaigns/reactivation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          mode: 'send',
          segment,
          studentIds: previews.map(p => p.studentId),
          messages: previews.map(p => ({ studentId: p.studentId, body: edited[p.studentId] ?? p.message })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'failed')
      setResult(json as SendResult)
      setPhase('sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
      setPhase('previewed')
    }
  }

  function reset() {
    setPhase('idle'); setPreviews([]); setEdited({}); setResult(null); setError('')
  }

  if (loading || !instructor) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="mb-8">
          <p className="small-caps font-mono text-[11px] text-accent mb-2">{t('kicker')}</p>
          <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight">{t('title')}</h1>
          <p className="text-ink-soft text-sm mt-2 max-w-lg">{t('subtitle', { days: DORMANT_DAYS })}</p>
        </div>

        {/* Dry-run banner: honest about no real send yet */}
        <div className="flex items-start gap-2.5 mb-8 border border-warn/40 bg-warn/5 rounded-md px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warn shrink-0 mt-0.5">
            <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <p className="text-xs text-ink-soft leading-relaxed">{t('dryRunNote')}</p>
        </div>

        {fetching ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : phase === 'sent' && result ? (
          <ResultView t={t} result={result} onReset={reset} />
        ) : (
          <>
            {/* Segment picker */}
            <div className="mb-6">
              <p className="small-caps font-mono text-[10px] text-ink-mute mb-2">{t('segmentLabel')}</p>
              <div className="flex items-center gap-1 flex-wrap">
                {(['dormant', 'active', 'all'] as const).map(seg => (
                  <button
                    key={seg}
                    onClick={() => { setSegment(seg); reset() }}
                    disabled={phase === 'previewing' || phase === 'sending'}
                    className={cn(
                      'small-caps font-mono text-[10px] px-3 h-9 border transition-colors disabled:opacity-50',
                      segment === seg ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink'
                    )}
                  >
                    {t(`segment_${seg}`)}<span className="ml-1.5 tabular-nums">({segmentCount(seg)})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Messageable / blocked summary */}
            <div className="border-t border-b border-rule divide-y divide-rule mb-6">
              <div className="flex items-center justify-between py-3">
                <span className="text-sm">{t('messageableLabel')}</span>
                <span className="font-display font-semibold text-xl tabular-nums">{messageable.length}</span>
              </div>
              {blocked.length > 0 && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-ink-soft">
                    {t('blockedLabel', { count: blocked.length })}{' '}
                    <Link href="/instructor/dashboard" className="underline hover:text-ink">{t('blockedFix')}</Link>
                  </span>
                  <span className="font-mono text-sm text-ink-mute tabular-nums">{blocked.length}</span>
                </div>
              )}
            </div>

            {error && (
              <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-md px-4 py-3 mb-4">{error}</p>
            )}

            {phase === 'idle' || phase === 'previewing' ? (
              <button
                onClick={generate}
                disabled={messageable.length === 0 || phase === 'previewing'}
                className="h-11 px-6 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {phase === 'previewing' && <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />}
                {phase === 'previewing' ? t('generating') : t('generateCta', { count: messageable.length })}
              </button>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-3">
                  <p className="small-caps font-mono text-[10px] text-ink-mute">{t('previewTitle', { count: previews.length })}</p>
                  <button onClick={generate} className="small-caps font-mono text-[10px] text-ink-mute hover:text-ink transition-colors">
                    {t('regenerate')}
                  </button>
                </div>

                <div className="flex flex-col gap-4 mb-8">
                  {previews.map(p => (
                    <div key={p.studentId} className="border border-rule rounded-md overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-paper-2/40 border-b border-rule">
                        <span className="font-display font-medium">{p.name}</span>
                        <div className="flex items-center gap-2.5">
                          {(edited[p.studentId] ?? p.message) !== p.message && (
                            <button
                              onClick={() => setEdited(m => ({ ...m, [p.studentId]: p.message }))}
                              className="small-caps font-mono text-[9px] text-ink-mute hover:text-ink transition-colors"
                            >
                              {t('revert')}
                            </button>
                          )}
                          <span className="small-caps font-mono text-[9px] text-ink-mute">
                            {p.daysAway === null ? t('neverActive') : t('daysAway', { days: p.daysAway })}
                            {p.topic && ` · ${p.topic}`}
                          </span>
                        </div>
                      </div>
                      <textarea
                        value={edited[p.studentId] ?? p.message}
                        onChange={e => setEdited(m => ({ ...m, [p.studentId]: e.target.value }))}
                        rows={3}
                        className="w-full bg-paper px-4 py-3 text-sm leading-relaxed focus:outline-none resize-y"
                      />
                      {p.error && <p className="text-bad text-xs px-4 pb-2">{p.error}</p>}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    onClick={send}
                    disabled={phase === 'sending' || previews.length === 0}
                    className="h-11 px-6 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {phase === 'sending' && <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />}
                    {phase === 'sending' ? t('sending') : t('sendCta', { count: previews.length })}
                  </button>
                  <button onClick={reset} className="text-sm text-ink-mute hover:text-ink transition-colors">{t('cancel')}</button>
                </div>
              </>
            )}
          </>
        )}
    </div>
  )
}

function ResultView({
  t, result, onReset,
}: {
  t: ReturnType<typeof useTranslations>
  result: SendResult
  onReset: () => void
}) {
  return (
    <div>
      <div className="flex flex-col items-center text-center py-8 border-t border-b border-rule mb-6">
        <div className="size-12 rounded-full bg-ok/10 flex items-center justify-center mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ok">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="font-display font-semibold text-2xl">
          {result.simulated
            ? t('resultQueued', { count: result.counts.queued })
            : t('resultSent', { count: result.counts.sentReal })}
        </p>
        {result.simulated && <p className="text-ink-soft text-sm mt-1 max-w-sm">{t('resultSimulatedNote')}</p>}
        {result.counts.failed > 0 && (
          <p className="text-warn text-sm mt-1">{t('resultFailed', { count: result.counts.failed })}</p>
        )}
      </div>

      <div className="border-t border-rule mb-8">
        {result.sent.map(s => (
          <div key={s.studentId} className="flex items-center justify-between py-2.5 border-b border-rule">
            <span className="font-display text-sm">{s.name}</span>
            <span className={cn(
              'small-caps font-mono text-[9px] px-1.5 py-0.5 border',
              s.status === 'failed' ? 'text-bad border-bad/40' : 'text-ink-soft border-rule'
            )}>
              {t(`status_${s.status}`)}
            </span>
          </div>
        ))}
      </div>

      <button onClick={onReset} className="h-11 px-6 border border-rule text-ink font-medium rounded-md hover:border-ink-soft transition-colors">
        {t('newCampaign')}
      </button>
    </div>
  )
}
