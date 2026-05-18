# parell.golf — Technical Architecture

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Frontend | Next.js 15 (App Router) + TypeScript | Already built, PWA installable on iPad and phone |
| Styles | Tailwind CSS v4 + shadcn/ui | Already built, consistent design system |
| Pose Estimation | MediaPipe Pose (CDN, on-device) | 33 landmarks, runs on device, free, no server cost |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) | Already built, handles auth, storage, RLS |
| Hosting | Vercel | Already deployed |
| LLM | Anthropic Claude API | Feedback generation, summaries |
| Audio Transcription | Whisper API | Transcribe instructor audio annotations |
| Email | Resend | Already configured |
| i18n | next-intl | To be implemented — mandatory from day 1 |
| Payments | Stripe | To be implemented in Phase 2 |

Note: The original architecture doc proposed React Native (Expo). The product is built as Next.js PWA instead. The PWA approach is correct — no app store friction, instant updates, installable on iPad and phone home screen.

## Data Model

The central unit is the **Clip**, grouped in **Classes** (auto-created, 24h threshold), within a **Student** profile belonging to an **Instructor**.

### Core Schema

```
Instructor
└── Student
    └── Class (auto-created when 24h+ since last clip for this student)
        └── Clip
            ├── video_url (Supabase Storage)
            ├── skeleton_url (optional — skeleton overlay video)
            ├── clip_type: 'position' | 'swing'
            ├── camera_angle: 'face_on' | 'dtl'
            ├── baseline (JSONB — calculated from all frames)
            ├── baseline_summary (text — LLM generated)
            ├── selected_metrics (text[])
            ├── status: 'pending' | 'calibrated' | 'archived'
            ├── ClipFrames[] ← ALL frames, ALL landmarks (for ML)
            ├── ClipAnnotations[] ← instructor drawings + audio
            └── PracticeSessions[]
                └── SessionFrames[] ← ALL frames, ALL landmarks (for ML)
```

### Tables

```sql
-- Auto-grouped classes (24h threshold)
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES instructors(id),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Core recording unit
CREATE TABLE clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id),
  instructor_id UUID REFERENCES instructors(id),
  name TEXT NOT NULL,
  camera_angle TEXT NOT NULL CHECK (camera_angle IN ('face_on', 'dtl')),
  clip_type TEXT NOT NULL DEFAULT 'position' CHECK (clip_type IN ('position', 'swing')),
  display_order INTEGER DEFAULT 0,
  video_url TEXT,
  skeleton_url TEXT,
  baseline JSONB,
  baseline_summary TEXT,
  selected_metrics TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'calibrated', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ALL frames, ALL landmarks — never filtered, never sampled
CREATE TABLE clip_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  landmarks JSONB NOT NULL,  -- array of 33: [{x, y, z, visibility}]
  metrics JSONB,             -- calculated metrics for this frame
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_clip_frames_clip ON clip_frames(clip_id, frame_index);

-- Instructor annotations: vectorial, not rasterized
CREATE TABLE clip_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  frame_timestamp_ms INTEGER NOT NULL,
  strokes JSONB NOT NULL DEFAULT '[]',
  -- strokes: [{type: "arrow"|"line"|"circle", color, points: [[x,y],...], label?}]
  -- points are normalized 0-1 coordinates (resolution-independent)
  audio_url TEXT,
  audio_transcript TEXT,  -- Whisper transcription for ML labeling
  text_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student practice attempts
CREATE TABLE practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES clips(id),
  student_id UUID REFERENCES students(id),
  date TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  overall_score INTEGER,  -- % of metrics within baseline
  results JSONB,          -- per-metric comparison
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ALL frames, ALL landmarks from student attempts — for ML
CREATE TABLE session_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES practice_sessions(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  landmarks JSONB NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_session_frames_session ON session_frames(session_id, frame_index);
```

### Auto-class creation logic

```typescript
// lib/classes.ts
export async function getOrCreateTodayClass(
  studentId: string,
  instructorId: string
): Promise<Class> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: existing } = await supabase
    .from('classes')
    .select('*')
    .eq('student_id', studentId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return existing

  const { data: newClass } = await supabase
    .from('classes')
    .insert({
      student_id: studentId,
      instructor_id: instructorId,
      date: new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  return newClass
}
```

### Annotation schema (vectorial)

