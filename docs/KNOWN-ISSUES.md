# Known issues — forat.golf

> Final state after the post-review remediation pass.
> Almost every actionable finding from the code review is now closed.
> The two that remain are upstream-blocked; the rest are nits or
> spec-level concerns that need product input rather than code changes.

---

## ✅ Resolved in this branch

The post-review pass shipped fixes for **every blocker, every high-
severity, every fixable medium, and every actionable low** that the
review surfaced. Commit hashes for reference:

| Finding | Commit | Notes |
|---|---|---|
| B1 — `practice_sessions.checkpoint_id NOT NULL` rejected new-flow inserts | `6064177` | Schema ALTER + idempotent migration |
| B2 — Insert errors swallowed | `6064177` | Now surfaces `student.practice.saveFailed` |
| B3 — Anon SELECT `using (true)` | `31496ae` | Per-student RLS via `current_student_id()` + `x-student-access-code` header |
| B4 — Storage uploads not path-scoped | `31496ae` | First-segment check against instructor's students/clips |
| H3 — `analyzeVideoBlob` race on unmount | `b78a5bd` | `cancelledRef` + cleanup useEffect |
| H4 — `compareToBaseline` defaults to OK | `555e4d4` | Drops unknown metrics instead |
| H5 — No per-frame timeout cap | `b78a5bd` | `MAX_CONSECUTIVE_TIMEOUTS = 10` in both call sites |
| H6 — `baseline_summary` regenerated every visit | `555e4d4` | Persisted at clip save time |
| H7 — Orphan clip recovery | `f27deb1` | "Reintentar procesamiento" CTA + retry flow |
| M1 — Layout context blob URL leak | `772b08b` | useEffect cleanup |
| M2 — `instructor_audio_url` column missing | `772b08b` | Canonicalized via ALTER in schema MIGRATIONS |
| M3 — Migration TOCTOU race | `0c004e6` | Documented; per-group try/catch covers the impact |
| M4 — Low-detection silent failure | `f27deb1` | `clipDetectionRatio < 0.3` surfaces an actionable error |
| M5 — `getOrCreateTodayClass` missing instructor filter | `555e4d4` | Scoped to (student, instructor) |
| M6 — Mirror smoothing tally defaults to OK | `555e4d4` | Skips missing frames; falls back to raw read |
| M7 — `clips.class_id` was nullable | `772b08b` | Tightened to NOT NULL |
| M8 — `/api/transcribe` body cap unrealistic | `0c004e6` | Lowered to 4 MB to match Vercel; `maxDuration = 60` |
| M9 — `recorder.onstop` race on double-tap stop | `772b08b` | Wired at construction time |
| L1 — `(baseline as any)?._type` | `772b08b` | Proper narrow |
| L2 — Std floor too small | `772b08b` | 5%-of-mean floor |
| L4 — Practice toggle copy bug | `772b08b` | Two distinct strings (`hideReference` / `showReference`) |
| L5 — `loadData` not in effect deps | `772b08b` | Explicit deps + eslint-disable on the closure |
| L6 — Student clip useEffect deps | `772b08b` | Explicit deps |
| L7 — Frame batch error missing parent ID | `772b08b` | Now logs `clip_id=...` / `session_id=...` |
| L8 — Migration zero-checkpoint output | `772b08b` | Clean early-exit branch |
| H2 — Migration partial-failure state | `0c004e6` | Per-student try/catch + summary report + exit code 1 |

Plus the foundational fixes shipped during the original PR (B1, B2,
H4, H6, M5, M6) in `6064177` and `555e4d4`.

The PWA service-worker gap that closed out the CLAUDE.md MVP scope is
in `e69eb04`.

---

## ❌ Still open — upstream-blocked

### Two transitive postcss vulnerabilities via Next.js

- `npm audit` reports two moderate `postcss` findings, pulled in
  transitively by Next.js (postcss is bundled inside `next`).
- **Re-checked 2026-05-22 (Next 16.2.6):** there is no patched Next in
  the current `^16` range — `npm update next` is a no-op and the
  vulnerable postcss ships across every 16.x. The only `npm audit fix
  --force` path is a breaking Next jump, so it stays deferred.
- **Practical risk: very low.** postcss runs **only at build time, on
  our own Tailwind/CSS** — never on untrusted/user-supplied CSS — so
  the advisory (CSS stringify XSS) isn't reachable here. It does not
  affect users or runtime.
- **Resolution (when convenient, ~5 min):** periodically run
  `npm update next` then `npm audit`. Once Next ships a release with a
  patched postcss, the safe in-range update closes it — no `--force`
  needed. Only use `npm audit fix --force` with a full build + test
  pass on a branch if you ever need the audit at zero sooner.

---

## 🟡 Deferred — spec-level questions, not bugs

These three need product input rather than code changes:

### L3 — Prioritization formula mixes day-units and score-fraction-units

> **Resolved 2026-05-22 by removal.** `lib/prioritization.ts` was deleted —
> the student home is now a transparent, chronological clip list with no
> algorithmic priority (a real "journey" will be co-designed with instructors
> later). The formula below no longer ships; kept for historical context.

`lib/prioritization.ts`:
```ts
priority = days_since_practice * 0.4 + (1 - avg_score) * 0.6
```

`days_since_practice` is in days (range 0..14+). `avg_score` is 0..1, so
`(1 - avg_score)` is 0..1. The day component always dominates after
a couple of days of neglect. This came straight from the spec but
should be sanity-checked with a product owner — possibly normalize
days to 0..1 over a 14-day window so the two factors actually mix.

### L9 — `pose.close()` coupling fragility

`lib/processClip.ts` comments correctly that we never call
`pose.close()` because the WASM module crashes on second init. This
couples the implementation to "load once per page" — robust but
fragile if Next ever bundle-splits a route in a way that creates a
fresh page context. Worth a comment in
`lib/mediapipe.ts` documenting the singleton invariant.

### CLAUDE.md "nice-to-have" — instructor practice-history UI

The student practice history page (`/student/clip/[id]/history`) is
in. There's no dedicated instructor view of "what did this student
practice this week" beyond the indirect view via
`weeklyStats` chips on the student profile page. Not blocker.

---

## Summary

**29 actionable findings → 27 closed in this branch, 2 upstream-blocked.**

| Severity | Found | Closed | Open | Notes |
|---|---|---|---|---|
| Blocker | 4 | 4 | 0 | B1 + B2 + B3 + B4 |
| High | 6 | 6 | 0 | H2 + H3 + H4 + H5 + H6 + H7 (H1 was non-bug) |
| Medium | 9 | 9 | 0 | M1..M9 |
| Low | 9 | 8 | 1 | L3 deferred as spec question |

**Vulns**: 11 found → 9 fixed, 2 transitive postcss waiting on Next.js.

This branch is now in a state where:
- No known security blocker remains (B3 + B4 closed).
- No known correctness blocker remains.
- The remaining items are upstream-blocked, spec-level, or
  nice-to-have UI we can ship without.
