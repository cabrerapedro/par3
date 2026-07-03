'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { JourneyTemplate } from '@/lib/types'
import { LibraryItemList } from '@/components/LibraryItemList'
import { cn } from '@/lib/utils'

export default function LibraryPage() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.library')

  const [tab, setTab] = useState<'templates' | 'recommendations'>('templates')
  const [templates, setTemplates] = useState<JourneyTemplate[]>([])
  const [name, setName] = useState('')
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  // step titles per template id, ordered — powers the card count + preview
  const [steps, setSteps] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading])

  async function loadTemplates() {
    if (!instructor) return
    const { data, error: e } = await supabase.from('journey_templates').select('*').eq('instructor_id', instructor.id).order('created_at', { ascending: true })
    if (e) setError(e.message)
    const tpls = (data as JourneyTemplate[]) ?? []
    setTemplates(tpls)
    loadSteps(tpls)
    setFetching(false)
  }

  // One query for every template's steps, grouped by template — feeds each
  // card's count + preview.
  async function loadSteps(tpls: JourneyTemplate[]) {
    if (!tpls.length) { setSteps({}); return }
    const { data } = await supabase
      .from('journey_template_items')
      .select('template_id, title, position')
      .in('template_id', tpls.map(x => x.id))
      .order('position', { ascending: true })
    const map: Record<string, string[]> = {}
    for (const it of (data as { template_id: string; title: string }[]) ?? []) {
      (map[it.template_id] ??= []).push(it.title)
    }
    setSteps(map)
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!instructor || !name.trim()) return
    setError('')
    const { data, error: err } = await supabase.from('journey_templates')
      .insert({ instructor_id: instructor.id, name: name.trim(), category: null })
      .select().single()
    if (err) { setError(err.message); return }
    setName('')
    // Open the fresh template on its own page to start adding steps.
    if (data) router.push(`/instructor/library/${(data as JourneyTemplate).id}`)
  }

  if (loading || !instructor) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <div className="mb-6">
          <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight">{t('title')}</h1>
          <p className="text-ink-soft text-sm mt-2 max-w-lg">{t('subtitle')}</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-3">
          {(['templates', 'recommendations'] as const).map(key => (
            <button key={key} onClick={() => setTab(key)} className={cn('small-caps font-mono text-[11px] px-3 h-9 border transition-colors', tab === key ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-mute hover:text-ink hover:border-ink-soft')}>
              {key === 'templates' ? t('tabTemplates') : t('tabRecommendations')}
            </button>
          ))}
        </div>

        {/* Plain-language explainer for the active tab — a contained helper card
            with the example broken onto its own line so it scans at a glance. */}
        <div className="flex items-start gap-2.5 mb-6 max-w-2xl border border-rule rounded-md bg-paper-2/40 px-4 py-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ink-mute shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm text-ink-soft leading-relaxed">
              {tab === 'templates' ? t('templatesLead') : t('recommendationsLead')}
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="small-caps font-mono text-[11px] text-ink-mute">{t('exampleLabel')}</span>
              <span className="text-[13px] font-medium text-ink">{tab === 'templates' ? t('templatesExample') : t('recommendationsExample')}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-bad text-sm bg-bad/10 border border-bad/20 rounded-md px-4 py-3">
            <p className="font-medium">{t('errorSave')}</p>
            <p className="text-xs text-bad/80 mt-1 font-mono break-words">{error}</p>
          </div>
        )}

        {tab === 'templates' ? (
          <>
            {/* Create template */}
            <form onSubmit={createTemplate} className="flex flex-col sm:flex-row gap-2 mb-6">
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('newTemplatePlaceholder')} className="flex-1 h-10 bg-paper-2/40 border border-rule rounded-md px-3 text-sm focus:outline-none focus:border-ink-soft" />
              <button type="submit" disabled={!name.trim()} className="h-10 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 shrink-0">{t('createTemplate')}</button>
            </form>

            {fetching ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-ink-soft border-t border-b border-rule py-10 text-center">{t('noTemplates')}</p>
            ) : (
              /* Template cards — name + step count + a peek at the steps. Each
                 opens on its own page (keeps this list clean). */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map(tpl => {
                  const list = steps[tpl.id] ?? []
                  return (
                    <Link
                      key={tpl.id}
                      href={`/instructor/library/${tpl.id}`}
                      className="group text-left border border-rule rounded-lg p-4 bg-card hover:border-ink-soft transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-semibold text-base leading-snug min-w-0 truncate group-hover:text-ink">{tpl.name}</h3>
                        <span className="small-caps font-mono text-[11px] text-accent shrink-0 pt-0.5">{t('stepCount', { count: list.length })}</span>
                      </div>
                      {list.length > 0 ? (
                        <ol className="mt-3 space-y-1 border-t border-rule/60 pt-3">
                          {list.slice(0, 3).map((s, i) => (
                            <li key={i} className="flex gap-2 text-[13px] text-ink-soft">
                              <span className="font-mono text-ink-mute tabular-nums shrink-0">{i + 1}</span>
                              <span className="truncate">{s}</span>
                            </li>
                          ))}
                          {list.length > 3 && (
                            <li className="text-xs text-ink-mute pl-5">{t('moreSteps', { count: list.length - 3 })}</li>
                          )}
                        </ol>
                      ) : (
                        <p className="mt-3 text-[13px] text-ink-mute border-t border-rule/60 pt-3">{t('emptyStepsHint')}</p>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div>
            <LibraryItemList table="recommendations" parentColumn="instructor_id" parentId={instructor.id} emptyText={t('tipsEmpty')} addPlaceholder={t('addTipPlaceholder')} />
          </div>
        )}
    </div>
  )
}
