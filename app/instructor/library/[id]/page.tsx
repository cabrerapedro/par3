'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { JourneyTemplate } from '@/lib/types'
import { LibraryItemList } from '@/components/LibraryItemList'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// A single journey template on its own page: editable name, its ordered steps,
// and delete. Reached from the library card grid so the list stays uncluttered.
export default function TemplateDetailPage() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const t = useTranslations('instructor.library')

  const [template, setTemplate] = useState<JourneyTemplate | null>(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading, id])

  async function load() {
    if (!instructor) return
    const { data } = await supabase.from('journey_templates').select('*').eq('id', id).eq('instructor_id', instructor.id).single()
    setTemplate((data as JourneyTemplate) ?? null)
    setFetching(false)
  }

  async function saveName(value: string) {
    if (!template) return
    const clean = value.trim() || template.name
    setTemplate({ ...template, name: clean })
    const { error: e } = await supabase.from('journey_templates').update({ name: clean }).eq('id', template.id)
    if (e) setError(e.message)
  }

  async function confirmDelete() {
    if (!template) return
    setDeleting(true)
    const { error: e } = await supabase.from('journey_templates').delete().eq('id', template.id)
    if (e) { setDeleting(false); setConfirmOpen(false); setError(e.message); return }
    router.push('/instructor/library')
  }

  if (loading || fetching) {
    return <div className="flex items-center justify-center py-24"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
  }

  return (
    <div className="max-w-3xl px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <Link href="/instructor/library" className="inline-flex items-center gap-1.5 small-caps font-mono text-[11px] text-ink-mute hover:text-ink transition-colors mb-6">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        {t('backToLibrary')}
      </Link>

      {error && (
        <div className="mb-4 text-bad text-sm bg-bad/10 border border-bad/20 rounded-md px-4 py-3">
          <p className="font-medium">{t('errorSave')}</p>
          <p className="text-xs text-bad/80 mt-1 font-mono break-words">{error}</p>
        </div>
      )}

      {!template ? (
        <p className="text-sm text-ink-soft border-t border-b border-rule py-16 text-center">{t('templateNotFound')}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-5">
            <input
              defaultValue={template.name}
              onBlur={e => saveName(e.target.value)}
              className="flex-1 h-11 bg-transparent border-b border-rule/60 hover:border-ink-soft/60 focus:border-ink-soft font-display font-semibold text-2xl focus:outline-none"
            />
            <button onClick={() => setConfirmOpen(true)} title={t('deleteTemplate')} className="size-9 flex items-center justify-center text-ink-mute hover:text-bad transition-colors shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>

          <p className="small-caps font-mono text-[11px] text-accent mb-2">{t('templateItemsTitle')}</p>
          <LibraryItemList table="journey_template_items" parentColumn="template_id" parentId={template.id} emptyText={t('itemsEmpty')} addPlaceholder={t('addItemPlaceholder')} />

          {/* Delete confirmation */}
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t('deleteTemplateTitle')}</DialogTitle>
                <DialogDescription>{t('deleteTemplateBody', { name: template.name })}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-row gap-2">
                <Button variant="outline" onClick={() => setConfirmOpen(false)} className="flex-1">
                  {t('deleteCancel')}
                </Button>
                <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="flex-1">
                  {t('deleteTemplate')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
