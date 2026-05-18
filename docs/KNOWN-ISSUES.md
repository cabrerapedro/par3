# Known issues — parell.golf

> Snapshot at the end of the i18n + rebrand + Class/Clip migration.
> Findings from the post-migration code review that were intentionally
> deferred to keep that PR scoped. Pick these up in follow-up PRs in the
> order listed inside each section.

---

## Security — trust model (blockers in the strict sense)

These are the highest-impact items. None are regressions from the legacy
flow — the trust model was the same for `checkpoints` — but the new
schema doubles the surface area (annotations carry audio + instructor
transcripts; frames carry the raw landmark stream).

### B3 — Anonymous SELECT on every student-visible table is `using (true)`

`supabase/schema.sql`: the `_anon_select` policies for `clips`, `classes`,
`clip_annotations`, `practice_sessions`, `session_frames`, `students`
all return rows with no row-level filter. Combined with the student auth
model (no JWT, localStorage holds the `Student` row), every student-side
fetch runs as the anon role and can read **any** row of those tables —
including audio + transcripts of instructor feedback for other students,
if the attacker can guess or scrape a UUID.

**Practical risk today:** UUIDs are unguessable in isolation but they
leak via share links (`/student/login?code=...`) and any future
public-facing surface.

**Fix sketch:**

1. Add a `students.access_code`-keyed function (or signed token sent as a
   request header) that the client passes on every fetch.
2. Replace `using (true)` with a check that the row's `student_id`
   matches the token-resolved student.
3. The instructor side (authenticated, has a JWT) is unaffected — those
   policies already scope via `auth.uid()`.

This is a non-trivial auth refactor. Out of scope for the Class+Clip
migration PR.

### B4 — Storage policies allow any authenticated user to write any path

`clip-videos` and `clip-annotations-audio` buckets accept inserts from
any `authenticated` role with no path-based check. A malicious instructor
could write into `${otherStudentId}/${otherClassId}/foo.webm` and pollute
another instructor's namespace.

`upsert: false` blocks overwriting an existing object, but creating new
ones in someone else's tree is allowed.

**Fix sketch:**

```sql
create policy "clip_videos_path_scoped_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clip-videos'
    and (storage.foldername(name))[1] in (
      select id::text from students where instructor_id = auth.uid()
    )
  );
```

Same pattern for `clip-annotations-audio` but scope by clip_id (resolved
through clips → instructor_id).

---

## High — correctness gaps under load / abuse

### H3 — `analyzeVideoBlob` keeps writing to state after unmount

`app/student/clip/[id]/practice/page.tsx`: the frame-by-frame analysis
loop is ~30 s of `setState` calls (`setProgress`, `setError`, etc.) with
no `AbortController`. If the student navigates away mid-analysis, React
logs "set state on unmounted component" and the in-flight MediaPipe
session, video element, and `URL.createObjectURL` references all leak.

**Fix:** wire an `AbortController` into the effect, check `signal.aborted`
inside the loop, revoke `URL`s and stop the Pose stream in cleanup.

### H5 — No per-frame timeout cap on `pose.send`

Both `lib/processClip.ts` and `app/student/clip/[id]/practice/page.tsx`
have a 1.5 s fallback timer per frame. At 600 frames × 1.5 s, a stuck
MediaPipe session can hang the UI for ~15 minutes before any error
surfaces.

**Fix:** track consecutive timeouts; bail with a user-visible "MediaPipe
stuck — refresh and try again" after N (e.g. 5) consecutive misses.

### H7 — Annotate save mid-flight navigation leaves orphan clips

`app/instructor/students/[id]/clips/new/annotate/page.tsx`: the save state
machine (`upload → insert → frames → baseline`) is blocking from the UI
perspective but the user can still hit the browser back button. If they
do during the `frames` or `baseline` stage, the clips row stays at
`status='pending'` with a video but no baseline. Recoverable via delete
on the clip detail page but confusing.

**Fix sketch:** show a "Procesamiento incompleto — reintentar" CTA on
the clip detail page when `status='pending'` and a video is uploaded.
The CTA re-runs `processClip` + `insertClipFrames` + baseline update.

---

## Medium — performance + UX gaps

