'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  calculateMetrics, compareToBaseline,
  generateBaselineSummary, METRICS_BY_ANGLE, isSwingBaseline,
  detectSwingPhases, compareSwingToBaseline, generateSwingSummary,
} from '@/lib/baseline'
import { loadMediaPipe, createPose } from '@/lib/mediapipe'
import type { PoseResults } from '@/lib/mediapipe'
import { pickVideoMime, resolveRecordedMime, RECORDER_TIMESLICE_MS } from '@/lib/recorder'
import { useWakeLock } from '@/lib/wakeLock'
import { insertSessionFrames, type FrameRow } from '@/lib/frames'
import type { Clip } from '@/lib/classes'
import type { Baseline, Landmark, SwingBaseline } from '@/lib/types'
import type { BaselineCheck, SwingPhaseCheck } from '@/lib/baseline'
import Link from 'next/link'

type Stage = 'input' | 'recording' | 'processing' | 'results'

interface FrameResult {
  checks: BaselineCheck[]
}

export default function StudentClipPractice() {
  const { student, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.practice')
  const tClip = useTranslations('student.clip')
  const tBaselineSummary = useTranslations('baselineSummary')
  const tSwingSummary = useTranslations('swingSummary')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pendingStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [clip, setClip] = useState<Clip | null>(null)
  const [stage, setStage] = useState<Stage>('input')
  const [cameraReady, setCameraReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [frameResults, setFrameResults] = useState<FrameResult[]>([])
  const [summary, setSummary] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [error, setError] = useState('')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [recordingVisibleCount, setRecordingVisibleCount] = useState(-1)
  const [swingPhaseChecks, setSwingPhaseChecks] = useState<SwingPhaseCheck[]>([])
  const [sideBySide, setSideBySide] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Signals analyzeVideoBlob to bail mid-flight when the component unmounts.
  // Avoids "set state on unmounted component" warnings + leaked MediaPipe
  // resources after a long-running analyze (the loop is ~30 s for a 60 s clip).
  const cancelledRef = useRef(false)
  const recordingSecondsRef = useRef(0)
  const poseCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clipRef = useRef<Clip | null>(null)

  useWakeLock(stage === 'recording')

  // Callback ref: auto-attach pending stream when the video element mounts
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (node && pendingStreamRef.current) {
      node.srcObject = pendingStreamRef.current
      node.play().catch(() => {})
      pendingStreamRef.current = null
      setCameraReady(true)
    }
  }, [])

  useEffect(() => {
    // Wait for auth to hydrate before redirecting. On a hard load this effect
    // runs before AuthProvider populates `student`; gating on authLoading
    // avoids bouncing a logged-in student to login. authLoading flips exactly
    // once (true→false), so the setup below still runs only once.
    if (authLoading) return
    if (!student) { router.replace('/student/login'); return }
    loadClip()
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setHasMultipleCameras(devices.filter(d => d.kind === 'videoinput').length > 1)
    }).catch(() => {})
    return () => {
      cancelledRef.current = true
      cleanupRecording()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  async function loadClip() {
    const { data } = await supabase.from('clips').select('*').eq('id', clipId).single()
    if (!data?.baseline) { setError(t('noBaseline')); return }
    setClip(data as Clip)
    clipRef.current = data as Clip
  }

  async function startRecording(facing: 'user' | 'environment' = 'environment') {
    setFacingMode(facing)
    setCameraReady(false)
    setRecordingSeconds(0)
    recordingSecondsRef.current = 0

    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: facing },
          audio: false,
        })
      } catch {
        if (facing === 'environment') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: 'user' },
            audio: false,
          })
          setFacingMode('user')
        } else {
          throw new Error('No camera')
        }
      }

      streamRef.current = stream

      // Store stream for the callback ref to pick up when video element mounts
      pendingStreamRef.current = stream

      // Setup MediaRecorder (doesn't need the video element)
      chunksRef.current = []
      const picked = pickVideoMime()
      const recorder = new MediaRecorder(stream, picked ? { mimeType: picked } : undefined)
      // Store the requested mime; the REAL container is resolved at stop time
      // (iOS leaves recorder.mimeType empty and produces mp4, not webm).
      mimeTypeRef.current = picked ?? ''
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      // Wire onstop up-front so a fast stop() can't fire before the handler
      // is assigned. We don't know yet whether the user will stop normally or
      // via cleanup; processVideo guards against an empty chunks array.
      recorder.onstop = () => processVideo()
      // Timeslice: iOS needs periodic dataavailable to capture reliably.
      recorder.start(RECORDER_TIMESLICE_MS)
      recorderRef.current = recorder

      // Show recording UI — the callback ref will attach the stream to the video element
      setStage('recording')

      // If video element already exists (e.g. re-recording), attach directly
      if (videoRef.current && pendingStreamRef.current) {
        videoRef.current.srcObject = pendingStreamRef.current
        videoRef.current.play().catch(() => {})
        pendingStreamRef.current = null
        setCameraReady(true)
      }

      timerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1
        setRecordingSeconds(s => s + 1)
      }, 1000)

      // Start live visibility checking
      startVisibilityCheck()
    } catch {
      setError(t('cameraError'))
      setStage('input')
    }
  }

  async function flipCamera() {
    stopVisibilityCheck()
    if (timerRef.current) clearInterval(timerRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    chunksRef.current = []
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    await startRecording(newFacing)
  }

  function stopVisibilityCheck() {
    if (poseCheckIntervalRef.current) {
      clearInterval(poseCheckIntervalRef.current)
      poseCheckIntervalRef.current = null
    }
    setRecordingVisibleCount(-1)
  }

  async function startVisibilityCheck() {
    stopVisibilityCheck()
    const c = clipRef.current
    if (!c) return
    try {
      await loadMediaPipe()
      // Lite model: fast enough to run live on an iPhone while also recording.
      const pose = await createPose(() => {}, { modelComplexity: 0, smoothLandmarks: false })
      pose.onResults((results: PoseResults) => {
        if (!results.poseLandmarks) { setRecordingVisibleCount(0); return }
        const metrics = calculateMetrics(results.poseLandmarks, c.camera_angle)
        const expected = c.selected_metrics?.length
          ? c.selected_metrics
          : METRICS_BY_ANGLE[c.camera_angle] ?? []
        setRecordingVisibleCount(Object.keys(metrics).filter(k => expected.includes(k)).length)
      })
      poseCheckIntervalRef.current = setInterval(async () => {
        if (videoRef.current) {
          try { await pose.send({ image: videoRef.current }) } catch {}
        }
      }, 1000)
    } catch { /* MediaPipe not available */ }
  }

  function cleanupRecording() {
    stopVisibilityCheck()
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  function stopRecording() {
    stopVisibilityCheck()
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      // onstop was wired at recorder-creation time (M9 fix). Just stop;
      // the handler will run processVideo() with the captured chunks.
      recorderRef.current.stop()
    } else {
      processVideo()
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await analyzeVideoBlob(file)
  }

  async function processVideo() {
    if (!chunksRef.current.length) { setError(t('noVideoCaptured')); return }
    const mime = recorderRef.current
      ? resolveRecordedMime(recorderRef.current, chunksRef.current, mimeTypeRef.current || undefined, 'video')
      : (chunksRef.current[0]?.type || 'video/mp4')
    const blob = new Blob(chunksRef.current, { type: mime })
    await analyzeVideoBlob(blob)
  }

  async function resolveVideoDuration(video: HTMLVideoElement): Promise<number> {
    await new Promise<void>(res => {
      if (video.readyState >= 1) { res(); return }
      const handler = () => { video.removeEventListener('loadedmetadata', handler); res() }
      video.addEventListener('loadedmetadata', handler)
      setTimeout(res, 5000)
    })

    if (isFinite(video.duration) && video.duration > 0) return video.duration

    // WebM from MediaRecorder has Infinity duration — seek to end to resolve
    await new Promise<void>(res => {
      video.currentTime = 1e10
      const handler = () => { video.removeEventListener('seeked', handler); res() }
      video.addEventListener('seeked', handler)
      setTimeout(res, 3000)
    })

    if (isFinite(video.duration) && video.duration > 0) {
      const dur = video.duration
      await new Promise<void>(res => {
        video.currentTime = 0
        const handler = () => { video.removeEventListener('seeked', handler); res() }
        video.addEventListener('seeked', handler)
        setTimeout(res, 1000)
      })
      return dur
    }

    // Last resort: use the recording timer
    return recordingSecondsRef.current || 10
  }

  async function analyzeVideoBlob(blob: Blob) {
    if (!clip?.baseline) { setError(t('noPersonalBaseline')); return }
    setStage('processing')
    setProgress(0)
    setSwingPhaseChecks([])

    const isSwingMode = clip.clip_type === 'swing' || isSwingBaseline(clip.baseline)

    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.load()

    const duration = await resolveVideoDuration(video)
    if (duration <= 0) { setError(t('couldntReadVideo')); URL.revokeObjectURL(url); return }

    // Posture is static so a low sample rate is plenty and much faster on a
    // phone; a swing needs more temporal resolution to find its phases.
    const fps = isSwingMode ? 10 : 5
    const step = 1 / fps
    const totalFrames = Math.min(Math.floor(duration * fps), 600)

    await loadMediaPipe()
    // Lite model: the medium model is far too slow on an iPhone.
    const pose = await createPose(() => {}, { modelComplexity: 0, smoothLandmarks: false })

    const results: FrameResult[] = []
    const allLandmarks: Landmark[][] = []
    // Frame rows captured for session_frames batch insert (ML training corpus)
    const frameRows: FrameRow[] = []
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')!

    let resolveFrame: (() => void) | null = null
    let frameChecks: BaselineCheck[] = []
    let frameLandmarks: Landmark[] | null = null
    let frameMetrics: Record<string, number> | undefined = undefined
    pose.onResults((r: PoseResults) => {
      frameChecks = []
      frameLandmarks = null
      frameMetrics = undefined
      if (r.poseLandmarks) {
        const lms: Landmark[] = r.poseLandmarks.map((lm) => ({
          x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility,
        }))
        frameLandmarks = lms
        if (isSwingMode) {
          allLandmarks.push(lms)
        } else {
          const metrics = calculateMetrics(r.poseLandmarks, clip.camera_angle)
          frameMetrics = metrics
          frameChecks = compareToBaseline(metrics, clip.baseline as Baseline, clip.selected_metrics)
        }
      }
      resolveFrame?.()
      resolveFrame = null
    })

    // Per-frame timeout counter. If MediaPipe stalls for too many consecutive
    // frames we bail with an actionable error rather than spend up to 15 minutes
    // of 1.5s-per-frame fallback timeouts on a stuck WASM session.
    const MAX_CONSECUTIVE_TIMEOUTS = 10
    let consecutiveTimeouts = 0
    let aborted = false

    for (let i = 0; i < totalFrames; i++) {
      if (cancelledRef.current) { aborted = true; break }

      video.currentTime = i * step
      await new Promise<void>(res => {
        const handler = () => { video.removeEventListener('seeked', handler); res() }
        video.addEventListener('seeked', handler)
        setTimeout(res, 800)
      })

      if (cancelledRef.current) { aborted = true; break }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      frameChecks = []
      frameLandmarks = null
      frameMetrics = undefined

      // Race pose.send() against a 1.5s timeout. timedOut tracks whether the
      // fallback won — used to decide if MediaPipe is stuck.
      let timedOut = false
      await new Promise<void>(res => {
        resolveFrame = () => { resolveFrame = null; res() }
        pose.send({ image: canvas }).catch(() => { resolveFrame = null; res() })
        setTimeout(() => {
          if (resolveFrame) { timedOut = true; resolveFrame = null; res() }
        }, 1500)
      })

      if (timedOut && !frameLandmarks) {
        consecutiveTimeouts++
        if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
          setError(t('mediaPipeStuck'))
          URL.revokeObjectURL(url)
          return
        }
      } else {
        consecutiveTimeouts = 0
      }

      if (frameLandmarks) {
        frameRows.push({
          frame_index: i,
          timestamp_ms: Math.round(i * step * 1000),
          landmarks: frameLandmarks,
          metrics: frameMetrics,
        })
      }

      if (!isSwingMode && frameChecks.length) results.push({ checks: frameChecks })
      setProgress(Math.round((i + 1) / totalFrames * 100))
    }

    if (aborted) {
      URL.revokeObjectURL(url)
      return
    }

    if (isSwingMode) {
      // Swing mode: detect phases and compare
      if (allLandmarks.length < 10) {
        setError(t('swingNotEnoughPose'))
        URL.revokeObjectURL(url)
        return
      }

      const phases = detectSwingPhases(allLandmarks, clip.camera_angle)
      if (!phases) {
        setError(t('swingNotDetected'))
        URL.revokeObjectURL(url)
        return
      }

      const swingBaseline = clip.baseline as SwingBaseline
      const phaseChecks = compareSwingToBaseline(phases, swingBaseline, clip.selected_metrics)

      setPreviewUrl(url)
      setSwingPhaseChecks(phaseChecks)
      setSummary(generateSwingSummary(phaseChecks, tSwingSummary))

      if (student && clip) {
        const allChecks = phaseChecks.flatMap(pc => pc.checks)
        const overall_score = allChecks.length > 0
          ? Math.round(allChecks.filter(c => c.status === 'ok').length / allChecks.length * 100)
          : 0
        const resultsMap = Object.fromEntries(
          phaseChecks.flatMap(pc =>
            pc.checks.map(c => [`${pc.phase}__${c.id}`, { value: 0, deviation: 0, status: c.status }])
          )
        )
        const { data: sessionRow, error: insErr } = await supabase.from('practice_sessions').insert({
          student_id: student.id,
          clip_id: clip.id,
          class_id: clip.class_id,
          checkpoint_id: null,
          date: new Date().toISOString(),
          duration_seconds: Math.round(allLandmarks.length / fps),
          results: resultsMap,
          overall_score,
        }).select('id').single()

        if (insErr) {
          console.error('practice_sessions insert failed', insErr)
          setError(t('saveFailed'))
        } else if (sessionRow?.id && frameRows.length > 0) {
          try { await insertSessionFrames(sessionRow.id, frameRows) } catch (err) { console.error('session_frames insert failed', err) }
        }
      }

      setStage('results')
    } else {
      // Position mode: aggregate frame results
      if (!results.length) {
        setError(t('positionNotDetected'))
        URL.revokeObjectURL(url)
        return
      }

      const aggregated = aggregateFrameResults(results)

      setPreviewUrl(url)
      setFrameResults(results)
      setSummary(generateBaselineSummary(aggregated, tBaselineSummary))

      if (student && clip) {
        const overall_score = Math.round(
          aggregated.filter(c => c.status === 'ok').length / aggregated.length * 100
        )
        const resultsMap = Object.fromEntries(
          aggregated.map(c => [c.id, { value: 0, deviation: 0, status: c.status }])
        )
        const { data: sessionRow, error: insErr } = await supabase.from('practice_sessions').insert({
          student_id: student.id,
          clip_id: clip.id,
          class_id: clip.class_id,
          checkpoint_id: null,
          date: new Date().toISOString(),
          duration_seconds: Math.round(results.length / fps),
          results: resultsMap,
          overall_score,
        }).select('id').single()

        if (insErr) {
          console.error('practice_sessions insert failed', insErr)
          setError(t('saveFailed'))
        } else if (sessionRow?.id && frameRows.length > 0) {
          try { await insertSessionFrames(sessionRow.id, frameRows) } catch (err) { console.error('session_frames insert failed', err) }
        }
      }

      setStage('results')
    }
  }

  function aggregateFrameResults(frames: FrameResult[]): BaselineCheck[] {
    if (!frames.length) return []
    const total = frames.length
    const keys = frames[0].checks.map(c => c.id)

    return keys.map(key => {
      let ok = 0, bad = 0
      frames.forEach(f => {
        const status = f.checks.find(c => c.id === key)?.status
        // Only 'ok' and 'bad' feed the score. A 'warn' frame (and a missing
        // one) is neither — but a missing frame still counts as 'bad', matching
        // the original behavior.
        if (status === 'ok') ok++
        else if (status !== 'warn') bad++
      })
      const badPct = bad / total
      const status = badPct > 0.4 ? 'bad' : ok / total > 0.6 ? 'ok' : 'warn'
      const template = frames[frames.length - 1].checks.find(c => c.id === key)!
      return { ...template, status }
    })
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (error) return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4 text-center">
      <p className="text-muted-foreground">{error}</p>
      <Link href={`/student/clip/${clipId}`} className="text-ok hover:underline text-sm">← Volver</Link>
    </main>
  )

  return (
    <main className="min-h-screen bg-background">
      {stage !== 'recording' && (
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-5 py-4">
          <Link href={`/student/clip/${clipId}`} className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {clip?.name ?? t('backFallback')}
          </Link>
        </header>
      )}

      {/* INPUT stage */}
      {stage === 'input' && (
        <div className="max-w-md mx-auto px-5 py-8 flex flex-col gap-4">
          <h1 className="text-xl font-display font-semibold mb-4">{t('title')}</h1>

          <button
            onClick={() => startRecording('environment')}
            className="bg-paper-2 border border-rule rounded-md p-6 text-left hover:bg-paper-3 transition-all block"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <p className="text-foreground font-semibold">{t('recordWithCamera')}</p>
            </div>
            <p className="text-muted-foreground text-sm">{t('recordWithCameraDesc')}</p>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-card border border-border rounded-md p-6 text-left hover:bg-secondary hover:border-ok/30 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted-foreground">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-foreground font-semibold">{t('uploadVideo')}</p>
            </div>
            <p className="text-muted-foreground text-sm">{t('uploadVideoDesc')}</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleUpload}
            className="hidden"
          />

          <p className="text-muted-foreground text-xs text-center mt-2">
            {t('angleHint', { angle: clip?.camera_angle === 'face_on' ? t('angleFaceOnLower') : t('angleDtlLower') })}
          </p>
        </div>
      )}

      {/* RECORDING stage */}
      {stage === 'recording' && (
        <div className="flex flex-col h-dvh">
          <div className="relative flex-1 bg-black overflow-hidden" style={{ minHeight: 0 }}>
            <video
              ref={videoCallbackRef}
              className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              playsInline
              muted
            />

            {/* Loading overlay while camera connects */}
            {!cameraReady && (
              <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">{t('startingCamera')}</p>
              </div>
            )}

            {/* Recording overlays */}
            {cameraReady && (
              <>
                {/* Timer */}
                <div className="absolute top-4 left-4 bg-bad/90 text-foreground text-sm font-mono px-3 py-1.5 rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  {formatTime(recordingSeconds)}
                </div>
                {/* Flip camera */}
                {hasMultipleCameras && (
                <button
                  onClick={flipCamera}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/60 backdrop-blur flex items-center justify-center text-foreground hover:bg-background/80 transition-all"
                  title={t('flipCameraTitle')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" />
                    <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="m18 22-3-3 3-3" />
                    <path d="m6 2 3 3-3 3" />
                  </svg>
                </button>
                )}
                {/* Visibility warning during recording */}
                {recordingVisibleCount >= 0 && clip && (() => {
                  const expected = clip.selected_metrics?.length
                    ? clip.selected_metrics
                    : METRICS_BY_ANGLE[clip.camera_angle] ?? []
                  if (expected.length > 0 && recordingVisibleCount < expected.length) return (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 bg-warn/90 backdrop-blur rounded-full px-4 py-2 max-w-xs text-center">
                      <span className="text-black text-sm font-medium">
                        {t('showFullBody', { visible: recordingVisibleCount, total: expected.length })}
                      </span>
                    </div>
                  )
                  return null
                })()}
                {/* Angle hint */}
                <div className="absolute bottom-4 left-4 bg-background/60 backdrop-blur text-muted-foreground text-xs px-3 py-1.5 rounded-full">
                  {clip?.camera_angle === 'face_on' ? t('angleFaceOn') : t('angleDtl')}
                </div>
              </>
            )}
          </div>

          {/* Stop button */}
          <div className="flex-shrink-0 p-4 bg-background">
            <button
              onClick={stopRecording}
              disabled={!cameraReady}
              className="w-full bg-bad text-foreground font-bold text-lg rounded-md py-5 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {t('stopAndAnalyze')}
            </button>
          </div>
        </div>
      )}

      {/* PROCESSING stage */}
      {stage === 'processing' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-5 gap-6">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">{t('analyzingFrames')}</span>
              <span className="text-ok font-mono">{progress}%</span>
            </div>
            <div className="h-2 bg-card rounded-full overflow-hidden">
              <div className="h-full bg-ok rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <p className="text-muted-foreground text-sm text-center">{t('comparingBaseline')}</p>
        </div>
      )}

      {/* RESULTS stage */}
      {stage === 'results' && clip && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
            <h1 className="text-xl font-display font-semibold">{t('resultsTitle')}</h1>
            {clip.video_url && (
              <button
                onClick={() => setSideBySide(!sideBySide)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  sideBySide
                    ? 'bg-ok/10 border-ok/30 text-ok'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="9" height="16" rx="1" />
                  <rect x="13" y="4" width="9" height="16" rx="1" />
                </svg>
                {sideBySide ? tClip('hideReference') : tClip('showReference')}
              </button>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-80 flex-shrink-0">
              {/* Side-by-side videos: reference (above on phone, left on tablet+) + student attempt */}
              <div className={`grid gap-3 ${sideBySide && clip.video_url ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-1' : 'grid-cols-1'}`}>
                {sideBySide && clip.video_url && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      {tClip('instructorReferenceTitle')}
                    </p>
                    <video
                      src={clip.video_url}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full rounded-md bg-black"
                    />
                  </div>
                )}
                {previewUrl && (
                  <div>
                    {sideBySide && clip.video_url && (
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                        {t('resultsTitle')}
                      </p>
                    )}
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      muted
                      preload="auto"
                      onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 0.1 }}
                      className="w-full rounded-md bg-black"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1">
              {/* Swing mode results */}
              {swingPhaseChecks.length > 0 && (
                <div className="flex flex-col gap-3 mb-6">
                  {swingPhaseChecks.map(pc => {
                    const okCount = pc.checks.filter(c => c.status === 'ok').length
                    const phaseStatus = pc.checks.every(c => c.status === 'ok') ? 'ok'
                      : pc.checks.some(c => c.status === 'bad') ? 'bad' : 'warn'
                    return (
                      <div key={pc.phase} className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-foreground text-sm font-semibold">{pc.phaseLabel}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            phaseStatus === 'ok' ? 'text-ok bg-ok/10' :
                            phaseStatus === 'bad' ? 'text-bad bg-bad/10' : 'text-warn bg-warn/10'
                          }`}>
                            {phaseStatus === 'ok' ? t('statusOk') : phaseStatus === 'bad' ? t('statusBad') : t('statusWarn')}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full ${
                              phaseStatus === 'ok' ? 'bg-ok' : phaseStatus === 'bad' ? 'bg-bad' : 'bg-warn'
                            }`}
                            style={{ width: `${pc.checks.length ? Math.round(okCount / pc.checks.length * 100) : 0}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {pc.checks.map(check => (
                            <span
                              key={check.id}
                              className={`text-xs px-2 py-0.5 rounded-full border ${
                                check.status === 'ok' ? 'text-ok bg-ok/10 border-ok/20' :
                                check.status === 'warn' ? 'text-warn bg-warn/10 border-warn/20' :
                                'text-bad bg-bad/10 border-bad/20'
                              }`}
                            >
                              {check.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Position mode: Warning if some metrics are missing */}
              {frameResults.length > 0 && (() => {
                const expected = clip.selected_metrics?.length
                  ? clip.selected_metrics
                  : METRICS_BY_ANGLE[clip.camera_angle] ?? []
                const detected = aggregateFrameResults(frameResults).map(c => c.id)
                const missing = expected.filter(k => !detected.includes(k))
                if (missing.length > 0) return (
                  <div className="bg-warn/10 border border-warn/20 rounded-xl px-4 py-3 mb-4">
                    <p className="text-warn text-sm font-medium">
                      {t('metricsDetected', { detected: detected.length, total: expected.length })}
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {t('metricsDetectedDesc')}
                    </p>
                  </div>
                )
                return null
              })()}
              {frameResults.length > 0 && (
                <div className="flex flex-col gap-2 mb-6">
                  {aggregateFrameResults(frameResults).map(check => {
                    const okPct = Math.round(frameResults.filter(f => f.checks.find(c => c.id === check.id)?.status === 'ok').length / frameResults.length * 100)
                    const warnPct = Math.round(frameResults.filter(f => f.checks.find(c => c.id === check.id)?.status === 'warn').length / frameResults.length * 100)
                    const badPct = 100 - okPct - warnPct

                    return (
                      <div key={check.id} className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-foreground text-sm font-medium">{check.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            check.status === 'ok' ? 'text-ok bg-ok/10' :
                            check.status === 'warn' ? 'text-warn bg-warn/10' : 'text-bad bg-bad/10'
                          }`}>
                            {check.status === 'ok' ? t('statusOk') : check.status === 'warn' ? t('statusWarn') : t('statusBad')}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden flex">
                          <div className="h-full bg-ok" style={{ width: `${okPct}%` }} />
                          <div className="h-full bg-warn" style={{ width: `${warnPct}%` }} />
                          <div className="h-full bg-bad" style={{ width: `${badPct}%` }} />
                        </div>
                        <p className="text-muted-foreground text-xs mt-1.5">{t('withinRange', { percent: okPct })}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {summary && (
                <div className="bg-paper-2 border border-rule rounded-md px-4 py-4">
                  <p className="text-xs text-ink-soft uppercase tracking-wide mb-2">{t('recommendation')}</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">{summary}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setStage('input'); setFrameResults([]); setSwingPhaseChecks([]); setSummary(''); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl('') } }}
                  className="flex-1 bg-card border border-border text-muted-foreground font-semibold rounded-xl py-3 hover:bg-secondary transition-all text-sm"
                >
                  {t('recordAgain')}
                </button>
                <Link href={`/student/clip/${clipId}`} className="flex-1">
                  <button className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3 hover:opacity-90 transition-all text-sm">
                    {t('viewCheckpoint')}
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </main>
  )
}
