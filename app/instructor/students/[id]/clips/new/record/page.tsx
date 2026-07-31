'use client'

// Section 4 step 1: record. Pure camera + MediaRecorder, intentionally
// NO MediaPipe overlay during recording — the spec is explicit that the
// instructor should see the student raw, not the skeleton, while filming.
// MediaPipe runs later in lib/processClip during the post-save background job.
//
// UX is built for a non-techy golf instructor filming live in class:
//   - plain-language instruction + a framing guide so the whole body fits
//   - the camera angle is chosen here (a physical decision) and carried into
//     the review step
//   - while recording, a duration cue tells them when they've filmed enough
//     (15–30 s sweet spot) and the screen makes "RECORDING" unmistakable.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { CameraAngle } from '@/lib/types'
import { pickVideoMime, resolveRecordedMime, videoRecorderOptions, RECORDER_TIMESLICE_MS } from '@/lib/recorder'
import { useWakeLock } from '@/lib/wakeLock'
import { useClipFlow } from '../layout'

const MAX_LENGTH_MS = 60_000 // hard cap; spec says clips run 15–30 s
const MIN_LENGTH_MS = 3_000
const REC_MIN_S = 15 // start of the recommended window
const REC_MAX_S = 30 // end of the recommended window
const HARD_CAP_S = MAX_LENGTH_MS / 1000

