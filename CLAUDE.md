# Par 3 — CLAUDE.md

## What is this project

Par 3 (par3.app) is a digital copilot for golf teaching professionals. It digitizes the instructor's teaching method, automates follow-up between lessons, and uses AI (MediaPipe pose estimation) to guide students' practice when the instructor isn't present.

**Core positioning:** The instructor is the client, the student is the end user, the club pays. We complement the instructor, never compete.

## Current phase

We are building a **Proof of Concept** to validate that MediaPipe pose estimation works well enough for beginner golf posture analysis. This is the technical spike before building the full app.

## The PoC — What we're building now

A web app (HTML + JS, no framework) with two modes:

### Mode 1: Smart Mirror (real-time)
- Opens webcam via browser
- MediaPipe Pose draws colored skeleton overlay on the live video
- Analyzes 4 posture checkpoints (depends on camera angle selected):
  - **Face-on view:** head position, arm position, shoulder level
  - **Down-the-line view:** spine inclination, knee flex, head position
- Side panel shows check results (ok/warn/bad) with messages in Spanish
- Tip box shows the most important correction
- Status pill on video shows overall posture status

### Mode 2: Video Analysis (post-recording)
- User uploads a video file OR records from camera
- App processes video frame-by-frame (10fps sampling) through MediaPipe
- Shows processing progress bar
- After analysis: plays video with skeleton overlay + shows aggregated results
- Side panel shows recommendations per checkpoint + copilot summary
- Video player with play/pause, seek, and "new video" reset

### Welcome screen
- Brand: par3 (the "3" is green accent color)
- Tagline: "Tu copiloto de practica"
- Two cards to select mode (Smart Mirror / Video Analysis)
- Footer: "par3.app — MediaPipe Pose Detection para postura de principiantes"

## Tech stack for PoC

- Pure HTML + CSS + vanilla JS (no framework)
- MediaPipe Pose via CDN: @mediapipe/pose, @mediapipe/camera_utils, @mediapipe/drawing_utils
- Google Fonts: DM Sans (UI) + JetBrains Mono (labels/badges)
- Serve locally with `npx serve .`

## Design system

Dark theme, golf-inspired green accent:
- Background: #060a08
- Surface: #0e1410, #141c17, #1a241e
- Border: #1e2b23
- Text: #e4ebe6 (primary), #a3b5a8 (secondary), #5e7464 (muted)
- Green (ok): #34d178
- Red (bad): #f04848
- Yellow (warn): #e8b930
- Blue (analysis mode accent): #6888ff

UI is clean, minimal, pro. Not flashy. Think high-end sports tech, not generic AI app.

## MediaPipe analysis rules

### Face-on view checks:
1. **Head position:** nose landmark lateral displacement vs hip midpoint. Threshold: 0.03 normalized units
2. **Arm position:** average arm angle (shoulder-elbow-wrist). Good range: 155-185 degrees
3. **Shoulder level:** vertical difference between left/right shoulder. Threshold: 0.025

### Down-the-line view checks:
1. **Spine inclination:** angle of shoulder-midpoint to hip-midpoint line vs vertical. Good range: 20-50 degrees
2. **Knee flex:** average hip-knee-ankle angle. Good range: 135-175 degrees
3. **Head position:** nose forward displacement vs shoulder midpoint. Threshold: 0.08

### Key landmarks used:
- Nose (0), Ears (7,8)
- Shoulders (11,12), Elbows (13,14), Wrists (15,16)
- Hips (23,24), Knees (25,26), Ankles (27,28)

### Analysis principles:
- Smoothing buffer of 6 frames for real-time mode
- No smoothing for video analysis mode
- Conservative thresholds: better no feedback than wrong feedback
- Status levels: ok (green), warn (yellow), bad (red), off (inactive/wrong view)
- All feedback messages in Spanish

## File structure

```
par3/
  index.html    — All HTML + CSS
  engine.js     — All JavaScript (navigation, pose analysis, mirror, video analysis)
  CLAUDE.md     — This file
```

## Future stack (for reference, NOT for now)

When we move past the PoC to the full app:
- Mobile: React Native (Expo)
- Backend: Supabase (PostgreSQL + Auth + Storage + Realtime)
- Payments: Stripe
- AI/LLM: Claude API for class summaries
- Web admin: Next.js on Vercel

## Brand

- Name: **par3**
- Domain: **par3.app**
- Logo: stylized golfer icon (circle head + vertical body + V-shaped legs)
- The "3" in par3 is always the green accent color (#34d178)

## Key decisions (do not violate)

1. The instructor is always right. We complement, never contradict.
2. Better no feedback than wrong feedback. Conservative AI.
3. B2B first: club pays, student gets free access.
4. The app IS the recording tool (replaces, doesn't add).
5. Progression-based gamification only. No leaderboards, no competition.
6. One correction at a time for beginners.
7. Positive framing: "Try to maintain..." not "You are losing..."
8. MediaPipe heuristics first, ML later (dataset is the moat).

## Language

- UI copy is in **Spanish** (target market: Spain, starting in Catalonia)
- Code comments in English
- Variable names in English

## What NOT to build (yet)

- No login/auth
- No backend/database
- No Supabase integration
- No journey system
- No instructor dashboard
- No notifications
- No gamification
- Just the two analysis modes working correctly with MediaPipe