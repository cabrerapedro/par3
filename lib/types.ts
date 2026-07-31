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

// Intersection (not a plain index signature) so the internal `_v` metrics-
// version stamp is visible to the type system: metric reads still resolve to
// BaselineMetric, while `baseline._v` types as number | undefined. Iterating
// code must skip `_`-prefixed keys (use baselineMetricKeys from lib/baseline).
export type Baseline = { [metricKey: string]: BaselineMetric } & {
  /** Metrics version the baseline was built with (absent = 1, legacy). */
  _v?: number
}

export interface SwingPhase {
  phase: SwingPhaseName
  landmarks: Landmark[]
  metrics: Record<string, number>
  frame_index: number
}

export interface SwingBaseline {
  _type: 'swing'
  /** Metrics version the baseline was built with (absent = 1, legacy). */
  _v?: number
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

// Explicit, human-set lifecycle of a student (distinct from the derived
// "dormant" engagement signal in lib/contacts.ts):
//   prospect — signed up, never came to a lesson yet
//   active   — currently taking lessons
//   former   — lessons ended, could come back (reactivation target)
export type LifecycleStage = 'prospect' | 'active' | 'former'

export interface Instructor {
  id: string
  name: string
  email: string
  preferred_locale?: Locale
  /** Passwordless login code (8 chars). Null until generated from the profile. */
  access_code?: string | null
  created_at: string
}

export interface Student {
  id: string
  instructor_id: string
  name: string
  email?: string
  access_code: string
  status?: 'active' | 'inactive'
  lifecycle_stage?: LifecycleStage
  avatar_url?: string
  handicap?: string
  dominant_hand?: 'right' | 'left'
  years_playing?: number
  home_course?: string
  bio?: string
  preferred_locale?: Locale
  // School CRM (July 2026) — contacts + WhatsApp campaigns
  phone?: string
  notes?: string
  level?: string
  whatsapp_opt_in_at?: string | null
  whatsapp_opt_in_source?: string | null
  whatsapp_window_expires_at?: string | null
  // Denormalized most-recent activity (last class/practice), kept fresh by a
  // DB trigger. Powers the "dormant" filter at scale.
  last_activity_at?: string | null
  created_at: string
}

export type JourneyStatus = 'todo' | 'doing' | 'done'

export type JourneyPlanStatus = 'active' | 'archived'

// A student's learning plan ("plan de aprendizaje"). A student can have several;
// one is the current focus. Steps (JourneyItem) belong to a plan via journey_id.
export interface Journey {
  id: string
  student_id: string
  instructor_id: string
  name: string
  source_template_id?: string | null
  is_focus: boolean
  position: number
  status: JourneyPlanStatus
  created_at: string
}

export interface JourneyItem {
  id: string
  student_id: string
  instructor_id: string
  journey_id?: string | null
  title: string
  note?: string | null
  images?: string[]
  position: number
  status: JourneyStatus
  created_at: string
}

export interface JourneyTemplate {
  id: string
  instructor_id: string
  name: string
  category?: string | null
  created_at: string
}

export interface JourneyTemplateItem {
  id: string
  template_id: string
  title: string
  note?: string | null
  images?: string[]
  position: number
  created_at: string
}

export interface Recommendation {
  id: string
  instructor_id: string
  title: string
  note?: string | null
  images?: string[]
  position: number
  created_at: string
}

export type LessonStatus = 'scheduled' | 'attended' | 'no_show' | 'cancelled'

export interface Lesson {
  id: string
  instructor_id: string
  student_id: string
  starts_at: string
  ends_at?: string | null
  status: LessonStatus
  note?: string | null
  created_at: string
}

export type MessageChannel = 'whatsapp' | 'email'
export type MessageDirection = 'outbound' | 'inbound'
export type MessageCategory = 'marketing' | 'utility' | 'service'
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'

export interface MessageLog {
  id: string
  student_id: string
  instructor_id: string
  channel: MessageChannel
  direction: MessageDirection
  category?: MessageCategory | null
  template_name?: string | null
  body?: string | null
  locale?: Locale | null
  status: MessageStatus
  kapso_message_id?: string | null
  kapso_broadcast_id?: string | null
  error?: string | null
  created_at: string
  updated_at: string
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
  /**
   * Instructor's verdict on this evaluation ("¿refleja lo que ves?") — the
   * calibration label for the measurement-validation loop.
   */
  instructor_feedback?: 'agree' | 'disagree' | null
  created_at: string
}
