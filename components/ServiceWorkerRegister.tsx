'use client'

// Mounts once at the root of the app and registers public/sw.js. Splitting
// this into its own component keeps the layout server-rendered while still
// running the registration on the client.

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Don't try to install the SW in dev — Next's dev server serves the same
    // bundle URLs on every reload, which thrashes the cache. The build target
    // (production / preview) is the only place this should run.
    if (process.env.NODE_ENV !== 'production') return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        // Non-fatal — the app keeps working without an SW, just no offline.
        console.error('[sw] register failed', err)
      })
    }

    // Wait until the page has finished loading so we don't compete with the
    // initial render for resources.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
