// Pose is pinned to avoid WASM re-init errors on HMR.
// camera_utils / drawing_utils have no WASM — use latest to avoid 404s.
export const MP_POSE    = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404'
export const MP_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils'
export const MP_CAMERA  = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils'

let _loaded = false

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
  if (_loaded) return
  await loadScript(`${MP_POSE}/pose.js`)
  await loadScript(`${MP_DRAWING}/drawing_utils.js`)
  await loadScript(`${MP_CAMERA}/camera_utils.js`)
  _loaded = true
}

export function createPose(onResults: (r: any) => void) {
  const Pose = (window as any).Pose
  const pose = new Pose({ locateFile: (f: string) => `${MP_POSE}/${f}` })
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  pose.onResults(onResults)
  return pose
}

export function createCamera(
  video: HTMLVideoElement,
  onFrame: () => Promise<void>,
  facingMode: 'user' | 'environment' = 'user'
) {
  const Camera = (window as any).Camera
  return new Camera(video, { onFrame, width: 1280, height: 720, facingMode })
}
