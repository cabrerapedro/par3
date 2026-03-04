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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
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
export function createPose(onResults: (r: any) => void) {
  if (W.__mp_pose) {
    W.__mp_pose.onResults(onResults)
    return W.__mp_pose
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
    W.__mp_pose = pose
    return pose
  } catch (e: any) {
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
