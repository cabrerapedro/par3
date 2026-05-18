import { supabase } from './supabase'

// Types for the new Class + Clip data model (May 2026). Lives here while the
// sub-agent's i18n migration finishes touching lib/types.ts; once that lands,
// move these into types.ts alongside Checkpoint/Student/etc.

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
  created_at: string
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

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
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString()

  const { data: recent, error: queryError } = await supabase
    .from('classes')
    .select('*')
    // Scope to the same (student, instructor) pair so a student switching
    // instructors mid-day starts a fresh class with the new one instead of
    // landing under the previous instructor's row.
    .eq('student_id', studentId)
    .eq('instructor_id', instructorId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (queryError) throw queryError
  if (recent) return recent as Class

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
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

/**
 * List every class for a student, newest first. Used by the instructor
 * student profile (Section 5) and the student journey (Section 6).
 */
export async function listClassesForStudent(studentId: string): Promise<Class[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('student_id', studentId)
    .order('date', { ascending: false })

  if (error) throw error
  return (data ?? []) as Class[]
}

/**
 * Fetch all clips for a class, ordered by display_order then created_at so
 * the instructor's intended order is preserved but new unordered clips
 * still show up at the bottom.
 */
export async function listClipsForClass(classId: string): Promise<Clip[]> {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('class_id', classId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Clip[]
}
