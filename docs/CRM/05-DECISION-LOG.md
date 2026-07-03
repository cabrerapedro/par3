# forat.golf — Decision Log

Tracks key decisions with rationale. Reference this before proposing changes. If a new decision contradicts an old one, update this log.

---

## Decision 1: B2B — Instructor Pays, Student is Free
**Instructor pays a monthly subscription. Student accesses for free.**

Why: Zero friction for student adoption. The instructor is the distribution channel. Revenue predictability from B2B is better than chasing individual students. Volume of usage matters more than per-student revenue in MVP.

Pricing model: tiered by number of active students. Free trial at 2 students.

---

## Decision 2: App IS the Recording Tool
**The instructor records directly in forat.golf, not in a separate app.**

Why: Eliminates the biggest friction. Replaces a tool the instructor already uses (they already record and draw lines). Video is automatically linked to the student and the auto-class. No file transfer. No metadata association step.

Implication: Camera and recording UX is the core interaction. It must be excellent.

---

## Decision 3: Clip Model Replaces Checkpoint Model
**The central unit is the Clip (a short, intentional recording), not the Checkpoint (a long session with marked moments).**

Why: The old "Bien" button model required the instructor to maintain attention during a long recording and tap at exactly the right moment. The new model reflects how instructors actually work: they decide to record a specific movement, record it, then annotate.

The clip IS the baseline. No separate calibration step. The full clip is processed.

---

## Decision 4: Classes Are Automatic (24-Hour Threshold)
**Classes auto-create based on time elapsed since last clip for a given student. Threshold: 24 hours.**

Why: The instructor does not think in "classes" — they think in "what I recorded today with this student." Forcing them to create a class adds friction. 24 hours is the right threshold: a lesson in the morning and another clip in the afternoon of the same day group together. A week later is clearly a new class.

There is no "create class" button anywhere in the product.

---

## Decision 5: Save ALL Landmarks, ALL Frames, Always
**Every frame of every clip and every practice session has its landmarks saved to the database.**

Why: This is the raw material for the future proprietary model. The instructor's annotations (where they pause, what they draw, what they say) are expert labels. The student's attempts are training examples. Lost data cannot be recovered retroactively. Storage is cheap.

Not sampled. Not filtered to "good" frames. Everything.

---

## Decision 6: Annotations Are Vectorial, Not Rasterized
**Instructor drawings are stored as normalized coordinate JSON, not as images.**

Why: Vector annotations can be scaled to any resolution, processed automatically for ML (detecting which body part was annotated, arrow directions), and re-rendered over updated video. A rasterized image is opaque — it can only be shown, not analyzed.

Points are normalized 0-1 so they're resolution-independent.

---

## Decision 7: Audio and Drawing Are Simultaneous
**When the instructor annotates, they draw and speak at the same time. Audio is not a separate step.**

Why: This is how instructors actually explain things. They draw a line on the spine while saying "look how your columna is tilting here." Separating these into two steps breaks the natural flow. The UX must allow both to happen in a single continuous gesture.

---

## Decision 8: Skeleton Is Always Opt-In
**The MediaPipe skeleton overlay is never visible by default. It requires an explicit tap to activate.**

Why: The skeleton is a tool for those who want to see technical details. Most students and many instructors just need the colored indicators and the one instruction. Showing the skeleton by default is visually overwhelming and intimidating for non-technical users.

Both instructor (while reviewing a clip) and student (while practicing) have access to it — but it's hidden unless requested.

---

## Decision 9: One Instruction at a Time for Students
**The app shows exactly one correction instruction to the student at a time — the most urgent one.**

Why: Showing 4 corrections simultaneously overwhelms the student and leads to worse outcomes, not better ones. This is validated golf teaching pedagogy (see 04-GOLF-DOMAIN-KNOWLEDGE.md). The most important correction gets the full attention.

---

## Decision 10: No Technical Numbers for Students
**Angles and distances are always translated to plain body language.**

Why: "4° more upright" means nothing to a beginner. "Inclinarte más desde las caderas" is actionable. The technical values are used internally for comparison, never shown to students.

---

## Decision 11: i18n from Day 1
**All user-visible strings are in translation files from the start. No hardcoded strings in components.**

Why: The product targets Spain first but UK, Germany, and US are the real prize. Retrofitting i18n is expensive and error-prone. Starting with it costs almost nothing extra when done correctly.

Languages: Spanish (es) and English (en). Browser language detection. Fallback: Spanish.

---

## Decision 12: MediaPipe Heuristics First, Proprietary ML Later
**V1 uses rule-based thresholds. Proprietary model when data volume is sufficient (estimated: 500+ active students, 6+ months).**

Why: Heuristic rules are buildable in days and sufficient for beginner posture corrections. Every clip accumulates data for future ML. The dataset — annotated swings by real instructors with expert labels — is the moat that competitors cannot replicate.

Conservative approach: better to give no feedback than wrong feedback. Start only with high-confidence corrections.

---

## Decision 13: PWA over Native App
**The product is a Progressive Web App (Next.js), not a React Native / Expo app.**

Why: Already built this way. PWA is installable on iPad and phone home screen. No app store friction. Instant updates. Camera and MediaPipe work well in modern mobile browsers. The trade-off (some native APIs unavailable) is acceptable for this use case.

---

