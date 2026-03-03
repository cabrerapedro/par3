import type { Landmark, Baseline, CalibrationMark, CameraAngle } from './types'

type LM = Landmark

function angleBetween(a: LM, b: LM, c: LM): number {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2)
  if (mag === 0) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI
}

// Raw metric values from landmarks (no thresholds)
export function calculateMetrics(lm: LM[], cameraAngle: CameraAngle): Record<string, number> {
  if (cameraAngle === 'face_on') {
    const nose = lm[0]
    const lShoulder = lm[11], rShoulder = lm[12]
    const lElbow = lm[13], rElbow = lm[14]
    const lWrist = lm[15], rWrist = lm[16]
    const lHip = lm[23], rHip = lm[24]

    const hipMidX = (lHip.x + rHip.x) / 2
    const head_lateral = Math.abs(nose.x - hipMidX)
    const lArm = angleBetween(lShoulder, lElbow, lWrist)
    const rArm = angleBetween(rShoulder, rElbow, rWrist)
    const arm_angle = (lArm + rArm) / 2
    const shoulder_level = Math.abs(lShoulder.y - rShoulder.y)

    return { head_lateral, arm_angle, shoulder_level }
  } else {
    const nose = lm[0]
    const lShoulder = lm[11], rShoulder = lm[12]
    const lHip = lm[23], rHip = lm[24]
    const lKnee = lm[25], rKnee = lm[26]
    const lAnkle = lm[27], rAnkle = lm[28]

    const sMid = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2, z: 0 }
    const hMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2, z: 0 }
    const spine_angle = Math.abs(Math.atan2(Math.abs(hMid.x - sMid.x), hMid.y - sMid.y) * 180 / Math.PI)
    const lKneeAngle = angleBetween(lHip, lKnee, lAnkle)
    const rKneeAngle = angleBetween(rHip, rKnee, rAnkle)
    const knee_flex = (lKneeAngle + rKneeAngle) / 2
    const head_forward = Math.abs(nose.x - sMid.x)

    return { spine_angle, knee_flex, head_forward }
  }
}

// Calculate baseline statistics from an array of calibration marks
export function calculateBaseline(marks: CalibrationMark[]): Baseline {
  if (!marks.length) return {}

  const keys = Object.keys(marks[0].metrics)
  const baseline: Baseline = {}

  for (const key of keys) {
    const values = marks.map(m => m.metrics[key]).filter(v => v !== undefined && !isNaN(v))
    if (!values.length) continue

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
    const std = Math.sqrt(variance)
    const min = Math.min(...values)
    const max = Math.max(...values)

    baseline[key] = { mean, std: Math.max(std, 0.001), min, max }
  }

  return baseline
}

export const METRIC_LABELS: Record<string, string> = {
  head_lateral: 'Cabeza',
  arm_angle: 'Brazos',
  shoulder_level: 'Hombros',
  spine_angle: 'Columna',
  knee_flex: 'Rodillas',
  head_forward: 'Cabeza adelante',
}

function baselineMessage(key: string, value: number, mean: number, status: string): string {
  if (status === 'ok') {
    const msgs: Record<string, string> = {
      head_lateral: 'Cabeza centrada, igual que en tu calibración.',
      arm_angle: 'Extensión de brazos correcta.',
      shoulder_level: 'Hombros nivelados correctamente.',
      spine_angle: 'Inclinación de columna perfecta.',
      knee_flex: 'Flexión de rodillas en tu rango.',
      head_forward: 'Posición de cabeza correcta.',
    }
    return msgs[key] || 'Correcto'
  }

  const diff = value - mean
  const msgs: Record<string, (d: number) => string> = {
    head_lateral: () => 'Centra un poco más la cabeza sobre las caderas.',
    arm_angle: (d) => d > 0 ? 'Brazos demasiado extendidos, relaja un poco.' : 'Extiende más los brazos.',
    shoulder_level: () => 'Nivelar los hombros, igual que en tu calibración.',
    spine_angle: (d) => d > 0
      ? 'Tu columna está más erguida que tu referencia. Inclínate más desde las caderas.'
      : 'Tu columna está muy inclinada. Endereza ligeramente.',
    knee_flex: (d) => d > 0
      ? 'Las rodillas están muy extendidas. Flexiona un poco más.'
      : 'Las rodillas están muy flexionadas. Endereza ligeramente.',
    head_forward: (d) => d > 0
      ? 'La cabeza está muy adelantada. Llévala hacia atrás.'
      : 'La cabeza está muy atrás. Adelántala ligeramente.',
  }

  return msgs[key]?.(diff) || (status === 'bad' ? 'Corregir posición.' : 'Ajustar ligeramente.')
}

export interface BaselineCheck {
  id: string
  label: string
  status: 'ok' | 'warn' | 'bad'
  message: string
}

// Compare current metrics against a personal baseline
export function compareToBaseline(
  metrics: Record<string, number>,
  baseline: Baseline
): BaselineCheck[] {
  return Object.entries(metrics).map(([key, value]) => {
    const b = baseline[key]
    if (!b) return { id: key, label: METRIC_LABELS[key] || key, status: 'ok' as const, message: 'Correcto' }

    const deviation = Math.abs(value - b.mean)
    const status: 'ok' | 'warn' | 'bad' = deviation <= b.std ? 'ok' : deviation <= 2 * b.std ? 'warn' : 'bad'

    return {
      id: key,
      label: METRIC_LABELS[key] || key,
      status,
      message: baselineMessage(key, value, b.mean, status),
    }
  })
}

// Overall status from baseline checks
export function baselineOverallStatus(checks: BaselineCheck[]): 'ok' | 'warn' | 'bad' {
  if (checks.some(c => c.status === 'bad')) return 'bad'
  if (checks.some(c => c.status === 'warn')) return 'warn'
  return 'ok'
}

// Main tip: one correction at a time
export function baselineTip(checks: BaselineCheck[]): string {
  const bad = checks.find(c => c.status === 'bad')
  if (bad) return bad.message
  const warn = checks.find(c => c.status === 'warn')
  if (warn) return warn.message
  return 'Excelente postura. Mantén esta posición y tira.'
}

// Average multiple landmark frames into one set
export function averageLandmarks(frames: LM[][]): LM[] {
  if (!frames.length) return []
  const n = frames.length
  return frames[0].map((_, i) => ({
    x: frames.reduce((s, f) => s + (f[i]?.x ?? 0), 0) / n,
    y: frames.reduce((s, f) => s + (f[i]?.y ?? 0), 0) / n,
    z: frames.reduce((s, f) => s + (f[i]?.z ?? 0), 0) / n,
    visibility: frames.reduce((s, f) => s + (f[i]?.visibility ?? 0), 0) / n,
  }))
}

// Generate copilot summary for practice results
export function generateBaselineSummary(checks: BaselineCheck[]): string {
  const good = checks.filter(c => c.status === 'ok')
  const issues = checks.filter(c => c.status !== 'ok')

  if (!issues.length) {
    return 'Postura excelente en general. Tu consistencia está mejorando. Mantén este nivel en tus próximas prácticas.'
  }

  const goodStr = good.length ? `${good.map(c => c.label.toLowerCase()).join(' y ')} están dentro de tu rango. ` : ''
  const worst = issues.reduce((a, b) => (a.status === 'bad' ? a : b))

  return `${goodStr}Trabaja principalmente en: ${worst.label.toLowerCase()}. ${worst.message}`
}
