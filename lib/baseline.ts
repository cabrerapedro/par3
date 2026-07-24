import type { Landmark, Baseline, CalibrationMark, CameraAngle, SwingPhaseName, SwingPhase, SwingBaseline } from './types'

// Local shape — matches lib/processClip's ProcessedFrame but defined here to
// avoid the cycle (processClip imports calculateMetrics from this file).
interface FrameLike {
  timestamp_ms: number
  landmarks: Landmark[]
  metrics: Record<string, number>
}

type LM = Landmark

function angleBetween(a: LM, b: LM, c: LM): number {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2)
  if (mag === 0) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI
}

// Available metrics per camera angle (source of truth for forms)
export const METRICS_BY_ANGLE: Record<CameraAngle, string[]> = {
  face_on: ['head_lateral', 'arm_angle', 'shoulder_level', 'hip_sway', 'stance_width', 'weight_shift'],
  dtl: ['spine_angle', 'knee_flex', 'head_forward', 'hip_hinge', 'trail_arm', 'head_height'],
}

// Rich metric info for UI display
export interface MetricInfo {
  label: string
  description: string
  unit: string
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  head_lateral:   { label: 'Posición de cabeza', description: 'Posición lateral de la cabeza respecto a las caderas', unit: 'distancia' },
  arm_angle:      { label: 'Extensión de brazos', description: 'Ángulo promedio de extensión de ambos brazos', unit: 'grados' },
  shoulder_level: { label: 'Nivel de hombros', description: 'Diferencia de altura entre hombros', unit: 'distancia' },
  hip_sway:       { label: 'Balanceo de cadera', description: 'Desplazamiento lateral de las caderas respecto a los pies', unit: 'distancia' },
  stance_width:   { label: 'Ancho de stance', description: 'Distancia entre tobillos relativa al ancho de hombros', unit: 'ratio' },
  weight_shift:   { label: 'Distribución de peso', description: 'Posición de hombros respecto a los pies', unit: 'distancia' },
  spine_angle:    { label: 'Inclinación de columna', description: 'Ángulo de inclinación del torso respecto a la vertical', unit: 'grados' },
  knee_flex:      { label: 'Flexión de rodillas', description: 'Ángulo promedio de flexión de ambas rodillas', unit: 'grados' },
  head_forward:   { label: 'Cabeza adelante', description: 'Distancia horizontal de la cabeza respecto a los hombros', unit: 'distancia' },
  hip_hinge:      { label: 'Bisagra de cadera', description: 'Ángulo de la articulación de cadera (hombro-cadera-rodilla)', unit: 'grados' },
  trail_arm:      { label: 'Brazo trasero', description: 'Ángulo del brazo más alejado de la cámara', unit: 'grados' },
  head_height:    { label: 'Altura de cabeza', description: 'Posición vertical de la cabeza respecto a las caderas', unit: 'distancia' },
}

// Backward-compatible: derived from METRIC_INFO
export const METRIC_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(METRIC_INFO).map(([k, v]) => [k, v.label])
)

// ─── i18n helpers ───────────────────────────────────────────────────────────
// Stable metric / phase keys (head_lateral, address, ...) live in this module
// because analysis code keys baselines by them. Their human-facing labels live
// in messages/{es,en}.json under metrics.labels and metrics.phases.
//
// These helpers accept a `t` function from next-intl (useTranslations or
// getTranslations) and return the translated label, falling back to the raw
// key if the namespace doesn't have an entry.

type TFn = (key: string) => string

export function getMetricLabel(key: string, t: TFn): string {
  try { return t(key) } catch { return key }
}

export function getPhaseLabel(phase: SwingPhaseName, t: TFn): string {
  try { return t(phase) } catch { return phase }
}

// Minimum visibility threshold — landmarks below this are considered unreliable
const MIN_VIS = 0.65

// Check if all given landmarks are visible enough
function visible(...landmarks: LM[]): boolean {
  return landmarks.every(l => (l.visibility ?? 0) >= MIN_VIS)
}

// ─── Metric versioning ──────────────────────────────────────────────────────
// v1 (legacy): distance metrics are raw normalized-frame coordinates, so their
// scale depends on how far the camera was from the body. v2 divides every
// distance metric by the subject's torso length measured in the same frame,
// making them invariant to camera distance / framing — the instructor's iPad
// and the student's phone no longer need to be at the same spot.
//
// The version a baseline was built with is stamped into the baseline JSON
// under `_v` (absent = 1). Comparisons must compute current-frame metrics with
// the SAME version as the baseline they compare against.
export const METRICS_VERSION = 2

