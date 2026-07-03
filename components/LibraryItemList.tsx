'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { uploadImage } from '@/lib/uploads'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  title: string
  note: string | null
  images: string[]
  position: number
}

// Reusable editor for an ordered list of {title, note, up to 2 images}, backed
// by a table filtered on a parent column. Used for journey template items and
// for the universal recommendations list.
export function LibraryItemList({ table, parentColumn, parentId, emptyText, addPlaceholder }: {
  table: 'journey_template_items' | 'recommendations'
  parentColumn: string
  parentId: string
  emptyText: string
  addPlaceholder: string
}) {
  const t = useTranslations('instructor.library')
  const [items, setItems] = useState<Item[]>([])
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId])

  async function load() {
    const { data } = await supabase.from(table).select('*').eq(parentColumn, parentId).order('position', { ascending: true })
    setItems(((data as Item[]) ?? []).map(i => ({ ...i, images: i.images ?? [] })))
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || adding) return
    setAdding(true); setError('')
    const { error: e2 } = await supabase.from(table).insert({ [parentColumn]: parentId, title: trimmed, position: items.length })
    setAdding(false)
    if (e2) { setError(e2.message); return }
    setTitle(''); load()
  }

  function patchLocal(id: string, patch: Partial<Item>) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
  }
  async function persist(id: string, patch: Partial<Item>) {
    const { error: e } = await supabase.from(table).update(patch).eq('id', id)
    if (e) { setError(e.message); load() }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const a = items[index], b = items[target]
    // Optimistic reorder + background persist.
    setItems(prev => {
      const next = [...prev]
      next[index] = { ...b, position: a.position }
      next[target] = { ...a, position: b.position }
      return next
    })
    const [r1, r2] = await Promise.all([
      supabase.from(table).update({ position: b.position }).eq('id', a.id),
      supabase.from(table).update({ position: a.position }).eq('id', b.id),
    ])
    if (r1.error || r2.error) { setError((r1.error ?? r2.error)!.message); load() }
  }

  async function remove(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    const { error: e } = await supabase.from(table).delete().eq('id', id)
    if (e) { setError(e.message); load() }
  }

  async function addImage(item: Item, file: File) {
    if (item.images.length >= 2) return
    setError('')
    const url = await uploadImage('journey-images', file)
    if (!url) { setError(t('uploadError')); return }
    const images = [...item.images, url]
    patchLocal(item.id, { images })
    persist(item.id, { images })
  }
  async function removeImage(item: Item, url: string) {
    const images = item.images.filter(u => u !== url)
    patchLocal(item.id, { images })
    persist(item.id, { images })
  }

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft border-t border-b border-rule py-6 text-center">{emptyText}</p>
      ) : (
        <ul className="border-t border-rule">
          {items.map((item, i) => (
            <li key={item.id} className="py-3 border-b border-rule">
              <div className="flex items-start gap-2">
                <span className="font-mono text-[11px] text-ink-mute tabular-nums w-5 shrink-0 pt-2.5">{i + 1}</span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <input
                    value={item.title}
                    onChange={e => patchLocal(item.id, { title: e.target.value })}
                    onBlur={e => persist(item.id, { title: e.target.value.trim() })}
                    className="h-9 bg-transparent border-b border-rule/60 hover:border-ink-soft/60 focus:border-ink-soft text-sm font-medium focus:outline-none"
                  />
                  <input
                    value={item.note ?? ''}
                    onChange={e => patchLocal(item.id, { note: e.target.value })}
                    onBlur={e => persist(item.id, { note: e.target.value.trim() || null })}
                    placeholder={t('notePlaceholder')}
                    className="h-8 bg-transparent text-xs text-ink-soft placeholder:text-ink-mute/50 focus:outline-none"
                  />
                  {/* Images */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.images.map(url => (
                      <div key={url} className="relative size-14 rounded-md overflow-hidden border border-rule">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => removeImage(item, url)} className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 text-white flex items-center justify-center">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                    {item.images.length < 2 && (
                      <>
                        <button onClick={() => fileRefs.current[item.id]?.click()} className="size-14 rounded-md border border-dashed border-rule text-ink-mute hover:border-ink-soft hover:text-ink transition-colors flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" /></svg>
                        </button>
                        <input
                          ref={el => { fileRefs.current[item.id] = el }}
                          type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) addImage(item, f); e.target.value = '' }}
                        />
                      </>
                    )}
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
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={addPlaceholder} className="flex-1 h-10 bg-paper-2/40 border border-rule rounded-md px-3 text-sm focus:outline-none focus:border-ink-soft" />
        <button type="submit" disabled={!title.trim() || adding} className="h-10 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 shrink-0">
          {adding ? t('adding') : t('addItem')}
        </button>
      </form>
    </div>
  )
}

function IconBtn({ children, label, onClick, disabled, danger }: {
  children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={cn('size-7 flex items-center justify-center border border-transparent text-ink-mute transition-colors disabled:opacity-30', danger ? 'hover:text-bad' : 'hover:text-ink hover:border-rule')}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  )
}
