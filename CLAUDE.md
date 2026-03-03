# Par 3 — CLAUDE.md

## What is Par 3

Par 3 (par3.app) is a digital copilot for golf teaching professionals. The instructor calibrates each student's optimal posture using video + AI pose detection, creating a personalized baseline. The student then practices on their own and compares their swings against that baseline.

**Core positioning:** The instructor is the client, the student is the end user. We complement the instructor's method, never compete with it. The instructor is always right.

## The Problem

A golf student takes weekly lessons. The instructor corrects their posture, shows them the right positions, and the student understands in the moment. But when they go practice alone at the range, they don't remember what they were taught. They have no reference, no feedback, and potentially reinforce bad habits.

The instructor has a physical calibration machine with adjustable guides (metal rods, pads) that physically constrain the student into correct positions. But when the student leaves the club, that physical reference is gone.

**Par 3 digitizes that calibration so the student carries their personalized reference in their phone.**

## Current Phase

We are building the **MVP** — a working web application (PWA) that covers the complete instructor-calibration to student-practice loop.

---

## THE PRODUCT

### Two Users, One Flow

**The Instructor (Steve)** uses Par 3 on his iPad at the club to:
1. Create student profiles
2. Record calibration sessions per technique/checkpoint
3. Mark the good moments during recording
4. Build a personalized journey for each student

**The Student** uses Par 3 on their phone at the range to:
1. See their journey with checkpoints created by their instructor
2. Use Smart Mirror to check their address posture in real-time
3. Record practice videos and compare against their personal baseline
4. Track improvement over time

---

## DETAILED FLOWS

### Flow 1: Instructor Creates Student Profile

1. Instructor opens Par 3 on iPad
2. Taps "Nuevo Alumno"
3. Enters: name, email (optional), basic info
4. Student profile is created with an empty journey
5. Instructor can now start calibrating

**UI:** Simple list of students. Tap to select. Plus button to add new. No complex forms.

### Flow 2: Instructor Calibration Session

This is the core flow. The instructor works with the student (usually on the calibration machine or at the range) and records their technique checkpoint by checkpoint.

**Step 1: Select student and create checkpoint**
1. Instructor selects the student from the list
2. Sees the student's journey (list of existing checkpoints, or empty)
3. Taps "Nuevo Checkpoint"
4. Names it (e.g., "Address de frente", "Backswing de perfil", "Postura sentado")
5. Selects camera angle: "De frente" (face-on) or "De perfil" (down-the-line)

**Step 2: Record with live MediaPipe**
1. Camera activates with MediaPipe skeleton overlay running in real-time
2. The instructor sees the student's body with landmarks drawn on screen
3. The student performs swings while the instructor observes
4. Recording is continuous but SHORT — typically 2-5 minutes per checkpoint
5. NOT one-hour continuous recordings. One recording per technique/checkpoint.

**Step 3: Mark the good moments**
1. While recording, the instructor watches the student
2. When they see a swing or position that is CORRECT for this student, they tap a green "Bien" button
3. Each tap captures the landmarks from the surrounding ~3 seconds (the swing that just happened)
4. The instructor can tap "Bien" multiple times during the recording (e.g., 3-5 good swings)
5. Everything NOT marked is simply ignored for baseline purposes

**Step 4: Save checkpoint**
1. Instructor taps "Stop Recording"
2. The app processes the marked moments and calculates the baseline:
   - Averages the landmark angles from all "Bien" marks
   - Calculates the acceptable range (mean plus/minus standard deviation) per metric
3. Shows a summary: "3 good moments captured. Baseline: spine 28-32 degrees, knees 155-162 degrees..."
4. Instructor can optionally add a text note: "Focus on keeping spine angle constant"
5. Taps "Save" — checkpoint is added to the student's journey

**Step 5: Repeat for next technique**
1. Instructor goes back to the student's journey
2. Now shows: "1. Address de frente (calibrated)"
3. Can add "2. Address de perfil", "3. Backswing de perfil", etc.
4. Each checkpoint = one short recording with its own baseline
5. The journey grows organically over one or multiple lessons

### Flow 3: Student Views Their Journey

