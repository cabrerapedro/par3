'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { uploadImage } from '@/lib/uploads'
import type { JourneyItem, JourneyStatus, JourneyTemplate, JourneyTemplateItem } from '@/lib/types'
import { cn } from '@/lib/utils'

// Instructor-facing journey editor: a simple ordered list of focus items for a
// student (Module 4 — deliberately not a complex builder). Add, reorder with
// up/down, cycle status, remove. The student sees this list read-only.
const STATUS_CYCLE: Record<JourneyStatus, JourneyStatus> = { todo: 'doing', doing: 'done', done: 'todo' }
const STATUS_STYLE: Record<JourneyStatus, string> = {
  todo: 'border-rule text-ink-mute',
  doing: 'border-accent/40 text-accent',
  done: 'border-ok/50 text-ok',
}

export function JourneyEditor({ studentId, instructorId }: { studentId: string; instructorId: string }) {
  const t = useTranslations('instructor.journey')
  const [items, setItems] = useState<JourneyItem[]>([])
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [templates, setTemplates] = useState<JourneyTemplate[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    load()
    supabase.from('journey_templates').select('*').eq('instructor_id', instructorId).order('created_at')
      .then(({ data }) => setTemplates((data as JourneyTemplate[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  // Assigning a template copies its focuses (title/note/images) into this
  // student's journey, appended after whatever's already there. Editable after.
  async function applyTemplate(templateId: string) {
    if (applying) return
    setApplying(true); setError('')
    setPickerOpen(false)
    const { data } = await supabase.from('journey_template_items')
      .select('*').eq('template_id', templateId).order('position', { ascending: true })
    const tplItems = (data as JourneyTemplateItem[]) ?? []
    if (tplItems.length > 0) {
      const { error: e } = await supabase.from('journey_items').insert(
        tplItems.map((it, i) => ({
          student_id: studentId,
          instructor_id: instructorId,
          title: it.title,
          note: it.note ?? null,
          images: it.images ?? [],
          position: items.length + i,
          status: 'todo',
        }))
      )
      if (e) setError(e.message)
    }
    setApplying(false)
    load()
  }

  async function load() {
    const { data } = await supabase
      .from('journey_items')
      .select('*')
      .eq('student_id', studentId)
      .order('position', { ascending: true })
    setItems((data as JourneyItem[]) ?? [])
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || adding) return
    setAdding(true); setError('')
    const { error: insErr } = await supabase.from('journey_items').insert({
      student_id: studentId,
      instructor_id: instructorId,
      title: trimmed,
      position: items.length,
      status: 'todo',
    })
    setAdding(false)
    if (insErr) { setError(insErr.message); return }
    setTitle('')
    load()
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
    const a = items[index]
    const b = items[target]
    // Optimistic: reorder locally now, persist the position swap in the
    // background (no round-trip wait, no lock).
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
  async function addImage(item: JourneyItem, file: File) {
    const imgs = item.images ?? []
    if (imgs.length >= 2) return
    setError('')
    const url = await uploadImage('journey-images', file)
    if (!url) { setError(t('uploadError')); return }
    const images = [...imgs, url]
    patchLocal(item.id, { images })
    persist(item.id, { images })
  }
  function removeImage(item: JourneyItem, url: string) {
    const images = (item.images ?? []).filter(u => u !== url)
    patchLocal(item.id, { images })
    persist(item.id, { images })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="small-caps font-mono text-[10px] text-accent">{t('title')}</p>
        <div className="relative">
          <button
            onClick={() => setPickerOpen(o => !o)}
            disabled={applying}
            className="inline-flex items-center gap-1.5 h-8 px-3 border border-rule rounded-md small-caps font-mono text-[10px] text-ink-soft hover:border-ink-soft hover:text-ink transition-colors disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            {t('loadTemplate')}
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-9 z-30 w-64 bg-paper border border-rule rounded-md shadow-lg overflow-hidden">
              {templates.length === 0 ? (
                <div className="px-3 py-3 text-xs text-ink-soft">
                  {t('noTemplates')}
                  <Link href="/instructor/library" className="block mt-2 text-accent hover:underline">{t('manageLibrary')}</Link>
                </div>
              ) : (
                <ul className="max-h-64 overflow-y-auto divide-y divide-rule">
                  {templates.map(tpl => (
                    <li key={tpl.id}>
                      <button onClick={() => applyTemplate(tpl.id)} className="w-full text-left px-3 py-2.5 hover:bg-paper-2/60 transition-colors">
                        <span className="text-sm font-medium block">{tpl.name}</span>
                        {tpl.category && <span className="small-caps font-mono text-[9px] text-ink-mute">{tpl.category}</span>}
                      </button>
                    </li>
                  ))}
                  <li><Link href="/instructor/library" className="block px-3 py-2 text-xs text-accent hover:bg-paper-2/60">{t('manageLibrary')}</Link></li>
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-mute mb-4">{t('subtitle')}</p>

      {items.length === 0 ? (
        <p className="text-sm text-ink-soft border-t border-b border-rule py-6 text-center">{t('empty')}</p>
      ) : (
        <ul className="border-t border-rule">
          {items.map((item, i) => (
            <li key={item.id} className="py-2.5 border-b border-rule">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-ink-mute tabular-nums w-5 shrink-0">{i + 1}</span>
                <button
                  onClick={() => cycleStatus(item)}
                  className={cn('small-caps font-mono text-[9px] px-1.5 py-0.5 border shrink-0 transition-colors', STATUS_STYLE[item.status])}
                >
                  {t(item.status === 'todo' ? 'statusTodo' : item.status === 'doing' ? 'statusDoing' : 'statusDone')}
                </button>
                <input
                  value={item.title}
                  onChange={e => patchLocal(item.id, { title: e.target.value })}
                  onBlur={e => persist(item.id, { title: e.target.value.trim() || item.title })}
                  className={cn('flex-1 min-w-0 h-8 bg-transparent border-b border-transparent hover:border-rule focus:border-ink-soft text-sm focus:outline-none', item.status === 'done' && 'text-ink-mute line-through')}
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconBtn label={t('moveUp')} disabled={i === 0} onClick={() => move(i, -1)}><polyline points="18 15 12 9 6 15" /></IconBtn>
                  <IconBtn label={t('moveDown')} disabled={i === items.length - 1} onClick={() => move(i, 1)}><polyline points="6 9 12 15 18 9" /></IconBtn>
                  <IconBtn label={t('remove')} onClick={() => remove(item.id)} danger><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></IconBtn>
                </div>
              </div>
              {/* note + images, indented under the title */}
              <div className="pl-[52px] pr-16 flex flex-col gap-2 mt-0.5">
                <input
                  value={item.note ?? ''}
                  onChange={e => patchLocal(item.id, { note: e.target.value })}
                  onBlur={e => persist(item.id, { note: e.target.value.trim() || null })}
                  placeholder={t('itemNotePlaceholder')}
                  className="h-7 bg-transparent text-xs text-ink-soft placeholder:text-ink-mute/50 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  {(item.images ?? []).map(url => (
                    <div key={url} className="relative size-12 rounded-md overflow-hidden border border-rule">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(item, url)} className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 text-white flex items-center justify-center">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                  {(item.images ?? []).length < 2 && (
                    <>
                      <button onClick={() => fileRefs.current[item.id]?.click()} className="size-12 rounded-md border border-dashed border-rule text-ink-mute hover:border-ink-soft hover:text-ink transition-colors flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" /></svg>
                      </button>
                      <input ref={el => { fileRefs.current[item.id] = el }} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) addImage(item, f); e.target.value = '' }} />
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-bad mt-3 font-mono break-words">{error}</p>}

      <form onSubmit={add} className="flex items-center gap-2 mt-4">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('addPlaceholder')}
          className="flex-1 h-10 bg-paper-2/40 border border-rule rounded-md px-3 text-sm focus:outline-none focus:border-ink-soft"
        />
        <button
          type="submit"
          disabled={!title.trim() || adding}
          className="h-10 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 shrink-0"
        >
          {adding ? t('adding') : t('add')}
        </button>
      </form>
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
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}
