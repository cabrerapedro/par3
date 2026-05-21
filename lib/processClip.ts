'use client'

// processClip — frame-by-frame MediaPipe pipeline for a recorded clip.
//
// This is the background-job side of Section 4: after the instructor saves
// a clip, we walk through the video at `fps` fps, run each frame through
// MediaPipe, compute the per-frame metrics, and accumulate ProcessedFrame
// rows ready for insertClipFrames().
//
// Why client-side instead of a server worker:
// - The instructor's iPad already has the MediaPipe WASM module loaded
//   for the live camera preview. Reusing the same singleton is free.
// - Avoids needing a Node-side MediaPipe build or shipping the video to
//   a separate worker.
// Trade-off: the iPad stays busy for a few seconds after save. We surface
// progress so the UI can show "Procesando…" instead of feeling frozen.

import { loadMediaPipe, createPose } from './mediapipe'
import { calculateMetrics } from './baseline'
import type { CameraAngle, Landmark } from './types'

export interface ProcessedFrame {
  frame_index: number
  timestamp_ms: number
  landmarks: Landmark[]
  metrics: Record<string, number>
}

interface ProcessClipOptions {
  videoBlob: Blob
  cameraAngle: CameraAngle
  /** Sampling rate in frames per second. Default 10 — matches the live overlay. */
  fps?: number
  /**
   * Known clip length in ms, measured at record time. Used as the source of
   * truth because MediaRecorder webm blobs frequently report
   * `video.duration === Infinity` at loadedmetadata.
   */
  durationMs?: number
  /** Reports progress 0..1 as frames are processed. */
  onProgress?: (progress: number) => void
  /** Aborts processing partway through; resolves with frames captured so far. */
  signal?: AbortSignal
}

/**
 * Run MediaPipe over every sampled frame of the clip and return the
 * resulting frame rows. The caller is expected to feed these into
 * insertClipFrames() and (separately) recompute the baseline.
 *
 * If `signal` aborts mid-flight, resolves with whatever was captured
 * before the abort — the caller can still persist partial frames and
 * mark the clip as `pending` so the instructor can retry.
 */
export async function processClip(opts: ProcessClipOptions): Promise<ProcessedFrame[]> {
  const { videoBlob, cameraAngle, fps = 10, durationMs, onProgress, signal } = opts

  await loadMediaPipe()

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const objectUrl = URL.createObjectURL(videoBlob)
  video.src = objectUrl

  let pendingResolver: ((landmarks: Landmark[] | null) => void) | null = null
  // Lite model + no smoothing: this is batch analysis (frame-by-frame seeking),
  // where smoothing across non-sequential seeks adds cost for no benefit, and
  // the lighter model is far faster on an iPad. The full video is stored, so a
  // higher-fidelity baseline can be recomputed later if needed.
  const pose = await createPose(
    (results: { poseLandmarks?: Landmark[] }) => {
      pendingResolver?.(results.poseLandmarks ?? null)
    },
    { modelComplexity: 0, smoothLandmarks: false },
  )

  try {
    // Don't hang forever if metadata never arrives — fall back to the hint.
    await waitForEvent(video, 'loadedmetadata', 8000).catch(() => {})

    // MediaRecorder webm blobs commonly report Infinity here. Trust the
    // record-time measurement first; only fall back to the element's value.
    const durationSec = await resolveDurationSec(video, durationMs)
    if (durationSec <= 0) {
      return []
    }

    const intervalMs = 1000 / fps
    const totalFrames = Math.max(1, Math.floor(durationSec * fps))
    const frames: ProcessedFrame[] = []
    // If MediaPipe times out for this many consecutive frames we bail. At
    // ~1.5s per timeout, 10 ≈ 15s of stuck — enough signal that this isn't
    // recovering. Throwing here surfaces to the caller; the caller logs +
    // surfaces a "MediaPipe stuck" error and stops the save flow.
    const MAX_CONSECUTIVE_TIMEOUTS = 10
    let consecutiveTimeouts = 0

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) break

      const timestampMs = Math.round(i * intervalMs)
      // Robust seek: never blocks forever (frame 0 often needs no seek, and a
      // missing 'seeked' event must not freeze the whole save).
      await seekTo(video, timestampMs / 1000)

      const result = await sendFrame(pose, video, (resolver) => {
        pendingResolver = resolver
      })

      if (result === 'timeout') {
        consecutiveTimeouts++
        if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
          throw new Error('MediaPipe timed out for too many consecutive frames')
        }
        // Still advance the bar so the UI never looks frozen.
        onProgress?.((i + 1) / totalFrames)
        continue
      }
      consecutiveTimeouts = 0

      // Frames where MediaPipe failed to detect a person are skipped but
      // still counted in the index so timestamps stay aligned with the
      // original video.
      if (result) {
        const metrics = safeCalculateMetrics(result, cameraAngle)
        frames.push({
          frame_index: i,
          timestamp_ms: timestampMs,
          landmarks: result,
          metrics,
        })
      }

      onProgress?.((i + 1) / totalFrames)
    }

    return frames
  } finally {
    pendingResolver = null
    URL.revokeObjectURL(objectUrl)
    // We deliberately don't call pose.close() — the singleton lives on the
    // window and a second initialization would crash WASM. See lib/mediapipe.ts.
  }
}