// Distance metrics that get body-scale normalization in v2. Angles and the
// stance_width ratio are already scale-free.
const NORMALIZED_METRICS: Record<CameraAngle, string[]> = {
  face_on: ['head_lateral', 'shoulder_level', 'hip_sway', 'weight_shift'],
  dtl: ['head_forward', 'head_height'],
}

/**
 * Torso length (mid-shoulder → mid-hip, 2D) — the body-scale unit for v2
 * metrics. Returns null when the four torso landmarks aren't reliably visible
 * or the length is degenerate (person too small / detection glitch).
 */
function torsoLength(lm: LM[]): number | null {
  const lS = lm[11], rS = lm[12], lH = lm[23], rH = lm[24]
  if (!lS || !rS || !lH || !rH || !visible(lS, rS, lH, rH)) return null
  const len = Math.hypot(
    (lS.x + rS.x) / 2 - (lH.x + rH.x) / 2,
    (lS.y + rS.y) / 2 - (lH.y + rH.y) / 2,
  )
  return len > 0.02 ? len : null
}

/** Read the metrics version a stored baseline was built with (absent = 1). */
export function baselineMetricsVersion(baseline: unknown): number {
  if (!baseline || typeof baseline !== 'object') return 1
  const v = (baseline as Record<string, unknown>)._v
  return typeof v === 'number' ? v : 1
}

/** Metric keys of a position baseline, skipping internal `_`-prefixed fields. */
export function baselineMetricKeys(baseline: Record<string, unknown>): string[] {
  return Object.keys(baseline).filter(k => !k.startsWith('_'))
}

// Raw metric values from landmarks (no thresholds)
// Only includes metrics where the required landmarks are sufficiently visible.
// `version` controls body-scale normalization (see METRICS_VERSION above);
// pass the version of the baseline you'll compare against.
export function calculateMetrics(
  lm: LM[],
  cameraAngle: CameraAngle,
  version: number = METRICS_VERSION,
): Record<string, number> {
  const metrics: Record<string, number> = {}

  if (cameraAngle === 'face_on') {
    const nose = lm[0]
    const lShoulder = lm[11], rShoulder = lm[12]
    const lElbow = lm[13], rElbow = lm[14]
    const lWrist = lm[15], rWrist = lm[16]
    const lHip = lm[23], rHip = lm[24]
    const lAnkle = lm[27], rAnkle = lm[28]

    if (visible(nose, lHip, rHip)) {
      metrics.head_lateral = Math.abs(nose.x - (lHip.x + rHip.x) / 2)
    }
    if (visible(lShoulder, lElbow, lWrist, rShoulder, rElbow, rWrist)) {
      metrics.arm_angle = (angleBetween(lShoulder, lElbow, lWrist) + angleBetween(rShoulder, rElbow, rWrist)) / 2
    }
    if (visible(lShoulder, rShoulder)) {
      metrics.shoulder_level = Math.abs(lShoulder.y - rShoulder.y)
    }
    if (visible(lHip, rHip, lAnkle, rAnkle)) {
      const hipMidX = (lHip.x + rHip.x) / 2
      const ankleMidX = (lAnkle.x + rAnkle.x) / 2
      metrics.hip_sway = Math.abs(hipMidX - ankleMidX)
      const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x)
      const ankleWidth = Math.abs(lAnkle.x - rAnkle.x)
      metrics.stance_width = shoulderWidth > 0.001 ? ankleWidth / shoulderWidth : 0
      metrics.weight_shift = Math.abs((lShoulder.x + rShoulder.x) / 2 - ankleMidX)
    }
  } else {
    const nose = lm[0]
    const lShoulder = lm[11], rShoulder = lm[12]
    const lElbow = lm[13], rElbow = lm[14]
    const lWrist = lm[15], rWrist = lm[16]
    const lHip = lm[23], rHip = lm[24]
    const lKnee = lm[25], rKnee = lm[26]
    const lAnkle = lm[27], rAnkle = lm[28]

    const sMid = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2, z: 0, visibility: 1 }
    const hMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2, z: 0, visibility: 1 }

    if (visible(lShoulder, rShoulder, lHip, rHip)) {
      metrics.spine_angle = Math.abs(Math.atan2(Math.abs(hMid.x - sMid.x), hMid.y - sMid.y) * 180 / Math.PI)
    }
    if (visible(lHip, rHip, lKnee, rKnee, lAnkle, rAnkle)) {
      metrics.knee_flex = (angleBetween(lHip, lKnee, lAnkle) + angleBetween(rHip, rKnee, rAnkle)) / 2
    }
    if (visible(nose, lShoulder, rShoulder)) {
      metrics.head_forward = Math.abs(nose.x - sMid.x)
    }
    if (visible(lShoulder, rShoulder, lHip, rHip, lKnee, rKnee)) {
      const kMid = { x: (lKnee.x + rKnee.x) / 2, y: (lKnee.y + rKnee.y) / 2, z: 0, visibility: 1 }
      metrics.hip_hinge = angleBetween(sMid, hMid, kMid)
    }
    if (visible(lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist)) {
      const trailIsLeft = lShoulder.x > rShoulder.x
      const trailShoulder = trailIsLeft ? lShoulder : rShoulder
      const trailElbow = trailIsLeft ? lElbow : rElbow
      const trailWrist = trailIsLeft ? lWrist : rWrist
      metrics.trail_arm = angleBetween(trailShoulder, trailElbow, trailWrist)
    }
    if (visible(nose, lHip, rHip)) {
      metrics.head_height = Math.abs(hMid.y - nose.y)
    }
  }

  if (version >= 2) {
    // Body-scale normalization: distances become "torso lengths". When the
    // torso isn't reliably visible we DROP those metrics rather than emit
    // camera-dependent values — no feedback beats wrong feedback.
    const torso = torsoLength(lm)
    for (const key of NORMALIZED_METRICS[cameraAngle]) {
      if (!(key in metrics)) continue
      if (torso) metrics[key] = metrics[key] / torso
      else delete metrics[key]
    }
  }

  return metrics
}

