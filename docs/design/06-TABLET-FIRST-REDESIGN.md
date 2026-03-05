# Golf Copilot — Tablet-First Layout Redesign

## Context

The app runs on three device types with different roles:

| Device | Primary User | Purpose |
|--------|-------------|---------|
| iPad / Tablet | Instructor (during lessons) + Student (at range) | Recording, calibration, smart mirror, swing analysis |
| Desktop / Laptop | Instructor (at desk) | Journey builder, student dashboard, progress review |
| Phone (mobile) | Student (away from range) | View journey, read notes, watch replays, see summaries |

The current layout is mobile-first with max-w-4xl containers, which wastes significant screen space on iPad (1024px landscape) and desktop. The redesign should be tablet-first for the primary experience.

## Design Principles

1. **Tablet-first, responsive up and down.** Design for iPad landscape (1024px) as the primary breakpoint. Scale up for desktop, scale down for phone.
2. **No wasted space on iPad.** Content should use the full available width on tablet. No narrow centered columns with empty margins.
3. **Touch-friendly always.** Minimum 48px touch targets. The instructor uses this with fingers, not a mouse.
4. **Split-view patterns on tablet+desktop.** Video on one side, controls/notes on the other. List on left, detail on right. Never stack everything vertically on large screens.
5. **Phone is consumption-only.** Simpler layout, read-focused. No recording, no mirror, no analysis. Journey view, notes, replays, summaries.

## Specific Layout Changes

### Global Container
- Remove all `max-w-4xl` and `max-w-lg` constraints from primary pages
- Use `max-w-7xl mx-auto px-4 md:px-6 lg:px-8` as the default page container
- Forms can keep `max-w-2xl` (they don't need to be wide)

### Instructor Dashboard (`/instructor/dashboard`)
- Current: `max-w-4xl`, student cards in `lg:grid-cols-2`
- Target: `max-w-7xl`, student cards in `md:grid-cols-2 lg:grid-cols-3`
- Add quick-action bar at top (today's students, quick record button)

### Student Profile (`/instructor/students/[id]`)
- Current: narrow single column
- Target: two-column layout on tablet+. Left column: student info, journey progress. Right column: recent checkpoints, practice history.

### Checkpoint Detail (`/instructor/students/[id]/checkpoints/[checkpointId]`)
- Already at `max-w-6xl` with `lg:` breakpoints — good
- Ensure video player uses available width, not a fixed small size

### Calibration (`/instructor/.../calibrate`)
- This is the most important screen for tablet. Camera viewfinder should be large.
- Two-column on tablet: camera feed (70% width) + controls panel (30% width)
- Controls panel: student name, exercise config, screenshot button, notes
- Camera feed must feel like a professional recording tool, not a phone camera

### Student Mirror (`/student/checkpoint/[id]/mirror`)
- This runs on iPad at the range. THE most critical screen for tablet.
- Camera feed should be FULL WIDTH on tablet. Semaphore indicators must be large enough to see at 2-3 meters.
- Traffic light indicators: minimum 64px diameter on tablet, bright colors with high contrast
- Landmark overlay lines: minimum 4px stroke width
- Consider a "kiosk mode" that hides all UI chrome (header, nav) and shows only the mirror + semaphore

### Student Practice/Analysis (`/student/checkpoint/[id]/practice`)
- Two-column on tablet: video recording/playback (left 60%) + analysis results (right 40%)
- Analysis results should be scannable: big check/cross icons, short text

### Student Journey (`/student/journey`)
- Phone-optimized is fine here (this is primarily viewed on phone)
- On tablet, use the extra width for richer checkpoint cards (show thumbnail, last score)

### Forms (new student, new checkpoint, edit)
- Keep `max-w-2xl` centered — forms don't benefit from being wide
- But ensure inputs are comfortable size on tablet (not tiny)

## Breakpoint Strategy (Tailwind v4)

Since Tailwind v4 with @theme inline, the default breakpoints apply:
- `sm:` 640px — large phones
- `md:` 768px — iPad portrait, small tablets
- `lg:` 1024px — iPad landscape, desktop
- `xl:` 1280px — large desktop
- `2xl:` 1536px — ultrawide

Primary design target: `lg:` (1024px, iPad landscape)

## Phone Restrictions

On screens below `md:` (768px), hide or disable:
- Mirror mode (show message: "Use an iPad or tablet for mirror mode")
- Recording/camera features
- Keep accessible: journey view, checkpoint details, notes, replays, summaries, history

## PWA Considerations

- The app is already a PWA with manifest.json
- On iPad, prompt users to "Add to Home Screen" for full-screen experience (no Safari chrome)
- Consider adding `"display": "standalone"` to manifest if not already present
- This gives the app a native feel on iPad without any app store friction