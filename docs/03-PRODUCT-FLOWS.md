# forat.golf — Product Flows

## User Personas

### The Instructor (Primary Client)
- Teaches at academy or club, typically 30+ active students
- Uses forat.golf on **iPad during the lesson** — not between lessons
- Currently records on another app, draws lines on paused video, explains verbally
- Not technically advanced but comfortable with tablet
- Pain: repeats same corrections, no continuity between lessons, can't scale impact
- Need: minimum friction tool that replaces current workflow, not adds to it

### The Student (End User)
- Beginner to intermediate golfer
- Takes weekly lessons (individual or group)
- Practices 1-3 times between lessons at the range
- Pain: forgets what was taught, practices without guidance, can't tell if improving
- Need: clear reference for what to practice and immediate feedback when doing it

---

## Flow 1: Instructor — Recording a Clip

This is the core interaction. The instructor is at the range with the student.

### Step 1: Select student
- Opens forat.golf → sees list of students
- Taps the student's name
- The class for today is auto-created if 24+ hours have passed since the last clip for this student
- No "create class" button. No friction.

### Step 2: Record
- Taps "Grabar / Record"
- Camera opens clean — no skeleton overlay, no analysis during recording
- Records 15-30 seconds (2-3 good repetitions of the correct movement)
- Taps "Stop"

### Step 3: Review and annotate
- Video plays back automatically
- **Skeleton toggle:** opt-in button to activate MediaPipe overlay if the instructor wants to see angles
- Instructor scrubs to the key frame
- Taps "Annotate / Anotar"
- Canvas appears over the paused frame:
  - Draws with finger: arrows, lines, circles
  - While drawing, taps microphone — audio records simultaneously
  - Speaks while drawing: "Notice how the spine is more upright here than it should be..."
  - Taps microphone again to stop audio
  - Optional: adds text note
  - Taps "Done / Listo"
- Can annotate multiple frames in the same clip
- Names the clip: "Address de frente", "Backswing de perfil", etc.
- Selects camera angle (face-on / down-the-line)
- Taps "Save clip / Guardar"

### Step 4: Background processing
- Video uploads to Supabase Storage
- MediaPipe processes ALL frames — landmarks saved to `clip_frames`
- Baseline calculated from the clip
- LLM generates baseline summary for the student
- Clip is immediately visible to student (before processing completes — shows "processing" state)

### Repeat
- Instructor goes back to student profile, records another clip for another movement
- All clips from the same session auto-group under the same class (24h threshold)

---

## Flow 2: Instructor — Reviewing Student Progress

At the start of Saturday's lesson, before picking up the iPad to record.

1. Opens student profile
2. Sees "Esta semana / This week" block:
   - How many practice sessions the student did
   - Which clips they improved on (score went up >10%)
   - Which clips they're stuck on (score unchanged across 3+ sessions)
3. Can tap any clip to see the student's recorded attempts
4. Uses this to decide what to focus on in today's class
5. The class becomes a conversation about a real week of practice, not a reset

---

## Flow 3: Student — Main Screen

The student arrives at the range. Opens forat.golf.

### "Practicá esto hoy / Practice this today" (top block)
- 1-2 clips auto-prioritized by the app
- Prioritization algorithm: `(days_without_practice * 0.4) + (1 - recent_avg_score) * 0.6`
- More days without practice + worse score = higher priority
- Each card shows: video thumbnail, clip name, last practiced, current score
- Large "Practice" button on each card

### "Tu última clase / Your last session" (below)
- All clips from the most recent class, in order
- Status chips: "Improved / Mejorado", "Stuck / Estancado", "Not practiced / Sin practicar"

### "History / Historial" (bottom)
- All previous classes, collapsed
- Tap to expand and see clips from that day

---

## Flow 4: Student — Reviewing a Clip

Before practicing, the student reviews what the instructor left.

1. Taps a clip card
2. Sees the video player with instructor's annotations:
   - Video plays normally
   - At the annotated timestamp, the drawn strokes appear overlaid on the frame
   - Audio plays simultaneously with the drawing
3. Can scrub to see the annotated frame anytime
4. Skeleton toggle: opt-in to see MediaPipe angles on the instructor's video
5. Taps "Practice / Practicar" when ready

---

