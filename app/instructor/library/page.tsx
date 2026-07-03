'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

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
    setTemplates((data as JourneyTemplate[]) ?? [])
    setFetching(false)
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!instructor || !name.trim()) return
    setError('')
    const { data, error: err } = await supabase.from('journey_templates')
      .insert({ instructor_id: instructor.id, name: name.trim(), category: category.trim() || null })
      .select().single()
    if (err) { setError(err.message); return }
    setName(''); setCategory('')
    await loadTemplates()
    if (data) setSelectedId((data as JourneyTemplate).id)
  }

  async function updateTemplate(id: string, patch: Partial<JourneyTemplate>) {
    setTemplates(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
    const { error: e } = await supabase.from('journey_templates').update(patch).eq('id', id)
    if (e) { setError(e.message); loadTemplates() }
  }

  async function deleteTemplate(id: string) {
    setSelectedId(s => (s === id ? null : s))
    setTemplates(prev => prev.filter(t => t.id !== id))
    const { error: e } = await supabase.from('journey_templates').delete().eq('id', id)
    if (e) { setError(e.message); loadTemplates() }
  }

  if (loading || !instructor) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
  }

  const selected = templates.find(t => t.id === selectedId) ?? null

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="mb-6">
          <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight">{t('title')}</h1>
          <p className="text-ink-soft text-sm mt-2 max-w-lg">{t('subtitle')}</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6">
          {(['templates', 'recommendations'] as const).map(key => (
            <button key={key} onClick={() => setTab(key)} className={cn('small-caps font-mono text-[10px] px-3 h-9 border transition-colors', tab === key ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-mute hover:text-ink hover:border-ink-soft')}>
              {key === 'templates' ? t('tabTemplates') : t('tabRecommendations')}
            </button>
          ))}
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
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder={t('categoryPlaceholder')} className="sm:w-40 h-10 bg-paper-2/40 border border-rule rounded-md px-3 text-sm focus:outline-none focus:border-ink-soft" />
              <button type="submit" disabled={!name.trim()} className="h-10 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 shrink-0">{t('createTemplate')}</button>
            </form>

            {fetching ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-ink-soft border-t border-b border-rule py-10 text-center">{t('noTemplates')}</p>
            ) : (
              <>
                {/* Template chips */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {templates.map(tpl => (
                    <button key={tpl.id} onClick={() => setSelectedId(tpl.id)} className={cn('flex items-center gap-2 px-3 h-9 border rounded-md text-sm transition-colors', selectedId === tpl.id ? 'border-ink bg-ink/[0.05]' : 'border-rule text-ink-soft hover:border-ink-soft hover:text-ink')}>
                      <span className="font-medium">{tpl.name}</span>
                      {tpl.category && <span className="small-caps font-mono text-[9px] text-ink-mute">{tpl.category}</span>}
                    </button>
                  ))}
                </div>

                {selected ? (
                  <div>
                    {/* Editable template name + category */}
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        value={selected.name}
                        onChange={e => setTemplates(prev => prev.map(t => (t.id === selected.id ? { ...t, name: e.target.value } : t)))}
                        onBlur={e => updateTemplate(selected.id, { name: e.target.value.trim() || selected.name })}
                        className="flex-1 h-9 bg-transparent border-b border-transparent hover:border-rule focus:border-ink-soft font-display font-semibold text-lg focus:outline-none"
                      />
                      <input
                        value={selected.category ?? ''}
                        onChange={e => setTemplates(prev => prev.map(t => (t.id === selected.id ? { ...t, category: e.target.value } : t)))}
                        onBlur={e => updateTemplate(selected.id, { category: e.target.value.trim() || null })}
                        placeholder={t('categoryPlaceholder')}
                        className="w-32 h-9 bg-transparent border-b border-transparent hover:border-rule focus:border-ink-soft small-caps font-mono text-[10px] text-ink-mute focus:outline-none"
                      />
                      <button onClick={() => deleteTemplate(selected.id)} title={t('deleteTemplate')} className="size-8 flex items-center justify-center text-ink-mute hover:text-bad transition-colors shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                    <p className="small-caps font-mono text-[10px] text-accent mb-2">{t('templateItemsTitle')}</p>
                    <LibraryItemList table="journey_template_items" parentColumn="template_id" parentId={selected.id} />
                  </div>
                ) : (
                  <p className="text-sm text-ink-mute text-center py-6">{t('selectTemplateHint')}</p>
                )}
              </>
            )}
          </>
        ) : (
          <div>
            <p className="text-xs text-ink-mute mb-4">{t('recommendationsHint')}</p>
            <LibraryItemList table="recommendations" parentColumn="instructor_id" parentId={instructor.id} />
          </div>
        )}
    </div>
  )
}
