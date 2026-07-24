import { describe, it, expect } from 'vitest'
import {
  calculateMetrics,
  METRICS_VERSION,
  baselineMetricsVersion,
  baselineMetricKeys,
  selectStableFrames,
  detectSwingReps,
  averageSwingReps,
  estimateCameraAngle,
  aggregatePositionChecks,
  buildClipBaseline,
  isSwingBaseline,
} from '../baseline'
import type { Baseline, Landmark, SwingBaseline } from '../types'

// ─── Synthetic pose builders ────────────────────────────────────────────────
// Plausible face-on / down-the-line stick figures in normalized coordinates.
// scale multiplies every body dimension (≈ camera closer/farther), cx shifts
// the whole body horizontally (≈ walking), noseOffset leans the head sideways.

interface PoseOpts {
  scale?: number
  cx?: number
  cy?: number
  noseOffset?: number
  wristY?: number
  view?: 'face_on' | 'dtl'
}

function pose(opts: PoseOpts = {}): Landmark[] {
  const { scale: s = 1, cx = 0.5, cy = 0.5, noseOffset = 0, wristY, view = 'face_on' } = opts
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: cx, y: cy, z: 0, visibility: 1 }))
  const put = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0, visibility: 1 } }

  // Shoulder half-width: wide face-on, nearly overlapping down-the-line.
  const shoulderHalf = (view === 'face_on' ? 0.2 : 0.02) * s
  const hipHalf = (view === 'face_on' ? 0.12 : 0.015) * s

  put(0, cx + noseOffset * s, cy - 0.45 * s)               // nose
  put(11, cx + shoulderHalf, cy - 0.3 * s)                 // shoulders
  put(12, cx - shoulderHalf, cy - 0.3 * s)
  put(13, cx + 0.25 * s, cy - 0.15 * s)                    // elbows
  put(14, cx - 0.25 * s, cy - 0.15 * s)
  put(15, cx + 0.28 * s, wristY ?? cy)                     // wrists
  put(16, cx - 0.28 * s, wristY ?? cy)
  put(23, cx + hipHalf, cy)                                // hips
  put(24, cx - hipHalf, cy)
  put(25, cx + hipHalf, cy + 0.25 * s)                     // knees
  put(26, cx - hipHalf, cy + 0.25 * s)
  put(27, cx + 0.13 * s, cy + 0.5 * s)                     // ankles
  put(28, cx - 0.13 * s, cy + 0.5 * s)
  return lm
}

// ─── Metrics v2: body-scale normalization ───────────────────────────────────

describe('calculateMetrics v2 normalization', () => {
  it('makes distance metrics invariant to camera distance', () => {
    // Same body posture, filmed twice as far away (half the frame size).
    const near = calculateMetrics(pose({ scale: 1, noseOffset: 0.05 }), 'face_on', 2)
    const far = calculateMetrics(pose({ scale: 0.5, noseOffset: 0.05 }), 'face_on', 2)
    expect(near.head_lateral).toBeCloseTo(far.head_lateral, 5)
    // Torso is 0.3·scale, offset 0.05·scale → normalized value 1/6.
    expect(near.head_lateral).toBeCloseTo(0.05 / 0.3, 5)
  })

  it('v1 (legacy) distance metrics DO depend on camera distance', () => {
    const near = calculateMetrics(pose({ scale: 1, noseOffset: 0.05 }), 'face_on', 1)
    const far = calculateMetrics(pose({ scale: 0.5, noseOffset: 0.05 }), 'face_on', 1)
    expect(near.head_lateral).toBeCloseTo(0.05, 5)
    expect(far.head_lateral).toBeCloseTo(0.025, 5)
  })

  it('leaves angle metrics untouched by normalization', () => {
    const v1 = calculateMetrics(pose(), 'face_on', 1)
    const v2 = calculateMetrics(pose(), 'face_on', 2)
    expect(v2.arm_angle).toBeCloseTo(v1.arm_angle, 5)
    expect(v2.stance_width).toBeCloseTo(v1.stance_width, 5)
  })

  it('drops normalized metrics when the torso is not visible (never invents)', () => {
    const lm = pose({ noseOffset: 0.05 })
    lm[23] = { ...lm[23], visibility: 0.1 } // hip lost
    lm[24] = { ...lm[24], visibility: 0.1 }
    const metrics = calculateMetrics(lm, 'face_on', 2)
    expect(metrics.head_lateral).toBeUndefined()
  })
})

