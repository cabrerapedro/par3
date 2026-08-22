// Copies the MediaPipe runtime files we need from node_modules into
// public/mediapipe so the pose engine is served from OUR origin.
//
// Why: the engine used to load from jsdelivr at runtime. On a golf range with
// a flaky hotspot — or if the CDN changes/removes the pinned version — that
// meant NO analysis at all, and the service worker (which skips cross-origin
// on purpose) could never precache it. Self-hosting makes the engine a static
// asset of the app: same-origin, cacheable, offline-capable.
//
// Runs on `postinstall` (locally and on Vercel). Idempotent. The output dir is
// gitignored — these are ~25 MB of binaries that belong to the build, not the
// repo. The heavy model (27 MB) is deliberately skipped: complexity 2 is never
// requested.

import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules', '@mediapipe')
const out = join(root, 'public', 'mediapipe')

const FILES = {
  pose: [
    'pose.js',
    'pose_solution_packed_assets.data',
    'pose_solution_packed_assets_loader.js',
    'pose_solution_simd_wasm_bin.js',
    'pose_solution_simd_wasm_bin.wasm',
    'pose_solution_wasm_bin.js',
    'pose_solution_wasm_bin.wasm',
    'pose_web.binarypb',
    'pose_landmark_lite.tflite',
    'pose_landmark_full.tflite',
  ],
  camera_utils: ['camera_utils.js'],
  drawing_utils: ['drawing_utils.js'],
}

let copied = 0
let bytes = 0
let missing = 0
for (const [pkg, files] of Object.entries(FILES)) {
  const src = join(nm, pkg)
  if (!existsSync(src)) {
    console.warn(`[copy-mediapipe] missing package @mediapipe/${pkg} — run npm install`)
    missing++
    continue
  }
  const dst = join(out, pkg)
  mkdirSync(dst, { recursive: true })
  for (const f of files) {
    const from = join(src, f)
    if (!existsSync(from)) {
      console.warn(`[copy-mediapipe] missing file ${pkg}/${f}`)
      missing++
      continue
    }
    cpSync(from, join(dst, f))
    copied++
    bytes += statSync(from).size
  }
}
console.log(`[copy-mediapipe] ${copied} files, ${(bytes / 1024 / 1024).toFixed(1)} MB → public/mediapipe`)
// A partial engine is worse than none: pose.js would load locally and then
// 404 on a model with no per-asset fallback to the CDN. Fail loudly so the
// Vercel build (and the dev) notices instead of shipping a half engine.
if (missing > 0) {
  console.error(`[copy-mediapipe] ${missing} file(s) missing — refusing to ship a partial engine`)
  process.exitCode = 1
}