/**
 * Determine the clip duration in seconds. Prefers the record-time hint
 * because MediaRecorder webm blobs report `video.duration === Infinity` at
 * loadedmetadata. As a last resort, nudges the element (seek far past the
 * end) to coax the browser into computing a real duration.
 */
async function resolveDurationSec(video: HTMLVideoElement, hintMs?: number): Promise<number> {
  const fromEl = video.duration
  if (Number.isFinite(fromEl) && fromEl > 0) return fromEl
  if (hintMs && hintMs > 0) return hintMs / 1000

  return new Promise<number>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      video.removeEventListener('durationchange', onChange)
      video.removeEventListener('seeked', onChange)
      const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      try { video.currentTime = 0 } catch {}
      resolve(d)
    }
    const onChange = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) finish()
    }
    video.addEventListener('durationchange', onChange)
    video.addEventListener('seeked', onChange)
    try { video.currentTime = 1e7 } catch { /* ignore */ }
    setTimeout(finish, 2000)
  })
}

/**
 * Seek the video to `timeSec`, resolving once it lands — but never hanging.
 * If we're already at that time (e.g. frame 0), or the 'seeked' event never
 * fires, we resolve anyway after a short fallback so the loop keeps moving.
 */
function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - timeSec) < 1e-3 && !video.seeking) {
      resolve()
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      video.removeEventListener('seeked', finish)
      resolve()
    }
    video.addEventListener('seeked', finish, { once: true })
    try { video.currentTime = timeSec } catch { finish() }
    setTimeout(finish, 2000)
  })
}

function waitForEvent(target: EventTarget, event: string, timeoutMs?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onError = () => {
      cleanup()
      reject(new Error(`Video error on ${event}`))
    }
    const onEvent = () => {
      cleanup()
      resolve()
    }
    function cleanup() {
      if (timer) clearTimeout(timer)
      target.removeEventListener(event, onEvent)
      target.removeEventListener('error', onError)
    }
    target.addEventListener(event, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
    if (timeoutMs) timer = setTimeout(() => { cleanup(); reject(new Error(`Timeout on ${event}`)) }, timeoutMs)
  })
}

/**
 * Send a single frame to MediaPipe and await the results. Wraps the
 * onResults callback in a promise so the caller can write linear code.
 *
 * Caps per-frame wait at `timeoutMs` (default 1.5s). Returns `'timeout'`
 * sentinel separately from `null` (= person not detected) so the caller
 * can count consecutive stuck frames and bail rather than spend ~15 min
 * waiting on a hung WASM session.
 */
async function sendFrame(
  pose: { send: (input: { image: HTMLVideoElement }) => Promise<void> },
  video: HTMLVideoElement,
  registerResolver: (resolver: (landmarks: Landmark[] | null) => void) => void,
  timeoutMs = 1500,
): Promise<Landmark[] | null | 'timeout'> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (value: Landmark[] | null | 'timeout') => {
      if (settled) return
      settled = true
      resolve(value)
    }
    registerResolver((lm) => settle(lm))
    pose.send({ image: video }).catch(() => settle(null))
    setTimeout(() => settle('timeout'), timeoutMs)
  })
}

function safeCalculateMetrics(landmarks: Landmark[], angle: CameraAngle): Record<string, number> {
  try {
    return calculateMetrics(landmarks, angle)
  } catch {
    return {}
  }
}
