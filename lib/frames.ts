// Frame batch inserters for the ML training corpus (Section 8 of the spec).
//
// Every clip's frames go to clip_frames; every practice session's frames
// go to session_frames. The doc explicitly calls these out as the raw
// material for the future custom model — data not captured can't be
// recovered, so we capture everything.
//
// We chunk inserts (default 100 rows) because:
// 1. PostgREST has a payload size limit and clip_frames rows are fat
//    (33 landmarks × x/y/z/visibility + a metrics object).
// 2. Smaller batches surface partial failures earlier so a transient
//    upload glitch doesn't lose the whole clip.
//
// Errors are aggregated and re-thrown at the end so the caller sees a
// single failure rather than 50.

import { supabase } from './supabase'
import { retry, sbCall } from './net'
import { compactLandmarks, compactMetrics } from './compact'
import type { Landmark } from './types'

const DEFAULT_BATCH_SIZE = 100

export interface FrameRow {
  frame_index: number
  timestamp_ms: number
  landmarks: Landmark[]
  metrics?: Record<string, number>
  /** 3D world landmarks (meters, hip origin) — captured for the corpus. */
  world_landmarks?: Landmark[]
}

// Set once the database tells us the world_landmarks column doesn't exist
// yet (schema.sql not re-run). We then drop the field instead of losing the
// whole frame stream — the 2D corpus is the one that matters today.
let worldColumnMissing = false

/**
 * Insert a clip's full frame stream into clip_frames in batches.
 * Called from the post-save background processor in the recording flow.
 */
export async function insertClipFrames(
  clipId: string,
  frames: FrameRow[],
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<void> {
  await batchInsert('clip_frames', clipId, 'clip_id', frames, batchSize)
}

/**
 * Insert a practice session's frame stream into session_frames in batches.
 * Called from the post-attempt processor in the student practice flow.
 */
export async function insertSessionFrames(
  sessionId: string,
  frames: FrameRow[],
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<void> {
  await batchInsert('session_frames', sessionId, 'session_id', frames, batchSize)
}

async function batchInsert(
  table: 'clip_frames' | 'session_frames',
  parentId: string,
  parentColumn: 'clip_id' | 'session_id',
  frames: FrameRow[],
  batchSize: number,
): Promise<void> {
  if (frames.length === 0) return

  const failures: { batch: number; error: unknown }[] = []

  for (let i = 0; i < frames.length; i += batchSize) {
    const buildSlice = (withWorld: boolean) =>
      frames.slice(i, i + batchSize).map((f) => ({
        [parentColumn]: parentId,
        frame_index: f.frame_index,
        timestamp_ms: f.timestamp_ms,
        landmarks: compactLandmarks(f.landmarks),
        metrics: f.metrics ? compactMetrics(f.metrics) : null,
        ...(withWorld && f.world_landmarks
          ? { world_landmarks: compactLandmarks(f.world_landmarks) }
          : {}),
      }))

    // Per-batch timeout + retry: on a flaky hotspot a single stalled fetch
    // must not hang the whole save, and a transient drop shouldn't lose the
    // batch.
    try {
      await retry(
        async () => {
          try {
            await sbCall(supabase.from(table).insert(buildSlice(!worldColumnMissing)), `insert ${table} batch`)
          } catch (e) {
            // Column not migrated yet → degrade gracefully to the 2D row.
            const msg = e instanceof Error ? e.message : String(e)
            if (!worldColumnMissing && msg.includes('world_landmarks')) {
              worldColumnMissing = true
              console.warn('[frames] world_landmarks column missing — storing 2D only (re-run schema.sql)')
              await sbCall(supabase.from(table).insert(buildSlice(false)), `insert ${table} batch (2D)`)
              return
            }
            throw e
          }
        },
        { tries: 3, baseDelayMs: 800, label: `${table} batch ${i / batchSize}` },
      )
    } catch (error) {
      failures.push({ batch: i / batchSize, error })
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Failed to insert ${failures.length}/${Math.ceil(frames.length / batchSize)} batches into ${table} for ${parentColumn}=${parentId}: ${failures
        .map((f) => `batch ${f.batch}: ${describeError(f.error)}`)
        .join('; ')}`,
    )
  }
}

function describeError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}