describe('baseline version helpers', () => {
  it('reads the _v stamp, defaulting to 1', () => {
    expect(baselineMetricsVersion({ _v: 2 })).toBe(2)
    expect(baselineMetricsVersion({ spine_angle: { mean: 1, std: 1, min: 0, max: 2 } })).toBe(1)
    expect(baselineMetricsVersion(null)).toBe(1)
  })

  it('baselineMetricKeys skips internal fields', () => {
    expect(baselineMetricKeys({ _v: 2, spine_angle: {} })).toEqual(['spine_angle'])
  })
})

// ─── Stable-segment selection ───────────────────────────────────────────────

function motionFrames(spec: { moving: boolean; noseOffset?: number }[], stepMs = 200) {
  let cx = 0.3
  return spec.map((s, i) => {
    if (s.moving) cx += 0.05 // fast lateral travel (~0.83 torso/s at 5 fps)
    return {
      timestamp_ms: i * stepMs,
      landmarks: pose({ cx, noseOffset: s.noseOffset ?? 0 }),
      metrics: {},
    }
  })
}

describe('selectStableFrames', () => {
  it('keeps only the still stretch, trimming transition frames', () => {
    const frames = motionFrames([
      ...Array.from({ length: 5 }, () => ({ moving: true })),
      ...Array.from({ length: 10 }, () => ({ moving: false })),
      ...Array.from({ length: 5 }, () => ({ moving: true })),
    ])
    const stable = selectStableFrames(frames)
    expect(stable.length).toBeGreaterThanOrEqual(6)
    expect(stable.length).toBeLessThan(10) // boundary frames excluded
    // Every kept frame lies inside the still block (indices 5..14).
    for (const f of stable) {
      expect(f.timestamp_ms).toBeGreaterThanOrEqual(5 * 200)
      expect(f.timestamp_ms).toBeLessThan(15 * 200)
    }
  })

  it('falls back to all frames when nothing is stable', () => {
    const frames = motionFrames(Array.from({ length: 12 }, () => ({ moving: true })))
    expect(selectStableFrames(frames)).toHaveLength(12)
  })

  it('does not treat a detection gap as stability (motion happened unobserved)', () => {
    // 5 still frames, then MediaPipe loses tracking for 4s while the subject
    // walks half a torso away, then 5 still frames at the new spot. The
    // frames flanking the gap must NOT bridge into one stable run.
    const before = Array.from({ length: 5 }, (_, i) => ({
      timestamp_ms: i * 200,
      landmarks: pose({ cx: 0.3 }),
      metrics: {},
    }))
    const after = Array.from({ length: 5 }, (_, i) => ({
      timestamp_ms: 4800 + i * 200,
      landmarks: pose({ cx: 0.45 }),
      metrics: {},
    }))
    const stable = selectStableFrames([...before, ...after])
    const kept = stable.map(f => f.timestamp_ms)
    expect(kept).not.toContain(800)   // last frame before the gap
    expect(kept).not.toContain(4800)  // first frame after the gap
    expect(stable.length).toBe(8)     // both still runs survive on their own
  })

  it('returns short clips untouched', () => {
    const frames = motionFrames([{ moving: false }, { moving: false }])
    expect(selectStableFrames(frames)).toHaveLength(2)
  })
})

// ─── Multi-rep swing detection ──────────────────────────────────────────────

// Wrist-Y profile of one swing rep at 10 fps: address plateau → top (wrists
// high = low y) → impact (wrists low = high y) → back to address.
function swingRepProfile(topY = 0.25): number[] {
  return [
    0.55, 0.55, 0.55, 0.55,           // address
    0.48, 0.4, 0.32, topY,            // backswing → top
    0.4, 0.55, 0.68,                  // downswing → impact
    0.62, 0.58, 0.55,                 // follow-through / reset
  ]
}

function swingFrames(reps: number[][]): Landmark[][] {
  return reps.flat().map((y) => pose({ wristY: y }))
}

