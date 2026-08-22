'use client'

// Baseline maintenance that runs quietly in the instructor's session:
//
// 1. upgradeLegacyBaselines — clips calibrated before metrics v2 compare with
//    camera-dependent distances (the worst case for a student practicing
//    alone). But clip_frames stores the raw landmarks of every frame, and the
//    whole calibration chain is pure TypeScript — so the baseline can be
//    rebuilt as v2 WITHOUT re-recording. This is the textbook use of the `_v`
//    contract: the moment the stored baseline says v2, mirror and practice
//    compare in v2 automatically. The old baseline is kept under `_prev` for
//    rollback; clips whose frames were never stored stay v1 (never invent).
//
// 2. recalibrateClipBands — every time the instructor labels a session
//    (👍/👎), re-fit the per-clip band scale `_k` from ALL that clip's labeled
//    sessions (see calibrateBandScale). Pure arithmetic over stored results;
//    runs client-side under the instructor's own RLS.
//
// Both are best-effort and silent: a failure logs and changes nothing.

import { supabase } from './supabase'
import {
  buildClipBaseline, calculateMetrics, calibrateBandScale, annotationFocusMetrics,
  baselineMetricsVersion, METRICS_BY_ANGLE,
} from './baseline'
import type { MetricOpts, LabeledSession } from './baseline'
import { logAnalysisEvent } from './telemetry'
import type { Baseline, CameraAngle, Landmark, SwingBaseline } from './types'

// Cap per run so a large legacy library upgrades over a few sessions instead
// of hammering the connection in one go.
const MAX_UPGRADES_PER_RUN = 10
const SESSION_FLAG = 'forat_baseline_upgrade_ran'

interface LegacyClipRow {
  id: string
  student_id: string
  clip_type: 'position' | 'swing'
  camera_angle: CameraAngle
  selected_metrics: string[] | null
  baseline: Record<string, unknown> | null
}

/**
 * Upgrade this instructor's v1 baselines to v2 from stored clip_frames.
 * Runs once per browser session (sessionStorage flag), sequentially.
 */
