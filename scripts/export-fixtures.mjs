// Export real MediaPipe landmark streams as regression fixtures for
// lib/__tests__/realFixtures.test.ts.
//
// Picks, per clip type, the calibrated clip with the most FULL-BODY frames
// (nose, shoulders, hips, knees, ankles all ≥ 0.65 visibility) and requires
// that at least 60% of its frames pass — desk tests with no legs in frame
// are rejected, because a fixture must carry the range's real noise, not a
// laptop's. Landmarks are normalized coordinates: nothing identifying.
//
// Usage (dev machine, reads .env.local for the service role):
//   node scripts/export-fixtures.mjs
// Then run `npm test` — the real-fixture suite activates automatically.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const CORE = [0, 11, 12, 23, 24, 25, 26, 27, 28]

// Same geometry heuristic as lib/baseline.ts estimateCameraAngle (shoulder
// width / torso length, median): a fixture whose configured angle contradicts
// its geometry would make the suite fail for the instructor's mistake, not
// the detector's.
function estimateAngle(frames) {
  const ratios = []
  for (const f of frames) {
    const lm = f.landmarks
    const [lS, rS, lH, rH] = [lm[11], lm[12], lm[23], lm[24]]
    if (![lS, rS, lH, rH].every((l) => (l?.visibility ?? 0) >= 0.65)) continue
    const torso = Math.hypot((lS.x + rS.x) / 2 - (lH.x + rH.x) / 2, (lS.y + rS.y) / 2 - (lH.y + rH.y) / 2)
    if (torso <= 0.02) continue
    ratios.push(Math.abs(lS.x - rS.x) / torso)
  }
  if (ratios.length < 5) return null
  ratios.sort((a, b) => a - b)
  const m = ratios[Math.floor(ratios.length / 2)]
  return m >= 0.55 ? 'face_on' : m <= 0.38 ? 'dtl' : null
}
const MIN_FULL_BODY_SHARE = 0.6
const outDir = join(root, 'lib', '__tests__', 'fixtures')

const { data: clips } = await sb.from('clips').select('id, clip_type, camera_angle, status').eq('status', 'calibrated')
const candidates = []
for (const c of clips ?? []) {
  const { data: frames } = await sb.from('clip_frames').select('frame_index, timestamp_ms, landmarks').eq('clip_id', c.id).order('frame_index')
  if (!frames || frames.length < 40) continue
  const fullBody = frames.filter((f) => CORE.every((i) => (f.landmarks[i]?.visibility ?? 0) >= 0.65)).length
  const share = fullBody / frames.length
  const geometry = estimateAngle(frames)
  const angleOk = geometry === c.camera_angle
  console.log(`${c.clip_type.padEnd(9)} ${c.camera_angle.padEnd(8)} ${String(frames.length).padStart(4)} frames · full-body ${(share * 100).toFixed(0)}% · geometry ${geometry ?? '?'}${angleOk ? '' : ' ✗'}`)
  if (share >= MIN_FULL_BODY_SHARE && angleOk) candidates.push({ clip: c, frames, fullBody })
}

let exported = 0
for (const type of ['position', 'swing']) {
  const best = candidates.filter((k) => k.clip.clip_type === type).sort((a, b) => b.fullBody - a.fullBody)[0]
  if (!best) { console.log(`no full-body ${type} clip yet — record one at the range first`); continue }
  mkdirSync(outDir, { recursive: true })
  const fixture = {
    clip_type: type,
    camera_angle: best.clip.camera_angle,
    fps: type === 'swing' ? 10 : 5,
    frames: best.frames.map((f) => ({
      t: f.timestamp_ms,
      lm: f.landmarks.map((l) => [l.x, l.y, l.z, l.visibility ?? 0].map((v) => Math.round(v * 10000) / 10000)),
    })),
  }
  writeFileSync(join(outDir, `real-${type}.json`), JSON.stringify(fixture))
  exported++
  console.log(`→ fixtures/real-${type}.json (${fixture.frames.length} frames, ${best.clip.camera_angle})`)
}
console.log(exported ? `${exported} fixture(s) exported — run npm test` : 'nothing exported')