```json
{
  "frame_timestamp_ms": 2340,
  "strokes": [
    {
      "type": "arrow",
      "color": "#ef4444",
      "points": [[0.42, 0.31], [0.38, 0.55]],
      "label": "columna"
    },
    {
      "type": "circle",
      "color": "#f59e0b",
      "center": [0.55, 0.48],
      "radius": 0.06
    }
  ],
  "audio_url": "https://...",
  "audio_transcript": "Fijate cómo la columna está más erguida de lo ideal...",
  "text_note": null
}
```

Annotations are stored as vectors (not rasterized images) so they can be:
- Scaled to any resolution
- Processed automatically for ML feature extraction
- Overlaid on video at any size

## MediaPipe Pose Detection

### Overview
33 body landmarks per frame, normalized coordinates (0-1). Runs on-device — video never leaves the device. Minimum visibility threshold: 0.65. Below that, the landmark is ignored, never invented.

### Landmarks Used

- **Nose (0):** Head position tracking
- **Ears (7, 8):** Head tilt
- **Shoulders (11, 12):** Spine angle top, shoulder level
- **Elbows (13, 14):** Arm angle
- **Wrists (15, 16):** Arm extension, swing phase detection
- **Hips (23, 24):** Spine angle base, hip rotation
- **Knees (25, 26):** Knee flex
- **Ankles (27, 28):** Stance width, base stability

### Metrics by Camera Angle

**Face-on (face_on):**
- `head_lateral`: nose X vs hip midpoint X
- `arm_angle`: shoulder-elbow-wrist angle, both arms averaged
- `shoulder_level`: vertical difference between shoulders
- `hip_sway`: hip midpoint X vs ankle midpoint X
- `stance_width`: ankle width / shoulder width ratio
- `weight_shift`: shoulder midpoint X vs ankle midpoint X

**Down-the-line (dtl):**
- `spine_angle`: torso angle vs vertical (shoulder midpoint → hip midpoint)
- `knee_flex`: hip-knee-ankle angle, both legs averaged
- `head_forward`: nose X vs shoulder midpoint X
- `hip_hinge`: shoulder-hip-knee angle
- `trail_arm`: shoulder-elbow-wrist of the trail arm
- `head_height`: nose Y vs hip midpoint Y

### Analysis Modes

**Position (static):** Baseline computed from all frames of the clip. Comparison is frame-by-frame in real time (mirror) or post-recording (practice).

**Swing (dynamic):** Wrist Y trajectory used to detect 4 phases (address, top, impact, finish). Baseline and comparison are per-phase.

### Comparison Thresholds

- ≤ 1 std from mean: green (OK)
- 1–2 std: yellow (adjust)
- > 2 std: red (correct)

### What MediaPipe Cannot Detect

Grip, club position, swing tempo, wrist angles, impact quality, actual weight distribution. Do not attempt to infer these.

## Key Technical Decisions

### Recording in the App
The app IS the recording tool. Clean video, no overlay during recording. Instructor records directly in parell.golf — video is automatically linked to the student and auto-class. No file transfer, no manual upload.

### On-Device Processing
MediaPipe runs on-device for:
- Privacy: video never leaves phone during analysis
- Speed: real-time feedback with no network latency
- Cost: no GPU server costs for pose estimation
- Offline capability: ranges may have poor connectivity

### Save Everything
ALL frames, ALL landmarks, ALL clips, ALL practice sessions. Not just the "good" ones. Not sampled. This is the raw material for the future proprietary model. Storage is cheap. Lost data is gone forever.

### Annotations as Vectors
Instructor drawings are stored as normalized coordinate JSON, not as images. This allows:
- Resolution-independent rendering at any screen size
- Automatic feature extraction for ML (which body part was annotated, direction of arrows)
- Re-rendering over updated video frames

### Video Storage
- Clip videos (instructor): always uploaded, private (signed URLs only)
- Practice videos (student): always uploaded, private
- Skeleton overlay videos: optional, uploaded when generated
- Storage buckets: `clip-videos`, `clip-annotations-audio`, `practice-videos`
- Compression: 720p sufficient for MediaPipe landmark detection

### i18n
next-intl, mandatory from day 1. All user-visible strings in `/messages/es.json` and `/messages/en.json`. Language auto-detected from browser. Fallback: Spanish. Feedback strings to students must be in the student's language, not the instructor's.

### PWA
Installable on iPad home screen (instructor) and phone home screen (student). Service worker for offline support of core flows.