describe('detectSwingReps', () => {
  it('finds every repetition in a multi-swing clip', () => {
    const frames = swingFrames([swingRepProfile(0.25), swingRepProfile(0.27), swingRepProfile(0.24)])
    const reps = detectSwingReps(frames, 'face_on')
    expect(reps).not.toBeNull()
    expect(reps!).toHaveLength(3)
    for (const rep of reps!) {
      const byPhase = Object.fromEntries(rep.map(p => [p.phase, p.frame_index]))
      expect(byPhase.address).toBeLessThan(byPhase.top)
      expect(byPhase.top).toBeLessThan(byPhase.impact)
      expect(byPhase.impact).toBeLessThanOrEqual(byPhase.finish)
    }
    // Tops land in three different reps (14 frames per rep).
    const tops = reps!.map(r => r.find(p => p.phase === 'top')!.frame_index)
    expect(new Set(tops.map(i => Math.floor(i / 14))).size).toBe(3)
  })

  it('still detects a single swing', () => {
    const reps = detectSwingReps(swingFrames([swingRepProfile()]), 'face_on')
    expect(reps).not.toBeNull()
    expect(reps!).toHaveLength(1)
  })

  it('does not invent phantom reps from a held high finish', () => {
    // Full swing with a real finish: hands end HIGH (wrist Y near top height)
    // and hold the pose ~1s before lowering back to address. The finish hold
    // is a "top"-band candidate; the lowering back down must NOT read as a
    // second swing.
    const fullSwingRep = [
      0.55, 0.55, 0.55, 0.55,                         // address
      0.48, 0.4, 0.32, 0.25,                          // backswing → top
      0.35, 0.5, 0.62, 0.68,                          // downswing → impact
      0.55, 0.42, 0.32,                               // follow-through rising
      0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, // finish held ~0.8s
      0.38, 0.48, 0.55, 0.55,                         // lower back to address
    ]
    const reps = detectSwingReps(swingFrames([fullSwingRep, fullSwingRep, fullSwingRep]), 'face_on')
    expect(reps).not.toBeNull()
    expect(reps!).toHaveLength(3)
    // Every detected top must be a real top-of-backswing (index 7 within each
    // 27-frame rep), not a finish hold.
    for (const rep of reps!) {
      const top = rep.find(p => p.phase === 'top')!
      expect(top.frame_index % 27).toBe(7)
    }
  })

  it('returns null when the wrists barely move', () => {
    const frames = swingFrames([Array.from({ length: 20 }, () => 0.5)])
    expect(detectSwingReps(frames, 'face_on')).toBeNull()
  })
})

describe('averageSwingReps', () => {
  it('averages per-phase metrics across reps', () => {
    const mk = (v: number) => [{
      phase: 'top' as const,
      landmarks: pose(),
      metrics: { arm_angle: v },
      frame_index: 0,
    }]
    const avg = averageSwingReps([mk(100), mk(120)])
    expect(avg).toHaveLength(1)
    expect(avg[0].metrics.arm_angle).toBeCloseTo(110)
  })
})

// ─── Camera-angle estimation ────────────────────────────────────────────────

describe('estimateCameraAngle', () => {
  it('detects a face-on view', () => {
    const frames = Array.from({ length: 6 }, () => pose({ view: 'face_on' }))
    expect(estimateCameraAngle(frames)).toBe('face_on')
  })

  it('detects a down-the-line view', () => {
    const frames = Array.from({ length: 6 }, () => pose({ view: 'dtl' }))
    expect(estimateCameraAngle(frames)).toBe('dtl')
  })

  it('returns null with too few usable frames', () => {
    expect(estimateCameraAngle([pose(), pose()])).toBeNull()
  })
})

// ─── Practice aggregation ───────────────────────────────────────────────────

