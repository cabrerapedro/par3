// Pure payload-compaction helpers for the frame corpus (no I/O, no supabase
// import — also usable from tests and workers).
//
// Full-precision floats serialize to ~17 chars each and the training corpus
// doesn't need them — 4 decimals in normalized coords is ~0.1 px at 1080p,
// well under MediaPipe's own jitter. Halves the JSON size of a frames batch,
// which matters a lot on a hotspot uplink.

import type { Landmark } from './types'

const round4 = (n: number) => Math.round(n * 10_000) / 10_000
const round3 = (n: number) => Math.round(n * 1_000) / 1_000

export function compactLandmarks(landmarks: Landmark[]): Landmark[] {
  return landmarks.map((l) => ({
    x: round4(l.x),
    y: round4(l.y),
    z: round4(l.z),
    ...(l.visibility === undefined ? {} : { visibility: round3(l.visibility) }),
  }))
}

export function compactMetrics(metrics: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, round4(v)]))
}
