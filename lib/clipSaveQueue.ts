'use client'

// Background save queue for instructor clips ("guardar y seguir").
//
// The old save flow blocked the annotate screen behind ONE long sequential
// chain — video upload (the whale), MediaPipe frame analysis, frames insert,
// baseline build, AI summary — with no timeouts. On a range hotspot the video
// upload alone can take minutes and a single stalled fetch hung the overlay
// forever, trapping the instructor mid-lesson.
//
// Now the annotate page persists only the small, critical rows (clip row +
// annotations), hands the heavy work to this queue, and returns the
// instructor to the class. The queue:
//   - stores the video Blob + job metadata in IndexedDB (survives relaunch),
//   - uploads the video resumably (TUS, 6 MB chunks, progress, auto-retry),
//   - runs MediaPipe locally, inserts frames, builds the baseline,
//   - checkpoints each step so a relaunch resumes where it stopped,
//   - surfaces progress/errors/review states to the UI via a tiny store
//     (ClipSyncIndicator in the instructor layout).
//
// Clips whose calibration needs a human (angle mismatch, low detection, no
// baseline) end as status 'pending' + a review notice; the clip detail page's
// existing edit/retry pipeline resolves them. The instructor stays the
// authority — the queue never switches a camera angle on its own.

import { supabase } from './supabase'
import { uploadResumable } from './tusUpload'
import { processClip, refineSwingReps } from './processClip'
import { insertClipFrames } from './frames'
import {
  buildClipBaseline, buildSwingBaselineFromReps, detectSwingReps,
  annotationFocusMetrics, clipDetectionRatio, estimateCameraAngle,
} from './baseline'
import type { MetricOpts } from './baseline'
import { retry, sbCall } from './net'
import { logAnalysisEvent } from './telemetry'
import type { Baseline, CameraAngle, SwingBaseline } from './types'

// ---------- Types ----------

export interface QueuedClipSave {
  clipId: string
  studentId: string
  clipName: string
  blob: Blob
  mime: string
  durationMs: number
  cameraAngle: CameraAngle
  clipType: 'position' | 'swing'
  selectedMetrics: string[]
  /** Storage object path decided at enqueue time (stable across retries). */
  videoPath: string
  /** Step checkpoint: video confirmed in storage + clip row updated. */
  videoUploaded?: boolean
  createdAt: number
  /** Consecutive failures for this job. Drives the head-of-line release. */
  attempts?: number
  /** Student's locale, fetched during processing — the AI summary's language. */
  studentLocale?: 'es' | 'en'
}

// After this many consecutive failures a job stops holding up the queue: it
// goes to the BACK so the rest of the class still uploads. Without this, one
// deterministically-broken clip (corrupt blob, MediaPipe choking on that one
// video) blocks every later clip of the same lesson — the instructor loses a
// whole session's recordings without being told.
const MAX_ATTEMPTS_BEFORE_DEFER = 3

export type ReviewReason = 'angle_mismatch' | 'calibration_failed'

export interface ClipQueueState {
  active: {
    clipId: string
    studentId: string
    clipName: string
    phase: 'uploading' | 'processing' | 'finalizing'
    /** 0..1 within the current phase. */
    progress: number
    sizeMB: number
  } | null
  /** Items waiting behind the active one. */
  pendingCount: number
  /** Network-type failure — retryable. Item stays queued in IndexedDB. */
  error: { clipId: string; studentId: string; clipName: string } | null
  /** Calibration needs the instructor's eyes; clip stays 'pending' in DB. */
  review: {
    clipId: string
    studentId: string
    clipName: string
    reason: ReviewReason
    detectedAngle?: CameraAngle
  } | null
  /** Last finished clip — brief "listo ✓" flash, self-clears. */
  done: { clipName: string } | null
  /**
   * Jobs that failed repeatedly and were moved to the back of the queue. They
   * are NOT lost (the video still sits in IndexedDB) but they need attention,
   * so the pill keeps saying so instead of failing silently.
   */
  stuck: { clipId: string; studentId: string; clipName: string }[]
}

const INITIAL_STATE: ClipQueueState = {
  active: null, pendingCount: 0, error: null, review: null, done: null, stuck: [],
}

// ---------- Tiny external store (for useSyncExternalStore) ----------

let state: ClipQueueState = INITIAL_STATE
const listeners = new Set<() => void>()

