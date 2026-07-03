'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { dormantCutoffISO } from '@/lib/contacts'
import { cn } from '@/lib/utils'

interface Stats {
  total: number
  active: number
  former: number
  prospect: number
  dormant: number
  whatsapp: number
  practice30d: number
  sent: number
  replies: number
}

// Count-only query (head:true) — never pulls rows, just the matching count.
// Supabase filter builders don't narrow cleanly, so we thread `any` through.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function countStudents(instructorId: string, apply: (q: any) => any): Promise<number> {
  const base: any = supabase.from('students').select('id', { count: 'exact', head: true }).eq('instructor_id', instructorId)
  const { count } = await apply(base)
  return count ?? 0
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function StatsPage() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.stats')
  const [stats, setStats] = useState<Stats | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    loadStats(instructor.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading])

  async function loadStats(id: string) {
    setFetching(true)
    const cutoff = dormantCutoffISO()
    const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const msgCount = async (apply: (q: any) => any): Promise<number> => {
      const base: any = supabase.from('message_log').select('id', { count: 'exact', head: true }).eq('instructor_id', id)
      const { count } = await apply(base)
      return count ?? 0
    }
    const practiceCount = async (): Promise<number> => {
      // practice_sessions has no instructor_id; scope via the student list.
      const { data: ids } = await supabase.from('students').select('id').eq('instructor_id', id)
      const studentIds = (ids ?? []).map((r: any) => r.id)
      if (studentIds.length === 0) return 0
      const { count } = await supabase
        .from('practice_sessions')
        .select('id', { count: 'exact', head: true })
        .in('student_id', studentIds)
        .gte('date', cutoff30)
      return count ?? 0
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const [total, active, former, prospect, dormant, whatsapp, practice30d, sent, replies] = await Promise.all([
      countStudents(id, q => q),
      countStudents(id, q => q.eq('lifecycle_stage', 'active')),
      countStudents(id, q => q.eq('lifecycle_stage', 'former')),
      countStudents(id, q => q.eq('lifecycle_stage', 'prospect')),
      countStudents(id, q => q.eq('lifecycle_stage', 'active').or(`last_activity_at.is.null,last_activity_at.lt.${cutoff}`)),
      countStudents(id, q => q.not('phone', 'is', null).not('whatsapp_opt_in_at', 'is', null)),
      practiceCount(),
      msgCount(q => q.eq('direction', 'outbound')),
      msgCount(q => q.eq('direction', 'inbound')),
    ])
    setStats({ total, active, former, prospect, dormant, whatsapp, practice30d, sent, replies })
    setFetching(false)
  }

  if (loading || fetching || !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const stageBar = [
    { key: 'active', value: stats.active, color: 'bg-ok' },
    { key: 'former', value: stats.former, color: 'bg-warn' },
    { key: 'prospect', value: stats.prospect, color: 'bg-blue' },
  ]
  const stageTotal = stats.active + stats.former + stats.prospect || 1

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <div className="mb-8">
        <p className="small-caps font-mono text-[11px] text-accent mb-2">{t('kicker')}</p>
        <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight">{t('title')}</h1>
        <p className="text-ink-soft text-sm mt-2">{t('subtitle')}</p>
      </div>

      {stats.total === 0 ? (
        <p className="text-sm text-ink-soft border-t border-b border-rule py-16 text-center">{t('empty')}</p>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-t border-b border-rule mb-10">
            <BigStat label={t('totalStudents')} value={stats.total} />
            <BigStat label={t('active')} value={stats.active} border />
            <BigStat label={t('dormant')} value={stats.dormant} border accent={stats.dormant > 0} />
            <BigStat label={t('whatsappReachable')} value={stats.whatsapp} border />
          </div>

          {/* By stage */}
          <div className="mb-10">
            <p className="small-caps font-mono text-[10px] text-accent mb-3">{t('byStage')}</p>
            <div className="flex h-3 rounded-full overflow-hidden border border-rule">
              {stageBar.map(s => (
                <div key={s.key} className={cn(s.color)} style={{ width: `${(s.value / stageTotal) * 100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
              {stageBar.map(s => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', s.color)} />
                  <span className="text-sm">{t(s.key)}</span>
                  <span className="font-mono text-sm tabular-nums text-ink-mute">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity + reactivation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-rule rounded-lg p-5">
              <p className="small-caps font-mono text-[10px] text-accent mb-3">{t('engagement')}</p>
              <p className="font-display font-semibold text-3xl tabular-nums">{stats.practice30d}</p>
              <p className="text-sm text-ink-soft mt-1">{t('practice30d')}</p>
              <p className="text-xs text-ink-mute mt-0.5">{t('practice30dHint')}</p>
            </div>
            <div className="border border-rule rounded-lg p-5">
              <p className="small-caps font-mono text-[10px] text-accent mb-3">{t('reactivation')}</p>
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="font-display font-semibold text-3xl tabular-nums">{stats.sent}</p>
                  <p className="text-sm text-ink-soft mt-1">{t('messagesSent')}</p>
                </div>
                <div>
                  <p className="font-display font-semibold text-3xl tabular-nums text-ok">{stats.replies}</p>
                  <p className="text-sm text-ink-soft mt-1">{t('replies')}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BigStat({ label, value, border, accent }: { label: string; value: number; border?: boolean; accent?: boolean }) {
  return (
    <div className={cn('px-5 py-5', border && 'md:border-l border-rule')}>
      <p className="small-caps font-mono text-[10px] text-ink-mute">{label}</p>
      <p className={cn('font-display font-semibold text-3xl md:text-4xl tabular-nums mt-1', accent && 'text-accent')}>{value}</p>
    </div>
  )
}
