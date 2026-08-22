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
import type { MetricOpts, SwingPhase } from './baseline'
import type { CameraAngle, Landmark } from './types'

export interface ProcessedFrame {
  frame_index: number
  timestamp_ms: number
  landmarks: Landmark[]
  metrics: Record<string, number>
  /** MediaPipe's 3D world landmarks (meters, hip origin). Stored, not used yet. */
  world_landmarks?: Landmark[]
}

// What one MediaPipe pass over a frame yields.
interface FrameDetection {
  landmarks: Landmark[] | null
  world?: Landmark[]
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
  /**
   * Restrict sampling to [start, end] ms — the two-pass swing refinement
   * re-samples just the top→impact window at a higher fps.
   */
  windowMs?: { start: number; end: number }
  /**
   * Pose model complexity. Default 1 (full): this is BATCH analysis — the
   * latency budget is seconds behind a progress bar, and the full model
   * visibly reduces landmark jitter and motion-blur misses, which cleans
   * every downstream product (baselines, evaluations, the ML corpus). Live
   * flows that need real-time keep passing 0 through createPose directly.
   */
  modelComplexity?: 0 | 1 | 2
  /** Metric options (e.g. the student's trail arm) threaded to calculateMetrics. */
  metricOpts?: MetricOpts
  /** Metrics version for the computed per-frame metrics. Default: current. */
  version?: number
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
  const { videoBlob, cameraAngle, fps = 10, durationMs, onProgress, signal, windowMs, metricOpts, version } = opts

  await loadMediaPipe()

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const objectUrl = URL.createObjectURL(videoBlob)
  video.src = objectUrl

  let pendingResolver: ((detection: FrameDetection) => void) | null = null
  // Full model + no smoothing: batch analysis seeks frame-by-frame, so
  // temporal smoothing adds cost for no benefit, but model quality pays for
  // itself — these frames feed baselines, evaluations and the ML corpus. The
  // first send after a complexity switch reloads the graph (~1-2 s); the
  // per-frame timeout below absorbs that as a couple of tolerated timeouts.
  const pose = await createPose(
    (results: { poseLandmarks?: Landmark[]; poseWorldLandmarks?: Landmark[] }) => {
      pendingResolver?.({ landmarks: results.poseLandmarks ?? null, world: results.poseWorldLandmarks })
    },
    { modelComplexity: opts.modelComplexity ?? 1, smoothLandmarks: false },
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
    // Optional sampling window (two-pass refinement); default = whole clip.
    const startMs = Math.max(0, windowMs?.start ?? 0)
    const endMs = Math.min(durationSec * 1000, windowMs?.end ?? durationSec * 1000)
    const totalFrames = Math.max(1, Math.floor((endMs - startMs) / intervalMs))
    const frames: ProcessedFrame[] = []
    // If MediaPipe times out for this many consecutive frames we bail. At
    // ~1.5s per timeout, 10 ≈ 15s of stuck — enough signal that this isn't
    // recovering. Throwing here surfaces to the caller; the caller logs +
    // surfaces a "MediaPipe stuck" error and stops the save flow.
    const MAX_CONSECUTIVE_TIMEOUTS = 10
    let consecutiveTimeouts = 0

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) break

      const timestampMs = Math.round(startMs + i * intervalMs)
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
      if (result.landmarks) {
        const metrics = safeCalculateMetrics(result.landmarks, cameraAngle, version, metricOpts)
        frames.push({
          frame_index: i,
          timestamp_ms: timestampMs,
          landmarks: result.landmarks,
          metrics,
          world_landmarks: result.world,
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
  registerResolver: (resolver: (detection: FrameDetection) => void) => void,
  timeoutMs = 1500,
): Promise<FrameDetection | 'timeout'> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (value: FrameDetection | 'timeout') => {
      if (settled) return
      settled = true
      resolve(value)
    }
    registerResolver((detection) => settle(detection))
    pose.send({ image: video }).catch(() => settle({ landmarks: null }))
    setTimeout(() => settle('timeout'), timeoutMs)
  })
}

