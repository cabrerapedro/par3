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
  const { videoBlob, cameraAngle, fps = 10, onProgress, signal } = opts

  await loadMediaPipe()

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const objectUrl = URL.createObjectURL(videoBlob)
  video.src = objectUrl

  let pendingResolver: ((landmarks: Landmark[] | null) => void) | null = null
  const pose = await createPose((results: { poseLandmarks?: Landmark[] }) => {
    pendingResolver?.(results.poseLandmarks ?? null)
  })

  try {
    await waitForEvent(video, 'loadedmetadata')

    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) {
      return []
    }

    const intervalMs = 1000 / fps
    const totalFrames = Math.max(1, Math.floor(duration * fps))
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
      video.currentTime = timestampMs / 1000
      try {
        await waitForEvent(video, 'seeked')
      } catch {
        continue
      }

      const result = await sendFrame(pose, video, (resolver) => {
        pendingResolver = resolver
      })

      if (result === 'timeout') {
        consecutiveTimeouts++
        if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
          throw new Error('MediaPipe timed out for too many consecutive frames')
        }
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

function waitForEvent(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = () => {
      cleanup()
      reject(new Error(`Video error on ${event}`))
    }
    const onEvent = () => {
      cleanup()
      resolve()
    }
    function cleanup() {
      target.removeEventListener(event, onEvent)
      target.removeEventListener('error', onError)
    }
    target.addEventListener(event, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
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
