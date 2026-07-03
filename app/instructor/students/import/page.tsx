'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// Access codes: unambiguous alphabet (no O/0, I/1). Mirrors students/new.
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Keep the leading + (country code marker) and digits only. Everything else
// (spaces, dashes, parens) is cosmetic and dropped. Used both as the stored
// value and — via digitsOnly — as the dedup/exists key.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  const plus = trimmed.startsWith('+') ? '+' : ''
  return plus + trimmed.replace(/[^\d]/g, '')
}
const digitsOnly = (p: string) => p.replace(/[^\d]/g, '')

type Issue = 'noName' | 'noPhone' | 'dup' | 'exists' | null

interface ParsedRow {
  name: string
  phone: string        // normalized, for storage
  raw: string
  issue: Issue
}

// One student per line. "Name, phone" (comma/tab) or "Name <phone>" where the
// phone is the trailing run of digits/+()-. Deliberately forgiving: Steve
// pastes from WhatsApp or a spreadsheet, not a clean CSV.
function parseLine(line: string): { name: string; phone: string } {
  const byDelim = line.split(/[,\t]/)
  if (byDelim.length >= 2) {
    return { name: byDelim[0].trim(), phone: normalizePhone(byDelim.slice(1).join(' ')) }
  }
  const m = line.match(/^(.*?)[\s]+([+(]?\d[\d\s()\-]{5,})$/)
  if (m) return { name: m[1].trim(), phone: normalizePhone(m[2]) }
  return { name: line.trim(), phone: '' }
}

export default function ImportStudents() {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.contacts')

  const [text, setText] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase.from('students').select('phone').eq('instructor_id', instructor.id)
      .then(({ data }) => {
        const set = new Set<string>()
        for (const r of data ?? []) {
          const d = digitsOnly((r as { phone?: string }).phone ?? '')
          if (d) set.add(d)
        }
        setExistingPhones(set)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructor, loading])

  const rows = useMemo<ParsedRow[]>(() => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const seen = new Set<string>()
    return lines.map(raw => {
      const parsed = parseLine(raw)
      // Phone is OPTIONAL (it is everywhere else). A too-short/junk phone is
      // dropped rather than blocking the row. Only a missing name, or a real
      // duplicate/existing phone, blocks an import.
      const key = digitsOnly(parsed.phone)
      const phone = key.length >= 7 ? parsed.phone : ''
      const vkey = key.length >= 7 ? key : ''
      let issue: Issue = null
      if (!parsed.name) issue = 'noName'
      else if (vkey && seen.has(vkey)) issue = 'dup'
      else if (vkey && existingPhones.has(vkey)) issue = 'exists'
      if (vkey) seen.add(vkey)
      return { name: parsed.name, phone, raw, issue }
    })
  }, [text, existingPhones])

  const importable = useMemo(() => rows.filter(r => r.issue === null), [rows])
  const skipCount = rows.length - importable.length

  async function handleImport() {
    if (!instructor || importable.length === 0) return
    setError('')
    setImporting(true)
    const now = new Date().toISOString()
    const payload = importable.map(r => ({
      instructor_id: instructor.id,
      name: r.name,
      phone: r.phone || null,
      access_code: generateCode(),
      // Consent only matters (and is only stored) when there's a phone to reach.
      ...(optIn && r.phone
        ? { whatsapp_opt_in_at: now, whatsapp_opt_in_source: 'bulk_import' }
        : {}),
    }))
    const { error: insertErr } = await supabase.from('students').insert(payload)
    setImporting(false)
    if (insertErr) { setError(t('error')); return }
    router.push('/instructor/dashboard')
  }

  if (loading || !instructor) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <Link href="/instructor/dashboard" className="text-ink-soft text-sm hover:text-ink transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('back')}
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-semibold mb-1">{t('title')}</h1>
          <p className="text-ink-soft text-sm max-w-md">{t('subtitle')}</p>
        </div>

        <div className="flex flex-col gap-1.5 mb-6">
          <label htmlFor="paste" className="small-caps font-mono text-[10px] text-ink-mute">{t('pasteLabel')}</label>
          <textarea
            id="paste"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('pastePlaceholder')}
            rows={7}
            className="w-full bg-paper-2/40 border border-rule rounded-md px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:border-ink-soft resize-y"
          />
          <p className="text-xs text-ink-mute">{t('pasteHint')}</p>
        </div>

        {rows.length > 0 ? (
          <>
            <div className="flex items-baseline justify-between mb-2">
              <p className="small-caps font-mono text-[10px] text-ink-mute">{t('parsedTitle', { count: rows.length })}</p>
            </div>
            <div className="border-t border-rule mb-6">
              <div className="hidden sm:grid grid-cols-[1fr_150px_110px] gap-4 py-2 border-b border-rule">
                <span className="small-caps font-mono text-[10px] text-ink-mute">{t('colName')}</span>
                <span className="small-caps font-mono text-[10px] text-ink-mute">{t('colPhone')}</span>
                <span className="small-caps font-mono text-[10px] text-ink-mute">{t('colIssue')}</span>
              </div>
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_150px_110px] gap-2 sm:gap-4 items-center py-2.5 border-b border-rule',
                    r.issue && r.issue !== 'exists' && r.issue !== 'dup' && 'opacity-60'
                  )}
                >
                  <span className={cn('font-display text-sm truncate', !r.name && 'text-ink-mute italic')}>
                    {r.name || r.raw}
                  </span>
                  <span className="font-mono text-xs text-ink-soft hidden sm:block">{r.phone || '—'}</span>
                  <span className="justify-self-end sm:justify-self-start">
                    {r.issue ? (
                      <span className="small-caps font-mono text-[9px] text-warn border border-warn/40 px-1.5 py-0.5">
                        {t(
                          r.issue === 'noName' ? 'issueNoName'
                          : r.issue === 'noPhone' ? 'issueNoPhone'
                          : r.issue === 'dup' ? 'issueDup'
                          : 'issueExists'
                        )}
                      </span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ok">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={optIn}
                onChange={e => setOptIn(e.target.checked)}
                className="mt-0.5 size-4 accent-primary shrink-0"
              />
              <span>
                <span className="text-sm font-medium block">{t('optInLabel')}</span>
                <span className="text-xs text-ink-mute">{t('optInHint')}</span>
              </span>
            </label>

            {error && (
              <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-md px-4 py-3 mb-4">{error}</p>
            )}

            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleImport}
                disabled={importing || importable.length === 0}
                className="h-11 px-6 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-85 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? t('importing') : t('cta', { count: importable.length })}
              </button>
              <span className="text-xs text-ink-mute">
                {t('willImport', { count: importable.length })}
                {skipCount > 0 && ` · ${t('willSkip', { count: skipCount })}`}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-mute py-6 border-t border-rule">{t('emptyCta')}</p>
        )}
      </div>
    </div>
  )
}