// ─── Stable-segment selection ───────────────────────────────────────────────
// A position clip inevitably contains frames where the subject is walking in,
// settling, or relaxing between repetitions. Averaging those into a baseline
// shifts the mean and inflates the std; counting them in a practice score
// punishes the student for frames that aren't attempts. We keep only frames
// inside "stable" runs — where the body is close to still.

export interface MotionFrame {
  timestamp_ms: number
  landmarks: Landmark[]
}

// Landmarks used to measure body motion: nose, shoulders, hips, knees, ankles.
const MOTION_LANDMARKS = [0, 11, 12, 23, 24, 25, 26, 27, 28]
// Mean landmark speed (in torso-lengths per second) below which a frame is
// considered stable. Walking / settling moves at well over 1 torso/s; MediaPipe
// jitter on a still body stays well under this.
const STABLE_MAX_SPEED = 0.35
// A stable run must last at least this many consecutive frames to count.
const STABLE_MIN_RUN = 3

/**
 * Filter a frame stream down to its stable segments. Falls back to returning
 * ALL frames when too few stable ones are found (e.g. very short clip, jittery
 * detection) — degrading to the old whole-clip behavior beats returning
 * nothing.
 */
export function selectStableFrames<T extends MotionFrame>(frames: T[]): T[] {
  if (frames.length < STABLE_MIN_RUN + 1) return frames

  // Speed between consecutive frames, in torso-lengths/second. null = can't
  // measure (landmarks not visible in both frames, or a detection gap) →
  // treated as unstable.
  const speeds: (number | null)[] = []
  for (let i = 1; i < frames.length; i++) {
    speeds.push(frameSpeed(frames[i - 1], frames[i]))
  }

  // A frame is stable when every adjacent transition is measurable AND slow.
  // An unmeasurable side (null) disqualifies: MediaPipe typically loses
  // tracking DURING fast motion, so the frames flanking a gap are exactly the
  // ones we can't vouch for. Sequence edges (undefined) ride on the other side.
  const slow = (s: number | null | undefined): boolean =>
    s !== null && (s === undefined || s <= STABLE_MAX_SPEED)
  const stable = frames.map((_, i) => {
    const before = i > 0 ? speeds[i - 1] : undefined
    const after = i < speeds.length ? speeds[i] : undefined
    if (before === undefined && after === undefined) return false
    return slow(before) && slow(after)
  })

  // Keep only runs of >= STABLE_MIN_RUN consecutive stable frames.
  const kept: T[] = []
  let runStart = -1
  for (let i = 0; i <= frames.length; i++) {
    if (i < frames.length && stable[i]) {
      if (runStart < 0) runStart = i
    } else if (runStart >= 0) {
      if (i - runStart >= STABLE_MIN_RUN) kept.push(...frames.slice(runStart, i))
      runStart = -1
    }
  }

  const minKept = Math.max(STABLE_MIN_RUN, Math.ceil(frames.length * 0.2))
  return kept.length >= minKept ? kept : frames
}

