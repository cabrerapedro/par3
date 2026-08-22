import { describe, it, expect } from 'vitest'
import {
  calculateMetrics,
  METRICS_VERSION,
  METRICS_BY_ANGLE,
  METRIC_ZONES,
  baselineMetricsVersion,
  baselineMetricKeys,
  selectStableFrames,
  detectSwingReps,
  averageSwingReps,
  estimateCameraAngle,
  aggregatePositionChecks,
  buildClipBaseline,
  isSwingBaseline,
  zoneStatuses,
  checkPlacement,
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

// ─── Body zones + placement assistant ───────────────────────────────────────

describe('zone mapping', () => {
  it('covers every metric of both camera angles', () => {
    for (const angle of ['face_on', 'dtl'] as const) {
      for (const metric of METRICS_BY_ANGLE[angle]) {
        expect(METRIC_ZONES[metric], `zone for ${metric}`).toBeDefined()
      }
    }
  })
})

describe('zoneStatuses', () => {
  it('keeps the worst status per zone and leaves unmeasured zones out', () => {
    const zones = zoneStatuses([
      { id: 'hip_hinge', status: 'ok' },
      { id: 'hip_sway', status: 'bad' },   // same zone, worse → wins
      { id: 'knee_flex', status: 'warn' },
    ])
    expect(zones.hips).toBe('bad')
    expect(zones.knees).toBe('warn')
    expect(zones.head).toBeUndefined()     // never green-flag the unmeasured
  })
})

describe('checkPlacement', () => {
  const expected = METRICS_BY_ANGLE.face_on

  it('reports no_person without frames', () => {
    expect(checkPlacement([], 'face_on', expected)).toBe('no_person')
  })

  it('reports too_far / too_close from the torso size', () => {
    const far = Array.from({ length: 6 }, () => pose({ scale: 0.3 }))   // torso 0.09
    const close = Array.from({ length: 6 }, () => pose({ scale: 1.6 })) // torso 0.48
    expect(checkPlacement(far, 'face_on', expected)).toBe('too_far')
    expect(checkPlacement(close, 'face_on', expected)).toBe('too_close')
  })

  it('reports wrong_angle on a confident view mismatch', () => {
    const dtlFrames = Array.from({ length: 6 }, () => pose({ view: 'dtl' }))
    expect(checkPlacement(dtlFrames, 'face_on', METRICS_BY_ANGLE.face_on)).toBe('wrong_angle')
  })

  it('reports partial when an expected metric is not measurable', () => {
    const frames = Array.from({ length: 6 }, () => pose())
    const last = frames[frames.length - 1]
    last[13] = { ...last[13], visibility: 0.1 } // elbow lost → arm_angle missing
    expect(checkPlacement(frames, 'face_on', expected)).toBe('partial')
  })

  it('reports ok for a well-placed full body', () => {
    const frames = Array.from({ length: 6 }, () => pose())
    expect(checkPlacement(frames, 'face_on', expected)).toBe('ok')
  })
})

// ─── Frame payload compaction ───────────────────────────────────────────────

describe('compactLandmarks / compactMetrics', () => {
  it('rounds coordinates to 4 decimals and visibility to 3', async () => {
    const { compactLandmarks, compactMetrics } = await import('../compact')
    const [lm] = compactLandmarks([{ x: 0.123456789, y: 0.987654321, z: -0.000012345, visibility: 0.876543 }])
    expect(lm).toEqual({ x: 0.1235, y: 0.9877, z: -0, visibility: 0.877 })
    expect(compactMetrics({ spine_angle: 31.4159265 })).toEqual({ spine_angle: 31.4159 })
  })

  it('omits visibility when absent instead of inventing one', async () => {
    const { compactLandmarks } = await import('../compact')
    const [lm] = compactLandmarks([{ x: 0.5, y: 0.5, z: 0 }])
    expect('visibility' in lm).toBe(false)
  })
})

// ─── Band intelligence: floors, _k, primary pick, calibration ───────────────

describe('effective std floors', () => {
  it('rescues near-zero-mean metrics from the collapsed 5% floor (v2)', async () => {
    const { compareToBaseline } = await import('../baseline')
    // A good shoulder_level baseline: mean ≈ 0.02 torsos, build-time floor
    // collapsed std to ~0.001. Pure MediaPipe jitter (±0.01) must stay green.
    const baseline = {
      _v: 2,
      shoulder_level: { mean: 0.02, std: 0.001, min: 0.019, max: 0.021 },
    } as unknown as Baseline
    const checks = compareToBaseline({ shoulder_level: 0.035 }, baseline)
    expect(checks[0].status).toBe('ok') // |0.015| ≤ floor 0.025
  })

  it('does not apply torso-unit floors to v1 baselines (different scale)', async () => {
    const { compareToBaseline } = await import('../baseline')
    const baseline = {
      shoulder_level: { mean: 0.02, std: 0.001, min: 0.019, max: 0.021 },
    } as unknown as Baseline // no _v → v1
    const checks = compareToBaseline({ shoulder_level: 0.035 }, baseline)
    expect(checks[0].status).toBe('bad') // v1 keeps the stored (tiny) std
  })

  it('reports deviation in UNSCALED σ so the _k calibration cannot chase its own tail', async () => {
    const { compareToBaseline } = await import('../baseline')
    const plain = { _v: 2, spine_angle: { mean: 30, std: 2, min: 28, max: 32 } } as unknown as Baseline
    const scaled = { _v: 2, _k: 2, spine_angle: { mean: 30, std: 2, min: 28, max: 32 } } as unknown as Baseline
    const a = compareToBaseline({ spine_angle: 35 }, plain)[0]
    const b = compareToBaseline({ spine_angle: 35 }, scaled)[0]
    expect(a.deviation).toBeCloseTo(2.5) // (35-30)/2
    expect(b.deviation).toBeCloseTo(2.5) // same unit regardless of _k …
    expect(a.status).toBe('bad')         // … even though the verdicts differ:
    expect(b.status).toBe('warn')        //     5 > 2·2 vs 5 ≤ 2·(2·2)
  })

  it('widens bands with the instructor-calibrated _k', async () => {
    const { compareToBaseline } = await import('../baseline')
    const tight = { _v: 2, spine_angle: { mean: 30, std: 2, min: 28, max: 32 } } as unknown as Baseline
    const scaled = { _v: 2, _k: 2, spine_angle: { mean: 30, std: 2, min: 28, max: 32 } } as unknown as Baseline
    expect(compareToBaseline({ spine_angle: 33 }, tight)[0].status).toBe('warn')
    expect(compareToBaseline({ spine_angle: 33 }, scaled)[0].status).toBe('ok') // band 2σ·k=4
  })
})

describe('pickPrimaryCheck', () => {
  const mk = (id: string, status: 'ok' | 'warn' | 'bad', deviation: number) => ({
    id, label: id, status, direction: 'high' as const, deviation,
  })

  it('worst status wins regardless of deviation', async () => {
    const { pickPrimaryCheck } = await import('../baseline')
    const primary = pickPrimaryCheck([mk('a', 'warn', 9), mk('b', 'bad', 1.5)])
    expect(primary?.id).toBe('b')
  })

  it('instructor focus breaks status ties before deviation does', async () => {
    const { pickPrimaryCheck } = await import('../baseline')
    const checks = [mk('spine_angle', 'bad', 5), mk('knee_flex', 'bad', 3)]
    expect(pickPrimaryCheck(checks)?.id).toBe('spine_angle') // by |deviation|
    expect(pickPrimaryCheck(checks, ['knee_flex'])?.id).toBe('knee_flex') // by focus
  })

  it('returns null when everything is ok', async () => {
    const { pickPrimaryCheck } = await import('../baseline')
    expect(pickPrimaryCheck([mk('a', 'ok', 0)])).toBeNull()
  })
})

describe('calibrateBandScale', () => {
  const session = (devs: number[], fb: 'agree' | 'disagree') => ({
    results: Object.fromEntries(devs.map((d, i) => [`m${i}`, { deviation: d, status: 'ok' }])),
    instructor_feedback: fb,
  })

  it('returns null below the label minimum', async () => {
    const { calibrateBandScale } = await import('../baseline')
    expect(calibrateBandScale([session([0.5], 'agree')])).toBeNull()
  })

  it('returns null when one class is missing', async () => {
    const { calibrateBandScale } = await import('../baseline')
    const sessions = Array.from({ length: 12 }, () => session([0.5, 0.6], 'agree'))
    expect(calibrateBandScale(sessions)).toBeNull()
  })

  it('finds a wider k when the instructor agrees with sessions the bands called bad', async () => {
    const { calibrateBandScale } = await import('../baseline')
    // Instructor agrees with sessions at ~1.3σ (bands too strict at k=1) and
    // disagrees with sessions at ~3σ.
    const sessions = [
      ...Array.from({ length: 7 }, () => session([1.3, 1.2, 1.4], 'agree')),
      ...Array.from({ length: 5 }, () => session([3.2, 2.9, 3.4], 'disagree')),
    ]
    const fit = calibrateBandScale(sessions)
    expect(fit).not.toBeNull()
    expect(fit!.k).toBe(1.5) // 1.3σ ≤ 1.5 ✓ ok · 3σ > 1.5 ✓ still bad
    expect(fit!.n).toBe(12)
  })

  it('ignores legacy zero-placeholder sessions', async () => {
    const { calibrateBandScale } = await import('../baseline')
    const legacy = Array.from({ length: 20 }, () => session([0, 0], 'agree'))
    expect(calibrateBandScale(legacy)).toBeNull()
  })
})

// ─── Annotation focus ───────────────────────────────────────────────────────

describe('annotationFocusMetrics', () => {
  it('maps a circle on the hips to the hip metrics of that view', async () => {
    const { annotationFocusMetrics } = await import('../baseline')
    const frame = { timestamp_ms: 2000, landmarks: pose() }
    // Real AnnotationCanvas shape: a circle is points [center, pointOnRadius].
    // The radius point sits up by the shoulders — the CENTER must win.
    const focus = annotationFocusMetrics(
      [{ frame_timestamp_ms: 2100, strokes: [{ type: 'circle', points: [[0.5, 0.5], [0.5, 0.22]] }] }],
      [frame],
      'face_on',
    )
    // face_on hip-zone metrics: hip_sway + weight_shift (hip_hinge is dtl).
    expect(focus).toContain('hip_sway')
    expect(focus).toContain('weight_shift')
    expect(focus).not.toContain('knee_flex')
  })

  it('maps a stroke near the knees to knee_flex in the dtl view', async () => {
    const { annotationFocusMetrics } = await import('../baseline')
    const lm = pose({ view: 'dtl' })
    const knee = lm[25]
    const focus = annotationFocusMetrics(
      [{ frame_timestamp_ms: 0, strokes: [{ type: 'line', points: [[knee.x, knee.y], [knee.x + 0.02, knee.y]] }] }],
      [{ timestamp_ms: 0, landmarks: lm }],
      'dtl',
    )
    expect(focus).toContain('knee_flex')
  })

  it('ignores annotations with no nearby frame', async () => {
    const { annotationFocusMetrics } = await import('../baseline')
    const focus = annotationFocusMetrics(
      [{ frame_timestamp_ms: 30_000, strokes: [{ type: 'circle', points: [[0.5, 0.5], [0.55, 0.5]] }] }],
      [{ timestamp_ms: 0, landmarks: pose() }],
      'face_on',
    )
    expect(focus).toEqual([])
  })
})

// ─── Swing rep consistency ──────────────────────────────────────────────────

describe('swingRepConsistency', () => {
  const swingBase = (std = 2) => ({
    _type: 'swing', _v: 2,
    phases: { top: { arm_angle: { mean: 100, std, min: 95, max: 105 } } },
  } as unknown as SwingBaseline)
  const rep = (v: number) => [{ phase: 'top' as const, landmarks: pose(), metrics: { arm_angle: v }, frame_index: 0 }]

  it('is null with a single rep', async () => {
    const { swingRepConsistency } = await import('../baseline')
    expect(swingRepConsistency([rep(100)], swingBase())).toBeNull()
  })

  it('reports high for near-identical reps and low for scattered ones', async () => {
    const { swingRepConsistency } = await import('../baseline')
    const tight = swingRepConsistency([rep(100), rep(101), rep(100.5)], swingBase())
    expect(tight?.level).toBe('high')
    const wild = swingRepConsistency([rep(90), rep(110), rep(100)], swingBase())
    expect(wild?.level).toBe('low')
  })
})

// ─── Stroke model (lib/strokes) ─────────────────────────────────────────────

describe('strokes: angle + anchors', () => {
  it('measures angles in pixel space (aspect-corrected)', async () => {
    const { angleDegrees } = await import('../strokes')
    // Vertex at center; arms straight up and straight right → 90° on any aspect.
    expect(angleDegrees([0.5, 0.5], [0.5, 0.2], [0.8, 0.5], 16 / 9)).toBe(90)
    // A 45° diagonal in PIXEL space on a 16:9 frame is NOT 45° in normalized
    // coords — the aspect correction must recover it.
    const dx = 0.2, dy = dx * (16 / 9) // equal pixel run and rise
    expect(angleDegrees([0.5, 0.5], [0.5 + dx, 0.5], [0.5 + dx, 0.5 + dy], 16 / 9)).toBe(45)
    expect(angleDegrees([0.5, 0.5], [0.5, 0.5], [0.8, 0.5], 1)).toBe(0) // degenerate arm
  })

  it('anchors each stroke type where it points', async () => {
    const { strokeAnchor } = await import('../strokes')
    expect(strokeAnchor({ type: 'angle', points: [[0.4, 0.6], [0.1, 0.1], [0.9, 0.1]] })).toEqual([0.4, 0.6])
    expect(strokeAnchor({ type: 'circle', points: [[0.5, 0.5], [0.6, 0.5]] })).toEqual([0.5, 0.5])
    const rect = strokeAnchor({ type: 'rect', points: [[0.2, 0.2], [0.6, 0.4]] })!
    expect(rect[0]).toBeCloseTo(0.4)
    expect(rect[1]).toBeCloseTo(0.3)
    expect(strokeAnchor({ type: 'freehand', points: [[0, 0], [1, 0], [1, 1], [0, 1]] })).toEqual([0.5, 0.5])
    expect(strokeAnchor({ type: 'line', points: [] })).toBeNull()
  })

  it('an angle drawn at the knees focuses knee_flex (dtl)', async () => {
    const { annotationFocusMetrics } = await import('../baseline')
    const lm = pose({ view: 'dtl' })
    const knee = lm[25]
    const focus = annotationFocusMetrics(
      [{ frame_timestamp_ms: 0, strokes: [{ type: 'angle', points: [[knee.x, knee.y], [knee.x, knee.y - 0.2], [knee.x + 0.05, knee.y + 0.2]] }] }],
      [{ timestamp_ms: 0, landmarks: lm }],
      'dtl',
    )
    expect(focus).toContain('knee_flex')
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