1. Student opens Par 3 on their phone
2. Logs in with access code provided by instructor
3. Sees their journey: a list of checkpoints created by their instructor
   - 1. Address de frente (calibrated)
   - 2. Address de perfil (calibrated)
   - 3. Backswing de perfil (calibrated)
   - 4. Downswing (pending — next class)
4. Each checkpoint shows:
   - Name and camera angle
   - Reference video clip from calibration (can rewatch)
   - Instructor's note if any
   - "Practicar" button to start comparing
5. Student taps a checkpoint to practice it

### Flow 4: Student Practice — Smart Mirror (Real-Time)

For static posture checks (address position) before swinging.

1. Student selects a checkpoint (e.g., "Address de frente")
2. Taps "Smart Mirror"
3. Camera activates with MediaPipe overlay
4. The app compares their current posture against THEIR personal baseline for this checkpoint
5. Shows colored lines:
   - Green: Within their baseline range
   - Yellow: Close to the edge of their range
   - Red: Outside their baseline range
6. Side panel shows each metric with status and deviation
7. Status pill: "Postura correcta" or "2 ajustes necesarios"
8. Student adjusts until everything is green, THEN swings
9. This mode is for pre-swing setup, not swing analysis

### Flow 5: Student Practice — Video Analysis (Post-Recording)

For analyzing the full swing after recording.

1. Student selects a checkpoint (e.g., "Backswing de perfil")
2. Taps "Grabar Practica"
3. Sets up phone on tripod, selects correct camera angle
4. Records their swing (short clip, 5-15 seconds)
5. App processes the video frame-by-frame through MediaPipe
6. Shows results compared against THEIR personal baseline:
   - Skeleton overlay on the video with colored lines
   - Per-metric comparison with deviation from baseline
   - Overall assessment: which metrics were good, which need work
7. Recommendation from the copilot (2-3 sentences, positive framing)
8. Student can record multiple attempts and see improvement
9. Practice sessions are saved for history

### Flow 6: Student Practice History (Simple)

1. Student can see a list of past practice sessions per checkpoint
2. Each session shows: date, which metrics were good/bad, deviation from baseline
3. Simple trend: "Your spine consistency improved from 60% to 82% over 3 sessions"
4. Minimal for MVP — no fancy charts, just a list with key metrics

---

## DATA MODEL

### Instructor
- id (uuid, primary key)
- name (text)
- email (text, unique)
- created_at (timestamp)

### Student
- id (uuid, primary key)
- instructor_id (uuid, foreign key to instructor)
- name (text)
- email (text, optional)
- access_code (text, 6-digit code, unique)
- created_at (timestamp)

### Checkpoint
- id (uuid, primary key)
- student_id (uuid, foreign key to student)
- name (text, e.g., "Address de frente")
- camera_angle (text, "face_on" or "dtl")
- display_order (integer, position in journey)
- instructor_note (text, optional)
- calibration_video_url (text, Supabase Storage URL)
- calibration_marks (jsonb, array of mark objects)
- baseline (jsonb, calculated metrics with mean/min/max/std)
- status (text, "calibrated" or "pending")
- created_at (timestamp)

### calibration_marks JSON structure
```json
[
  {
    "timestamp_ms": 32000,
    "landmarks": [{"x": 0.5, "y": 0.3, "z": -0.1, "visibility": 0.99}, ...],
    "metrics": {
      "spine_angle": 29.5,
      "head_lateral": 0.012,
      "knee_flex": 158,
      "arm_angle": 172,
      "shoulder_level": 0.008
    }
  }
]
```

### baseline JSON structure
```json
{
  "spine_angle": { "mean": 29.5, "min": 28, "max": 32, "std": 1.5 },
  "head_lateral": { "mean": 0.015, "min": 0.008, "max": 0.025, "std": 0.006 },
  "knee_flex": { "mean": 158, "min": 155, "max": 162, "std": 2.8 },
  "arm_angle": { "mean": 172, "min": 168, "max": 176, "std": 3.2 },
  "shoulder_level": { "mean": 0.01, "min": 0.005, "max": 0.018, "std": 0.005 }
}
```