## Flow 5: Student — Practice Session (Mirror Mode)

For position clips (static posture analysis).

1. Camera activates — student sees themselves in real time
2. **Skeleton: hidden by default.** Small toggle button available if they want it.
3. Color indicators per metric (large enough to see at arm's length):
   - Green circle + checkmark: within baseline
   - Yellow circle + directional arrow: close to edge
   - Red circle + directional arrow: outside baseline
4. **One instruction at a time** (bottom of screen, large text):
   - "Inclinarte más desde las caderas"
   - Never more than one correction simultaneously
5. Student adjusts position until indicators are green
6. Taps "Record / Grabar" when ready to capture their attempt
7. Records 15-30 seconds
8. Taps "Stop"

For swing clips (dynamic analysis):
- Same setup
- Student swings — the app records
- Analysis happens post-recording (swing phases detected, compared per phase)

---

## Flow 6: Student — Practice Results

After recording a practice attempt.

### Layout
- **Left (tablet) / Top (phone):** Student's video with evaluation overlay
- **Right (tablet) / Bottom (phone):** Instructor's reference clip
- Toggle between side-by-side and single view

### Evaluation
- Overall score (% of metrics within baseline)
- What was good: green metrics listed simply ("Columna ✓", "Rodillas ✓")
- **One thing to improve:** the worst metric, in plain language
  - "Tu columna está un poco más erguida que tu referencia. Antes del swing, inclinarte más desde las caderas hasta sentir la misma posición que en el video."
- Generated by Claude API — positive framing always, no technical numbers for the student

### History
- This attempt is saved automatically
- Progress chart available (tap "Ver historial / View history")
- Shows score evolution over time for this clip

---

## Flow 7: Annotation Canvas (Detail)

The annotation canvas is the most important UX in the product. It must feel as natural as using a finger on a whiteboard.

### Activation
- Video is paused on a specific frame
- Instructor taps "Annotate / Anotar"
- Canvas appears as a transparent overlay on top of the frame

### Drawing Tools (minimal toolbar, horizontal, below video)
- **Arrow** (default): tap start, drag to end, arrowhead rendered automatically
- **Line**: free draw straight line
- **Circle**: tap center, drag to set radius
- **Color selector:** red (#ef4444), yellow (#f59e0b), green (#34d178), white
- **Undo last stroke:** single button, top-right of canvas

### Audio (simultaneous, not sequential)
- Microphone button — large, visible, at bottom right of canvas
- Tap to start recording: button turns red, pulses
- Instructor speaks while continuing to draw — both happen at the same time
- Tap again to stop
- Audio waveform shows recording in progress

### Saving
- Tap "Done / Listo"
- Strokes saved as normalized vector JSON (coordinates 0-1, resolution-independent)
- Audio blob uploaded to Supabase Storage
- Audio sent to Whisper for transcription (non-blocking — annotation saves even if transcription fails)
- Annotation linked to this specific timestamp in the clip

### Rendering on student side
- At the annotated timestamp, strokes are rendered as SVG overlay (crisp at any resolution)
- Audio plays automatically at that moment
- Student can tap to replay

---

## Flow 8: Student Onboarding

When a student first receives their access code.

1. Receives 6-character code from instructor (via WhatsApp, email, or QR)
2. Opens forat.golf — taps "Soy Alumno / I'm a Student"
3. Enters the code → enters their name
4. Optionally: fills basic golf profile (dominant hand, years playing, home course)
5. Sees their journey — clips from their instructor, ready to practice

No email required. No password. No forms. Code → name → done.

The instructor creates the student profile first. The student just activates it.

---

## What Does NOT Exist in forat.golf

These were in earlier versions or proposed features that are explicitly out of scope:

- ❌ "Create class" button — classes are automatic
- ❌ "Bien" button during recording — recording is a full clip, not marked moments
- ❌ Long recording sessions — clips are 15-30 seconds, intentional
- ❌ Post-lesson checklist for instructor — the clip IS the record
- ❌ Journey builder / drag & drop journey phases — clips are the unit, not phases
- ❌ Leaderboards or student comparison — personal progression only
- ❌ Push notifications (MVP) — in Phase 2
- ❌ Chat between instructor and student (MVP) — in Phase 2
- ❌ Skeleton visible by default — always opt-in