// Consecutive rows further apart than this are a detection gap: whatever
// motion happened inside it is unmeasured (and net displacement can even
// cancel out), so averaging across it would fake stability.
const MAX_MEASURABLE_GAP_MS = 600

/** Mean motion-landmark speed between two frames, in torso-lengths/second. */
function frameSpeed(a: MotionFrame, b: MotionFrame): number | null {
  const dtMs = b.timestamp_ms - a.timestamp_ms
  if (dtMs > MAX_MEASURABLE_GAP_MS) return null
  const dtSec = Math.max(1, dtMs) / 1000
  const torso = torsoLength(b.landmarks) ?? torsoLength(a.landmarks)
  if (!torso) return null

  let sum = 0
  let count = 0
  for (const idx of MOTION_LANDMARKS) {
    const la = a.landmarks[idx], lb = b.landmarks[idx]
    if (!la || !lb || !visible(la, lb)) continue
    sum += Math.hypot(lb.x - la.x, lb.y - la.y)
    count++
  }
  if (count < 5) return null
  return sum / count / torso / dtSec
}

// ─── Camera-angle estimation ────────────────────────────────────────────────
// Face-on, the shoulder line spans roughly a torso length in x; down-the-line
// the shoulders nearly overlap. The ratio separates the two views cleanly, so
// we can warn when a video's actual view doesn't match the configured angle —
// a mismatch silently invalidates every metric.

/**
 * Estimate the camera angle from a clip's landmark stream. Returns null when
 * there aren't enough usable frames or the geometry is ambiguous (we only
 * warn on confident mismatches).
 */
export function estimateCameraAngle(frames: LM[][]): CameraAngle | null {
  const ratios: number[] = []
  for (const lm of frames) {
    const lS = lm[11], rS = lm[12]
    if (!lS || !rS || !visible(lS, rS)) continue
    const torso = torsoLength(lm)
    if (!torso) continue
    ratios.push(Math.abs(lS.x - rS.x) / torso)
  }
  if (ratios.length < 5) return null
  ratios.sort((a, b) => a - b)
  const median = ratios[Math.floor(ratios.length / 2)]
  if (median >= 0.55) return 'face_on'
  if (median <= 0.38) return 'dtl'
  return null
}

// Calculate baseline statistics from an array of calibration marks
export function calculateBaseline(marks: CalibrationMark[], selectedMetrics?: string[]): Baseline {
  if (!marks.length) return {}

  const keys = Object.keys(marks[0].metrics)
    .filter(k => !selectedMetrics?.length || selectedMetrics.includes(k))
  const baseline: Baseline = {}

  for (const key of keys) {
    const values = marks.map(m => m.metrics[key]).filter(v => v !== undefined && !isNaN(v))
    if (!values.length) continue

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
    const std = Math.sqrt(variance)
    const min = Math.min(...values)
    const max = Math.max(...values)

    // Floor std at 5% of |mean| (with a hard 0.001 floor for the degenerate
    // mean=0 case). The old 0.001 absolute floor produced 0.001-wide bands
    // when std was actually 0, flagging every nonzero deviation as 'bad'.
    // 5% of mean keeps the bands meaningful at any metric scale (degrees,
    // normalized lengths, etc.) without inventing variance the student didn't
    // demonstrate.
    const stdFloor = Math.max(Math.abs(mean) * 0.05, 0.001)
    baseline[key] = { mean, std: Math.max(std, stdFloor), min, max }
  }

  return baseline
}

export interface BaselineCheck {
  id: string
  label: string
  status: 'ok' | 'warn' | 'bad'
  direction: 'high' | 'low' | 'center'
}

// Compare current metrics against a personal baseline
export function compareToBaseline(
  metrics: Record<string, number>,
  baseline: Baseline,
  selectedMetrics?: string[]
): BaselineCheck[] {
  const entries = selectedMetrics?.length
    ? Object.entries(metrics).filter(([key]) => selectedMetrics.includes(key))
    : Object.entries(metrics)

  // Drop metrics with no baseline entry instead of defaulting them to 'ok'.
  // CLAUDE.md "Key Decisions" #2: better no feedback than wrong feedback —
  // a missing baseline entry happens when the wrong baseline type is loaded
  // (e.g. a swing baseline in a position context) and silently green-flagging
  // those would actively mislead the student.
  return entries.flatMap(([key, value]) => {
    const b = baseline[key]
    if (!b) return []

    const deviation = Math.abs(value - b.mean)
    const status: 'ok' | 'warn' | 'bad' = deviation <= b.std ? 'ok' : deviation <= 2 * b.std ? 'warn' : 'bad'
    const direction: 'high' | 'low' | 'center' = status === 'ok' ? 'center' : value > b.mean ? 'high' : 'low'

    return [{
      id: key,
      label: METRIC_LABELS[key] || key,
      status,
      direction,
    }]
  })
}

