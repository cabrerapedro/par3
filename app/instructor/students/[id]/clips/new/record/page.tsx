'use client'

// Section 4 step 1: record. Pure camera + MediaRecorder, intentionally
// NO MediaPipe overlay during recording — the spec is explicit that the
// instructor should see the student raw, not the skeleton, while filming.
// MediaPipe runs later in lib/processClip during the post-save background job.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useClipFlow } from '../layout'

const MAX_LENGTH_MS = 60_000 // hard cap; spec says clips run 15–30 s
const MIN_LENGTH_MS = 3_000

const PREFERRED_VIDEO_MIMES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
]

function pickVideoMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const mime of PREFERRED_VIDEO_MIMES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return undefined
}

export default function ClipRecordPage() {
  const t = useTranslations('instructor.clips.record')
  const params = useParams()
  const router = useRouter()
  const studentId = params.id as string

  const { setRecorded } = useClipFlow()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startMsRef = useRef<number>(0)
  // Track auto-stop timer so a manual stop can clear it.
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [cameraReady, setCameraReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

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
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'video/webm' })
        const durationMs = Math.max(0, Date.now() - startMsRef.current)

        if (durationMs < MIN_LENGTH_MS) {
          // Don't keep the clip, surface the error, let them try again.
          setError(t('tooShort'))
          setRecording(false)
          setElapsedMs(0)
          return
        }

        setRecorded({ blob, mime: recorder.mimeType || mime || 'video/webm', durationMs })
        router.push(`/instructor/students/${studentId}/clips/new/annotate`)
      }
      recorder.start(1000)
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
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }

  const flipCamera = async () => {
    if (recording) return
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    await startCamera(next)
  }

  // --- Render -----------------------------------------------------------

  const seconds = Math.floor(elapsedMs / 1000)
  const timeLabel = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

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
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="max-h-full max-w-full object-contain"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }}
        />

        {!cameraReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
            <span className="text-sm">{t('loadingCamera')}</span>
          </div>
        )}

        {/* Elapsed time pill — visible only while recording */}
        {recording && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-sm font-mono">
            <span className="size-2 rounded-full bg-bad animate-pulse" />
            {timeLabel}
          </div>
        )}

        {/* Flip camera */}
        {cameraReady && !recording && (
          <button
            type="button"
            onClick={flipCamera}
            aria-label={t('flipCamera')}
            className="absolute top-4 right-4 size-11 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/55 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        )}
      </div>

      {/* Hint + record control */}
      <div className="shrink-0 px-6 py-5 flex flex-col items-center gap-4 border-t border-border bg-background">
        <p className="text-sm text-muted-foreground text-center max-w-md leading-snug">
          {recording ? t('recordingHint') : t('preRecordHint')}
        </p>

        {error && (
          <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-2.5 leading-snug text-center w-full max-w-md">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={!cameraReady}
          aria-label={recording ? t('recordStop') : t('recordStart')}
          className={`size-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            recording
              ? 'bg-bad text-white shadow-lg shadow-bad/30'
              : 'bg-bad/90 text-white hover:bg-bad active:scale-95'
          }`}
        >
          {recording ? (
            <span className="size-7 bg-white rounded-md" />
          ) : (
            <span className="size-14 rounded-full bg-white/95" />
          )}
        </button>
      </div>
    </div>
  )
}
