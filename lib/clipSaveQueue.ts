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
import { processClip } from './processClip'
import { insertClipFrames } from './frames'
import {
  buildClipBaseline, clipDetectionRatio, estimateCameraAngle,
} from './baseline'
import { retry, sbCall } from './net'
import type { CameraAngle } from './types'

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
}

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
}

const INITIAL_STATE: ClipQueueState = {
  active: null, pendingCount: 0, error: null, review: null, done: null,
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

/** Manual retry after a network failure. */
export function retryClipQueue(): void {
  setState({ error: null })
  void processQueue()
}

async function processQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    for (;;) {
      const items = await idbAll()
      setState({ pendingCount: Math.max(0, items.length - 1) })
      const item = items[0]
      if (!item) break

      try {
        await processItem(item)
        await idbDelete(item.clipId)
      } catch (e) {
        console.error('[clip-queue] job failed, will retry', item.clipId, e)
        setState({
          active: null,
          error: { clipId: item.clipId, studentId: item.studentId, clipName: item.clipName },
        })
        return // stop the loop; retry button / next resume re-enters
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
  }

  // ---- 2. Local MediaPipe analysis -------------------------------------
  const t1 = performance.now()
  setState({ active: { ...base, phase: 'processing', progress: 0 } })
  const fps = item.clipType === 'swing' ? 10 : 5
  const frames = await processClip({
    videoBlob: item.blob,
    cameraAngle: item.cameraAngle,
    fps,
    durationMs: item.durationMs,
    onProgress: (p) => setState({ active: { ...base, phase: 'processing', progress: p } }),
  })
  console.info(`[clip-queue] analyzed ${frames.length} frames in ${Math.round(performance.now() - t1)}ms`)

  // ---- 3. Calibration ---------------------------------------------------
  setState({ active: { ...base, phase: 'finalizing', progress: 0 } })

  const detection = clipDetectionRatio(frames.length, item.durationMs / 1000, fps)
  try {
    await sbCall(
      supabase.from('clips').update({ detection_ratio: detection }).eq('id', item.clipId),
      'update detection_ratio',
    )
  } catch { /* best-effort cue */ }

  if (detection < 0.3) {
    // Body lost for most of the clip → not calibratable. Clip stays 'pending';
    // the detail page offers re-record / retry.
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

  const baseline = buildClipBaseline(frames, item.clipType, item.cameraAngle, item.selectedMetrics)
  if (!baseline) {
    setState({
      active: null,
      review: { clipId: item.clipId, studentId: item.studentId, clipName: item.clipName, reason: 'calibration_failed' },
    })
    return
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
        instructorNote: null,
        selectedMetrics: item.selectedMetrics,
        marksCount: frames.length,
        checkpointType: item.clipType,
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
  setState({ active: null, done: { clipName: item.clipName } })
  setTimeout(() => {
    if (state.done?.clipName === item.clipName) setState({ done: null })
  }, 5000)
}
