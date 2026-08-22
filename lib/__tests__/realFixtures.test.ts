import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  calculateMetrics, selectStableFrames, detectSwingReps, estimateCameraAngle,
  checkPlacement, buildClipBaseline, aggregatePositionChecks, METRICS_BY_ANGLE,
  baselineMetricsVersion, baselineMetricKeys, isSwingBaseline,
} from '../baseline'
import type { Baseline, CameraAngle, Landmark, SwingBaseline } from '../types'

// ─── Real MediaPipe streams ─────────────────────────────────────────────────
// Fixtures are genuine clip_frames rows (normalized landmarks, nothing
// identifying) exported with `node scripts/export-fixtures.mjs`, which only
// accepts FULL-BODY clips recorded at the range. Unlike the synthetic stick
// figures in evaluation.test.ts, they carry MediaPipe's actual jitter,
// visibility dips and arm confusions — the noise the detectors must survive.
//
// The suites skip themselves until the fixtures exist (the stored clips at
// the time of writing were desk tests with no legs in frame — useless as
// "range noise"). Assertions are deliberately tolerant: they pin BEHAVIOUR
// (detects, doesn't reject, stays in sane ranges), not exact numbers.

interface Fixture {
  clip_type: 'position' | 'swing'
  camera_angle: CameraAngle
  fps: number
  frames: { t: number; lm: number[][] }[]
}

const FIXTURES = join(__dirname, 'fixtures')
function loadFixture(name: string): Fixture | null {
  const path = join(FIXTURES, `real-${name}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as Fixture
}
function toFrames(f: Fixture) {
  return f.frames.map((fr) => ({
    timestamp_ms: fr.t,
    landmarks: fr.lm.map(([x, y, z, visibility]): Landmark => ({ x, y, z, visibility })),
  }))
}

const position = loadFixture('position')
const swing = loadFixture('swing')
// `describe.skipIf` still evaluates the suite body at collection time, so
// the body needs something harmless to work on when the fixture is absent.
const EMPTY = (type: Fixture['clip_type']): Fixture =>
  ({ clip_type: type, camera_angle: type === 'swing' ? 'dtl' : 'face_on', fps: 5, frames: [] })

describe.skipIf(!position)('real position clip', () => {
  const fx = position ?? EMPTY('position')
  const frames = toFrames(fx)
  const expected = METRICS_BY_ANGLE[fx.camera_angle]
  const rows = frames.map((f) => ({ ...f, metrics: calculateMetrics(f.landmarks, fx.camera_angle) }))

  it('camera angle is recognised from the geometry', () => {
    expect(estimateCameraAngle(frames.map((f) => f.landmarks))).toBe(fx.camera_angle)
  })

  it('most expected metrics are measurable in most frames', () => {
    const presence = expected.map((k) => rows.filter((r) => k in r.metrics).length / rows.length)
    expect(presence.filter((p) => p >= 0.7).length).toBeGreaterThanOrEqual(4)
  })

  it('stable-frame selection keeps a meaningful subset, never zero', () => {
    const stable = selectStableFrames(rows)
    expect(stable.length).toBeGreaterThanOrEqual(Math.ceil(rows.length * 0.2))
    expect(stable.length).toBeLessThanOrEqual(rows.length)
  })

  it('builds a v2 baseline with finite stats', () => {
    const b = buildClipBaseline(rows, 'position', fx.camera_angle, expected) as Baseline
    expect(b).not.toBeNull()
    expect(baselineMetricsVersion(b)).toBe(2)
    for (const key of baselineMetricKeys(b)) {
      expect(Number.isFinite(b[key].mean)).toBe(true)
      expect(b[key].std).toBeGreaterThanOrEqual(0)
    }
  })

  it('evaluating the clip against its own baseline comes out mostly green', () => {
    // A clip compared to itself must not read as a bad attempt — if it did,
    // the bands would be tighter than the measurement noise.
    const b = buildClipBaseline(rows, 'position', fx.camera_angle, expected) as Baseline
    const checks = aggregatePositionChecks(selectStableFrames(rows).map((r) => r.metrics), b)
    expect(checks.length).toBeGreaterThan(0)
    expect(checks.filter((c) => c.status === 'ok').length / checks.length).toBeGreaterThanOrEqual(0.6)
    expect(checks.some((c) => c.status === 'bad')).toBe(false)
  })

  it('placement check on real in-position frames is ok or partial', () => {
    const mid = Math.floor(frames.length / 2)
    const status = checkPlacement(frames.slice(mid, mid + 8).map((f) => f.landmarks), fx.camera_angle, expected)
    expect(['ok', 'partial']).toContain(status)
  })
})

describe.skipIf(!swing)('real swing clip', () => {
  const fx = swing ?? EMPTY('swing')
  const frames = toFrames(fx)
  const landmarks = frames.map((f) => f.landmarks)

  it('camera angle is recognised from the geometry', () => {
    expect(estimateCameraAngle(landmarks)).toBe(fx.camera_angle)
  })

  it('detects a sane number of repetitions with ordered phases', () => {
    const reps = detectSwingReps(landmarks, fx.camera_angle)
    expect(reps).not.toBeNull()
    expect(reps!.length).toBeGreaterThanOrEqual(1)
    // Spec says 2-3 reps per clip, but a long clip can hold more; anything
    // beyond 6 in a ≤30 s clip means phantom reps.
    expect(reps!.length).toBeLessThanOrEqual(6)
    for (const rep of reps!) {
      const idx = Object.fromEntries(rep.map((p) => [p.phase, p.frame_index]))
      expect(idx.address).toBeLessThan(idx.top)
      expect(idx.top).toBeLessThan(idx.impact)
      expect(idx.impact).toBeLessThanOrEqual(idx.finish)
      expect(idx.finish).toBeLessThan(landmarks.length)
    }
  })

  it('builds a swing baseline with every phase present', () => {
    const rows = frames.map((f) => ({ ...f, metrics: calculateMetrics(f.landmarks, fx.camera_angle) }))
    const b = buildClipBaseline(rows, 'swing', fx.camera_angle, METRICS_BY_ANGLE[fx.camera_angle])
    expect(b).not.toBeNull()
    expect(isSwingBaseline(b)).toBe(true)
    for (const phase of ['address', 'top', 'impact', 'finish'] as const) {
      expect((b as SwingBaseline).phases[phase]).toBeDefined()
    }
  })
})
