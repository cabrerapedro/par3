'use client'

import { useEffect } from 'react'

// Keep the screen awake while `active` (recording / practicing). Best-effort:
// the Screen Wake Lock API is supported on iOS 16.4+ and most modern browsers;
// elsewhere it's a no-op. Re-acquires on tab re-focus (iOS drops the lock when
// the page is backgrounded).
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    let lock: { release: () => Promise<void> } | null = null
    let cancelled = false

    const request = async () => {
      try {
        const wl = (navigator as unknown as {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
        }).wakeLock
        if (!wl) return
        lock = await wl.request('screen')
      } catch { /* ignore — not supported / denied */ }
    }

    void request()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      try { void lock?.release() } catch { /* ignore */ }
    }
  }, [active])
}
