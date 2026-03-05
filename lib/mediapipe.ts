// Pose is pinned to avoid WASM re-init errors on HMR.
// camera_utils / drawing_utils have no WASM — use latest to avoid 404s.
export const MP_POSE    = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404'
export const MP_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils'
export const MP_CAMERA  = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils'

// Persist state on window so it survives HMR module re-evaluation.
// The WASM module inside Pose can only be initialized ONCE per page load.
// Calling `new Pose()` a second time causes:
//   "Aborted(Module.arguments has been replaced with plain arguments_...)"
// Solution: singleton Pose instance on window, reused across components and HMR cycles.
const W = typeof window !== 'undefined' ? (window as any) : ({} as any)

// Cache promises so concurrent calls (e.g. React strict-mode double-mount)
// wait for the same script to finish rather than resolving early on tag-exists.
const _scriptCache = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  if (_scriptCache.has(src)) return _scriptCache.get(src)!
  const p = new Promise<void>((resolve, reject) => {
    // If the script tag already exists AND the global it provides is ready, resolve.
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (existing) {
      // Script tag exists — wait for it to finish if still loading
      if ((existing as any).__loaded) { resolve(); return }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => { (s as any).__loaded = true; resolve() }
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
  _scriptCache.set(src, p)
  return p
}

// Call once — safe to call multiple times (idempotent)
export async function loadMediaPipe(): Promise<void> {
  if (W.__mp_loaded) return
  await loadScript(`${MP_POSE}/pose.js`)
  await loadScript(`${MP_DRAWING}/drawing_utils.js`)
  await loadScript(`${MP_CAMERA}/camera_utils.js`)
  W.__mp_loaded = true
}

// Returns a singleton Pose instance. Only `new Pose()` is called once ever;
// subsequent calls just update the onResults callback.
// Async because WASM initialization must complete before first send().
export async function createPose(onResults: (r: any) => void) {
  if (W.__mp_pose) {
    W.__mp_pose.onResults(onResults)
    return W.__mp_pose
  }
  // Guard against concurrent calls (e.g. strict-mode double-mount)
  if (W.__mp_pose_initializing) {
    await W.__mp_pose_initializing
    if (W.__mp_pose) {
      W.__mp_pose.onResults(onResults)
      return W.__mp_pose
    }
  }
  const Pose = W.Pose
  if (!Pose) throw new Error('MediaPipe Pose not loaded')
  try {
    const pose = new Pose({ locateFile: (f: string) => `${MP_POSE}/${f}` })
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    pose.onResults(onResults)
    // Eagerly initialize WASM — must complete before first send()
    W.__mp_pose_initializing = pose.initialize()
    await W.__mp_pose_initializing
    W.__mp_pose_initializing = null
    W.__mp_pose = pose
    return pose
  } catch (e: any) {
    W.__mp_pose_initializing = null
    // WASM can only init once per page load — if it fails, need a reload
    if (e?.message?.includes('Aborted') || e?.message?.includes('Module.arguments')) {
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
  return new Camera(video, { onFrame, width: 1280, height: 720, facingMode })
}
