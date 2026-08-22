'use client'

// Engine telemetry — a thin, never-throwing event log for the analysis
// pipeline (analysis_events table).
//
// Until now the only trace of what the engine did on the instructor's iPad or
// the student's phone was console.info on THAT device. When the two-pass
// refinement takes 40 s on an old iPhone, or a clip is parked for angle
// review, or the upload queue stalls, nobody finds out until the person
// complains. This makes the engine diagnosable from anywhere: one row per
// meaningful step with its duration and a small detail payload.
//
// Rules: fire-and-forget (callers never await unless they want to), swallow
// every error, no PII in `detail` (ids, counts, timings, enum-ish strings).

import { supabase } from './supabase'

export type TelemetrySource = 'clip_queue' | 'practice' | 'mirror' | 'baseline_upgrade' | 'band_calibration' | 'clip_retry'

export interface AnalysisEvent {
  source: TelemetrySource
  step: string
  status?: 'ok' | 'error' | 'info'
  duration_ms?: number
  clip_id?: string | null
  session_id?: string | null
  student_id?: string | null
  detail?: Record<string, unknown>
}

async function currentInstructorId(): Promise<string | null> {
  // getSession() reads the locally persisted session — no network round
  // trip — so it can't fail in exactly the situation telemetry exists to
  // diagnose (no coverage at the range). Nothing is cached: a logout/login in
  // the same tab must not keep attributing events to the previous user (the
  // RLS policies would then reject every row, silently).
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

/** Log one engine event. Never throws, never blocks the caller. */
export function logAnalysisEvent(event: AnalysisEvent): void {
  void (async () => {
    try {
      const instructor_id = await currentInstructorId()
      const row = {
        source: event.source,
        step: event.step,
        status: event.status ?? 'ok',
        duration_ms: event.duration_ms !== undefined ? Math.round(event.duration_ms) : null,
        clip_id: event.clip_id ?? null,
        session_id: event.session_id ?? null,
        student_id: event.student_id ?? null,
        instructor_id,
        detail: event.detail ?? null,
        // Device context helps explain timings (old iPhone vs iPad).
        ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      }
      console.info(`[telemetry] ${event.source}/${event.step}`, event.status ?? 'ok', event.duration_ms !== undefined ? `${Math.round(event.duration_ms)}ms` : '', event.detail ?? '')
      const { error } = await supabase.from('analysis_events').insert(row)
      if (error) console.warn('[telemetry] insert failed (schema.sql re-run needed?)', error.message)
    } catch {
      /* telemetry must never affect the product */
    }
  })()
}

/** Convenience: time an async step and log it (ok or error), rethrowing errors. */
export async function timedStep<T>(event: Omit<AnalysisEvent, 'duration_ms' | 'status'>, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now()
  try {
    const result = await fn()
    logAnalysisEvent({ ...event, status: 'ok', duration_ms: performance.now() - t0 })
    return result
  } catch (e) {
    logAnalysisEvent({
      ...event,
      status: 'error',
      duration_ms: performance.now() - t0,
      detail: { ...(event.detail ?? {}), error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) },
    })
    throw e
  }
}