## Decision 14: Positive Framing in All Feedback
**All student feedback is phrased positively. Never "you're doing X wrong." Always "try to adjust toward Y."**

Why: Negative framing increases anxiety and reduces performance. This is validated sports psychology. The instructor calibrated what's correct for this student — the app's job is to guide toward that, not to criticize deviation.

---

## Decision 15: The "Practice Today" Screen Is Prioritized, Not a Full List
**The student's main screen shows 1-2 prioritized clips, not all clips.**

Why: A student with 20 clips and no guidance will feel overwhelmed and practice nothing. The app must make the decision for them. Prioritization: most days without practice + worst recent score = highest priority. Simple heuristic for MVP, ML-driven in the future.

---

## Decision 16: Steve Is a Co-Founder, Not Just First Client
**Steve moves from "first client / validation partner" to co-founder. The immediate shared objective is to grow his school.**

Why: The product is now built on a real, jointly-operated school (dogfooding). Monetization is being defined together and is not fixed. Any per-class commission is handled by Pedro outside the product, not built into forat.golf.

---

## Decision 17: Add Simple School Modules, Day-1 Useful
**Around the practice core we add management modules: contacts, campaigns/reactivation, calendar/operations, and a student app experience (journey + class record). All deliberately simple.**

Why: An independent instructor like Steve runs everything on WhatsApp + a calendar. The Spanish market serves clubs/academies (Golfmanager, Bookgy) or generic billing-heavy academy ERPs — nobody serves the growing independent instructor with a light, golf-aware, AI-automated tool. Rule: simple to build fast, useful from day 1, AI used to automate admin and create a great student experience. Never advanced or complex. See `08-MODULOS-ESCUELA.md`.

---

## Decision 18: Integrate Generic Tools, Don't Rebuild Them
**Calendar = integrate Google Calendar and layer student context on top. Payments = handled by the course, outside the product.**

Why: Steve already uses Google Calendar. Rebuilding a booking engine (à la Golfmanager/ProAgenda) is undifferentiated work where incumbents are mature. The value is the student context, the AI automation, and the practice loop — not the scheduling primitive.

---

## Decision 19: No Instructor-Consistency Layer (For Now)
**We will not build a cross-instructor method-standardization layer at this point.**

Why: Not necessary while Steve is the only instructor. Revisit only if/when scaling to multiple instructors makes it a real need.

---

## Decision 20: No Automated Lead Capture (For Now)
**The front door — capturing and qualifying new students — stays with Steve. No AI concierge / lead-intake module is built now.**

Why: Steve handles acquisition today. Building intake automation adds no value at one instructor. Focus on contacts, reactivation, operations, and student experience.

---

## Decision 21: Spain-First Focus
**Initial focus is the Spanish market.**

Why: That's where Steve and the first school are. Geographic expansion is deferred until there's something proven to expand.

---



## Decision 22: Automated WhatsApp From the Start — via Kapso
**Reactivation campaigns and lesson reminders are sent automatically via WhatsApp, from day 1 — using Kapso as the provider — not via deep-link from Steve's personal number.**

Why: Pedro's call. The app sends on its own; Steve doesn't copy-paste. This supersedes the earlier deep-link approach. **Provider = Kapso** (updated from the earlier "Meta Cloud API / BSP" framing): Kapso is a managed layer over the WhatsApp Business Platform that gives us a TypeScript SDK, a Broadcasts API (bulk send with per-recipient variables + tracking), and signed webhooks. It lowers integration cost without removing Meta's underlying rules.

What it requires (operational, not code):
- A **Kapso** account + project.
- A dedicated school phone number (Steve's personal WhatsApp number can't double as the API number). Kapso offers instant setup or bring-your-own-Twilio.
- Kapso project API key + phone number ID + a configured webhook.
- Meta-approved message templates (es/en) and student opt-in (Meta policy + GDPR).

Opt-in for existing students is marked **by hand by Steve** in Contacts (recorded with date + source). Sending is blocked without opt-in.

Key product constraint: a business-initiated message must use an approved template with variables — AI fills the variables (name, last topic, days away), it does not write free-form for the first touch. Once the student replies, a 24-hour service window opens where free-form AI text is allowed and free. Reminders go as "utility" templates (cheaper / free inside the window); reactivation as "marketing" (Spain marketing rates are among the highest in Europe and rose on 2026-07-01).

What Kapso does NOT remove: dedicated number, approved templates, the 24h window, opt-in, and per-message cost still apply.

---

## Deprecated Decisions (from previous versions)

The following decisions were made for "Sweep" / "Golf Copilot" and are no longer valid:

- ~~"Bien" button during recording~~ → Replaced by full-clip recording model
- ~~Post-lesson checklist (60 seconds)~~ → The clip IS the record, no separate checklist
- ~~Journey builder with drag & drop phases~~ → Clips are the unit, organized by auto-class
- ~~Long recording sessions~~ → Clips are short (15-30s) and intentional
- ~~React Native (Expo) stack~~ → Product is Next.js PWA
- ~~Club pays (B2B to club)~~ → Instructor pays directly
- ~~Per-class commission built into the product~~ → Any commission handled by Pedro outside the product (Decision 16)
- ~~Journey builder is out of scope~~ → Reintroduced as **simple** adjustable templates co-created with Steve (Decision 17); the deprecated item was a *complex* drag-and-drop phase builder, not this
