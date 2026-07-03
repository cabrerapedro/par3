// School CRM helpers — dormant detection + WhatsApp messageability.
// Shared by the instructor dashboard (indicators/filters) and the reactivation
// campaign so "dormant" and "can I message this student" mean the same thing
// in both places.

// A student is "dormant" once this many days pass with no lesson (class) and no
// practice session. Tuned for a weekly-lesson cadence: ~3 weeks of silence is a
// meaningful gap worth a reactivation nudge, not a one-off missed week.
export const DORMANT_DAYS = 21

// The shape we join onto a student to compute activity. Both relations are
// optional so callers can pass a plain Student when they haven't loaded them.
export interface StudentActivity {
  classes?: { date: string }[] | null
  practice_sessions?: { date: string }[] | null
}

const DAY_MS = 86_400_000

/** Most recent activity (last class OR last practice), in epoch ms, or null. */
export function lastActivityMs(s: StudentActivity): number | null {
  let max: number | null = null
  const consider = (raw?: string) => {
    if (!raw) return
    const t = Date.parse(raw)
    if (!Number.isNaN(t) && (max === null || t > max)) max = t
  }
  for (const c of s.classes ?? []) consider(c.date)
  for (const p of s.practice_sessions ?? []) consider(p.date)
  return max
}

/** Whole days since a timestamp, or null when there's no activity at all. */
export function daysSince(ms: number | null, now: number = Date.now()): number | null {
  if (ms === null) return null
  return Math.floor((now - ms) / DAY_MS)
}

/**
 * Dormant = no activity ever, or last activity older than DORMANT_DAYS.
 * Caller decides whether to restrict to active students (archived/inactive
 * students are a separate, manual concept).
 */
export function isDormant(s: StudentActivity, now: number = Date.now()): boolean {
  const d = daysSince(lastActivityMs(s), now)
  return d === null || d >= DORMANT_DAYS
}

/**
 * Dormant computed from the denormalized `last_activity_at` column (the scalable
 * path — no need to load nested classes/practice). Null = never active = dormant.
 */
export function isDormantAt(lastActivityAt?: string | null, now: number = Date.now()): boolean {
  if (!lastActivityAt) return true
  const t = Date.parse(lastActivityAt)
  return Number.isNaN(t) || t < now - DORMANT_DAYS * DAY_MS
}

/** The ISO cutoff for a server-side dormant filter: activity before this = dormant. */
export function dormantCutoffISO(now: number = Date.now()): string {
  return new Date(now - DORMANT_DAYS * DAY_MS).toISOString()
}

/**
 * Can we send this student a WhatsApp? Needs a phone AND recorded consent.
 * This is the hard gate the campaign sender must respect (Meta + GDPR).
 */
export function canMessageWhatsapp(
  s: { phone?: string | null; whatsapp_opt_in_at?: string | null }
): boolean {
  return !!(s.phone && s.phone.trim() && s.whatsapp_opt_in_at)
}
