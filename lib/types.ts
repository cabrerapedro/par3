export type CameraAngle = 'face_on' | 'dtl'
export type MetricStatus = 'ok' | 'warn' | 'bad'
export type SwingPhaseName = 'address' | 'top' | 'impact' | 'finish'

export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export interface BaselineMetric {
  mean: number
  std: number
  min: number
  max: number
}

export interface Baseline {
  [metricKey: string]: BaselineMetric
}

export interface SwingPhase {
  phase: SwingPhaseName
  landmarks: Landmark[]
  metrics: Record<string, number>
  frame_index: number
}

export interface SwingBaseline {
  _type: 'swing'
  phases: Partial<Record<SwingPhaseName, Baseline>>
}

export interface CalibrationMark {
  timestamp_ms: number
  relative_ms?: number  // ms since recording started, for timeline mapping
  landmarks: Landmark[]
  metrics: Record<string, number>
  note?: string
  phases?: SwingPhase[]  // Only present in swing mode
}

export type Locale = 'es' | 'en'

export interface Instructor {
  id: string
  name: string
  email: string
  preferred_locale?: Locale
  created_at: string
}

export interface Student {
  id: string
  instructor_id: string
  name: string
  email?: string
  access_code: string
  status?: 'active' | 'inactive'
  avatar_url?: string
  handicap?: string
  dominant_hand?: 'right' | 'left'
  years_playing?: number
  home_course?: string
  bio?: string
  preferred_locale?: Locale
  created_at: string
}

export interface MetricResult {
  value: number
  deviation: number
  status: MetricStatus
}

export interface PracticeSession {
  id: string
  student_id: string
  checkpoint_id: string
  video_url?: string
  date: string
  duration_seconds: number
  results: Record<string, MetricResult>
  overall_score: number
  created_at: string
}