### PracticeSession
- id (uuid, primary key)
- student_id (uuid, foreign key to student)
- checkpoint_id (uuid, foreign key to checkpoint)
- video_url (text, optional)
- date (timestamp)
- duration_seconds (integer)
- results (jsonb, per-metric comparison against baseline)
- overall_score (integer, percentage of metrics within baseline)
- created_at (timestamp)

### results JSON structure
```json
{
  "spine_angle": { "value": 35, "deviation": 5.5, "status": "bad" },
  "head_lateral": { "value": 0.018, "deviation": 0.003, "status": "ok" },
  "knee_flex": { "value": 160, "deviation": 2, "status": "ok" },
  "arm_angle": { "value": 165, "deviation": 7, "status": "warn" },
  "shoulder_level": { "value": 0.012, "deviation": 0.002, "status": "ok" }
}
```

---

## TECHNICAL ARCHITECTURE

### Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Frontend | HTML + CSS + Vanilla JS | MVP speed, no build step, runs everywhere |
| Pose Detection | MediaPipe Pose via CDN | 33 landmarks, on-device, free, no server |
| Backend | Supabase | Auth, PostgreSQL, file storage, free tier |
| Hosting | Vercel or Netlify | Static hosting with HTTPS (required for camera) |
| PWA | Service Worker + Manifest | Installable on iPad and phone home screen |

### Why Supabase

Instructor and student use different devices. The instructor calibrates on iPad, the student practices on phone. The baseline data must be shared. Supabase gives us auth, database, and file storage in one service with a generous free tier.

### MediaPipe Integration

CDN imports (no npm needed):
- @mediapipe/camera_utils
- @mediapipe/drawing_utils
- @mediapipe/pose

Key landmarks used:
- Nose (0): Head position tracking
- Ears (7, 8): Head tilt
- Shoulders (11, 12): Spine angle top, shoulder level
- Elbows (13, 14): Arm angle
- Wrists (15, 16): Arm extension
- Hips (23, 24): Spine angle bottom
- Knees (25, 26): Knee flex
- Ankles (27, 28): Base stability

### Analysis per camera angle

**Face-on (de frente) detects:**
- Head lateral displacement: Nose(0) vs Midpoint of Hips(23,24). Horizontal distance normalized.
- Shoulder level: Shoulder_L(11).y vs Shoulder_R(12).y. Vertical distance normalized.
- Arm position: Average angle of Shoulder to Elbow to Wrist chains for both arms.

**Down-the-line (de perfil) detects:**
- Spine inclination: Angle of line from Midpoint(Shoulders) to Midpoint(Hips) vs vertical.
- Knee flex: Average angle of Hip to Knee to Ankle chains for both legs.
- Head forward position: Nose(0) horizontal distance vs Midpoint(Shoulders).

### Baseline comparison logic

For each metric during practice:
- Calculate deviation = absolute value of (current_value minus baseline.mean)
- If deviation is within 1.0 standard deviations: status is "ok" (green)
- If deviation is within 2.0 standard deviations: status is "warn" (yellow)
- If deviation is beyond 2.0 standard deviations: status is "bad" (red)

If baseline has very low standard deviation (instructor marked very consistent positions), the ranges will be tight. If there is more variance in the marks, the ranges will be wider. This is self-calibrating.

### Smoothing
- Real-time mode (Smart Mirror and Calibration): 6-frame smoothing buffer
- Video analysis mode: No smoothing, process each frame independently

### "Bien" button capture logic

When instructor taps "Bien":
1. Capture landmark data from the last 3 seconds (~30 frames at 10fps)
2. Average those frames into a single landmark set for this mark
3. Calculate all metrics for this averaged set
4. Store as one entry in calibration_marks array
5. Show brief green flash confirmation on screen
6. Increment mark counter display

### Baseline calculation on save

1. Take all marks from calibration_marks array
2. For each metric: compute mean, min, max, standard deviation
3. Acceptable range = mean plus/minus (std times 1.5), or (min minus padding) to (max plus padding), whichever is wider
4. Use conservative padding: better to accept slightly off positions than reject correct ones