function safeCalculateMetrics(
  landmarks: Landmark[],
  angle: CameraAngle,
  version?: number,
  metricOpts?: MetricOpts,
): Record<string, number> {
  try {
    return calculateMetrics(landmarks, angle, version, metricOpts)
  } catch {
    return {}
  }
}

// ============================================================
// Two-pass swing refinement
// ============================================================

// Second-pass sampling rate over the top→impact window. At the coarse 10 fps
// the impact lands with ±50 ms of error on a downswing that lasts 250-350 ms
// — i.e. 2-3 frames for the fastest, most scored part of the swing. 30 fps
// brings that to ±16 ms for the cost of ~15-25 extra frames per rep.
const REFINE_FPS = 30
// Window padding around the coarse top/impact estimates.
const REFINE_PRE_TOP_MS = 200
const REFINE_POST_IMPACT_MS = 300

export interface RefinedSwing {
  reps: SwingPhase[][]
  /** Coarse tempo per rep, captured for future validation — NOT shown to the
   * student yet (CLAUDE.md keeps tempo off-limits until this is validated). */
  tempo: { backswingMs: number; downswingMs: number }[]
}

/**
 * Refine each detected rep's top and impact by re-sampling just that window
 * at REFINE_FPS. Address/finish keep their coarse frames (they're slow poses
 * — the coarse pass is fine there). The impact metrics are averaged over the
 * refined impact frame ±1 so a single blurred frame doesn't decide the phase.
 * Falls back to the coarse rep whenever the refined window is unusable.
 */
export async function refineSwingReps(opts: {
  videoBlob: Blob
  cameraAngle: CameraAngle
  coarseReps: SwingPhase[][]
  /**
   * Real timestamp (ms) of each coarse frame, indexed like the landmark
   * array the reps were detected on. REQUIRED because that array is
   * COMPACTED (frames without a detected person are dropped), so a phase's
   * `frame_index` is an array position, not a time — `index / fps` would
   * point at the wrong instant as soon as the student walks into frame late
   * or tracking drops mid-clip.
   */
  coarseTimestampsMs: number[]
  durationMs: number
  version?: number
  metricOpts?: MetricOpts
  signal?: AbortSignal
}): Promise<RefinedSwing> {
  const { videoBlob, cameraAngle, coarseReps, coarseTimestampsMs, durationMs, version, metricOpts, signal } = opts
  const reps: SwingPhase[][] = []
  const tempo: RefinedSwing['tempo'] = []

  const msOf = (idx: number | undefined): number | undefined =>
    idx === undefined ? undefined : coarseTimestampsMs[idx]
  // Map a refined absolute time back to the nearest coarse array index, so
  // refined phases keep the same indexing unit as the untouched ones.
  const nearestCoarseIdx = (ms: number): number => {
    let best = 0
    for (let i = 1; i < coarseTimestampsMs.length; i++) {
      if (Math.abs(coarseTimestampsMs[i] - ms) < Math.abs(coarseTimestampsMs[best] - ms)) best = i
    }
    return best
  }

  for (const rep of coarseReps) {
    const byPhase = Object.fromEntries(rep.map((p) => [p.phase, p]))
    const top = byPhase.top
    const impact = byPhase.impact
    const address = byPhase.address
    const topMs = msOf(top?.frame_index)
    const impactMs = msOf(impact?.frame_index)
    const addressMs = msOf(address?.frame_index) ?? topMs ?? 0
    if (!top || !impact || topMs === undefined || impactMs === undefined) {
      reps.push(rep)
      tempo.push({ backswingMs: 0, downswingMs: 0 })
      continue
    }

    let refined: SwingPhase[] | null = null
    let refinedTopMs = topMs
    let refinedImpactMs = impactMs
    try {
      const windowFrames = await processClip({
        videoBlob,
        cameraAngle,
        fps: REFINE_FPS,
        durationMs,
        windowMs: { start: Math.max(0, topMs - REFINE_PRE_TOP_MS), end: impactMs + REFINE_POST_IMPACT_MS },
        metricOpts,
        version,
        signal,
      })
      refined = refineWindow(windowFrames, cameraAngle, version, metricOpts)
      if (refined) {
        refinedTopMs = refined.find((p) => p.phase === 'top')?.frame_index ?? topMs
        refinedImpactMs = refined.find((p) => p.phase === 'impact')?.frame_index ?? impactMs
      }
    } catch (e) {
      console.warn('[refineSwingReps] window pass failed, keeping coarse rep', e)
    }

    if (refined) {
      // frame_index on refined phases holds the ABSOLUTE ms (see refineWindow);
      // map back to the nearest coarse index so downstream consumers keep a
      // consistent unit with the untouched address/finish phases.
      const merged = rep.map((p) => {
        const r = refined!.find((rp) => rp.phase === p.phase)
        return r ? { ...r, frame_index: nearestCoarseIdx(r.frame_index) } : p
      })
      reps.push(merged)
    } else {
      reps.push(rep)
    }
    tempo.push({
      backswingMs: Math.max(0, Math.round(refinedTopMs - addressMs)),
      downswingMs: Math.max(0, Math.round(refinedImpactMs - refinedTopMs)),
    })
  }

  return { reps, tempo }
}

