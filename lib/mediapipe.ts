import type { Landmark } from './types'

// The pose engine is SELF-HOSTED: scripts/copy-mediapipe.mjs copies the
// pinned @mediapipe packages into public/mediapipe on install, so the WASM,
// the models and the helpers are static assets of our own origin — cacheable
// by the service worker and available offline on a range with no signal.
// The CDN URLs remain as a fallback if the local files are missing (e.g. a
// deploy where postinstall didn't run).
export const MP_LOCAL_POSE    = '/mediapipe/pose'
export const MP_LOCAL_DRAWING = '/mediapipe/drawing_utils'
export const MP_LOCAL_CAMERA  = '/mediapipe/camera_utils'
// Pose is pinned to avoid WASM re-init errors on HMR.
// camera_utils / drawing_utils have no WASM — use latest to avoid 404s.
export const MP_CDN_POSE    = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404'
export const MP_CDN_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils'
export const MP_CDN_CAMERA  = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils'

// Minimal structural types for the MediaPipe globals (loaded from the CDN, no
// @types package). We only type what we actually use.
export interface PoseResults {
  poseLandmarks?: Landmark[]
  /** Hip-origin metric-space (meters) landmarks — captured for the corpus,
   *  not yet used by any metric (see ROADMAP: 3D angles need validation). */
  poseWorldLandmarks?: Landmark[]
  image?: CanvasImageSource
}

export interface PoseInstance {
  setOptions(options: Record<string, unknown>): void
  onResults(cb: (results: PoseResults) => void): void
  initialize(): Promise<void>
  send(inputs: { image: CanvasImageSource }): Promise<void>
  close(): void
}

export interface CameraInstance {
  start(): Promise<void>
  stop(): void
}

// drawing_utils globals (used by the live mirror to paint the skeleton).
export type PoseConnections = ReadonlyArray<readonly [number, number]>
export type DrawConnectorsFn = (
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  connections: PoseConnections,
  options?: { color?: string; lineWidth?: number },
) => void
export type DrawLandmarksFn = (
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  options?: { color?: string; fillColor?: string; lineWidth?: number; radius?: number },
) => void

type PoseConstructor = new (config: { locateFile: (file: string) => string }) => PoseInstance
type CameraConstructor = new (
  video: HTMLVideoElement,
  options: { onFrame: () => Promise<void>; width: number; height: number; facingMode: string },
) => CameraInstance

// Shape of the singleton state we stash on `window` (see note below).
interface MediaPipeWindow {
  __mp_loaded?: boolean
  /** Base URL pose.js was actually loaded from — the WASM/model files must
   *  come from the same place (local or CDN), so locateFile reads this. */
  __mp_pose_base?: string
  __mp_pose?: PoseInstance
  __mp_pose_initializing?: Promise<void> | null
  Pose?: PoseConstructor
  Camera?: CameraConstructor
  drawConnectors?: DrawConnectorsFn
  drawLandmarks?: DrawLandmarksFn
  POSE_CONNECTIONS?: PoseConnections
}

// Persist state on window so it survives HMR module re-evaluation.
// The WASM module inside Pose can only be initialized ONCE per page load.
// Calling `new Pose()` a second time causes:
//   "Aborted(Module.arguments has been replaced with plain arguments_...)"
// Solution: singleton Pose instance on window, reused across components and HMR cycles.
const W: MediaPipeWindow =
  typeof window !== 'undefined'
    ? (window as unknown as MediaPipeWindow)
    : ({} as MediaPipeWindow)

