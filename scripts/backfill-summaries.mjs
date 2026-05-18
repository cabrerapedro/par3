// Backfill baseline_summary for all calibrated position checkpoints that don't have one yet
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data: cps, error } = await sb
  .from('checkpoints')
  .select('id, name, camera_angle, checkpoint_type, baseline, selected_metrics, instructor_note, calibration_marks, baseline_summary, status')
  .eq('status', 'calibrated')

if (error) { console.error('Error:', error); process.exit(1) }

const targets = cps.filter(cp => cp.baseline && cp.checkpoint_type !== 'swing' && !cp.baseline_summary)
console.log(`Found ${targets.length} checkpoints to backfill (of ${cps.length} total calibrated)\n`)

for (const cp of targets) {
  console.log(`Generating for "${cp.name}" (${cp.camera_angle})...`)
  const resp = await fetch('http://localhost:3000/api/baseline-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseline: cp.baseline,
      cameraAngle: cp.camera_angle,
      checkpointName: cp.name,
      instructorNote: cp.instructor_note || null,
      selectedMetrics: cp.selected_metrics,
      marksCount: cp.calibration_marks?.length || 0,
    }),
  })

  if (!resp.ok) {
    console.error(`  ERROR: ${resp.status} ${await resp.text()}`)
    continue
  }

  const { summary } = await resp.json()
  console.log(`  Summary: ${summary.substring(0, 80)}...`)

  const { error: upErr } = await sb
    .from('checkpoints')
    .update({ baseline_summary: summary })
    .eq('id', cp.id)

  if (upErr) console.error(`  DB error:`, upErr)
  else console.log(`  Saved!\n`)
}

console.log('Done.')