// Overall status from baseline checks
export function baselineOverallStatus(checks: BaselineCheck[]): 'ok' | 'warn' | 'bad' {
  if (checks.some(c => c.status === 'bad')) return 'bad'
  if (checks.some(c => c.status === 'warn')) return 'warn'
  return 'ok'
}

// Translator function shape — same as next-intl's `useTranslations` return.
// Accepting it as a parameter keeps these helpers as pure functions while
// staying locale-aware. Callers get the translator via useTranslations()
// in their component and pass it through.
type Translator = (key: string, values?: Record<string, string | number>) => string

// Generate summary for practice results (template-based, no AI).
// `t` should be bound to the `baselineSummary` namespace, e.g.
// `useTranslations('baselineSummary')`.
export function generateBaselineSummary(checks: BaselineCheck[], t: Translator): string {
  const good = checks.filter(c => c.status === 'ok')
  const issues = checks.filter(c => c.status !== 'ok')

  if (!issues.length) {
    return t('allInRange')
  }

  const parts: string[] = []
  if (good.length) {
    parts.push(t(good.length === 1 ? 'goodOne' : 'goodMany', {
      labels: good.map(c => c.label).join(', '),
    }))
  }
  const worst = issues.find(c => c.status === 'bad') || issues[0]
  parts.push(t('focusOn', { label: worst.label.toLowerCase() }))

  return parts.join(' ')
}

// ============================================================
// Swing analysis — phase-based
// ============================================================

export const PHASE_LABELS: Record<SwingPhaseName, string> = {
  address: 'Address',
  top: 'Top del backswing',
  impact: 'Impacto',
  finish: 'Finish',
}

export function isSwingBaseline(baseline: unknown): baseline is SwingBaseline {
  return (baseline as { _type?: string } | null | undefined)?._type === 'swing'
}

// Minimum wrist-Y travel (normalized frame units) for a swing to count.
const SWING_MIN_RANGE = 0.03
// Local-extremum window and minimum spacing between two tops (in frames).
const SWING_PEAK_WINDOW = 2
const SWING_MIN_TOP_GAP = 8

/**
 * Detect EVERY swing repetition in a landmark stream. A clip is meant to hold
 * 2-3 repetitions (spec), and a per-phase baseline is only statistically
 * meaningful with the variance ACROSS those reps — the old single-swing
 * detection produced one sample per phase (std = 0, bands defined purely by
 * the artificial floor) and could even pair the top of one swing with the
 * impact of another.
 *
 * Uses the wrist-Y trajectory: tops are local minima near the global minimum
 * (wrists highest), impacts the first strong maximum after each top.
 * Returns null when no swing pattern is detected.
 */
