'use client'

// Floating sync pill for the background clip-save queue ("guardar y seguir").
// Mounted once in the instructor layout so it's visible on every instructor
// screen: upload/analysis progress, a retry button on network failures, and
// a tap-through notice when a clip needs the instructor's review.

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  subscribeClipQueue, getClipQueueState, getClipQueueServerState,
  resumeClipQueue, retryClipQueue, dismissClipQueueNotice,
} from '@/lib/clipSaveQueue'

export function ClipSyncIndicator() {
  const t = useTranslations('instructor.sync')
  const state = useSyncExternalStore(subscribeClipQueue, getClipQueueState, getClipQueueServerState)

  // Resume interrupted jobs (app relaunch, page reload) as soon as any
  // instructor screen mounts.
  useEffect(() => { resumeClipQueue() }, [])

  const { active, pendingCount, error, review, done } = state
  if (!active && !error && !review && !done) return null

  return (
    <div className="fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 max-w-[calc(100vw-2rem)] w-80 flex flex-col gap-2">
      {/* Active job */}
      {active && (
        <div className="bg-card border border-border rounded-md shadow-lg px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="size-4 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-foreground truncate flex-1">{active.clipName}</p>
            {pendingCount > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">+{pendingCount}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {active.phase === 'uploading' && t('uploading', {
              pct: Math.round(active.progress * 100),
              mb: active.sizeMB.toFixed(1),
            })}
            {active.phase === 'processing' && t('processing', { pct: Math.round(active.progress * 100) })}
            {active.phase === 'finalizing' && t('finalizing')}
          </p>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1.5">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.round(active.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Network failure — retryable, nothing lost */}
      {error && (
        <div className="bg-card border border-warn/40 rounded-md shadow-lg px-4 py-3">
          <p className="text-sm font-medium text-foreground">{error.clipName}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('errorNetwork')}</p>
          <button
            onClick={retryClipQueue}
            className="mt-2 h-9 px-3 rounded-lg bg-warn/15 text-warn text-sm font-semibold hover:bg-warn/25 transition-colors"
          >
            {t('retry')}
          </button>
        </div>
      )}

      {/* Needs the instructor's review — tap through to the clip */}
      {review && (
        <div className="bg-card border border-warn/40 rounded-md shadow-lg px-4 py-3">
          <p className="text-sm font-medium text-foreground">{review.clipName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {review.reason === 'angle_mismatch'
              ? t('reviewAngle', {
                  detected: review.detectedAngle === 'dtl' ? t('angleDtl') : t('angleFaceOn'),
                })
              : t('reviewCalibration')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Link
              href={`/instructor/students/${review.studentId}/clips/${review.clipId}`}
              onClick={dismissClipQueueNotice}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center hover:opacity-90 transition-opacity"
            >
              {t('reviewCta')}
            </Link>
            <button
              onClick={dismissClipQueueNotice}
              className="h-9 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Done flash */}
      {done && (
        <div className="bg-card border border-ok/40 rounded-md shadow-lg px-4 py-3 flex items-center gap-2.5">
          <span className="size-5 shrink-0 rounded-full bg-ok text-black flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          <p className="text-sm text-foreground">{t('done', { name: done.clipName })}</p>
        </div>
      )}
    </div>
  )
}