### File Structure

```
par3/
├── index.html              — Entry point, routes to instructor or student view
├── css/
│   └── styles.css          — All styles (dark theme, responsive)
├── js/
│   ├── app.js              — Navigation, routing, shared state
│   ├── mediapipe.js        — Pose detection, analysis, skeleton drawing
│   ├── calibration.js      — Instructor calibration flow
│   ├── mirror.js           — Student smart mirror
│   ├── video-analysis.js   — Student video recording and analysis
│   ├── baseline.js         — Baseline calculation and comparison
│   └── supabase.js         — Supabase client, auth, CRUD
├── manifest.json           — PWA manifest
├── sw.js                   — Service worker for caching
└── CLAUDE.md               — This file
```

### Supabase Setup

Tables: instructors, students, checkpoints, practice_sessions (as defined in data model above).

Storage buckets: calibration-videos, practice-videos.

Auth strategy for MVP:
- Instructor: email + password via Supabase auth
- Student: 6-digit access code generated by instructor, stored in students table. Student enters code to log in. No email required, minimal friction.

Row Level Security: Instructor reads/writes their own students and checkpoints. Student reads their own checkpoints and writes their own practice sessions.

---

## DESIGN SYSTEM

### Brand
- Name: **par3** (lowercase)
- Domain: **par3.app**
- The "3" is always rendered in the green accent color
- Tagline: "Tu copiloto de practica"

### Colors (Dark Theme)
- Background: #060a08
- Surface: #0e1410
- Surface elevated: #141c17
- Surface hover: #1a241e
- Border: #1e2b23
- Border light: #2a3830
- Text primary: #e4ebe6
- Text secondary: #a3b5a8
- Text muted: #5e7464
- Green (ok/brand): #34d178
- Red (bad): #f04848
- Yellow (warn): #e8b930
- Blue (info/analysis): #6888ff

### Typography
- Primary: DM Sans (Google Fonts CDN)
- Monospace: JetBrains Mono (Google Fonts CDN)

### UI Principles
- Dark, minimal, professional sports tech aesthetic
- Touch-friendly: large tap targets for iPad during lessons
- The "Bien" button must be LARGE (at least 80x80px), fixed at bottom of screen
- Spanish copy throughout
- Responsive: iPad (instructor) and phone (student)
- No unnecessary animations — performance matters during live analysis

---

## ANALYSIS RULES DETAIL

### Face-on View (de frente)

**Head Lateral Displacement**
- Landmarks: Nose(0) vs Midpoint(Hip_L(23), Hip_R(24))
- Metric: Horizontal distance in normalized coordinate space
- During calibration: Capture actual value when instructor marks good
- During practice: Compare against calibrated baseline range

**Shoulder Level**
- Landmarks: Shoulder_L(11).y vs Shoulder_R(12).y
- Metric: Vertical distance normalized
- Note: Some tilt is normal. Baseline captures what is correct for THIS student.

**Arm Position**
- Landmarks: Shoulder(11,12) to Elbow(13,14) to Wrist(15,16)
- Metric: Average arm angle in degrees
- Note: Depends on player build. Baseline is personal.

### Down-the-Line View (de perfil)

**Spine Inclination**
- Landmarks: Midpoint(Shoulders 11,12) to Midpoint(Hips 23,24)
- Metric: Angle of this line vs vertical, in degrees
- Most critical metric for beginners.

**Knee Flex**
- Landmarks: Hip(23,24) to Knee(25,26) to Ankle(27,28)
- Metric: Average knee angle in degrees

**Head Forward Position**
- Landmarks: Nose(0) vs Midpoint(Shoulders 11,12)
- Metric: Horizontal distance normalized

### What MediaPipe CANNOT detect (do not attempt)
- Grip (fingers occluded)
- Club position or path (tracks body not objects)
- Swing tempo
- Wrist angles (insufficient precision)
- Impact quality
- Weight distribution

---

## FEEDBACK LANGUAGE

All in Spanish. Always positive framing. One correction at a time.

