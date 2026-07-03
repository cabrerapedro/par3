'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { uploadImage } from '@/lib/uploads'
import type { Journey, JourneyItem, JourneyStatus, JourneyTemplate, JourneyTemplateItem } from '@/lib/types'
import { Lightbox } from '@/components/Lightbox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Instructor-facing learning-plan editor. A student can have several named
// plans ("planes de aprendizaje"); one is the current focus. Each plan is a
// PlanSection with an ordered list of steps. Plans can be created blank or
// loaded from the library (journey_templates).
const STATUS_CYCLE: Record<JourneyStatus, JourneyStatus> = { todo: 'doing', doing: 'done', done: 'todo' }
const STATUS_STYLE: Record<JourneyStatus, string> = {
  todo: 'border-rule text-ink-mute',
  doing: 'border-accent/40 text-accent',
  done: 'border-ok/50 text-ok',
}
const MAX_IMAGES = 6

export function JourneyEditor({ studentId, instructorId }: { studentId: string; instructorId: string }) {
  const t = useTranslations('instructor.journey')
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [templates, setTemplates] = useState<JourneyTemplate[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Journey | null>(null)

  useEffect(() => {
    loadJourneys()
    supabase.from('journey_templates').select('*').eq('instructor_id', instructorId).order('created_at')
      .then(({ data }) => setTemplates((data as JourneyTemplate[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  async function loadJourneys() {
    const { data } = await supabase
      .from('journeys')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: true })
    setJourneys((data as Journey[]) ?? [])
  }

  async function createFromTemplate(tpl: JourneyTemplate) {
    if (busy) return
    setBusy(true); setError(''); setPickerOpen(false)
    const { data: j, error: je } = await supabase.from('journeys').insert({
      student_id: studentId, instructor_id: instructorId, name: tpl.name,
      source_template_id: tpl.id, position: journeys.length,
    }).select().single()
    if (je || !j) { setBusy(false); setError(je?.message ?? 'error'); return }
    const { data: tItems } = await supabase.from('journey_template_items')
      .select('*').eq('template_id', tpl.id).order('position', { ascending: true })
    const items = (tItems as JourneyTemplateItem[]) ?? []
    if (items.length) {
      const { error: ie } = await supabase.from('journey_items').insert(items.map((it, i) => ({
        student_id: studentId, instructor_id: instructorId, journey_id: (j as Journey).id,
        title: it.title, note: it.note ?? null, images: it.images ?? [], position: i, status: 'todo',
      })))
      if (ie) setError(ie.message)
    }
    setBusy(false); loadJourneys()
  }

  // Local update on each keystroke; the DB write happens once on blur (renamePlan)
  // — otherwise every character fired an UPDATE, racing on flaky Wi-Fi.
  function renameLocal(id: string, name: string) {
    setJourneys(prev => prev.map(j => (j.id === id ? { ...j, name } : j)))
  }
  async function renamePlan(id: string, name: string) {
    renameLocal(id, name)
    const { error: e } = await supabase.from('journeys').update({ name }).eq('id', id)
    if (e) { setError(e.message); loadJourneys() }
  }

  async function confirmDelete() {
    const target = pendingDelete
    if (!target) return
    setJourneys(prev => prev.filter(j => j.id !== target.id))
    setPendingDelete(null)
    const { error: e } = await supabase.from('journeys').delete().eq('id', target.id)
    if (e) { setError(e.message); loadJourneys() }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="small-caps font-mono text-[11px] text-accent">{t('plansTitle')}</p>
        <div className="relative">
          <button
            onClick={() => setPickerOpen(o => !o)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 border border-rule rounded-md small-caps font-mono text-[11px] text-ink-soft hover:border-ink-soft hover:text-ink transition-colors disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
            {t('loadFromLibrary')}
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-9 z-20 w-64 max-h-72 overflow-y-auto border border-rule bg-paper-2 rounded-md shadow-lg py-1">
              {templates.length === 0 ? (
                <div className="px-3 py-3 text-xs text-ink-soft">
                  {t('noTemplates')}{' '}
                  <Link href="/instructor/library" className="text-accent underline">{t('manageLibrary')}</Link>
                </div>
              ) : (
                <>
                  <p className="px-3 py-1.5 small-caps font-mono text-[10px] text-ink-mute">{t('pickTemplate')}</p>
                  {templates.map(tpl => (
                    <button key={tpl.id} onClick={() => createFromTemplate(tpl)} className="w-full text-left px-3 py-2 text-sm hover:bg-ink/[0.04] transition-colors truncate">
                      {tpl.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-bad mb-3 font-mono break-words">{error}</p>}

      {journeys.length === 0 ? (
        <p className="text-sm text-ink-soft border-t border-b border-rule py-10 text-center">{t('noPlans')}</p>
      ) : (
        <div className="flex flex-col gap-8">
          {journeys.map(j => (
            <PlanSection
              key={j.id}
              journey={j}
              studentId={studentId}
              instructorId={instructorId}
              onRenameLocal={name => renameLocal(j.id, name)}
              onRename={name => renamePlan(j.id, name)}
              onDelete={() => setPendingDelete(j)}
            />
          ))}
        </div>
      )}

      {/* Delete plan confirmation */}
      <Dialog open={!!pendingDelete} onOpenChange={o => { if (!o) setPendingDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deletePlanTitle')}</DialogTitle>
            <DialogDescription>{t('deletePlanBody', { name: pendingDelete?.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)} className="flex-1">{t('deleteCancel')}</Button>
            <Button variant="destructive" onClick={confirmDelete} className="flex-1">{t('deletePlan')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---- One plan: editable name, focus toggle, delete, and its ordered steps ----
function PlanSection({ journey, studentId, instructorId, onRenameLocal, onRename, onDelete }: {
  journey: Journey
  studentId: string
  instructorId: string
  onRenameLocal: (name: string) => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const t = useTranslations('instructor.journey')
  const tc = useTranslations('common')
  const [items, setItems] = useState<JourneyItem[]>([])
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const [clips, setClips] = useState<Record<string, { id: string; name: string; status: string }[]>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey.id])

  async function load() {
    const { data } = await supabase.from('journey_items').select('*').eq('journey_id', journey.id).order('position', { ascending: true })
    const its = (data as JourneyItem[]) ?? []
    setItems(its)
    if (!its.length) { setClips({}); return }
    // Recorded reference clips linked to these steps ("abre el paso y graba").
    const { data: cl } = await supabase
      .from('clips')
      .select('id, name, status, journey_item_id')
      .in('journey_item_id', its.map(i => i.id))
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
    const map: Record<string, { id: string; name: string; status: string }[]> = {}
    for (const c of (cl as { id: string; name: string; status: string; journey_item_id: string }[]) ?? []) {
      (map[c.journey_item_id] ??= []).push({ id: c.id, name: c.name, status: c.status })
    }
    setClips(map)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || adding) return
    setAdding(true); setError('')
    const { error: e2 } = await supabase.from('journey_items').insert({
      student_id: studentId, instructor_id: instructorId, journey_id: journey.id,
      title: trimmed, position: items.length, status: 'todo',
    })
    setAdding(false)
    if (e2) { setError(e2.message); return }
    setTitle(''); load()
  }

  async function cycleStatus(item: JourneyItem) {
    const next = STATUS_CYCLE[item.status]
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, status: next } : i)))
    const { error: e } = await supabase.from('journey_items').update({ status: next }).eq('id', item.id)
    if (e) { setError(e.message); load() }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const a = items[index], b = items[target]
    setItems(prev => {
      const next = [...prev]
      next[index] = { ...b, position: a.position }
      next[target] = { ...a, position: b.position }
      return next
    })
    await Promise.all([
      supabase.from('journey_items').update({ position: b.position }).eq('id', a.id),
      supabase.from('journey_items').update({ position: a.position }).eq('id', b.id),
    ])
  }

  async function remove(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    const { error: e } = await supabase.from('journey_items').delete().eq('id', id)
    if (e) { setError(e.message); load() }
  }

  function patchLocal(id: string, patch: Partial<JourneyItem>) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
  }
  async function persist(id: string, patch: Partial<JourneyItem>) {
    const { error: e } = await supabase.from('journey_items').update(patch).eq('id', id)
    if (e) { setError(e.message); load() }
  }
  async function addImages(item: JourneyItem, files: FileList) {
    const imgs = item.images ?? []
    const room = MAX_IMAGES - imgs.length
    if (room <= 0) return
    setError('')
    const picked = Array.from(files).slice(0, room)
    const uploaded = (await Promise.all(picked.map(f => uploadImage('journey-images', f)))).filter(Boolean) as string[]
    if (!uploaded.length) { setError(t('uploadError')); return }
    const images = [...imgs, ...uploaded]
    patchLocal(item.id, { images })
    persist(item.id, { images })
  }
  function removeImage(item: JourneyItem, url: string) {
    const images = (item.images ?? []).filter(u => u !== url)
    patchLocal(item.id, { images })
    persist(item.id, { images })
  }

  return (
    <div className="border border-rule rounded-lg bg-card p-4 sm:p-5">
      {/* Plan header: name + focus + delete */}
      <div className="flex items-center gap-2 mb-1">
        <input
          value={journey.name}
          onChange={e => onRenameLocal(e.target.value)}
          onBlur={e => onRename(e.target.value.trim() || journey.name)}
          className="flex-1 min-w-0 h-9 bg-transparent border-b border-transparent hover:border-rule focus:border-ink-soft font-display font-semibold text-lg focus:outline-none"
        />
        <button onClick={onDelete} title={t('deletePlan')} className="size-8 flex items-center justify-center text-ink-mute hover:text-bad transition-colors shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>

      {items.length > 0 && (
        <ul className="border-t border-rule mt-3">
          {items.map((item, i) => (
            <li key={item.id} className="py-3 border-b border-rule">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => cycleStatus(item)}
                  title={t(item.status === 'todo' ? 'statusTodo' : item.status === 'doing' ? 'statusDoing' : 'statusDone')}
                  className={cn('size-6 rounded-full border flex items-center justify-center shrink-0 mt-1.5 transition-colors', STATUS_STYLE[item.status])}
                >
                  {item.status === 'done'
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    : <span className="font-mono text-[10px] tabular-nums">{i + 1}</span>}
                </button>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <input
                    value={item.title}
                    onChange={e => patchLocal(item.id, { title: e.target.value })}
                    onBlur={e => persist(item.id, { title: e.target.value.trim() })}
                    className={cn('h-8 bg-transparent border-b border-transparent hover:border-rule/60 focus:border-ink-soft text-sm font-medium focus:outline-none', item.status === 'done' && 'text-ink-mute line-through')}
                  />
                  <input
                    value={item.note ?? ''}
                    onChange={e => patchLocal(item.id, { note: e.target.value })}
                    onBlur={e => persist(item.id, { note: e.target.value.trim() || null })}
                    placeholder={t('itemNotePlaceholder')}
                    className="h-7 bg-transparent text-xs text-ink-soft placeholder:text-ink-mute/50 focus:outline-none"
                  />
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {(item.images ?? []).map(url => (
                      <div key={url} className="relative size-12 rounded-md overflow-hidden border border-rule">
                        <button type="button" onClick={() => setZoom(url)} title={tc('enlarge')} className="block w-full h-full cursor-zoom-in">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); removeImage(item, url) }} title={t('remove')} className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 text-white flex items-center justify-center">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                    {(item.images ?? []).length < MAX_IMAGES && (
                      <>
                        <button onClick={() => fileRefs.current[item.id]?.click()} className="size-12 rounded-md border border-dashed border-rule text-ink-mute hover:border-ink-soft hover:text-ink transition-colors flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" /></svg>
                        </button>
                        <input ref={el => { fileRefs.current[item.id] = el }} type="file" accept="image/*" multiple className="hidden" onChange={e => { const fs = e.target.files; if (fs?.length) addImages(item, fs); e.target.value = '' }} />
                      </>
                    )}
                  </div>
                  {/* Record into this step + the reference clips already linked */}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <Link href={`/instructor/students/${studentId}/clips/new/record?step=${item.id}`} className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-md hover:opacity-85 transition-opacity">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.5" /><path d="M19 6h-2.5L15 4h-6L7.5 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" /></svg>
                      {t('recordStep')}
                    </Link>
                    {(clips[item.id] ?? []).map(c => (
                      <Link key={c.id} href={`/instructor/students/${studentId}/clips/${c.id}`} className="inline-flex items-center gap-1.5 h-7 px-2.5 border border-rule rounded-md text-xs text-ink-soft hover:border-ink-soft hover:text-ink transition-colors max-w-[11rem]">
                        <span className={cn('size-1.5 rounded-full shrink-0', c.status === 'calibrated' ? 'bg-ok' : 'bg-warn')} />
                        <span className="truncate">{c.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconBtn label={t('moveUp')} disabled={i === 0} onClick={() => move(i, -1)}><polyline points="18 15 12 9 6 15" /></IconBtn>
                  <IconBtn label={t('moveDown')} disabled={i === items.length - 1} onClick={() => move(i, 1)}><polyline points="6 9 12 15 18 9" /></IconBtn>
                  <IconBtn label={t('remove')} danger onClick={() => remove(item.id)}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></IconBtn>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-bad mt-3 font-mono break-words">{error}</p>}

      <form onSubmit={add} className="flex items-center gap-2 mt-4">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('addPlaceholder')} className="flex-1 h-10 bg-paper-2/40 border border-rule rounded-md px-3 text-sm focus:outline-none focus:border-ink-soft" />
        <button type="submit" disabled={!title.trim() || adding} className="h-10 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 shrink-0">
          {adding ? t('adding') : t('add')}
        </button>
      </form>

      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  )
}

function IconBtn({ children, label, onClick, disabled, danger }: {
  children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'size-7 flex items-center justify-center border border-transparent text-ink-mute transition-colors disabled:opacity-30',
        danger ? 'hover:text-bad' : 'hover:text-ink hover:border-rule'
      )}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  )
}
