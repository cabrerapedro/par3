// forat.golf service worker — minimal PWA offline shell.
//
// Strategy:
// - Navigation requests (HTML pages): network-first with cache fallback.
//   Online users always get the latest deploy; offline users see the last
//   page they visited.
// - Static asset GETs (JS, CSS, fonts, images, MediaPipe CDN): cache-first
//   so repeat visits are instant and offline-tolerant.
// - Anything to /api/*, Supabase, OpenAI, or other origins: bypass the SW
//   entirely. We never want stale auth, stale clips, or stale Whisper data
//   sitting in a long-lived cache.
//
// Cache versioning: bump CACHE_VERSION when the strategy changes (not on
// every deploy — Next ships hashed filenames so individual assets bust
// themselves naturally).

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `forat-static-${CACHE_VERSION}`
const NAV_CACHE = `forat-nav-${CACHE_VERSION}`

self.addEventListener('install', () => {
  // Skip the "waiting" phase: the new SW takes over on next page load.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Drop any caches that don't match the current version. Cheap garbage
  // collection on deploys that bump CACHE_VERSION.
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((n) => n !== STATIC_CACHE && n !== NAV_CACHE)
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Skip cross-origin (Supabase Storage, OpenAI, MediaPipe CDN proxies).
  // MediaPipe in particular is loaded from jsdelivr — the browser HTTP cache
  // handles that one fine without us getting in the way.
  if (url.origin !== self.location.origin) return

  // Skip API routes entirely. They mutate, they auth, they don't want
  // any service worker thinking it knows better.
  if (url.pathname.startsWith('/api/')) return

  // Navigation requests: network-first.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(NAV_CACHE)
          cache.put(req, fresh.clone())
          return fresh
        } catch {
          const cached = await caches.match(req)
          if (cached) return cached
          // Last-resort offline fallback: serve the root if we have it.
          const root = await caches.match('/')
          if (root) return root
          return new Response('Offline', { status: 503, statusText: 'Offline' })
        }
      })(),
    )
    return
  }

  // Static GET: cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req)
      if (cached) return cached
      try {
        const fresh = await fetch(req)
        if (fresh.ok) {
          const cache = await caches.open(STATIC_CACHE)
          cache.put(req, fresh.clone())
        }
        return fresh
      } catch {
        return cached || new Response('Offline', { status: 503 })
      }
    })(),
  )
})