describe('aggregatePositionChecks', () => {
  const baseline: Baseline = {
    spine_angle: { mean: 30, std: 2, min: 28, max: 32 },
    knee_flex: { mean: 160, std: 5, min: 155, max: 165 },
    head_height: { mean: 1.5, std: 0.1, min: 1.4, max: 1.6 },
  }

  it('judges each metric over the frames where it was present', () => {
    const frames = Array.from({ length: 10 }, () => ({ spine_angle: 30.5, knee_flex: 190 }))
    const checks = aggregatePositionChecks(frames, baseline)
    expect(checks.find(c => c.id === 'spine_angle')?.status).toBe('ok')
    expect(checks.find(c => c.id === 'knee_flex')?.status).toBe('bad')
  })

  it('drops metrics measurable in too few frames instead of calling them bad', () => {
    // head_height present in 2/10 frames → visibility problem, not technique.
    const frames = Array.from({ length: 10 }, (_, i): Record<string, number> =>
      i < 2 ? { spine_angle: 30, head_height: 1.5 } : { spine_angle: 30 },
    )
    const checks = aggregatePositionChecks(frames, baseline)
    expect(checks.find(c => c.id === 'head_height')).toBeUndefined()
    expect(checks.find(c => c.id === 'spine_angle')?.presence).toBe(1)
  })

  it('reports real mean values and signed deviations in std units', () => {
    const frames = Array.from({ length: 4 }, () => ({ spine_angle: 36 }))
    const [check] = aggregatePositionChecks(frames, baseline)
    expect(check.value).toBeCloseTo(36)
    expect(check.deviation).toBeCloseTo(3) // (36 - 30) / 2
    expect(check.direction).toBe('high')
    expect(check.status).toBe('bad')
  })

  it('honours selectedMetrics', () => {
    const frames = [{ spine_angle: 30, knee_flex: 160 }]
    const checks = aggregatePositionChecks(frames, baseline, ['knee_flex'])
    expect(checks.map(c => c.id)).toEqual(['knee_flex'])
  })
})

// ─── buildClipBaseline integration ──────────────────────────────────────────

describe('buildClipBaseline (v2)', () => {
  it('builds a position baseline from the stable stretch only', () => {
    // Walking in with the head leaning (offset 0.15), then holding the real
    // position (offset 0.05). The baseline must reflect the held position.
    const spec = [
      ...Array.from({ length: 5 }, () => ({ moving: true, noseOffset: 0.15 })),
      ...Array.from({ length: 10 }, () => ({ moving: false, noseOffset: 0.05 })),
      ...Array.from({ length: 5 }, () => ({ moving: true, noseOffset: 0.15 })),
    ]
    const frames = motionFrames(spec).map(f => ({
      ...f,
      metrics: calculateMetrics(f.landmarks, 'face_on'),
    }))
    const b = buildClipBaseline(frames, 'position', 'face_on', ['head_lateral']) as Baseline
    expect(b).not.toBeNull()
    expect(baselineMetricsVersion(b)).toBe(METRICS_VERSION)
    // 0.05 offset / 0.3 torso ≈ 0.1667 — NOT dragged up by the 0.15 walk-in.
    expect(b.head_lateral.mean).toBeCloseTo(0.05 / 0.3, 2)
  })

  it('builds a swing baseline with variance across repetitions', () => {
    const landmarks = swingFrames([swingRepProfile(0.25), swingRepProfile(0.27), swingRepProfile(0.24)])
    const frames = landmarks.map((lm, i) => ({
      timestamp_ms: i * 100,
      landmarks: lm,
      metrics: calculateMetrics(lm, 'face_on'),
    }))
    const b = buildClipBaseline(frames, 'swing', 'face_on', ['arm_angle', 'head_lateral'])
    expect(b).not.toBeNull()
    expect(isSwingBaseline(b)).toBe(true)
    const swing = b as SwingBaseline
    expect(swing._v).toBe(METRICS_VERSION)
    for (const phase of ['address', 'top', 'impact', 'finish'] as const) {
      expect(swing.phases[phase]).toBeDefined()
    }
  })

  it('returns null when no metrics could be computed', () => {
    const invisible = pose()
    for (const lm of invisible) lm.visibility = 0
    const frames = Array.from({ length: 10 }, (_, i) => ({
      timestamp_ms: i * 200,
      landmarks: invisible,
      metrics: {},
    }))
    expect(buildClipBaseline(frames, 'position', 'face_on', ['head_lateral'])).toBeNull()
  })
})