export function detectSwingReps(
  frames: LM[][],
  cameraAngle: CameraAngle,
  version: number = METRICS_VERSION,
): SwingPhase[][] | null {
  if (frames.length < 10) return null

  // Track average wrist Y across frames (lower Y = higher in frame)
  const wristY = frames.map(lm => {
    const lWrist = lm[15], rWrist = lm[16]
    if (!lWrist || !rWrist) return 0.5
    return (lWrist.y + rWrist.y) / 2
  })

  // Smooth signal (moving average of 3)
  const smooth = wristY.map((_, i) => {
    const start = Math.max(0, i - 1)
    const end = Math.min(wristY.length, i + 2)
    const slice = wristY.slice(start, end)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })

  const min = Math.min(...smooth)
  const max = Math.max(...smooth)
  const range = max - min
  if (range < SWING_MIN_RANGE) return null

  // Top candidates: local minima in the top 35% band of the travel.
  const topThreshold = min + range * 0.35
  const tops: number[] = []
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] > topThreshold) continue
    let isLocalMin = true
    for (let k = Math.max(0, i - SWING_PEAK_WINDOW); k <= Math.min(smooth.length - 1, i + SWING_PEAK_WINDOW); k++) {
      if (smooth[k] < smooth[i]) { isLocalMin = false; break }
    }
    if (!isLocalMin) continue
    // Merge candidates closer than the minimum gap, keeping the higher one
    // (lower y) — plateaus around the top produce runs of candidates.
    const prev = tops[tops.length - 1]
    if (prev !== undefined && i - prev < SWING_MIN_TOP_GAP) {
      if (smooth[i] < smooth[prev]) tops[tops.length - 1] = i
      continue
    }
    tops.push(i)
  }
  if (tops.length === 0) return null

  const phaseNames: SwingPhaseName[] = ['address', 'top', 'impact', 'finish']
  const reps: SwingPhase[][] = []
  let prevImpact = -1

  for (let j = 0; j < tops.length; j++) {
    const topIdx = tops[j]
    // Impact: strongest maximum between this top and the next top (or end).
    const searchEnd = j + 1 < tops.length ? tops[j + 1] : smooth.length
    let impactIdx = -1
    let impactVal = -Infinity
    for (let i = topIdx + 1; i < searchEnd; i++) {
      if (smooth[i] > impactVal) { impactVal = smooth[i]; impactIdx = i }
    }
    if (impactIdx <= topIdx) continue
    // Reject wiggles: this rep must cover most of the overall travel.
    if (impactVal - smooth[topIdx] < Math.max(SWING_MIN_RANGE, range * 0.5)) continue

    // Phantom-rep filters. A held full-swing finish keeps the hands high
    // (wrist Y near top-of-backswing height), so it also becomes a "top"
    // candidate, and lowering the club back to address then reads as its
    // "impact" — one phantom rep per real swing. Two structural differences
    // kill it without touching real reps:
    // 1. A real impact is the deepest point of the clip (hands at ball
    //    height); a phantom's "impact" is only re-address height.
    if (impactVal < max - range * 0.2) continue
    // 2. A real top is left immediately (the downswing is violent); a held
    //    finish stays inside the top band for many frames.
    const bandExitBy = Math.min(smooth.length - 1, topIdx + 4)
    let exitsTopBand = false
    for (let i = topIdx + 1; i <= bandExitBy; i++) {
      if (smooth[i] > topThreshold) { exitsTopBand = true; break }
    }
    if (!exitsTopBand) continue

    // Rep window: from just after the previous rep's impact to just before the
    // next top. Address: walking backward from the top, the first frame back
    // at address height (the last still moment before the backswing). Falls
    // back to 20% into the window when the clip starts mid-backswing.
    // Finish: shortly after impact (follow-through ≈ up to 2x the downswing),
    // clamped so it never bleeds into the next rep's setup.
    const windowStart = prevImpact + 1
    const addressLevel = min + range * 0.6
    let addressIdx = -1
    for (let i = topIdx - 1; i > prevImpact; i--) {
      if (smooth[i] >= addressLevel) { addressIdx = i; break }
    }
    if (addressIdx < 0) addressIdx = windowStart + Math.floor((topIdx - windowStart) * 0.2)
    const windowEnd = j + 1 < tops.length ? tops[j + 1] - 1 : smooth.length - 1
    const finishIdx = Math.min(
      windowEnd,
      impactIdx + Math.max(1, Math.min(
        Math.floor((windowEnd - impactIdx) * 0.7),
        (impactIdx - topIdx) * 2,
      )),
    )
    if (addressIdx < 0 || addressIdx >= topIdx) continue

    const indices = [addressIdx, topIdx, impactIdx, finishIdx]
    reps.push(phaseNames.map((phase, i) => ({
      phase,
      landmarks: frames[indices[i]],
      metrics: calculateMetrics(frames[indices[i]], cameraAngle, version),
      frame_index: indices[i],
    })))
    prevImpact = impactIdx
  }

  return reps.length > 0 ? reps : null
}

/**
 * Detect swing phases from a sequence of landmark frames — first repetition
 * only. Kept for compatibility; prefer detectSwingReps for anything that can
 * use every repetition.
 */
export function detectSwingPhases(
  frames: LM[][],
  cameraAngle: CameraAngle,
  version: number = METRICS_VERSION,
): SwingPhase[] | null {
  return detectSwingReps(frames, cameraAngle, version)?.[0] ?? null
}

/**
 * Average detected reps into one representative set of phases: per phase and
 * metric, the mean across every rep where it was measured. Comparing the
 * averaged attempt against the baseline is steadier than judging a single rep.
 */
