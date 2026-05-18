'use client'

// Section 4 step 2: review and annotate.
//
// Reads the recorded clip from the layout context, lets the instructor scrub
// the video, pause at meaningful moments, and overlay AnnotationCanvas to
// draw + record audio + jot a note. Each saved annotation is anchored at the
// pause-time of the video.
//
// Save flow is wired in the next commit; this page renders the UI and
// collects the AnnotationDraft state.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AnnotationCanvas, type AnnotationDraft } from '@/components/AnnotationCanvas'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getOrCreateTodayClass } from '@/lib/classes'
import { processClip, type ProcessedFrame } from '@/lib/processClip'
import { insertClipFrames } from '@/lib/frames'
import {
  METRICS_BY_ANGLE,
  calculateBaseline,
  calculateSwingBaseline,
  detectSwingPhases,
} from '@/lib/baseline'
import type { CalibrationMark } from '@/lib/types'
import { useClipFlow } from '../layout'

type CameraAngle = 'face_on' | 'dtl'
type ClipType = 'position' | 'swing'

interface DraftAnnotation extends AnnotationDraft {
  // Local-only fields; the persisted shape (clip_annotations rows) is built
  // from these at save time in the next commit.
  id: string
  frame_timestamp_ms: number
}

const PLAYBACK_SPEEDS = [1, 0.5, 0.25] as const
type Speed = (typeof PLAYBACK_SPEEDS)[number]

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const tenths = Math.floor((ms % 1000) / 100)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${tenths}`
}

type SaveStage = 'idle' | 'upload' | 'insert' | 'frames' | 'baseline'

export default function ClipAnnotatePage() {
  const t = useTranslations('instructor.clips.annotate')
  const params = useParams()
  const router = useRouter()
  const studentId = params.id as string
  const { instructor } = useAuth()

  const { recorded, getVideoUrl, reset } = useClipFlow()

  const [saveStage, setSaveStage] = useState<SaveStage>('idle')
  const [framesPct, setFramesPct] = useState(0)

  // ---- Guard: no recording → bounce back to /record ---------------
  useEffect(() => {
    if (!recorded) {
      router.replace(`/instructor/students/${studentId}/clips/new/record`)
    }
  }, [recorded, router, studentId])

  const videoUrl = recorded ? getVideoUrl() : null

  // ---- Video element state ----------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoStageRef = useRef<HTMLDivElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(1)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)

  // ---- Clip metadata + annotations local state --------------------
  const [name, setName] = useState('')
  const [angle, setAngle] = useState<CameraAngle>('face_on')
  const [clipType, setClipType] = useState<ClipType>('position')
  const [annotations, setAnnotations] = useState<DraftAnnotation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)

  // Keep <video>.playbackRate in sync.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  // ---- Video event handlers ---------------------------------------

  const onLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration * 1000)
  }

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime * 1000)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const onPlay = () => setPlaying(true)
  const onPause = () => setPlaying(false)
  const onEnded = () => setPlaying(false)

  const seek = (ms: number) => {
    const v = videoRef.current
    if (!v) return
    const clamped = Math.max(0, Math.min(duration, ms))
    v.currentTime = clamped / 1000
    setCurrentTime(clamped)
  }

  // ---- Annotate button --------------------------------------------

  const openCanvas = () => {
    const stage = videoStageRef.current
    const v = videoRef.current
    if (!stage || !v) return
    // The canvas must match the displayed video pixel-for-pixel so saved
    // strokes anchor correctly when the student replays the clip.
    const rect = v.getBoundingClientRect()
    setCanvasSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
    setCanvasOpen(true)
  }

  const handleCanvasSave = (draft: AnnotationDraft) => {
    setAnnotations((prev) => [
      ...prev,
      {
        ...draft,
        id: crypto.randomUUID(),
        frame_timestamp_ms: Math.round(currentTime),
      },
    ])
    setCanvasOpen(false)
  }

  const handleCanvasCancel = () => setCanvasOpen(false)

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }

  const jumpToAnnotation = (a: DraftAnnotation) => {
    seek(a.frame_timestamp_ms)
    const v = videoRef.current
    if (v && !v.paused) v.pause()
  }

  // ---- Save / discard ---------------------------------------------

  const canSave = useMemo(() => name.trim().length > 0 && saveStage === 'idle', [name, saveStage])

  // Persist a single annotation row. Best-effort on each piece — if Whisper
  // is down we still keep the audio file + drawing; if audio upload fails
  // we still keep the strokes + transcript text. Returns void.
  const persistAnnotation = useCallback(
    async (clipId: string, draft: DraftAnnotation): Promise<void> => {
      let audioUrl: string | null = null
      let transcript: string | null = null

      if (draft.audio_blob) {
        const ext = (draft.audio_mime ?? '').includes('mp4') ? 'm4a' : 'webm'
        const path = `${clipId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('clip-annotations-audio')
          .upload(path, draft.audio_blob, {
            contentType: draft.audio_mime || 'audio/webm',
          })
        if (!upErr) {
          audioUrl = supabase.storage.from('clip-annotations-audio').getPublicUrl(path).data.publicUrl
        }

        // Fire-and-forget transcribe. If Whisper is unavailable we just
        // keep the audio without text — the row still persists.
        try {
          const fd = new FormData()
          fd.append('audio', draft.audio_blob, `audio.${ext}`)
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
          if (res.ok) {
            const data = (await res.json()) as { transcript?: string }
            transcript = data.transcript ?? null
          }
        } catch {
          /* leave transcript null */
        }
      }

      await supabase.from('clip_annotations').insert({
        clip_id: clipId,
        frame_timestamp_ms: draft.frame_timestamp_ms,
        strokes: draft.strokes,
        audio_url: audioUrl,
        audio_transcript: transcript,
        text_note: draft.text_note ?? null,
      })
    },
    [],
  )

  // Build the per-clip baseline from MediaPipe frames. Position clips
  // average every frame (the student is meant to be static). Swing clips
  // try to find address/top/impact/finish and build a phase-wise baseline;
  // if phase detection fails we leave the clip in 'pending' so the
  // instructor can retry — rather than persisting a bogus baseline.
  const buildBaseline = useCallback(
    (frames: ProcessedFrame[], selectedMetrics: string[]) => {
      if (frames.length === 0) return null

      const marks: CalibrationMark[] = frames.map((f) => ({
        timestamp_ms: f.timestamp_ms,
        landmarks: f.landmarks,
        metrics: f.metrics,
      }))

      if (clipType === 'position') {
        return calculateBaseline(marks, selectedMetrics)
      }

      // Swing: detect phases from the landmark trajectory.
      const phases = detectSwingPhases(frames.map((f) => f.landmarks), angle)
      if (!phases) return null

      const swingMarks: CalibrationMark[] = [
        { timestamp_ms: 0, landmarks: marks[0].landmarks, metrics: marks[0].metrics, phases },
      ]
      return calculateSwingBaseline(swingMarks, selectedMetrics)
    },
    [angle, clipType],
  )

  const handleSave = async () => {
    if (saveStage !== 'idle') return
    if (!name.trim()) {
      setError(t('missingName'))
      return
    }
    if (!recorded || !instructor) {
      setError(t('missingVideo'))
      return
    }

    setError(null)
    const selectedMetrics = METRICS_BY_ANGLE[angle] ?? []

    try {
      // 1. Class for today (creates one if 24h since the last).
      setSaveStage('upload')
      const cls = await getOrCreateTodayClass(studentId, instructor.id)

      // 2. Upload the video to clip-videos. Path namespaced by student + class
      // so we don't collide and so a single cascading delete cleans up.
      const ext = recorded.mime.includes('webm') ? 'webm' : recorded.mime.includes('mp4') ? 'mp4' : 'bin'
      const videoPath = `${studentId}/${cls.id}/${crypto.randomUUID()}.${ext}`
      const { error: vidErr } = await supabase.storage
        .from('clip-videos')
        .upload(videoPath, recorded.blob, {
          contentType: recorded.mime,
          upsert: false,
        })
      if (vidErr) throw vidErr
      const videoUrl = supabase.storage.from('clip-videos').getPublicUrl(videoPath).data.publicUrl

      // 3. Insert the clip row.
      setSaveStage('insert')
      const { data: clip, error: clipErr } = await supabase
        .from('clips')
        .insert({
          class_id: cls.id,
          student_id: studentId,
          instructor_id: instructor.id,
          name: name.trim(),
          camera_angle: angle,
          clip_type: clipType,
          video_url: videoUrl,
          selected_metrics: selectedMetrics,
          status: 'pending',
        })
        .select()
        .single()
      if (clipErr || !clip) throw clipErr ?? new Error('Failed to insert clip')

      // 4. Persist annotations one by one. Each is best-effort; we don't
      // want a flaky single audio upload to bury the whole clip.
      for (const a of annotations) {
        try {
          await persistAnnotation(clip.id, a)
        } catch {
          /* skip this annotation, keep going */
        }
      }

      // 5. Run MediaPipe over every frame and write to clip_frames.
      setSaveStage('frames')
      setFramesPct(0)
      const frames = await processClip({
        videoBlob: recorded.blob,
        cameraAngle: angle,
        fps: 10,
        onProgress: (p) => setFramesPct(Math.round(p * 100)),
      })
      if (frames.length > 0) {
        try {
          await insertClipFrames(clip.id, frames)
        } catch {
          /* frames are nice-to-have for ML; don't fail the save */
        }
      }

      // 6. Build the baseline and flip the clip to calibrated.
      setSaveStage('baseline')
      const baseline = buildBaseline(frames, selectedMetrics)

      // Generate the personal-reference summary string once, here, so the
      // student detail page doesn't have to hit Claude on every page load
      // (review H6). Non-blocking: a failed summary just leaves the field
      // null and the student page falls back to the on-demand fetch path.
      let baselineSummary: string | null = null
      if (baseline) {
        try {
          const res = await fetch('/api/baseline-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseline,
              cameraAngle: angle,
              checkpointName: name.trim(),
              instructorNote: null,
              selectedMetrics,
              marksCount: frames.length,
              checkpointType: clipType,
            }),
          })
          if (res.ok) {
            const data = (await res.json()) as { summary?: string }
            baselineSummary = data.summary ?? null
          }
        } catch {
          /* leave null */
        }
      }

      await supabase
        .from('clips')
        .update({
          baseline,
          baseline_summary: baselineSummary,
          status: baseline ? 'calibrated' : 'pending',
        })
        .eq('id', clip.id)

      // 7. Done. Clean the in-memory blob and bounce.
      reset()
      router.replace(`/instructor/students/${studentId}`)
    } catch (e: unknown) {
      setSaveStage('idle')
      const reason = e instanceof Error ? e.message : String(e)
      setError(`${t('saveErrorTitle')}: ${reason}`)
    }
  }

  const handleDiscard = () => {
    reset()
    router.replace(`/instructor/students/${studentId}`)
  }

  // ---- Render ------------------------------------------------------

  if (!recorded || !videoUrl) {
    // The guard useEffect will bounce; show a brief loading state in the
    // meantime instead of flashing an empty page.
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
      </div>
    )
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Link
          href={`/instructor/students/${studentId}/clips/new/record`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back')}
        </Link>
        <h1 className="text-sm font-semibold">{t('title')}</h1>
        <button
          type="button"
          onClick={() => setDiscardOpen(true)}
          className="text-sm text-muted-foreground hover:text-bad transition-colors"
        >
          {t('discard')}
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6">
        {/* Video stage — 60% on lg+ */}
        <div className="lg:basis-3/5 flex flex-col gap-3">
          <div ref={videoStageRef} className="relative bg-black rounded-2xl overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl}
              className="max-h-[60vh] max-w-full"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
              playsInline
            />

            {canvasOpen && canvasSize && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-auto p-4">
                <AnnotationCanvas
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onSave={handleCanvasSave}
                  onCancel={handleCanvasCancel}
                />
              </div>
            )}
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? t('pause') : t('play')}
              className="size-11 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center transition-colors"
            >
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
              )}
            </button>

            {/* Scrubber */}
            <div className="flex-1 min-w-[160px] flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.max(1, duration)}
                step={50}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-ok"
                style={{ background: `linear-gradient(to right, var(--ok) ${progressPct}%, var(--secondary) ${progressPct}%)` }}
              />
              <span className="text-xs font-mono text-muted-foreground tabular-nums min-w-[64px] text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Speed selector */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              {PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                    speed === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Annotate button — only when paused (otherwise the canvas would drift) */}
          {!playing && !canvasOpen && (
            <button
              type="button"
              onClick={openCanvas}
              className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ok/15 text-ok border border-ok/30 hover:bg-ok/20 transition-colors font-medium text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              {t('annotateMoment')}
            </button>
          )}
        </div>

        {/* Right panel — 40% on lg+ */}
        <aside className="lg:basis-2/5 flex flex-col gap-4">
          {/* Metadata form */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clip-name" className="text-sm">{t('nameLabel')}</Label>
              <Input
                id="clip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="bg-secondary border-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">{t('angleLabel')}</Label>
              <div className="flex gap-2">
                <SegBtn active={angle === 'face_on'} onClick={() => setAngle('face_on')}>{t('angleFaceOn')}</SegBtn>
                <SegBtn active={angle === 'dtl'} onClick={() => setAngle('dtl')}>{t('angleDtl')}</SegBtn>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">{t('typeLabel')}</Label>
              <div className="flex gap-2">
                <SegBtn active={clipType === 'position'} onClick={() => setClipType('position')}>{t('typePosition')}</SegBtn>
                <SegBtn active={clipType === 'swing'} onClick={() => setClipType('swing')}>{t('typeSwing')}</SegBtn>
              </div>
            </div>
          </div>

          {/* Annotations list */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 min-h-[140px]">
            <h2 className="text-sm font-semibold text-foreground">
              {t('annotationsTitle')} {annotations.length > 0 && <span className="text-muted-foreground font-normal">({annotations.length})</span>}
            </h2>

            {annotations.length === 0 ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{t('annotationsEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...annotations]
                  .sort((a, b) => a.frame_timestamp_ms - b.frame_timestamp_ms)
                  .map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => jumpToAnnotation(a)}
                        className="flex-1 text-left flex items-center gap-3"
                      >
                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                          {formatTime(a.frame_timestamp_ms)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-foreground">
                          {a.strokes.length > 0 && <Badge>✎ {a.strokes.length}</Badge>}
                          {a.audio_blob && <Badge>🎙</Badge>}
                          {a.text_note && <Badge>✉</Badge>}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAnnotation(a.id)}
                        aria-label={t('deleteAnnotation')}
                        className="size-7 rounded-md text-muted-foreground hover:text-bad hover:bg-bad/10 flex items-center justify-center transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                        </svg>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Save */}
          {error && (
            <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-2.5 leading-snug">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="h-12 rounded-xl bg-ok text-black font-semibold hover:bg-ok/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {t('save')}
          </button>
        </aside>
      </div>

      {/* Saving overlay — blocks the whole page during the long save flow */}
      {saveStage !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="bg-card border border-border rounded-2xl px-8 py-7 max-w-sm w-full flex flex-col items-center gap-4 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-ok border-t-transparent animate-spin" />
            <p className="text-base font-medium text-foreground">
              {saveStage === 'upload'   && t('savingUpload')}
              {saveStage === 'insert'   && t('savingInsert')}
              {saveStage === 'frames'   && t('savingFrames', { pct: framesPct })}
              {saveStage === 'baseline' && t('savingBaseline')}
            </p>
            {saveStage === 'frames' && (
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-ok transition-all duration-200"
                  style={{ width: `${framesPct}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Discard confirmation */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('discardConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('discardConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setDiscardOpen(false)} className="flex-1 border-border">
              {t('discardConfirmCancel')}
            </Button>
            <Button variant="destructive" onClick={handleDiscard} className="flex-1">
              {t('discardConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Tiny presentational helpers ---

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-ok/15 text-ok border border-ok/40'
          : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded bg-background/60 text-[10px]">{children}</span>
}
