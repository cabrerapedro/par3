'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'

// Lightweight placeholder for sections whose full build lands in a later phase.
// Keeps the nav navigable end-to-end and is honest about what's coming.
export function SectionPlaceholder({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { instructor, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.soon')

  useEffect(() => {
    if (!loading && !instructor) router.replace('/instructor/login')
  }, [loading, instructor, router])

  if (loading || !instructor) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <p className="small-caps font-mono text-[11px] text-accent mb-2">{t('kicker')}</p>
      <h1 className="font-display font-semibold text-3xl md:text-[40px] leading-tight mb-8">{t(titleKey)}</h1>
      <div className="border border-dashed border-rule rounded-lg px-6 py-10 text-center">
        <div className="mx-auto mb-4 size-10 rounded-full border border-rule flex items-center justify-center text-ink-mute">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
          </svg>
        </div>
        <p className="text-ink-soft text-sm max-w-md mx-auto leading-relaxed">{t(bodyKey)}</p>
      </div>
    </div>
  )
}