export default function ClipRecordPage() {
  const t = useTranslations('instructor.clips.record')
  const params = useParams()
  const router = useRouter()
  const studentId = params.id as string

  const { commitRecorded } = useClipFlow()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startMsRef = useRef<number>(0)
  // Track auto-stop timer so a manual stop can clear it.
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Angle is no longer chosen before recording (frame → record; the instructor
  // sets/confirms the real angle when annotating). Default carried into commit.
  const angleRef = useRef<CameraAngle>('face_on')

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [cameraReady, setCameraReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useWakeLock(recording)

  // --- Camera lifecycle -------------------------------------------------

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    setCameraReady(false)
    setError(null)

    // Stop any previous stream before requesting a new one — Safari refuses
    // a second getUserMedia while the first is still live.
    streamRef.current?.getTracks().forEach((t) => t.stop())

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraReady(true)
    } catch {
      // Fallback: if back camera isn't available (desktop, locked iPad),
      // try the front camera before giving up.
      if (facing === 'environment') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            await videoRef.current.play().catch(() => {})
          }
          setFacingMode('user')
          setCameraReady(true)
          return
        } catch {
          /* fall through to error */
        }
      }
      setError(t('cameraError'))
    }
  }, [t])

  useEffect(() => {
    startCamera(facingMode)
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch {}
      }
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    }
    // startCamera intentionally not in deps — facingMode change is handled
    // explicitly via flipCamera, so we only run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Elapsed-time ticker ----------------------------------------------

  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startMsRef.current)
    }, 100)
    return () => clearInterval(id)
  }, [recording])

  // --- Record / stop ----------------------------------------------------

  const startRecording = () => {
    const stream = streamRef.current
    if (!stream) {
      setError(t('recordingFailed'))
      return
    }
    const mime = pickVideoMime()
    chunksRef.current = []
    try {
      const recorder = new MediaRecorder(stream, videoRecorderOptions(mime))
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const rawMime = resolveRecordedMime(recorder, chunksRef.current, mime, 'video')
        const raw = new Blob(chunksRef.current, { type: rawMime })
        const durationMs = Math.max(0, Date.now() - startMsRef.current)

        // No data captured (can happen on iOS if the recorder didn't flush) —
        // surface it instead of advancing with an empty, unplayable clip.
        if (raw.size === 0) {
          setError(t('recordingFailed'))
          setRecording(false)
          setElapsedMs(0)
          return
        }

        if (durationMs < MIN_LENGTH_MS) {
          // Don't keep the clip, surface the error, let them try again.
          setError(t('tooShort'))
          setRecording(false)
          setElapsedMs(0)
          return
        }

        // Persist to IndexedDB BEFORE navigating: the layout context is lost
        // when the layout re-mounts across this navigation on iPadOS, so
        // annotate rehydrates the blob from storage instead of memory.
        // Carry the step this clip belongs to (when started from "abre el paso
        // y graba"); null for an ad-hoc recording.
        const stepId = new URLSearchParams(window.location.search).get('step')
        await commitRecorded({ blob: raw, mime: rawMime, durationMs, angle: angleRef.current, journeyItemId: stepId })
        router.push(`/instructor/students/${studentId}/clips/new/annotate`)
      }
      // Timeslice: iOS/WebKit needs periodic dataavailable to reliably
      // capture — without it, stop() can yield an empty recording.
      recorder.start(RECORDER_TIMESLICE_MS)
      recorderRef.current = recorder
      startMsRef.current = Date.now()
      setElapsedMs(0)
      setError(null)
      setRecording(true)

      // Hard 60 s cap. We schedule a stop instead of trusting the user to
      // catch a forgotten recording.
      stopTimerRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop()
        }
        setError(t('maxLengthHit'))
      }, MAX_LENGTH_MS)
    } catch {
      setError(t('recordingFailed'))
    }
  }

  const stopRecording = () => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      // requestData() forces WebKit to flush a final chunk synchronously before
      // stop(); without it some iOS builds emit onstop with no dataavailable.
      try { recorder.requestData() } catch {}
      recorder.stop()
    }
    setRecording(false)
  }

  const flipCamera = async () => {
    if (recording) return
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    await startCamera(next)
  }

  // --- Derived ----------------------------------------------------------

  const seconds = Math.floor(elapsedMs / 1000)
  const timeLabel = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const zone: 'short' | 'good' | 'long' =
    seconds < REC_MIN_S ? 'short' : seconds <= REC_MAX_S ? 'good' : 'long'
  const durationPct = Math.min(seconds / HARD_CAP_S, 1) * 100
  const goodLeftPct = (REC_MIN_S / HARD_CAP_S) * 100
  const goodWidthPct = ((REC_MAX_S - REC_MIN_S) / HARD_CAP_S) * 100

  // --- Render -----------------------------------------------------------

  return (
    <div className="h-[100dvh] overflow-hidden bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
        <Link
          href={`/instructor/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('back')}
        </Link>
        <h1 className="text-sm font-semibold">{t('title')}</h1>
        <div className="w-16" /> {/* spacer for symmetry */}
      </div>

      {/* Camera feed */}
      <div
        className={`relative flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden transition-shadow ${
          recording ? 'ring-4 ring-inset ring-bad' : ''
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="max-h-full max-w-full object-contain"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }}
        />

        {!cameraReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
            <span className="text-sm">{t('loadingCamera')}</span>
          </div>
        )}

        {/* Framing guide — subtle corner brackets + "whole body" legend */}
        {cameraReady && !recording && (
          <div className="pointer-events-none absolute inset-6 md:inset-10">
            <span className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-white/70 rounded-tl" />
            <span className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-white/70 rounded-tr" />
            <span className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-white/70 rounded-bl" />
            <span className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-white/70 rounded-br" />
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 small-caps font-mono text-[11px] tracking-wide text-white/90 bg-black/45 px-2.5 py-1 rounded-full whitespace-nowrap">
              {t('framingGuideLabel')}
            </span>
          </div>
        )}

        {/* RECORDING badge */}
        {recording && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-bad text-white text-sm font-semibold shadow-lg">
            <span className="size-2 rounded-full bg-white animate-pulse" />
            {t('recordingBadge')}
            <span className="font-mono tabular-nums font-normal">{timeLabel}</span>
          </div>
        )}

        {/* Flip camera */}
        {cameraReady && !recording && (
          <button
            type="button"
            onClick={flipCamera}
            aria-label={t('flipCamera')}
            className="absolute top-4 right-4 inline-flex items-center gap-1.5 h-10 pl-3 pr-3.5 rounded-full bg-black/45 backdrop-blur text-white hover:bg-black/60 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span className="text-xs font-medium">{t('flipCameraShort')}</span>
          </button>
        )}
      </div>

      {/* Bottom panel */}
      <div className="shrink-0 px-5 py-4 flex flex-col items-center gap-3 border-t border-border bg-background">
        {error && (
          <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-2.5 leading-snug text-center w-full max-w-md">
            {error}
          </div>
        )}

        {!recording ? (
          <>
            <button
              type="button"
              onClick={startRecording}
              disabled={!cameraReady}
              aria-label={t('recordStart')}
              className="size-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-bad/90 text-white hover:bg-bad active:scale-95 shadow-lg shadow-bad/20"
            >
              <span className="size-14 rounded-full bg-white/95" />
            </button>

            <p className="text-xs text-muted-foreground text-center max-w-md leading-snug">
              {t('framingHint')}
            </p>
          </>
        ) : (
          <>
            {/* Duration cue: tells the instructor when they've filmed enough */}
            <div className="w-full max-w-md">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-sm tabular-nums">{timeLabel}</span>
                <span className={`text-xs font-medium ${zone === 'good' ? 'text-ok' : 'text-muted-foreground'}`}>
                  {zone === 'short' ? t('durationShort') : zone === 'good' ? t('durationGood') : t('durationLong')}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                {/* recommended window */}
                <div
                  className="absolute inset-y-0 bg-ok/25"
                  style={{ left: `${goodLeftPct}%`, width: `${goodWidthPct}%` }}
                />
                {/* elapsed fill */}
                <div
                  className={`absolute inset-y-0 left-0 transition-[width] duration-200 ${zone === 'good' ? 'bg-ok' : 'bg-foreground'}`}
                  style={{ width: `${durationPct}%` }}
                />
              </div>
            </div>

            <div className="relative size-20">
              <span className="absolute inset-0 rounded-full bg-bad/40 animate-ping" />
              <button
                type="button"
                onClick={stopRecording}
                aria-label={t('recordStop')}
                className="relative z-10 size-20 rounded-full flex items-center justify-center transition-all bg-bad text-white shadow-lg shadow-bad/30"
              >
                <span className="size-7 bg-white rounded-[4px]" />
              </button>
            </div>
            <span className="text-xs font-medium text-bad">{t('recordStop')}</span>
          </>
        )}
      </div>
    </div>
  )
}
