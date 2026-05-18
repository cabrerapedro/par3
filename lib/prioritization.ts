// Prioritization for the student home — "Practicá esto hoy" (Section 6).
//
// Per the spec:
//
//   priority = (days_since_practice * 0.4) + (1 - avg_recent_score) * 0.6
//
// Higher = more urgent. The formula leans on two simple signals:
// neglect (haven't touched in a while) and difficulty (score has been
// poor lately). Both push the clip up.
//
// We work with a thin local SessionInput shape instead of importing
// PracticeSession from lib/types.ts so this file doesn't conflict with
// the in-flight i18n migration touching types.ts. The shape is a
// strict subset of PracticeSession.

import type { Clip } from './classes'

const RECENT_SESSION_COUNT = 3

// If the student has never practiced a clip, treat that as more urgent
// than any practiced-but-old clip. Two weeks of imagined neglect dominates
// the days-component and the score-component falls back to 0 (worst).
const NEVER_PRACTICED_DAYS = 14

// Sessions during the legacy migration window can have either `clip_id`
// (new model) or `checkpoint_id` (old model) populated. We match on both.
export interface SessionInput {
  clip_id?: string | null
  checkpoint_id?: string | null
  date: string // ISO timestamp
  overall_score: number // 0..100 per the schema
}

export interface ClipPriority {
  clipId: string
  priority: number // higher = more urgent
  daysSincePractice: number | null
  avgRecentScore: number | null // 0..1, normalized from overall_score/100
  sessionCount: number
}

export function computeClipPriority(
  clipId: string,
  sessions: SessionInput[],
  now: Date = new Date(),
): ClipPriority {
  const clipSessions = sessions
    .filter((s) => s.clip_id === clipId || s.checkpoint_id === clipId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const last = clipSessions[0]
  const daysSincePractice = last
    ? Math.max(0, (now.getTime() - new Date(last.date).getTime()) / (24 * 60 * 60 * 1000))
    : null

  const recent = clipSessions.slice(0, RECENT_SESSION_COUNT)
  const avgRecentScore =
    recent.length === 0
      ? null
      : recent.reduce((sum, s) => sum + s.overall_score, 0) / recent.length / 100

  const daysComponent = daysSincePractice ?? NEVER_PRACTICED_DAYS
  const scoreComponent = avgRecentScore ?? 0 // worst-case if no data
  const priority = daysComponent * 0.4 + (1 - scoreComponent) * 0.6

  return {
    clipId,
    priority,
    daysSincePractice,
    avgRecentScore,
    sessionCount: clipSessions.length,
  }
}

/**
 * Sort clips by priority and return the top N. The default of 2 matches
 * the layout in the spec: "1-2 clips priorizados, cards grandes y visuales".
 *
 * The original clip objects are returned with a `priority` field attached
 * so the UI can show "X days since you practiced" / "current score Y%"
 * without recomputing.
 */
export function pickTopClipsForToday<T extends Pick<Clip, 'id'>>(
  clips: T[],
  sessions: SessionInput[],
  n: number = 2,
  now: Date = new Date(),
): Array<T & { priority: ClipPriority }> {
  return clips
    .map((clip) => ({ ...clip, priority: computeClipPriority(clip.id, sessions, now) }))
    .sort((a, b) => b.priority.priority - a.priority.priority)
    .slice(0, n)
}