function setState(patch: Partial<ClipQueueState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function subscribeClipQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getClipQueueState(): ClipQueueState {
  return state
}

export function getClipQueueServerState(): ClipQueueState {
  return INITIAL_STATE
}

export function dismissClipQueueNotice() {
  setState({ review: null, done: null, error: state.error })
}

/** Dismiss one stuck-job notice (the job itself stays queued in IndexedDB). */
export function dismissStuckClip(clipId: string) {
  setState({ stuck: state.stuck.filter((s) => s.clipId !== clipId) })
}

// ---------- IndexedDB persistence ----------
// Own DB (not the clip-handoff one) to avoid coordinating version bumps.

const DB_NAME = 'forat-clip-queue'
const STORE = 'jobs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(item: QueuedClipSave): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(item, item.clipId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function idbDelete(clipId: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(clipId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } finally {
    db.close()
  }
}

async function idbAll(): Promise<QueuedClipSave[]> {
  const db = await openDb()
  try {
    return await new Promise<QueuedClipSave[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).getAll()
      r.onsuccess = () => {
        const items = (r.result as QueuedClipSave[]) ?? []
        resolve(items.sort((a, b) => a.createdAt - b.createdAt))
      }
      r.onerror = () => reject(r.error)
    })
  } finally {
    db.close()
  }
}

// ---------- Queue processor ----------

let running = false

export async function enqueueClipSave(item: QueuedClipSave): Promise<void> {
  await idbPut(item)
  void processQueue()
}

/** Kick the processor (e.g. on instructor layout mount, after a relaunch). */
export function resumeClipQueue(): void {
  void processQueue()
}

/** Manual retry after a network failure — also un-sticks deferred jobs. */
export function retryClipQueue(): void {
  setState({ error: null })
  void processQueue({ resetAttempts: true })
}

async function processQueue(opts: { resetAttempts?: boolean } = {}): Promise<void> {
  if (running) return
  running = true
  try {
    if (opts.resetAttempts) {
      // A manual retry (usually "the network is back now") gives every
      // deferred job a fresh set of attempts.
      for (const job of await idbAll()) {
        if (job.attempts) await idbPut({ ...job, attempts: 0 })
      }
      setState({ stuck: [] })
    }

    // Jobs deferred during THIS pass — skipped so we don't spin on them.
    const deferred = new Set<string>()

    for (;;) {
      const items = await idbAll()
      const queue = items.filter((i) => !deferred.has(i.clipId))
      setState({ pendingCount: Math.max(0, queue.length - 1) })
      const item = queue[0]
      if (!item) break

      try {
        await processItem(item)
        await idbDelete(item.clipId)
      } catch (e) {
        const attempts = (item.attempts ?? 0) + 1
        console.error(`[clip-queue] job failed (attempt ${attempts})`, item.clipId, e)
        logAnalysisEvent({
          source: 'clip_queue', step: 'job_failed', status: 'error', clip_id: item.clipId, student_id: item.studentId,
          detail: { attempts, video_uploaded: Boolean(item.videoUploaded), error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) },
        })
        // Keep the video: only the attempt counter changes.
        await idbPut({ ...item, attempts })

        if (attempts >= MAX_ATTEMPTS_BEFORE_DEFER) {
          // Stop holding up the rest of the class. The job stays in IndexedDB
          // (nothing is lost) and is surfaced as "stuck" so the instructor
          // knows this clip needs attention.
          deferred.add(item.clipId)
          setState({
            active: null,
            error: null,
            stuck: [
              ...state.stuck.filter((s) => s.clipId !== item.clipId),
              { clipId: item.clipId, studentId: item.studentId, clipName: item.clipName },
            ],
          })
          continue // move on to the next clip
        }

        setState({
          active: null,
          error: { clipId: item.clipId, studentId: item.studentId, clipName: item.clipName },
        })
        return // transient failure: wait for the retry button / next resume
      }
    }
    setState({ active: null, pendingCount: 0 })
  } finally {
    running = false
  }
}

