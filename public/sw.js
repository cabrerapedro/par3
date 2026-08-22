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

const CACHE_VERSION = 'v2'
const STATIC_CACHE = `forat-static-${CACHE_VERSION}`
const NAV_CACHE = `forat-nav-${CACHE_VERSION}`
// The pose engine (self-hosted MediaPipe: WASM + models + helpers) gets its
// own cache so a static-cache bump never evicts ~19 MB the range has no
// bandwidth to re-download. The cache is keyed by the MediaPipe PACKAGE
// version, not by CACHE_VERSION: entries are cache-first forever, so an
// upgrade of @mediapipe/pose must land in a fresh cache — otherwise a device
// would mix an old cached loader with new binaries and initialize() would
// abort with no way to recover short of clearing site data.
// ⚠️ Keep in sync with the @mediapipe/pose pin in package.json.
const ENGINE_VERSION = '0.5.1675469404'
const ENGINE_CACHE = `forat-engine-${ENGINE_VERSION}`

// Everything the engine needs for modelComplexity 0 and 1 on a SIMD-capable
// browser (every iOS ≥ 16.4 / modern Chrome). The non-SIMD WASM stays
// available on demand through the runtime cache-first path below.
const ENGINE_FILES = [
  '/mediapipe/pose/pose.js',
  '/mediapipe/pose/pose_solution_packed_assets_loader.js',
  '/mediapipe/pose/pose_solution_packed_assets.data',
  '/mediapipe/pose/pose_solution_simd_wasm_bin.js',
  '/mediapipe/pose/pose_solution_simd_wasm_bin.wasm',
  '/mediapipe/pose/pose_web.binarypb',
  '/mediapipe/pose/pose_landmark_lite.tflite',
  '/mediapipe/pose/pose_landmark_full.tflite',
  '/mediapipe/camera_utils/camera_utils.js',
  '/mediapipe/drawing_utils/drawing_utils.js',
]

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
          .filter((n) => n !== STATIC_CACHE && n !== NAV_CACHE && n !== ENGINE_CACHE)
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
      // Warm the engine cache in the background, one file at a time and
      // best-effort: a failure (offline right now) just means the runtime
      // cache-first path fills it on the first analysis instead.
      warmEngineCache()
    })(),
  )
})

async function warmEngineCache() {
  try {
    const cache = await caches.open(ENGINE_CACHE)
    for (const path of ENGINE_FILES) {
      if (await cache.match(path)) continue
      try {
        const res = await fetch(path, { cache: 'no-cache' })
        if (res.ok) await cache.put(path, res)
      } catch { /* try again on next activation */ }
    }
  } catch { /* cache API unavailable */ }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Skip cross-origin (Supabase Storage, OpenAI, the MediaPipe CDN fallback).
  if (url.origin !== self.location.origin) return

  // Skip API routes entirely. They mutate, they auth, they don't want
  // any service worker thinking it knows better.
  if (url.pathname.startsWith('/api/')) return

  // Skip Next's RSC prefetch payloads: they point at hashed chunks that a
  // later deploy prunes, and caching them serves stale route data.
  if (url.searchParams.has('_rsc')) return

  // Pose engine: cache-first in its own long-lived cache. Once analyzed once
  // on this device, the engine works with no network at all.
  if (url.pathname.startsWith('/mediapipe/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ENGINE_CACHE)
        const cached = await cache.match(req)
        if (cached) return cached
        const fresh = await fetch(req)
        if (fresh.ok) cache.put(req, fresh.clone())
        return fresh
      })(),
    )
    return
  }

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
