// MediaPipe landmark type (normalized coordinates)
type LM = { x: number; y: number; z: number; visibility?: number }

export type Status = 'ok' | 'warn' | 'bad' | 'off'

export interface Check {
  id: string
  label: string
  status: Status
  message: string
}

export interface AggregatedCheck extends Check {
  okPct: number
  warnPct: number
  badPct: number
}

// Angle at vertex b formed by rays b→a and b→c (degrees)
function angleBetween(a: LM, b: LM, c: LM): number {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2)
  if (mag === 0) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI
}

// --- Face-on view ---
// Checks: head position, arm extension, shoulder level
export function analyzeFaceOn(lm: LM[]): Check[] {
  const nose = lm[0]
  const lShoulder = lm[11], rShoulder = lm[12]
  const lElbow = lm[13], rElbow = lm[14]
  const lWrist = lm[15], rWrist = lm[16]
  const lHip = lm[23], rHip = lm[24]

  // Head lateral offset vs hip midpoint
  const hipMidX = (lHip.x + rHip.x) / 2
  const headOff = Math.abs(nose.x - hipMidX)
  const headSt: Status = headOff < 0.03 ? 'ok' : headOff < 0.06 ? 'warn' : 'bad'

  // Average arm angle (shoulder-elbow-wrist), good range 155-185°
  const lArm = angleBetween(lShoulder, lElbow, lWrist)
  const rArm = angleBetween(rShoulder, rElbow, rWrist)
  const avgArm = (lArm + rArm) / 2
  const armSt: Status = avgArm >= 155 && avgArm <= 185 ? 'ok'
    : avgArm >= 140 && avgArm <= 200 ? 'warn' : 'bad'

  // Shoulder level difference
  const sDiff = Math.abs(lShoulder.y - rShoulder.y)
  const shoulderSt: Status = sDiff < 0.025 ? 'ok' : sDiff < 0.05 ? 'warn' : 'bad'

  return [
    {
      id: 'head', label: 'Cabeza', status: headSt,
      message: headSt === 'ok' ? 'Posición centrada'
        : headSt === 'warn' ? 'Ligeramente descentrada'
        : 'Centra la cabeza sobre las caderas',
    },
    {
      id: 'arms', label: 'Brazos', status: armSt,
      message: armSt === 'ok' ? 'Extensión correcta'
        : armSt === 'warn' ? 'Ajusta la extensión de brazos'
        : 'Mantén los brazos más extendidos',
    },
    {
      id: 'shoulders', label: 'Hombros', status: shoulderSt,
      message: shoulderSt === 'ok' ? 'Hombros nivelados'
        : shoulderSt === 'warn' ? 'Ligera inclinación en hombros'
        : 'Mantén los hombros al mismo nivel',
    },
  ]
}

// --- Down-the-line view ---
// Checks: spine inclination, knee flex, head forward position
export function analyzeDownLine(lm: LM[]): Check[] {
  const nose = lm[0]
  const lShoulder = lm[11], rShoulder = lm[12]
  const lHip = lm[23], rHip = lm[24]
  const lKnee = lm[25], rKnee = lm[26]
  const lAnkle = lm[27], rAnkle = lm[28]

  // Spine inclination: shoulder-midpoint to hip-midpoint line vs vertical, good 20-50°
  const sMid = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2, z: 0 }
  const hMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2, z: 0 }
  const spineAngle = Math.abs(Math.atan2(Math.abs(hMid.x - sMid.x), hMid.y - sMid.y) * 180 / Math.PI)
  const spineSt: Status = spineAngle >= 20 && spineAngle <= 50 ? 'ok'
    : spineAngle >= 10 && spineAngle <= 60 ? 'warn' : 'bad'

  // Knee flex: hip-knee-ankle angle, good range 135-175°
  const lKneeAngle = angleBetween(lHip, lKnee, lAnkle)
  const rKneeAngle = angleBetween(rHip, rKnee, rAnkle)
  const avgKnee = (lKneeAngle + rKneeAngle) / 2
  const kneeSt: Status = avgKnee >= 135 && avgKnee <= 175 ? 'ok'
    : avgKnee >= 120 && avgKnee <= 185 ? 'warn' : 'bad'

  // Head forward displacement vs shoulder midpoint, threshold 0.08
  const headFwd = Math.abs(nose.x - sMid.x)
  const headSt: Status = headFwd < 0.08 ? 'ok' : headFwd < 0.12 ? 'warn' : 'bad'

  return [
    {
      id: 'spine', label: 'Columna', status: spineSt,
      message: spineSt === 'ok' ? 'Inclinación correcta (20-50°)'
        : spineSt === 'warn' ? 'Ajusta la inclinación de espalda'
        : 'Inclínate entre 20-50° desde las caderas',
    },
    {
      id: 'knees', label: 'Rodillas', status: kneeSt,
      message: kneeSt === 'ok' ? 'Flexión de rodillas correcta'
        : kneeSt === 'warn' ? 'Ajusta la flexión de rodillas'
        : 'Flexiona las rodillas entre 135-175°',
    },
    {
      id: 'head', label: 'Cabeza', status: headSt,
      message: headSt === 'ok' ? 'Posición de cabeza correcta'
        : headSt === 'warn' ? 'Cabeza ligeramente adelantada'
        : 'Lleva la cabeza hacia atrás',
    },
  ]
}

