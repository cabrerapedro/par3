export type CameraAngle = 'face_on' | 'dtl'
export type CheckpointStatus = 'calibrated' | 'pending' | 'archived'
export type CheckpointType = 'position' | 'swing'
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

export interface Instructor {
  id: string
  name: string
  email: string
  created_at: string
}

export interface Student {
  id: string
  instructor_id: string
  name: string
  email?: string
  access_code: string
  avatar_url?: string
  handicap?: string
  dominant_hand?: 'right' | 'left'
  years_playing?: number
  home_course?: string
  bio?: string
  created_at: string
}

export interface Checkpoint {
  id: string
  student_id: string
  name: string
  camera_angle: CameraAngle
  checkpoint_type?: CheckpointType
  display_order: number
  instructor_note?: string
  instructor_audio_url?: string
  calibration_video_url?: string
  calibration_skeleton_url?: string
  calibration_marks: CalibrationMark[]
  baseline: Baseline | SwingBaseline | null
  baseline_summary?: string
  selected_metrics: string[]
  status: CheckpointStatus
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