async function processItem(item: QueuedClipSave): Promise<void> {
  const sizeMB = item.blob.size / (1024 * 1024)
  const base = {
    clipId: item.clipId, studentId: item.studentId, clipName: item.clipName, sizeMB,
  }
  const t0 = performance.now()

  // ---- 1. Resumable video upload + clip row update --------------------
  if (!item.videoUploaded) {
    setState({ active: { ...base, phase: 'uploading', progress: 0 }, error: null })
    await uploadResumable({
      bucket: 'clip-videos',
      path: item.videoPath,
      blob: item.blob,
      contentType: item.mime,
      fingerprintKey: item.clipId,
      onProgress: (fraction) =>
        setState({ active: { ...base, phase: 'uploading', progress: fraction } }),
    })
    const videoUrl = supabase.storage.from('clip-videos').getPublicUrl(item.videoPath).data.publicUrl
    await retry(
      () => sbCall(
        supabase.from('clips').update({ video_url: videoUrl }).eq('id', item.clipId),
        'update clip video_url',
      ),
      { label: 'clip video_url' },
    )
    item.videoUploaded = true
    await idbPut(item) // checkpoint: a relaunch skips straight to processing
    console.info(`[clip-queue] video uploaded (${sizeMB.toFixed(1)} MB) in ${Math.round(performance.now() - t0)}ms`)
    logAnalysisEvent({
      source: 'clip_queue', step: 'upload', clip_id: item.clipId, student_id: item.studentId,
      duration_ms: performance.now() - t0,
      detail: { size_mb: Number(sizeMB.toFixed(2)), duration_ms_video: item.durationMs, attempts: item.attempts ?? 0 },
    })
  }

  // ---- 2. Local MediaPipe analysis -------------------------------------
  const t1 = performance.now()
  setState({ active: { ...base, phase: 'processing', progress: 0 } })
  const fps = item.clipType === 'swing' ? 10 : 5

  // The student's handedness pins trail_arm to the correct arm (the
  // shoulder-x heuristic is noise in the down-the-line view). Best-effort.
  let metricOpts: MetricOpts = {}
  try {
    const { data: studentRow } = await supabase
      .from('students')
      .select('dominant_hand, preferred_locale')
      .eq('id', item.studentId)
      .single()
    if (studentRow?.dominant_hand === 'left' || studentRow?.dominant_hand === 'right') {
      metricOpts = { trailSide: studentRow.dominant_hand }
    }
    item.studentLocale = studentRow?.preferred_locale === 'en' ? 'en' : 'es'
  } catch { /* heuristic fallback */ }

  const frames = await processClip({
    videoBlob: item.blob,
    cameraAngle: item.cameraAngle,
    fps,
    durationMs: item.durationMs,
    metricOpts,
    onProgress: (p) => setState({ active: { ...base, phase: 'processing', progress: p } }),
  })
  console.info(`[clip-queue] analyzed ${frames.length} frames in ${Math.round(performance.now() - t1)}ms`)

  // ---- 3. Calibration ---------------------------------------------------
  setState({ active: { ...base, phase: 'finalizing', progress: 0 } })

  const detection = clipDetectionRatio(frames.length, item.durationMs / 1000, fps)
  logAnalysisEvent({
    source: 'clip_queue', step: 'analyze', clip_id: item.clipId, student_id: item.studentId,
    duration_ms: performance.now() - t1,
    detail: {
      frames: frames.length, fps, model_complexity: 1, clip_type: item.clipType,
      detection_ratio: Number(detection.toFixed(2)), trail_side: metricOpts.trailSide ?? null,
    },
  })
  try {
    await sbCall(
      supabase.from('clips').update({ detection_ratio: detection }).eq('id', item.clipId),
      'update detection_ratio',
    )
  } catch { /* best-effort cue */ }

  if (detection < 0.3) {
    // Body lost for most of the clip → not calibratable. Clip stays 'pending';
    // the detail page offers re-record / retry.
    logAnalysisEvent({
      source: 'clip_queue', step: 'review', status: 'info', clip_id: item.clipId, student_id: item.studentId,
      detail: { reason: 'low_detection', detection_ratio: Number(detection.toFixed(2)) },
    })
    setState({
      active: null,
      review: { clipId: item.clipId, studentId: item.studentId, clipName: item.clipName, reason: 'calibration_failed' },
    })
    return
  }

  // Angle sanity check. In the background there's no instructor to ask, so a
  // confident mismatch parks the clip as 'pending' for review — never a
  // silent switch, never a silently-wrong baseline. Frames are NOT inserted
  // here: the detail-page retry reprocesses with the final angle and inserts
  // them itself.
  const estimated = estimateCameraAngle(frames.map((f) => f.landmarks))
  if (estimated && estimated !== item.cameraAngle) {
    logAnalysisEvent({
      source: 'clip_queue', step: 'review', status: 'info', clip_id: item.clipId, student_id: item.studentId,
      detail: { reason: 'angle_mismatch', configured: item.cameraAngle, detected: estimated },
    })
    setState({
      active: null,
      review: {
        clipId: item.clipId, studentId: item.studentId, clipName: item.clipName,
        reason: 'angle_mismatch', detectedAngle: estimated,
      },
    })
    return
  }

  if (frames.length > 0) {
    try {
      await insertClipFrames(item.clipId, frames)
    } catch (e) {
      console.error('[clip-queue] frames insert failed (non-fatal)', e)
    }
  }

  // Build the baseline. Swing clips get the two-pass refinement: the
  // top→impact window is re-sampled at 30 fps so the fastest, most scored
  // part of the swing isn't judged from a ±50 ms frame.
  let baseline: Baseline | SwingBaseline | null = null
  if (item.clipType === 'swing') {
    const coarseReps = detectSwingReps(frames.map((f) => f.landmarks), item.cameraAngle, undefined, metricOpts)
    if (coarseReps) {
      const t2 = performance.now()
      try {
        const { reps } = await refineSwingReps({
          videoBlob: item.blob,
          cameraAngle: item.cameraAngle,
          coarseReps,
          coarseTimestampsMs: frames.map((f) => f.timestamp_ms),
          durationMs: item.durationMs,
          metricOpts,
        })
        baseline = buildSwingBaselineFromReps(reps, item.selectedMetrics)
        logAnalysisEvent({
          source: 'clip_queue', step: 'refine_swing', clip_id: item.clipId, student_id: item.studentId,
          duration_ms: performance.now() - t2, detail: { reps: reps.length },
        })
      } catch (e) {
        console.warn('[clip-queue] swing refinement failed, using coarse reps', e)
        logAnalysisEvent({
          source: 'clip_queue', step: 'refine_swing', status: 'error', clip_id: item.clipId, student_id: item.studentId,
          duration_ms: performance.now() - t2,
          detail: { reps: coarseReps.length, error: e instanceof Error ? e.message.slice(0, 200) : String(e) },
        })
        baseline = buildSwingBaselineFromReps(coarseReps, item.selectedMetrics)
      }
    }
  } else {
    baseline = buildClipBaseline(frames, item.clipType, item.cameraAngle, item.selectedMetrics, metricOpts)
  }
  if (!baseline) {
    setState({
      active: null,
      review: { clipId: item.clipId, studentId: item.studentId, clipName: item.clipName, reason: 'calibration_failed' },
    })
    return
  }

  // The instructor's annotations become signal: strokes on the body map to
  // metric zones (`_focus`, drives the one-instruction priority) and the
  // voice transcripts feed the student-facing summary. Best-effort — a clip
  // without annotations still calibrates.
  let instructorNote: string | null = null
  try {
    const { data: annotations } = await supabase
      .from('clip_annotations')
      .select('frame_timestamp_ms, strokes, audio_transcript, text_note')
      .eq('clip_id', item.clipId)
    if (annotations?.length) {
      const focus = annotationFocusMetrics(
        annotations.map((a) => ({ frame_timestamp_ms: a.frame_timestamp_ms, strokes: a.strokes ?? [] })),
        frames,
        item.cameraAngle,
      )
      if (focus.length) (baseline as Record<string, unknown>)._focus = focus
      const spoken = annotations
        .flatMap((a) => [a.audio_transcript, a.text_note])
        .filter((s): s is string => Boolean(s?.trim()))
      if (spoken.length) instructorNote = spoken.join(' · ').slice(0, 2000)
    }
  } catch (e) {
    console.warn('[clip-queue] annotation focus failed (non-fatal)', e)
  }

  // AI summary is a nice-to-have: short timeout, never blocks calibration.
  let baselineSummary: string | null = null
  try {
    const res = await fetch('/api/baseline-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline,
        cameraAngle: item.cameraAngle,
        checkpointName: item.clipName,
        instructorNote,
        selectedMetrics: item.selectedMetrics,
        marksCount: frames.length,
        checkpointType: item.clipType,
        locale: item.studentLocale ?? 'es',
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) baselineSummary = ((await res.json()) as { summary?: string }).summary ?? null
  } catch { /* leave null; student page has an on-demand fallback */ }

  await retry(
    () => sbCall(
      supabase.from('clips')
        .update({ baseline, baseline_summary: baselineSummary, status: 'calibrated' })
        .eq('id', item.clipId),
      'update clip baseline',
    ),
    { label: 'clip baseline' },
  )

  console.info(`[clip-queue] clip ${item.clipId} calibrated in ${Math.round(performance.now() - t0)}ms total`)
  logAnalysisEvent({
    source: 'clip_queue', step: 'calibrated', clip_id: item.clipId, student_id: item.studentId,
    duration_ms: performance.now() - t0,
    detail: {
      clip_type: item.clipType, version: (baseline as Record<string, unknown>)._v ?? null,
      focus: (baseline as Record<string, unknown>)._focus ?? null, has_note: Boolean(instructorNote),
      summary: Boolean(baselineSummary),
    },
  })
  setState({ active: null, done: { clipName: item.clipName } })
  setTimeout(() => {
    if (state.done?.clipName === item.clipName) setState({ done: null })
  }, 5000)
}
