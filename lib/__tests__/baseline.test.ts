import { describe, it, expect } from 'vitest'
import {
  calculateBaseline,
  buildClipBaseline,
  clipDetectionRatio,
  compareToBaseline,
  baselineOverallStatus,
  isSwingBaseline,
  generateBaselineSummary,
  generateSwingSummary,
} from '../baseline'
import type { Baseline, CalibrationMark, Landmark } from '../types'

// We just need a 33-element array of zero landmarks for shape compatibility.
// The functions we test here don't read landmark data — they only consume
// the metrics map already computed off-board.
function emptyLandmarks(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
}

function mark(timestamp: number, metrics: Record<string, number>): CalibrationMark {
  return {
    timestamp_ms: timestamp,
    landmarks: emptyLandmarks(),
    metrics,
  }
}

describe('calculateBaseline', () => {
  it('returns an empty baseline when there are no marks', () => {
    expect(calculateBaseline([])).toEqual({})
  })

  it('computes mean/std/min/max from marks', () => {
    const marks = [
      mark(0, { spine_angle: 30 }),
      mark(100, { spine_angle: 32 }),
      mark(200, { spine_angle: 28 }),
    ]
    const b = calculateBaseline(marks)
    expect(b.spine_angle.mean).toBeCloseTo(30)
    expect(b.spine_angle.min).toBe(28)
    expect(b.spine_angle.max).toBe(32)
    // Std of {30,32,28}: sqrt(((30-30)^2 + (32-30)^2 + (28-30)^2)/3) ≈ 1.633
    expect(b.spine_angle.std).toBeGreaterThan(0)
  })

  it('only includes metrics from selectedMetrics when provided', () => {
    const marks = [mark(0, { spine_angle: 30, knee_flex: 160 })]
    const b = calculateBaseline(marks, ['spine_angle'])
    expect(b).toHaveProperty('spine_angle')
    expect(b).not.toHaveProperty('knee_flex')
  })
})

describe('buildClipBaseline', () => {
  it('returns null for no frames', () => {
    expect(buildClipBaseline([], 'position', 'dtl', ['spine_angle'])).toBeNull()
  })

  it('builds a position baseline from the frames’ metrics', () => {
    const frames = [
      mark(0, { spine_angle: 30 }),
      mark(100, { spine_angle: 32 }),
      mark(200, { spine_angle: 28 }),
    ]
    const b = buildClipBaseline(frames, 'position', 'dtl', ['spine_angle']) as Baseline
    expect(b.spine_angle.mean).toBeCloseTo(30)
    expect(b.spine_angle.min).toBe(28)
    expect(b.spine_angle.max).toBe(32)
  })

  it('honours selectedMetrics for a position clip', () => {
    const frames = [mark(0, { spine_angle: 30, knee_flex: 160 })]
    const b = buildClipBaseline(frames, 'position', 'dtl', ['spine_angle']) as Baseline
    expect(b).toHaveProperty('spine_angle')
    expect(b).not.toHaveProperty('knee_flex')
  })
})

describe('clipDetectionRatio', () => {
  it('is 1 when every expected frame was detected', () => {
    expect(clipDetectionRatio(50, 10, 5)).toBe(1)
  })

  it('is low when most frames were lost', () => {
    expect(clipDetectionRatio(5, 10, 5)).toBeCloseTo(0.1)
  })

  it('is 0 with no frames', () => {
    expect(clipDetectionRatio(0, 10)).toBe(0)
  })

  it('clamps to 1 when more frames than expected', () => {
    expect(clipDetectionRatio(100, 10, 5)).toBe(1)
  })
})

describe('compareToBaseline', () => {
  const baseline: Baseline = {
    spine_angle: { mean: 30, std: 2, min: 28, max: 32 },
    knee_flex: { mean: 160, std: 5, min: 155, max: 165 },
  }

  it('returns ok when the value is within 1 std', () => {
    const checks = compareToBaseline({ spine_angle: 31, knee_flex: 161 }, baseline)
    expect(checks.find(c => c.id === 'spine_angle')?.status).toBe('ok')
    expect(checks.find(c => c.id === 'knee_flex')?.status).toBe('ok')
  })

  it('returns warn between 1 and 2 std', () => {
    const checks = compareToBaseline({ spine_angle: 33 }, baseline)
    // 33 vs mean 30, deviation 3, std 2 → 1.5σ → warn
    expect(checks[0].status).toBe('warn')
  })

  it('returns bad past 2 std', () => {
    const checks = compareToBaseline({ spine_angle: 40 }, baseline)
    expect(checks[0].status).toBe('bad')
  })

  it('returns center direction when ok, high when above the mean', () => {
    const ok = compareToBaseline({ spine_angle: 31 }, baseline)
    expect(ok[0].direction).toBe('center')
    const high = compareToBaseline({ spine_angle: 40 }, baseline)
    expect(high[0].direction).toBe('high')
    const low = compareToBaseline({ spine_angle: 20 }, baseline)
    expect(low[0].direction).toBe('low')
  })

  it('drops metrics with no baseline entry — never default-OKs unknown metrics', () => {
    // Per CLAUDE.md "no wrong feedback" rule: returning ok for a metric we
    // can't actually check would mislead the student. We filter it out instead.
    const checks = compareToBaseline({ unknown_metric: 99 }, baseline)
    expect(checks).toEqual([])
  })

  it('keeps known metrics and drops unknown ones in the same call', () => {
    const checks = compareToBaseline(
      { spine_angle: 31, unknown_metric: 99 },
      baseline,
    )
    expect(checks).toHaveLength(1)
    expect(checks[0].id).toBe('spine_angle')
  })

  it('filters to selectedMetrics when provided', () => {
    const checks = compareToBaseline(
      { spine_angle: 31, knee_flex: 161 },
      baseline,
      ['spine_angle'],
    )
    expect(checks.map(c => c.id)).toEqual(['spine_angle'])
  })
})

