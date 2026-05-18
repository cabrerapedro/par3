#!/usr/bin/env node
//
// One-shot data migration: legacy `checkpoints` → new `classes` + `clips`
// + `clip_annotations`, and linking existing `practice_sessions` to the
// new IDs.
//
// Usage:
//   DRY_RUN=1 node scripts/migrate-checkpoints-to-clips.mjs   # report-only
//   node scripts/migrate-checkpoints-to-clips.mjs             # apply
//
// Required env vars:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (bypasses RLS so we can write across
//                                instructors)
//
// Idempotency: skips any student that already has at least one clip,
// printing a warning. The first run is the source of truth. Re-runs
// against partially-migrated data are not supported — if you want a
// reset, drop classes/clips/clip_annotations and re-run.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function log(msg, ...rest) {
  const tag = DRY_RUN ? '[dry-run]' : '[migrate]'
  console.log(`${tag} ${msg}`, ...rest)
}

async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY RUN — no writes' : 'APPLYING'}`)

  // ---------- Load source data ----------
  const { data: checkpoints, error: cpErr } = await sb
    .from('checkpoints')
    .select('*')
    .order('created_at', { ascending: true })
  if (cpErr) throw cpErr
  log(`Found ${checkpoints.length} checkpoints to consider`)
  if (checkpoints.length === 0) {
    log('Nothing to migrate. Exiting cleanly.')
    return
  }

  // Map student_id → instructor_id in one query
  const studentIds = Array.from(new Set(checkpoints.map((c) => c.student_id)))
  const { data: studentsRows } = await sb
    .from('students')
    .select('id, instructor_id')
    .in('id', studentIds)
  const studentInstructor = new Map(studentsRows?.map((s) => [s.id, s.instructor_id]) ?? [])

  // Skip students that already have clips (partial migrations stay safe).
  const { data: existingClips } = await sb
    .from('clips')
    .select('student_id')
    .in('student_id', studentIds)
  const studentsAlreadyMigrated = new Set((existingClips ?? []).map((c) => c.student_id))
  if (studentsAlreadyMigrated.size > 0) {
    log(`Skipping ${studentsAlreadyMigrated.size} students already migrated`)
  }

  // ---------- Group checkpoints by (student_id, created_at::date) ----------
  // Same logic as the runtime "24h auto-class" — keeps the data shape
  // consistent with what fresh recordings would produce.
  const groups = new Map() // key → { student_id, instructor_id, date, checkpoints[] }
  for (const cp of checkpoints) {
    if (studentsAlreadyMigrated.has(cp.student_id)) continue
    const instructor_id = studentInstructor.get(cp.student_id)
    if (!instructor_id) {
      log(`Skipping checkpoint ${cp.id}: student ${cp.student_id} not found`)
      continue
    }
    const date = cp.created_at.slice(0, 10) // YYYY-MM-DD
    const key = `${cp.student_id}|${date}`
    let g = groups.get(key)
    if (!g) {
      g = { student_id: cp.student_id, instructor_id, date, checkpoints: [] }
      groups.set(key, g)
    }
    g.checkpoints.push(cp)
  }
  log(`Will create ${groups.size} classes`)

  let classesCreated = 0
  let clipsCreated = 0
  let annotationsCreated = 0
  let sessionsLinked = 0

  // ---------- Per-group migration ----------
  for (const g of groups.values()) {
    log(`Group: student=${g.student_id} date=${g.date} (${g.checkpoints.length} checkpoints)`)

    let cls
    if (DRY_RUN) {
      cls = { id: '<dry-run-class-id>' }
    } else {
      const { data, error } = await sb
        .from('classes')
        .insert({
          student_id: g.student_id,
          instructor_id: g.instructor_id,
          date: g.date,
        })
        .select()
        .single()
      if (error) throw error
      cls = data
    }
    classesCreated++

    for (const cp of g.checkpoints) {
      // Derive clip status from checkpoint state.
      const status =
        cp.status === 'archived' ? 'archived' :
        cp.baseline ? 'calibrated' : 'pending'

      let clip
      if (DRY_RUN) {
        clip = { id: '<dry-run-clip-id>' }
      } else {
        const { data, error } = await sb
          .from('clips')
          .insert({
            class_id: cls.id,
            student_id: cp.student_id,
            instructor_id: g.instructor_id,
            name: cp.name,
            camera_angle: cp.camera_angle,
            clip_type: cp.checkpoint_type || 'position',
            display_order: cp.display_order,
            video_url: cp.calibration_video_url,
            skeleton_url: cp.calibration_skeleton_url,
            baseline: cp.baseline,
            baseline_summary: cp.baseline_summary,
            selected_metrics: cp.selected_metrics ?? [],
            status,
          })
          .select()
          .single()
        if (error) throw error
        clip = data
      }
      clipsCreated++

      // Preserve the legacy single instructor_note + instructor_audio_url
      // as a clip_annotation anchored at frame 0 — that's the closest
      // mapping into the new annotation model.
      if (cp.instructor_note || cp.instructor_audio_url) {
        if (!DRY_RUN) {
          await sb.from('clip_annotations').insert({
            clip_id: clip.id,
            frame_timestamp_ms: 0,
            strokes: [],
            audio_url: cp.instructor_audio_url ?? null,
            audio_transcript: null,
            text_note: cp.instructor_note ?? null,
          })
        }
        annotationsCreated++
      }

      // Link existing practice_sessions for this checkpoint to the new clip
      // + class.
      if (!DRY_RUN) {
        const { error: psErr, count } = await sb
          .from('practice_sessions')
          .update({ clip_id: clip.id, class_id: cls.id }, { count: 'exact' })
          .eq('checkpoint_id', cp.id)
          .is('clip_id', null)
        if (psErr) throw psErr
        sessionsLinked += count ?? 0
      } else {
        const { count } = await sb
          .from('practice_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('checkpoint_id', cp.id)
        sessionsLinked += count ?? 0
      }
    }
  }

  log(`Done.`)
  log(`  classes:     ${classesCreated}`)
  log(`  clips:       ${clipsCreated}`)
  log(`  annotations: ${annotationsCreated}`)
  log(`  sessions linked: ${sessionsLinked}`)
}

main().catch((e) => {
  console.error('[migrate] FAILED:', e)
  process.exit(1)
})
