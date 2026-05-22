import { supabase } from './supabase'

// Types + queries for the Class + Clip data model.

export interface Class {
  id: string
  student_id: string
  instructor_id: string
  date: string // ISO date 'YYYY-MM-DD'
  created_at: string
}

export type ClipType = 'position' | 'swing'
export type ClipStatus = 'pending' | 'calibrated' | 'archived'

export interface Clip {
  id: string
  class_id: string | null
  student_id: string
  instructor_id: string
  name: string
  camera_angle: 'face_on' | 'dtl'
  clip_type: ClipType
  display_order: number
  video_url?: string | null
  skeleton_url?: string | null
  baseline?: unknown // narrowed by callers that import the existing Baseline type
  baseline_summary?: string | null
  selected_metrics: string[]
  status: ClipStatus
  /** Share of sampled frames where MediaPipe detected the body (0..1). Used
   *  as a calm "framing quality" cue on the instructor's clip detail. */
  detection_ratio?: number | null
  created_at: string
}

/**
 * Get the student's class for "today", or create a new one if it's been
 * more than 24 hours since their last class.
 *
 * This is the heart of the auto-class model: the instructor never thinks
 * about creating a class — every clip they save during a single working
 * session lands in the same `classes` row. Stepping away for a day starts
 * a fresh class on next save.
 *
 * 24h is a deliberate choice over "same calendar day": evening lessons
 * that bleed past midnight should still belong to the same class.
 *
 * Throws on network/DB errors so callers can show an explicit failure
 * instead of silently dropping the clip.
 */
export async function getOrCreateTodayClass(
  studentId: string,
  instructorId: string,
): Promise<Class> {
  // Group clips by the *calendar day* (local), so a clip recorded the next
  // morning starts a new class instead of folding into yesterday's. A lesson
  // is a day, not a rolling 24h window.
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const { data: existing, error: queryError } = await supabase
    .from('classes')
    .select('*')
    // Scope to the same (student, instructor) pair so a student switching
    // instructors mid-day starts a fresh class with the new one instead of
    // landing under the previous instructor's row.
    .eq('student_id', studentId)
    .eq('instructor_id', instructorId)
    .eq('date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (queryError) throw queryError
  if (existing) return existing as Class

  const { data: created, error: insertError } = await supabase
    .from('classes')
    .insert({
      student_id: studentId,
      instructor_id: instructorId,
      date: today,
    })
    .select()
    .single()

  if (insertError) throw insertError
  if (!created) throw new Error('Failed to create class')

  return created as Class
}