describe('baselineOverallStatus', () => {
  const mk = (status: 'ok' | 'warn' | 'bad') => ({
    id: 'x',
    label: 'x',
    status,
    direction: 'center' as const,
  })

  it('bad if any check is bad', () => {
    expect(baselineOverallStatus([mk('ok'), mk('bad'), mk('warn')])).toBe('bad')
  })
  it('warn if any check is warn (no bad)', () => {
    expect(baselineOverallStatus([mk('ok'), mk('warn'), mk('ok')])).toBe('warn')
  })
  it('ok when everything is ok', () => {
    expect(baselineOverallStatus([mk('ok'), mk('ok')])).toBe('ok')
  })
})

describe('isSwingBaseline', () => {
  it('detects swing baselines by the _type field', () => {
    expect(isSwingBaseline({ _type: 'swing', phases: {} })).toBe(true)
  })
  it('rejects plain object baselines', () => {
    expect(isSwingBaseline({ spine_angle: { mean: 30, std: 2, min: 28, max: 32 } })).toBe(false)
  })
  it('rejects null + undefined', () => {
    expect(isSwingBaseline(null)).toBe(false)
    expect(isSwingBaseline(undefined)).toBe(false)
  })
})

// A tiny translator stub that mimics the next-intl signature without
// pulling i18n into the test runtime.
function mkT(messages: Record<string, string>) {
  return (key: string, values: Record<string, string | number> = {}) => {
    const raw = messages[key] ?? key
    return raw.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''))
  }
}

describe('generateBaselineSummary', () => {
  const t = mkT({
    allInRange: 'all in range',
    goodOne: '{labels} is within your range.',
    goodMany: '{labels} are within your range.',
    focusOn: 'focus on {label}.',
  })

  const ok = (id: string, label: string) => ({
    id,
    label,
    status: 'ok' as const,
    direction: 'center' as const,
  })
  const bad = (id: string, label: string) => ({
    id,
    label,
    status: 'bad' as const,
    direction: 'high' as const,
  })

  it('returns the all-in-range string when nothing is off', () => {
    expect(generateBaselineSummary([ok('a', 'Spine'), ok('b', 'Knee')], t)).toBe('all in range')
  })

  it('reports the worst-status metric to focus on', () => {
    const out = generateBaselineSummary([ok('a', 'Spine'), bad('b', 'Knee')], t)
    expect(out).toContain('Spine is within your range')
    expect(out).toContain('focus on knee')
  })

  it('uses the plural form when more than one metric is good', () => {
    const out = generateBaselineSummary([ok('a', 'Spine'), ok('b', 'Knee'), bad('c', 'Hip')], t)
    expect(out).toContain('Spine, Knee are within your range')
  })
})

describe('generateSwingSummary', () => {
  const t = mkT({
    allInRange: 'all phases in range',
    goodOne: '{phases} is within your range.',
    goodMany: '{phases} are within your range.',
    focusOn: 'focus on {metric} at {phase}.',
  })

  const ok = { id: 'm', label: 'M', status: 'ok' as const, direction: 'center' as const }
  const bad = { id: 'm', label: 'Spine', status: 'bad' as const, direction: 'high' as const }

  it('says all-in-range when every phase is clean', () => {
    const out = generateSwingSummary([
      { phase: 'address', phaseLabel: 'Address', checks: [ok] },
      { phase: 'top', phaseLabel: 'Top', checks: [ok] },
      { phase: 'impact', phaseLabel: 'Impact', checks: [ok] },
      { phase: 'finish', phaseLabel: 'Finish', checks: [ok] },
    ], t)
    expect(out).toBe('all phases in range')
  })

  it('picks the worst metric in the worst phase', () => {
    const out = generateSwingSummary([
      { phase: 'address', phaseLabel: 'Address', checks: [ok] },
      { phase: 'top', phaseLabel: 'Top', checks: [bad] },
    ], t)
    expect(out).toContain('focus on spine at top')
  })
})
