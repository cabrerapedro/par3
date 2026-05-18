import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data: cps, error } = await sb
  .from('checkpoints')
  .select('id, name, student_id, camera_angle, checkpoint_type, baseline, selected_metrics, instructor_note, calibration_marks, status')
  .eq('status', 'calibrated')
  .limit(10)

if (error) { console.error('Error:', error); process.exit(1) }

const target = cps.find(cp => cp.baseline && cp.checkpoint_type !== 'swing')
if (!target) { console.log('No position checkpoints with baseline found'); process.exit() }

console.log(`Target: "${target.name}" (${target.camera_angle})`)
console.log(`Marks: ${target.calibration_marks?.length || 0}`)
console.log(`Note: ${target.instructor_note || '(none)'}`)
console.log()

console.log('Generating summary via API...')
const resp = await fetch('http://localhost:3000/api/baseline-summary', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    baseline: target.baseline,
    cameraAngle: target.camera_angle,
    checkpointName: target.name,
    instructorNote: target.instructor_note || null,
    selectedMetrics: target.selected_metrics,
    marksCount: target.calibration_marks?.length || 0,
  }),
})

if (!resp.ok) {
  console.error('API error:', resp.status, await resp.text())
  process.exit(1)
}

const { summary } = await resp.json()
console.log('\n--- SUMMARY ---')
console.log(summary)
console.log('--- END ---')