// Cache promises so concurrent calls (e.g. React strict-mode double-mount)
// wait for the same script to finish rather than resolving early on tag-exists.
const _scriptCache = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  if (_scriptCache.has(src)) return _scriptCache.get(src)!
  const p = new Promise<void>((resolve, reject) => {
    // If the script tag already exists AND the global it provides is ready, resolve.
    const existing = document.querySelector(`script[src="${src}"]`) as
      | (HTMLScriptElement & { __loaded?: boolean })
      | null
    if (existing) {
      // Script tag exists — wait for it to finish if still loading
      if (existing.__loaded) { resolve(); return }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }
    const s: HTMLScriptElement & { __loaded?: boolean } = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => { s.__loaded = true; resolve() }
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
  // A rejected load must NOT stay cached: offline at the range → first try
  // fails → the student walks into coverage and taps "Practicar" again → we
  // must hit the network again instead of replaying the cached rejection.
  // The dead <script> tag goes too, or the `existing` branch above would
  // wait forever on an element whose error already fired.
  p.catch(() => {
    _scriptCache.delete(src)
    document.querySelector(`script[src="${src}"]`)?.remove()
  })
  _scriptCache.set(src, p)
  return p
}

// Load a script from our origin first, falling back to the CDN. Returns the
// base that worked so dependent asset URLs (WASM, models) stay consistent.
async function loadWithFallback(local: string, cdn: string, file: string): Promise<string> {
  try {
    await loadScript(`${local}/${file}`)
    return local
  } catch {
    console.warn(`[mediapipe] local ${file} unavailable, falling back to CDN`)
    await loadScript(`${cdn}/${file}`)
    return cdn
  }
}

// Call once — safe to call multiple times (idempotent)
export async function loadMediaPipe(): Promise<void> {
  if (W.__mp_loaded) return
  W.__mp_pose_base = await loadWithFallback(MP_LOCAL_POSE, MP_CDN_POSE, 'pose.js')
  await loadWithFallback(MP_LOCAL_DRAWING, MP_CDN_DRAWING, 'drawing_utils.js')
  await loadWithFallback(MP_LOCAL_CAMERA, MP_CDN_CAMERA, 'camera_utils.js')
  W.__mp_loaded = true
}

// Options for the underlying Pose model. Live flows pass modelComplexity 0
// (real-time on a phone); batch flows (post-save analysis, post-recording
// evaluation) pass 1 — their latency budget is seconds, and the full model
// visibly reduces landmark jitter and motion-blur misses.
export interface PoseOptions {
  modelComplexity?: 0 | 1 | 2
  smoothLandmarks?: boolean
}

// Track the last-applied options so a reuse with DIFFERENT options can call
// setOptions on the singleton. MediaPipe supports changing modelComplexity at
// runtime (it reloads the model graph on the next send, ~1-2 s) — only the
// WASM module itself is init-once. Without this, whichever flow reached the
// singleton first silently fixed the complexity for every later flow on the
// same page load.
let lastOptionsKey = ''

function applyOptions(pose: PoseInstance, options?: PoseOptions) {
  const resolved = {
    modelComplexity: options?.modelComplexity ?? 1,
    smoothLandmarks: options?.smoothLandmarks ?? true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }
  const key = JSON.stringify(resolved)
  if (key === lastOptionsKey) return
  pose.setOptions(resolved)
  lastOptionsKey = key
}

// Returns a singleton Pose instance. Only `new Pose()` is called once ever;
// subsequent calls update the onResults callback and re-apply `options` when
// they differ from the current ones (model reload happens on the next send).
// Async because WASM initialization must complete before first send().
export async function createPose(onResults: (r: PoseResults) => void, options?: PoseOptions) {
  if (W.__mp_pose) {
    applyOptions(W.__mp_pose, options)
    W.__mp_pose.onResults(onResults)
    return W.__mp_pose
  }
  // Guard against concurrent calls (e.g. strict-mode double-mount). The await
  // lets another in-flight call finish creating the singleton, so re-read it
  // into an explicitly-typed local (control-flow narrowing can't see the
  // cross-await mutation).
  if (W.__mp_pose_initializing) {
    await W.__mp_pose_initializing
    const ready = W.__mp_pose as PoseInstance | undefined
    if (ready) {
      applyOptions(ready, options)
      ready.onResults(onResults)
      return ready
    }
  }
  const Pose = W.Pose
  if (!Pose) throw new Error('MediaPipe Pose not loaded')
  try {
    const base = W.__mp_pose_base ?? MP_CDN_POSE
    const pose = new Pose({ locateFile: (f: string) => `${base}/${f}` })
    applyOptions(pose, options)
    pose.onResults(onResults)
    // Eagerly initialize WASM — must complete before first send()
    W.__mp_pose_initializing = pose.initialize()
    await W.__mp_pose_initializing
    W.__mp_pose_initializing = null
    W.__mp_pose = pose
    return pose
  } catch (e: unknown) {
    W.__mp_pose_initializing = null
    // WASM can only init once per page load — if it fails, need a reload
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('Aborted') || msg.includes('Module.arguments')) {
      throw new Error('RELOAD_REQUIRED')
    }
    throw e
  }
}

export function createCamera(
  video: HTMLVideoElement,
  onFrame: () => Promise<void>,
  facingMode: 'user' | 'environment' = 'user'
) {
  const Camera = W.Camera
  if (!Camera) throw new Error('MediaPipe Camera not loaded')
  return new Camera(video, { onFrame, width: 1280, height: 720, facingMode })
}

// Typed access to the drawing_utils CDN globals. Any of these can be undefined
// if drawing_utils hasn't finished loading — callers must null-check.
export function getDrawingUtils(): {
  drawConnectors?: DrawConnectorsFn
  drawLandmarks?: DrawLandmarksFn
  POSE_CONNECTIONS?: PoseConnections
} {
  return {
    drawConnectors: W.drawConnectors,
    drawLandmarks: W.drawLandmarks,
    POSE_CONNECTIONS: W.POSE_CONNECTIONS,
  }
}