/**
 * Locate top/impact inside a refined single-swing window. Returns phases with
 * `frame_index` carrying the ABSOLUTE timestamp in ms (the caller converts).
 */
function refineWindow(
  frames: ProcessedFrame[],
  cameraAngle: CameraAngle,
  version?: number,
  metricOpts?: MetricOpts,
): SwingPhase[] | null {
  if (frames.length < 4) return null
  const wristY = frames.map((f) => {
    const l = f.landmarks[15], r = f.landmarks[16]
    return l && r ? (l.y + r.y) / 2 : 0.5
  })
  // Moving average of 3 — same smoothing as the coarse detector.
  const smooth = wristY.map((_, i) => {
    const s = Math.max(0, i - 1)
    const e = Math.min(wristY.length, i + 2)
    const slice = wristY.slice(s, e)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })

  let topIdx = 0
  for (let i = 1; i < smooth.length; i++) if (smooth[i] < smooth[topIdx]) topIdx = i
  let impactIdx = topIdx
  for (let i = topIdx + 1; i < smooth.length; i++) if (smooth[i] > smooth[impactIdx]) impactIdx = i
  if (impactIdx <= topIdx || smooth[impactIdx] - smooth[topIdx] < 0.03) return null

  // Impact metrics: average over the refined frame ±1 to smooth out a single
  // motion-blurred read at the fastest instant of the swing.
  const impactNeighbors = [impactIdx - 1, impactIdx, impactIdx + 1]
    .filter((i) => i >= 0 && i < frames.length)
    .map((i) => calculateMetrics(frames[i].landmarks, cameraAngle, version, metricOpts))
  const impactMetrics: Record<string, number> = {}
  const keys = new Set(impactNeighbors.flatMap((m) => Object.keys(m)))
  for (const key of keys) {
    const vals = impactNeighbors.map((m) => m[key]).filter((v): v is number => v !== undefined)
    if (vals.length) impactMetrics[key] = vals.reduce((a, v) => a + v, 0) / vals.length
  }

  return [
    {
      phase: 'top',
      landmarks: frames[topIdx].landmarks,
      metrics: calculateMetrics(frames[topIdx].landmarks, cameraAngle, version, metricOpts),
      frame_index: frames[topIdx].timestamp_ms,
    },
    {
      phase: 'impact',
      landmarks: frames[impactIdx].landmarks,
      metrics: impactMetrics,
      frame_index: frames[impactIdx].timestamp_ms,
    },
  ]
}
