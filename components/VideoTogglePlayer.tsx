'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface VideoTogglePlayerProps {
  videoUrl?: string
  skeletonUrl?: string
  className?: string
}

export function VideoTogglePlayer({ videoUrl, skeletonUrl, className }: VideoTogglePlayerProps) {
  const t = useTranslations('components.videoTogglePlayer')
  const hasBoth = !!(videoUrl && skeletonUrl)
  const [active, setActive] = useState<'video' | 'skeleton'>(skeletonUrl ? 'skeleton' : 'video')

  const activeUrl = active === 'skeleton' ? skeletonUrl : videoUrl
  if (!activeUrl) return null

  return (
    <div className={className}>
      {hasBoth && (
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setActive('skeleton')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              active === 'skeleton'
                ? 'bg-ok/10 border-ok/30 text-ok'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('sourceVideoAxes')}
          </button>
          <button
            onClick={() => setActive('video')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              active === 'video'
                ? 'bg-ok/10 border-ok/30 text-ok'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('sourceVideo')}
          </button>
        </div>
      )}
      <video
        key={activeUrl}
        src={activeUrl}
        controls
        playsInline
        className="w-full rounded-xl bg-black"
        style={{ maxHeight: '14rem' }}
      />
    </div>
  )
}