export function averageSwingReps(reps: SwingPhase[][]): SwingPhase[] {
  if (reps.length === 1) return reps[0]
  const phaseNames: SwingPhaseName[] = ['address', 'top', 'impact', 'finish']
  const out: SwingPhase[] = []

  for (const phase of phaseNames) {
    const samples = reps
      .map(rep => rep.find(p => p.phase === phase))
      .filter((p): p is SwingPhase => Boolean(p))
    if (samples.length === 0) continue

    const sums: Record<string, { total: number; count: number }> = {}
    for (const s of samples) {
      for (const [key, value] of Object.entries(s.metrics)) {
        if (!sums[key]) sums[key] = { total: 0, count: 0 }
        sums[key].total += value
        sums[key].count++
      }
    }
    const metrics = Object.fromEntries(
      Object.entries(sums).map(([key, { total, count }]) => [key, total / count]),
    )
    out.push({ phase, landmarks: samples[0].landmarks, metrics, frame_index: samples[0].frame_index })
  }

  return out
}

/** Calculate per-phase baseline from swing calibration marks */
export function calculateSwingBaseline(marks: CalibrationMark[], selectedMetrics?: string[]): SwingBaseline {
  const phaseNames: SwingPhaseName[] = ['address', 'top', 'impact', 'finish']
  const phases: Partial<Record<SwingPhaseName, Baseline>> = {}

  for (const phaseName of phaseNames) {
    const phaseMarks: CalibrationMark[] = marks
      .filter(m => m.phases?.some(p => p.phase === phaseName))
      .map(m => {
        const phase = m.phases!.find(p => p.phase === phaseName)!
        return { ...m, landmarks: phase.landmarks, metrics: phase.metrics }
      })

    if (phaseMarks.length > 0) {
      phases[phaseName] = calculateBaseline(phaseMarks, selectedMetrics)
    }
  }

  return { _type: 'swing', phases }
}

export interface SwingPhaseCheck {
  phase: SwingPhaseName
  phaseLabel: string
  checks: BaselineCheck[]
}

/** Compare detected swing phases against a swing baseline */
export function compareSwingToBaseline(
  phases: SwingPhase[],
  baseline: SwingBaseline,
  selectedMetrics?: string[]
): SwingPhaseCheck[] {
  return phases
    .filter(p => baseline.phases[p.phase])
    .map(phase => ({
      phase: phase.phase,
      phaseLabel: PHASE_LABELS[phase.phase],
      checks: compareToBaseline(phase.metrics, baseline.phases[phase.phase]!, selectedMetrics),
    }))
}

/** Generate summary for swing practice results */
// `t` should be bound to the `swingSummary` namespace.
export function generateSwingSummary(phaseChecks: SwingPhaseCheck[], t: Translator): string {
  const good = phaseChecks.filter(pc => pc.checks.every(c => c.status === 'ok'))
  const bad = phaseChecks.filter(pc => pc.checks.some(c => c.status === 'bad'))

  if (!bad.length && good.length === phaseChecks.length) {
    return t('allInRange')
  }

  const parts: string[] = []
  if (good.length) {
    parts.push(t(good.length === 1 ? 'goodOne' : 'goodMany', {
      phases: good.map(pc => pc.phaseLabel).join(', '),
    }))
  }
  if (bad.length) {
    const worst = bad[0]
    const worstMetric = worst.checks.find(c => c.status === 'bad') || worst.checks[0]
    parts.push(t('focusOn', {
      metric: worstMetric.label.toLowerCase(),
      phase: worst.phaseLabel.toLowerCase(),
    }))
  }

  return parts.join(' ')
}

/**
 * Build the per-clip baseline from a MediaPipe frame stream.
 * Shared between the annotate save flow and the orphan-clip retry path.
 *
 * Position clips: average every frame (the student is meant to be static).
 * Swing clips: detect phases (address → top → impact → finish), then build
 * a phase-wise baseline. If phase detection fails (frames too short, no
 * clear swing trajectory), returns null so the caller can leave the clip
 * in 'pending' rather than persisting bogus data.
 */