Good patterns:
- "Tu columna esta 3 grados mas erguida que tu referencia. Inclinate un poco mas desde las caderas."
- "Cabeza centrada, igual que en tu calibracion. Bien!"
- "Tus rodillas estan un poco mas flexionadas de lo habitual. Endereza ligeramente."

Bad patterns (never use):
- English text in UI
- Negative framing ("Your posture is wrong")
- Multiple corrections at once ("Error in 4 metrics")
- Raw technical values ("Spine angle: 35.2 degrees, expected: 29.1 plus/minus 2.3")

Copilot summary pattern (after video analysis):
- Start with what was good
- Then ONE thing that needs work (the most important)
- Then actionable advice
- Example: "Tu postura general se ve bien, la flexion de rodillas y posicion de cabeza estan dentro de tu rango. La columna esta un poco mas erguida que tu referencia. Antes de cada swing, enfocate en inclinar mas desde las caderas hasta sentir la misma posicion que en la maquina."

---

## MVP SCOPE

### Must have
- Instructor login (email + password via Supabase)
- Student list (create, view, select)
- Student access via 6-digit code
- Checkpoint creation with name and camera angle
- Calibration recording with live MediaPipe overlay
- "Bien" button during recording that captures landmark data
- Baseline calculation from marked moments
- Student journey view (list of calibrated checkpoints)
- Smart Mirror mode (real-time comparison against baseline)
- Video recording and analysis (post-recording comparison)
- Results display with per-metric comparison and copilot summary
- Practice session history (simple list per checkpoint)
- PWA installable on home screen
- Responsive for iPad and phone

### Nice to have
- Instructor can rewatch calibration video with marks highlighted
- Student can see reference clip alongside practice video
- Instructor note per checkpoint
- Simple trend visualization for practice sessions
- Instructor can see student practice history

### NOT in MVP
- Journey phases or drag-and-drop
- Reminders or notifications
- Gamification or streaks
- Voice notes
- AI class recaps
- Marketplace
- Payments or Stripe
- Multi-club support
- Simultaneous dual-camera recording

---

## IMPLEMENTATION NOTES

### Camera and Recording on Web
- Use navigator.mediaDevices.getUserMedia() for camera access
- Requires HTTPS (use Vercel/Netlify for hosting, localhost for dev)
- Use MediaRecorder API to save video clips
- Process MediaPipe in parallel with recording
- iPad Safari works well for camera in PWA mode

### Video Storage
- Calibration videos: Always upload to Supabase Storage
- Practice videos: Upload to Supabase Storage for history
- Compress to 720p (sufficient for MediaPipe)

### Performance
- MediaPipe Pose with modelComplexity: 1
- Process at 10-15 fps for smooth overlay
- Use requestAnimationFrame for rendering
- The "Bien" button must respond instantly, no debounce

### The "Bien" Button UX
- At least 80x80px, fixed bottom of screen
- Green color, high contrast against dark camera feed
- On tap: green flash/pulse confirmation animation
- Counter showing marks: "3 marcas"
- Must not block view of the student on screen

---

## DEVELOPMENT ORDER

1. Set up Supabase: project, tables, storage buckets, auth
2. Build instructor flow: login, student list, create checkpoint, calibration recording with "Bien" marks, save baseline
3. Build student flow: login with code, journey view, smart mirror, video analysis, results
4. Add PWA: manifest, service worker, responsive design
5. Polish: loading states, error handling, edge cases
6. Test with real users: instructor calibrates a real student, student practices at range

---

## KEY DECISIONS (DO NOT VIOLATE)

1. The instructor is always right. We complement, never contradict.
2. Better no feedback than wrong feedback. Conservative thresholds.
3. Baselines are personal. No universal correct angles. Every student has their own.
4. One correction at a time. Never overwhelm the student.
5. Positive framing always. "Try to maintain..." not "You are losing..."
6. Short recordings per checkpoint. 2-5 minutes max, not hour-long sessions.
7. The "Bien" button is sacred. Easiest interaction in the app.
8. Spanish UI. English code comments and variable names.
9. MVP means MVP. No feature creep. Working end-to-end, then iterate.
10. Browser-first PWA. No app store for MVP.