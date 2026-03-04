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

// Minimum visibility threshold — landmarks below this are considered unreliable
const MIN_VIS = 0.65

// Check if all given landmarks are visible enough
function visible(...landmarks: LM[]): boolean {
  return landmarks.every(l => (l.visibility ?? 0) >= MIN_VIS)
}

// Raw metric values from landmarks (no thresholds)
// Only includes metrics where the required landmarks are sufficiently visible.
export function calculateMetrics(lm: LM[], cameraAngle: CameraAngle): Record<string, number> {
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

  return metrics
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

    baseline[key] = { mean, std: Math.max(std, 0.001), min, max }
  }

  return baseline
}

function baselineMessage(key: string, value: number, mean: number, status: string): string {
  if (status === 'ok') {
    const msgs: Record<string, string> = {
      head_lateral: 'Cabeza centrada, igual que en tu calibración.',
      arm_angle: 'Extensión de brazos correcta.',
      shoulder_level: 'Hombros nivelados correctamente.',
      hip_sway: 'Caderas centradas, sin balanceo lateral.',
      stance_width: 'Ancho de stance correcto.',
      weight_shift: 'Peso bien distribuido.',
      spine_angle: 'Inclinación de columna perfecta.',
      knee_flex: 'Flexión de rodillas en tu rango.',
      head_forward: 'Posición de cabeza correcta.',
      hip_hinge: 'Bisagra de cadera correcta.',
      trail_arm: 'Brazo trasero en buena posición.',
      head_height: 'Altura de cabeza consistente.',
    }
    return msgs[key] || 'Correcto'
  }

  const diff = value - mean
  const msgs: Record<string, (d: number) => string> = {
    head_lateral: () => 'Centra un poco más la cabeza sobre las caderas.',
    arm_angle: (d) => d > 0 ? 'Brazos demasiado extendidos, relaja un poco.' : 'Extiende más los brazos.',
    shoulder_level: () => 'Nivelar los hombros, igual que en tu calibración.',
    hip_sway: () => 'Mantén las caderas centradas sobre los pies.',
    stance_width: (d) => d > 0 ? 'Tu stance es muy ancho. Junta un poco los pies.' : 'Tu stance es muy estrecho. Separa un poco los pies.',
    weight_shift: () => 'Centra el peso sobre los pies.',
    spine_angle: (d) => d > 0
      ? 'Tu columna está más erguida que tu referencia. Inclínate más desde las caderas.'
      : 'Tu columna está muy inclinada. Endereza ligeramente.',
    knee_flex: (d) => d > 0
      ? 'Las rodillas están muy extendidas. Flexiona un poco más.'
      : 'Las rodillas están muy flexionadas. Endereza ligeramente.',
    head_forward: (d) => d > 0
      ? 'La cabeza está muy adelantada. Llévala hacia atrás.'
      : 'La cabeza está muy atrás. Adelántala ligeramente.',
    hip_hinge: (d) => d > 0
      ? 'Estás doblando demasiado desde las caderas. Flexiona un poco menos.'
      : 'Necesitas más bisagra de cadera. Inclínate desde las caderas.',
    trail_arm: (d) => d > 0
      ? 'El brazo trasero está muy extendido. Relaja un poco.'
      : 'Extiende más el brazo trasero.',
    head_height: (d) => d > 0
      ? 'Estás bajando demasiado. Mantén la altura de cabeza.'
      : 'Te estás levantando. Mantén la altura de cabeza.',
  }

  return msgs[key]?.(diff) || (status === 'bad' ? 'Corregir posición.' : 'Ajustar ligeramente.')
}

export interface BaselineCheck {
  id: string
  label: string
  status: 'ok' | 'warn' | 'bad'
  message: string
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

  return entries.map(([key, value]) => {
    const b = baseline[key]
    if (!b) return { id: key, label: METRIC_LABELS[key] || key, status: 'ok' as const, message: 'Correcto', direction: 'center' as const }

    const deviation = Math.abs(value - b.mean)
    const status: 'ok' | 'warn' | 'bad' = deviation <= b.std ? 'ok' : deviation <= 2 * b.std ? 'warn' : 'bad'
    const direction: 'high' | 'low' | 'center' = status === 'ok' ? 'center' : value > b.mean ? 'high' : 'low'

    return {
      id: key,
      label: METRIC_LABELS[key] || key,
      status,
      message: baselineMessage(key, value, b.mean, status),
      direction,
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

// Generate summary for practice results (template-based, no AI)
export function generateBaselineSummary(checks: BaselineCheck[]): string {
  const good = checks.filter(c => c.status === 'ok')
  const issues = checks.filter(c => c.status !== 'ok')

  if (!issues.length) {
    return 'Todas las métricas dentro de tu rango personal. Excelente consistencia.'
  }

  const parts: string[] = []
  if (good.length) {
    parts.push(`${good.map(c => c.label).join(', ')} ${good.length === 1 ? 'está' : 'están'} dentro de tu rango.`)
  }
  const worst = issues.find(c => c.status === 'bad') || issues[0]
  parts.push(`Enfócate en mejorar: ${worst.label.toLowerCase()}.`)

  return parts.join(' ')
}