// Smoothing buffer (6-frame majority vote) — module-level, lives per page session
const smoothBuffer: Status[][] = []
const BUFFER_SIZE = 6

export function smoothChecks(checks: Check[]): Check[] {
  smoothBuffer.push(checks.map(c => c.status))
  if (smoothBuffer.length > BUFFER_SIZE) smoothBuffer.shift()

  return checks.map((check, i) => {
    const votes: Partial<Record<Status, number>> = {}
    for (const frame of smoothBuffer) {
      const s = frame[i] ?? 'off'
      votes[s] = (votes[s] ?? 0) + 1
    }
    const smoothed = (Object.entries(votes).reduce((a, b) =>
      (a[1] as number) >= (b[1] as number) ? a : b
    )[0]) as Status
    return { ...check, status: smoothed }
  })
}

export function clearSmoothBuffer(): void {
  smoothBuffer.length = 0
}

export function overallStatus(checks: Check[]): Status {
  if (!checks.length) return 'off'
  if (checks.some(c => c.status === 'bad')) return 'bad'
  if (checks.some(c => c.status === 'warn')) return 'warn'
  if (checks.every(c => c.status === 'ok')) return 'ok'
  return 'off'
}

// Returns the single most important tip (one correction at a time)
export function getTip(checks: Check[]): string {
  const bad = checks.find(c => c.status === 'bad')
  if (bad) return bad.message
  const warn = checks.find(c => c.status === 'warn')
  if (warn) return warn.message
  return 'Excelente postura. Mantén esta posición.'
}

// Aggregate per-frame results into percentage breakdowns
export function aggregateResults(frames: Check[][]): AggregatedCheck[] {
  if (!frames.length) return []
  const total = frames.length

  return frames[0].map((template, i) => {
    let ok = 0, warn = 0, bad = 0
    for (const frame of frames) {
      const s = frame[i]?.status
      if (s === 'ok') ok++
      else if (s === 'warn') warn++
      else if (s === 'bad') bad++
    }
    const okPct = Math.round(ok / total * 100)
    const warnPct = Math.round(warn / total * 100)
    const badPct = Math.round(bad / total * 100)
    const status: Status = badPct > 40 ? 'bad' : warnPct > 40 ? 'warn' : 'ok'
    // Use message from the last frame with a definitive status
    const lastFrame = [...frames].reverse().find(f => f[i]?.status !== 'off')
    const message = lastFrame?.[i]?.message ?? template.message

    return { ...template, okPct, warnPct, badPct, status, message }
  })
}

// Copilot summary for video analysis results
export function generateSummary(results: AggregatedCheck[]): string {
  if (!results.length) return ''
  const issues = results.filter(r => r.status !== 'ok')
  if (!issues.length) return 'Excelente postura en general. Mantén este nivel de consistencia en tus prácticas.'
  if (issues.length === 1) {
    return `Tu postura es buena en general. Trabaja principalmente en: ${issues[0].label.toLowerCase()}. ${issues[0].message}.`
  }
  const worst = issues.reduce((a, b) => a.badPct > b.badPct ? a : b)
  return `Área principal a mejorar: ${worst.label.toLowerCase()}. ${worst.message}. Enfócate en un aspecto a la vez para una corrección efectiva.`
}