| ID | File | Issue | Fix sketch |
|----|------|-------|-----------|
| M1 | `app/.../clips/new/layout.tsx` | Layout context's `URL.createObjectURL` not revoked on unmount (only on `reset()`) | Add `useEffect(() => () => revokeUrl(), [])` |
| M2 | `scripts/migrate-checkpoints-to-clips.mjs` | Reads `cp.instructor_audio_url` which isn't declared in `schema.sql` (only in `lib/types.ts`) | Confirm prod schema; either add the ALTER to schema.sql or drop the reference |
| M3 | `scripts/migrate-checkpoints-to-clips.mjs` | TOCTOU on the "already migrated" check if two operators run it in parallel | Documented; one-shot script, accept |
| M4 | `lib/processClip.ts` | Silent fallback to empty frames if MediaPipe finds no person — clip stays pending with no explanation | Count `null` ratio; surface "no person detected" |
| M7 | `app/instructor/students/[id]/page.tsx` + `app/student/journey/page.tsx` | Clips with `class_id IS NULL` are invisible (schema allows null) | Either bucket them under "Other" or `NOT NULL` the column |
| M8 | `app/api/transcribe/route.ts` | The 25 MB cap is moot — Next.js Node runtime body parser is 4 MB by default | Add `export const dynamic = 'force-dynamic'` + a runtime body-size config, or stream the upload |
| M9 | `app/student/clip/[id]/practice/page.tsx` | `recorder.onstop` assignment can race if the user double-taps stop | Move `onstop` assignment immediately after `new MediaRecorder(...)` |

---

## Low — nits + cleanups

- **L1** `lib/baseline.ts:263` `(baseline as any)?._type` — replace with a proper narrow.
- **L2** `lib/baseline.ts:191` `Math.max(std, 0.001)` floor produces 0.001-wide bands when actual std is 0 → every nonzero deviation flags `bad`. Use a percentage-of-mean floor instead.
- **L3** `lib/prioritization.ts:62-64` weighted sum mixes day-units (0..14+) with score-fraction (0..1). Days dominate. Spec is suspect; flag to PM.
- **L4** `app/.../practice/page.tsx:658` both branches of a ternary return the same string ("Ocultar referencia" vs "Mostrar referencia" — copy bug).
- **L5** `app/.../students/[id]/page.tsx:51-55` `loadData` not in effect deps. Convert to `useCallback` or inline.
- **L6** `app/.../clip/[id]/page.tsx:54` `useEffect` uses `[student]` but reads `clipId` — make the dep explicit.
- **L7** `lib/frames.ts:79` error message doesn't include parent ID — annoying to debug.
- **L8** `scripts/migrate-checkpoints-to-clips.mjs:50` zero-checkpoint case has ugly output.
- **L9** `lib/processClip.ts:114` comment correctly says "never call pose.close()" but couples implementation to "load once per page" — fragile.

---

## Confirmed correct (from the same review)

For peace of mind, the review explicitly verified these are right:

- `lib/classes.ts::getOrCreateTodayClass` 24h cutoff logic — including
  the evening-bleeds-past-midnight tradeoff.
- `lib/processClip.ts` `waitForEvent` cleanup with `{ once: true }` plus
  matching error listener removal. No event listener leak.
- `lib/frames.ts` batched insert with aggregated error reporting.
- `lib/trends.ts` pure functions + dual `clip_id`/`checkpoint_id` match.
  Trend thresholds (10 pp, 5 pp range over 3 sessions) are reasonable.
- `components/AnnotationCanvas.tsx` — pointer capture, `touch-none
  select-none`, unmount-time mic release, MIME fallback for Safari.
- `components/SVGAnnotationOverlay.tsx` — pure presentational, per-color
  `<marker>` defs.
- `app/api/transcribe/route.ts` — does NOT leak OPENAI_API_KEY on error
  (server-side log only, generic code returned to client).
- `app/.../clips/new/record/page.tsx` cleanup hook stops tracks, recorder,
  and the auto-stop timer on unmount.
- `app/.../clips/new/annotate/page.tsx` save state machine + blocking
  overlay; best-effort annotation + frame inserts.
- `supabase/schema.sql` cascade behavior: `clip_frames` and
  `clip_annotations` cascade on clip delete; `practice_sessions.clip_id`
  is `SET NULL` so history survives.
- `components/AnnotationCanvas.tsx:140` degenerate-stroke filter — taps
  without movement don't create invisible dots.
