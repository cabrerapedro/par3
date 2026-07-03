'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

// Full-screen image viewer. Renders nothing when `src` is null. Click the
// backdrop or ✕ (or press Escape) to close. Shared by the library step editor,
// the per-student journey editor, and the student's read-only journey.
export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  const t = useTranslations('common')

  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onClick={e => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-md shadow-lg" />
      <button
        onClick={onClose}
        aria-label={t('close')}
        className="absolute top-4 right-4 size-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  )
}
