'use client'

// Layer 1 of the guided practice plan (docs/GUIDED-PRACTICE-PLAN.md): a generic,
// app-provided warm-up / practice-hygiene routine shown before the student's
// clips. It is NOT technique instruction (the coach is always the authority) and
// it's skippable — collapsed by default so it never crowds the home.

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export function WarmupCard() {
  const t = useTranslations('student.warmup')
  const [open, setOpen] = useState(false)
  const steps = t.raw('steps') as string[]

  return (
    <div className="mb-6 border border-rule bg-paper-2/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
          </svg>
          <span className="font-display font-semibold text-base text-ink truncate">{t('title')}</span>
          <span className="small-caps font-mono text-[10px] text-ink-mute shrink-0">{t('duration')}</span>
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-ink-mute shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-4 md:px-5 pb-5 pt-1">
          <p className="text-sm text-ink-soft leading-snug mb-3">{t('intro')}</p>
          <ol className="flex flex-col gap-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink">
                <span className="shrink-0 size-5 rounded-full bg-paper border border-rule text-ink-mute font-mono text-[11px] flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