export async function upgradeLegacyBaselines(instructorId: string): Promise<void> {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (sessionStorage.getItem(SESSION_FLAG)) return
      sessionStorage.setItem(SESSION_FLAG, '1')
    }

    const { data: clips } = await supabase
      .from('clips')
      .select('id, student_id, clip_type, camera_angle, selected_metrics, baseline')
      .eq('instructor_id', instructorId)
      .eq('status', 'calibrated')
    const legacy = ((clips ?? []) as LegacyClipRow[]).filter(
      (c) => c.baseline && baselineMetricsVersion(c.baseline) < 2,
    )
    if (legacy.length === 0) return
    console.info(`[baseline-upgrade] ${legacy.length} v1 clip(s) found, upgrading up to ${MAX_UPGRADES_PER_RUN}`)

    const handCache = new Map<string, MetricOpts>()
    let upgraded = 0

    for (const clip of legacy.slice(0, MAX_UPGRADES_PER_RUN)) {
      try {
        // Student handedness → consistent trail_arm in the rebuilt baseline.
        let metricOpts = handCache.get(clip.student_id)
        if (!metricOpts) {
          const { data: s } = await supabase
            .from('students').select('dominant_hand').eq('id', clip.student_id).single()
          metricOpts = s?.dominant_hand === 'left' || s?.dominant_hand === 'right'
            ? { trailSide: s.dominant_hand }
            : {}
          handCache.set(clip.student_id, metricOpts)
        }

        const { data: frames } = await supabase
          .from('clip_frames')
          .select('frame_index, timestamp_ms, landmarks')
          .eq('clip_id', clip.id)
          .order('frame_index', { ascending: true })
        if (!frames || frames.length < 10) {
          console.info(`[baseline-upgrade] clip ${clip.id}: no stored frames, stays v1`)
          continue
        }

        const rows = (frames as { timestamp_ms: number; landmarks: Landmark[] }[]).map((f) => ({
          timestamp_ms: f.timestamp_ms,
          landmarks: f.landmarks,
          metrics: calculateMetrics(f.landmarks, clip.camera_angle, undefined, metricOpts),
        }))
        const selected = clip.selected_metrics?.length
          ? clip.selected_metrics
          : METRICS_BY_ANGLE[clip.camera_angle] ?? []
        const rebuilt = buildClipBaseline(rows, clip.clip_type, clip.camera_angle, selected, metricOpts)
        if (!rebuilt) {
          console.info(`[baseline-upgrade] clip ${clip.id}: rebuild produced no baseline, stays v1`)
          continue
        }
        const out = rebuilt as Record<string, unknown>
        // Keep the v1 original for rollback; readers skip `_`-prefixed keys.
        out._prev = clip.baseline
        // Carry over the instructor-calibrated band scale — it was learned
        // from labels, not from the metric units, so it survives the upgrade.
        const prev = clip.baseline as Record<string, unknown>
        if (typeof prev._k === 'number') out._k = prev._k
        if (typeof prev._k_n === 'number') out._k_n = prev._k_n
        // Annotation focus: the clip's drawings exist, the frames exist —
        // derive `_focus` exactly as the calibration queue would have.
        try {
          const { data: annotations } = await supabase
            .from('clip_annotations')
            .select('frame_timestamp_ms, strokes')
            .eq('clip_id', clip.id)
          if (annotations?.length) {
            const focus = annotationFocusMetrics(
              annotations.map((a) => ({ frame_timestamp_ms: a.frame_timestamp_ms, strokes: a.strokes ?? [] })),
              rows,
              clip.camera_angle,
            )
            if (focus.length) out._focus = focus
          }
        } catch { /* focus is a nice-to-have */ }

        // Conditional write: only replace a baseline that is STILL v1. If the
        // calibration queue or a band recalibration wrote a v2 meanwhile,
        // this update matches zero rows instead of clobbering it.
        const { error } = await supabase
          .from('clips')
          .update({ baseline: rebuilt })
          .eq('id', clip.id)
          .is('baseline->>_v', null)
        if (error) throw error
        upgraded++
        console.info(`[baseline-upgrade] clip ${clip.id} upgraded to v2 (${clip.clip_type})`)
        logAnalysisEvent({
          source: 'baseline_upgrade', step: 'upgraded', clip_id: clip.id, student_id: clip.student_id,
          detail: { clip_type: clip.clip_type, frames: frames.length, focus: out._focus ?? null, kept_k: out._k ?? null },
        })
      } catch (e) {
        console.warn(`[baseline-upgrade] clip ${clip.id} failed, left untouched`, e)
        logAnalysisEvent({
          source: 'baseline_upgrade', step: 'upgrade_failed', status: 'error', clip_id: clip.id, student_id: clip.student_id,
          detail: { error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) },
        })
      }
    }
    if (upgraded) console.info(`[baseline-upgrade] done: ${upgraded} upgraded`)
  } catch (e) {
    console.warn('[baseline-upgrade] aborted', e)
  }
}

/**
 * Re-fit the clip's band scale `_k` from its labeled practice sessions.
 * Call after the instructor sets/changes a 👍/👎. No-op below the label
 * minimum (calibrateBandScale decides).
 */
export async function recalibrateClipBands(clipId: string): Promise<void> {
  try {
    const { data: sessions } = await supabase
      .from('practice_sessions')
      .select('results, instructor_feedback')
      .eq('clip_id', clipId)
      .not('instructor_feedback', 'is', null)
    if (!sessions?.length) return

    const fit = calibrateBandScale(sessions as LabeledSession[])
    if (!fit) return

    const { data: clip } = await supabase
      .from('clips').select('baseline').eq('id', clipId).single()
    const baseline = clip?.baseline as (Baseline | SwingBaseline) | null
    if (!baseline) return
    const current = (baseline as Record<string, unknown>)._k
    if (current === fit.k) return

    ;(baseline as Record<string, unknown>)._k = fit.k
    ;(baseline as Record<string, unknown>)._k_n = fit.n
    // Conditional write keyed on the version we READ: if the background
    // v1→v2 upgrade replaced the baseline between our read and this write,
    // the update matches zero rows rather than reverting the upgrade. The
    // next label re-runs the fit on the fresh baseline.
    const version = baselineMetricsVersion(baseline)
    let query = supabase.from('clips').update({ baseline }).eq('id', clipId)
    query = version >= 2 ? query.eq('baseline->>_v', String(version)) : query.is('baseline->>_v', null)
    const { error } = await query
    if (error) throw error
    console.info(`[band-calibration] clip ${clipId}: _k=${fit.k} (n=${fit.n})`)
    logAnalysisEvent({
      source: 'band_calibration', step: 'k_updated', clip_id: clipId,
      detail: { k: fit.k, n: fit.n, previous_k: typeof current === 'number' ? current : null },
    })
  } catch (e) {
    console.warn('[band-calibration] failed (non-fatal)', e)
  }
}
