// Trend + weekly-stats helpers for the instructor student profile (Section 5)
// and the student journey (Section 6).
//
// All pure functions taking sessions + a clock. No DB calls, no React.
// They work indifferently with sessions linked to the new clips OR to the
// legacy checkpoints — match on whichever id is populated — so they keep
// behaving correctly through the data migration window.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const IMPROVED_THRESHOLD = 10 // percentage points
const STAGNANT_MIN_SESSIONS = 3
const STAGNANT_RANGE = 5 // ≤ 5 pp delta across the recent run

export interface SessionLike {
  /** Either clip_id (new) or checkpoint_id (legacy) — we match on either. */
  clip_id?: string | null
  checkpoint_id?: string | null
  date: string // ISO timestamp
  overall_score: number // 0..100
}

/**
 * Trend signal for a single clip based on its session history.
 *
 * - improved:  score climbed by > IMPROVED_THRESHOLD between the first and
 *              the last recent session.
 * - declining: score dropped by > IMPROVED_THRESHOLD.
 * - stagnant:  at least 3 sessions and no meaningful change (max - min ≤
 *              STAGNANT_RANGE pp).
 * - newish:    has sessions but doesn't meet the heuristics above.
 * - noData:    no sessions at all.
 */
export type ClipTrend = 'improved' | 'declining' | 'stagnant' | 'newish' | 'noData'

export function clipTrend(sessions: SessionLike[], clipId: string): ClipTrend {
  const own = sessions
    .filter((s) => s.clip_id === clipId || s.checkpoint_id === clipId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (own.length === 0) return 'noData'

  if (own.length >= STAGNANT_MIN_SESSIONS) {
    const recent = own.slice(-STAGNANT_MIN_SESSIONS)
    const scores = recent.map((s) => s.overall_score)
    const range = Math.max(...scores) - Math.min(...scores)
    if (range <= STAGNANT_RANGE) return 'stagnant'
  }

  if (own.length >= 2) {
    const diff = own[own.length - 1].overall_score - own[0].overall_score
    if (diff > IMPROVED_THRESHOLD) return 'improved'
    if (diff < -IMPROVED_THRESHOLD) return 'declining'
  }

  return 'newish'
}

export interface WeeklyStats {
  /** Total practice sessions in the last 7 days, across every clip. */
  sessionsCount: number
  /** Clip IDs whose trend evaluated to "improved" using all-time data. */
  improvedClipIds: string[]
  /** Clip IDs flagged as "stagnant" using all-time data. */
  stagnantClipIds: string[]
  /** Distinct clip IDs touched in the last 7 days. */
  practicedClipIds: string[]
  /** Most recent session date (any clip), or null if no history at all. */
  lastSessionAt: Date | null
}

/**
 * Build the "Esta semana" headline numbers for a student.
 *
 * `clipIds` lists every clip (or legacy checkpoint id) currently assigned to
 * the student — used to compute improved/stagnant flags across the full
 * history of each clip, not just the past week. The sessionsCount and
 * practicedClipIds slices, by contrast, only look at the last 7 days.
 */
export function weeklyStats(
  sessions: SessionLike[],
  clipIds: string[],
  now: Date = new Date(),
): WeeklyStats {
  const cutoff = now.getTime() - WEEK_MS
  const recent = sessions.filter((s) => new Date(s.date).getTime() >= cutoff)
  const practicedClipIds = Array.from(
    new Set(
      recent.map((s) => s.clip_id ?? s.checkpoint_id).filter((id): id is string => Boolean(id)),
    ),
  )

  const improvedClipIds: string[] = []
  const stagnantClipIds: string[] = []
  for (const id of clipIds) {
    const trend = clipTrend(sessions, id)
    if (trend === 'improved') improvedClipIds.push(id)
    else if (trend === 'stagnant') stagnantClipIds.push(id)
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  const lastSessionAt = sorted[0] ? new Date(sorted[0].date) : null

  return {
    sessionsCount: recent.length,
    improvedClipIds,
    stagnantClipIds,
    practicedClipIds,
    lastSessionAt,
  }
}

/**
 * Score summary for a single clip — last score + total sessions. Used by the
 * profile card to surface "X% · Y sessions" without re-walking the history
 * three different ways.
 */
export interface ClipScoreSummary {
  sessionCount: number
  lastScore: number | null
  lastDate: Date | null
}

export function clipScoreSummary(sessions: SessionLike[], clipId: string): ClipScoreSummary {
  const own = sessions
    .filter((s) => s.clip_id === clipId || s.checkpoint_id === clipId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (own.length === 0) return { sessionCount: 0, lastScore: null, lastDate: null }

  return {
    sessionCount: own.length,
    lastScore: own[0].overall_score,
    lastDate: new Date(own[0].date),
  }
}