export function buildClipBaseline(
  frames: FrameLike[],
  clipType: 'position' | 'swing',
  cameraAngle: CameraAngle,
  selectedMetrics: string[],
): Baseline | SwingBaseline | null {
  if (frames.length === 0) return null

  if (clipType === 'position') {
    // Only stable frames feed the baseline — transitions (walking in,
    // settling, relaxing between reps) would shift the mean and inflate the
    // std. selectStableFrames falls back to all frames when in doubt.
    const stable = selectStableFrames(frames)
    const marks: CalibrationMark[] = stable.map((f) => ({
      timestamp_ms: f.timestamp_ms,
      landmarks: f.landmarks,
      metrics: f.metrics,
    }))
    const baseline = calculateBaseline(marks, selectedMetrics)
    if (baselineMetricKeys(baseline).length === 0) return null
    baseline._v = METRICS_VERSION
    return baseline
  }

  // Swing: one CalibrationMark per detected repetition, so the per-phase
  // stats carry the real variance across the student's 2-3 reps.
  const reps = detectSwingReps(frames.map((f) => f.landmarks), cameraAngle)
  if (!reps) return null

  const swingMarks: CalibrationMark[] = reps.map((phases, i) => ({
    timestamp_ms: i,
    landmarks: phases[0].landmarks,
    metrics: phases[0].metrics,
    phases,
  }))
  const baseline = calculateSwingBaseline(swingMarks, selectedMetrics)
  const hasMetrics = Object.values(baseline.phases).some(
    (phase) => phase && baselineMetricKeys(phase).length > 0,
  )
  if (!hasMetrics) return null
  baseline._v = METRICS_VERSION
  return baseline
}

// ============================================================
// Practice aggregation — position mode
// ============================================================

export interface AggregatedCheck extends BaselineCheck {
  /** Fraction of evaluated frames where the metric was ok / warn / bad. */
  okPct: number
  warnPct: number
  badPct: number
  /** Fraction of evaluated frames where the metric was measurable at all. */
  presence: number
  /** Mean measured value across the frames where it was present. */
  value: number
  /** Signed deviation of that mean from the baseline mean, in std units. */
  deviation: number
}

// A metric must be measurable in at least this fraction of evaluated frames
// to be judged. Below it, we have framing/visibility trouble — reporting a
// technique verdict from scraps would be wrong feedback.
const AGGREGATE_MIN_PRESENCE = 0.3

/**
 * Aggregate a practice attempt's per-frame metrics against a position
 * baseline. Frames where a metric wasn't measurable count toward `presence`,
 * NOT toward bad — visibility problems are surfaced separately from
 * technique problems.
 */
export function aggregatePositionChecks(
  frameMetrics: Record<string, number>[],
  baseline: Baseline,
  selectedMetrics?: string[],
): AggregatedCheck[] {
  const total = frameMetrics.length
  if (total === 0) return []

  const keys = baselineMetricKeys(baseline)
    .filter(k => !selectedMetrics?.length || selectedMetrics.includes(k))

  const out: AggregatedCheck[] = []
  for (const key of keys) {
    const b = baseline[key]
    if (!b) continue
    const values = frameMetrics
      .map(m => m[key])
      .filter((v): v is number => v !== undefined && !isNaN(v))
    const presence = values.length / total
    if (values.length === 0 || presence < AGGREGATE_MIN_PRESENCE) continue

    let ok = 0, warn = 0, bad = 0
    for (const v of values) {
      const dev = Math.abs(v - b.mean)
      if (dev <= b.std) ok++
      else if (dev <= 2 * b.std) warn++
      else bad++
    }
    const okPct = ok / values.length
    const warnPct = warn / values.length
    const badPct = bad / values.length
    const status: 'ok' | 'warn' | 'bad' = badPct > 0.4 ? 'bad' : okPct > 0.6 ? 'ok' : 'warn'

    const mean = values.reduce((a, v) => a + v, 0) / values.length
    const deviation = b.std > 0 ? (mean - b.mean) / b.std : 0
    const direction: 'high' | 'low' | 'center' =
      Math.abs(deviation) <= 1 ? 'center' : deviation > 0 ? 'high' : 'low'

    out.push({
      id: key,
      label: METRIC_LABELS[key] || key,
      status,
      direction,
      okPct,
      warnPct,
      badPct,
      presence,
      value: mean,
      deviation,
    })
  }
  return out
}

/**
 * Heuristic for surfacing "no person detected" / "muy pocas detecciones" to
 * the instructor. Returns the detection ratio (frames with valid landmarks
 * divided by expected frames at the given fps + duration). A ratio < 0.3
 * means MediaPipe lost track for most of the clip — the instructor should
 * re-record rather than trust whatever baseline gets built from the scraps.
 */
export function clipDetectionRatio(
  frameCount: number,
  durationSeconds: number,
  fps = 10,
): number {
  const expected = Math.max(1, Math.floor(durationSeconds * fps))
  return Math.min(1, frameCount / expected)
}
