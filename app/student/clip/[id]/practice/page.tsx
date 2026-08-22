'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  calculateMetrics, generateBaselineSummary, METRICS_BY_ANGLE, isSwingBaseline,
  detectSwingReps, averageSwingReps, compareSwingToBaseline, generateSwingSummary,
  selectStableFrames, aggregatePositionChecks, baselineMetricsVersion, estimateCameraAngle,
  checkPlacement, baselineFocusMetrics, swingRepConsistency,
} from '@/lib/baseline'
import { refineSwingReps } from '@/lib/processClip'
import { logAnalysisEvent } from '@/lib/telemetry'
import type { PlacementStatus, MetricOpts } from '@/lib/baseline'
import { loadMediaPipe, createPose } from '@/lib/mediapipe'
import type { PoseResults } from '@/lib/mediapipe'
import { pickVideoMime, resolveRecordedMime, videoRecorderOptions, RECORDER_TIMESLICE_MS } from '@/lib/recorder'
import { useWakeLock } from '@/lib/wakeLock'
import { insertSessionFrames, type FrameRow } from '@/lib/frames'
import type { Clip } from '@/lib/classes'
import type { Baseline, CameraAngle, Landmark, SwingBaseline } from '@/lib/types'
import type { AggregatedCheck, SwingPhaseCheck } from '@/lib/baseline'
import Link from 'next/link'

type Stage = 'input' | 'recording' | 'processing' | 'results'

export default function StudentClipPractice() {
  const { student, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.practice')
  const tp = useTranslations('student.placement')
  const tCommon = useTranslations('common')
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
  const [positionChecks, setPositionChecks] = useState<AggregatedCheck[]>([])
  // Seconds of stable, in-position footage the evaluation actually used.
  const [evaluatedSeconds, setEvaluatedSeconds] = useState(0)
  // Swing reps detected in the attempt (0 = not swing mode).
  const [repsCount, setRepsCount] = useState(0)
  // Set when the video's geometry clearly doesn't match the clip's configured
  // camera angle — the comparison is then unreliable and we say so.
  const [detectedAngle, setDetectedAngle] = useState<CameraAngle | null>(null)
  // Low-confidence explanations shown WITH the results ("mejor sin feedback
  // que feedback erróneo" — and when we do give it, we say how solid it is).
  const [confidenceNotes, setConfidenceNotes] = useState<string[]>([])
  // Rep-to-rep consistency for swing attempts (null = not applicable).
  const [consistencyLevel, setConsistencyLevel] = useState<'high' | 'medium' | 'low' | null>(null)
  const [summary, setSummary] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [error, setError] = useState('')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [recordingVisibleCount, setRecordingVisibleCount] = useState(-1)
  // Live placement guidance while recording (distance / view), fed by the
  // same 1 Hz pose check that powers the visibility counter. Non-blocking.
  const [recordingPlacement, setRecordingPlacement] = useState<PlacementStatus | null>(null)
  const recentPoseRef = useRef<Landmark[][]>([])
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
  const trailSideRef = useRef<'left' | 'right' | undefined>(undefined)

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
    // Handedness fresh from the DB: the cached student in localStorage can
    // lag behind an edit the instructor made on their profile, and a stale
    // trail arm would compare against a baseline built with the other one.
    if (student) {
      const { data: s } = await supabase
        .from('students').select('dominant_hand').eq('id', student.id).single()
      const hand = s?.dominant_hand ?? student.dominant_hand
      trailSideRef.current = hand === 'left' || hand === 'right' ? hand : undefined
    }
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
      const recorder = new MediaRecorder(stream, videoRecorderOptions(picked))
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
    setRecordingPlacement(null)
    recentPoseRef.current = []
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
        if (!results.poseLandmarks) {
          setRecordingVisibleCount(0)
          setRecordingPlacement(null)
          recentPoseRef.current = []
          return
        }
        // Same metrics version as the eventual evaluation, so the live
        // "N/6 métricas" counter matches what will actually be scored.
        const version = baselineMetricsVersion(c.baseline)
        const metrics = calculateMetrics(results.poseLandmarks, c.camera_angle, version)
        const expected = c.selected_metrics?.length
          ? c.selected_metrics
          : METRICS_BY_ANGLE[c.camera_angle] ?? []
        setRecordingVisibleCount(Object.keys(metrics).filter(k => expected.includes(k)).length)

        // Placement guidance: at 1 Hz, ~8 buffered frames span the last 8s.
        recentPoseRef.current.push(results.poseLandmarks.map(l => ({
          x: l.x, y: l.y, z: l.z, visibility: l.visibility,
        })))
        if (recentPoseRef.current.length > 8) recentPoseRef.current.shift()
        setRecordingPlacement(checkPlacement(recentPoseRef.current, c.camera_angle, expected, version))
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
    setPositionChecks([])
    setRepsCount(0)
    setDetectedAngle(null)
    setConfidenceNotes([])
    setConsistencyLevel(null)

    const isSwingMode = clip.clip_type === 'swing' || isSwingBaseline(clip.baseline)
    const tAnalysis = performance.now()

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
    // Full model: this runs AFTER recording with a progress bar — the latency
    // budget is seconds, and the model-1 landmarks are visibly less jittery
    // (which matters double in swing, where phases are scored on few frames).
    const pose = await createPose(() => {}, { modelComplexity: 1, smoothLandmarks: false })

    // The student's handedness pins trail_arm to the correct arm (fetched
    // fresh in loadClip; falls back to the cached profile).
    const metricOpts: MetricOpts = trailSideRef.current ? { trailSide: trailSideRef.current } : {}

    // Frame rows captured for session_frames batch insert (ML training corpus).
    // All evaluation happens AFTER the loop, from these rows — that's what lets
    // us filter to stable segments and aggregate per metric with real presence
    // accounting instead of judging frame by frame.
    const frameRows: FrameRow[] = []
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')!

    let resolveFrame: (() => void) | null = null
    let frameLandmarks: Landmark[] | null = null
    let frameWorld: Landmark[] | undefined = undefined
    let frameMetrics: Record<string, number> | undefined = undefined
    pose.onResults((r: PoseResults) => {
      frameLandmarks = null
      frameWorld = undefined
      frameMetrics = undefined
      if (r.poseLandmarks) {
        frameLandmarks = r.poseLandmarks.map((lm) => ({
          x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility,
        }))
        // 3D world landmarks: captured for the corpus (not used by any metric yet).
        frameWorld = r.poseWorldLandmarks?.map((lm) => ({
          x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility,
        }))
        // Stored metrics are always current-version (canonical for the ML
        // corpus); comparison metrics are computed separately below with the
        // baseline's own version.
        frameMetrics = calculateMetrics(r.poseLandmarks, clip.camera_angle, undefined, metricOpts)
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
      frameLandmarks = null
      frameWorld = undefined
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
          world_landmarks: frameWorld,
        })
      }

      setProgress(Math.round((i + 1) / totalFrames * 100))
    }

    if (aborted) {
      URL.revokeObjectURL(url)
      return
    }

    // Camera-angle sanity check: if the video's geometry clearly says the
    // student filmed from the other view, every metric comparison is invalid.
    // We still show results (the instructor's clip config is authority) but
    // warn loudly so a bad score isn't read as bad technique.
    const estimated = estimateCameraAngle(frameRows.map((r) => r.landmarks))
    const angleMismatch = Boolean(estimated && estimated !== clip.camera_angle)
    if (angleMismatch) setDetectedAngle(estimated)

    // Confidence gate: MediaPipe found a person in under 30% of the sampled
    // frames → any verdict would be built on scraps. Better no feedback than
    // wrong feedback.
    if (frameRows.length / totalFrames < 0.3) {
      logAnalysisEvent({
        source: 'practice', step: 'rejected', status: 'info', clip_id: clip.id, student_id: student?.id ?? null,
        duration_ms: performance.now() - tAnalysis,
        detail: { reason: 'low_detection', detected: frameRows.length, sampled: totalFrames, fps },
      })
      setError(t('lowDetectionError'))
      URL.revokeObjectURL(url)
      return
    }

    // Comparison metrics must match the baseline's metrics version (v1 clips
    // were calibrated with camera-dependent distances; v2 with body-normalized
    // ones).
    const compareVersion = baselineMetricsVersion(clip.baseline)
    // Metrics the instructor's annotations point at — drives what we tell the
    // student to fix first.
    const focus = baselineFocusMetrics(clip.baseline)
    const notes: string[] = []

    if (isSwingMode) {
      // Swing mode: segment every repetition, average them, compare per phase
      const allLandmarks = frameRows.map((r) => r.landmarks)
      if (allLandmarks.length < 10) {
        setError(t('swingNotEnoughPose'))
        URL.revokeObjectURL(url)
        return
      }

      let reps = detectSwingReps(allLandmarks, clip.camera_angle, compareVersion, metricOpts)
      if (!reps) {
        setError(t('swingNotDetected'))
        URL.revokeObjectURL(url)
        return
      }

      // Two-pass: re-sample each rep's top→impact window at 30 fps so the
      // fastest part of the swing isn't judged from a ±50 ms frame. Falls
      // back to the coarse reps on any failure.
      let tempo: { backswingMs: number; downswingMs: number }[] = []
      try {
        const refined = await refineSwingReps({
          videoBlob: blob,
          cameraAngle: clip.camera_angle,
          coarseReps: reps,
          coarseTimestampsMs: frameRows.map((r) => r.timestamp_ms),
          durationMs: duration * 1000,
          version: compareVersion,
          metricOpts,
        })
        reps = refined.reps
        tempo = refined.tempo
      } catch (e) {
        console.warn('[practice] swing refinement failed, using coarse pass', e)
      }

      const swingBaseline = clip.baseline as SwingBaseline
      // Judge the averaged attempt: steadier than a single rep, and consistent
      // with how the baseline itself is built (stats across reps).
      const avgPhases = averageSwingReps(reps)
      const phaseChecks = compareSwingToBaseline(avgPhases, swingBaseline, clip.selected_metrics)
      const consistency = swingRepConsistency(reps, swingBaseline)

      if (reps.length === 1) notes.push(t('confidenceSingleRep'))

      setPreviewUrl(url)
      setRepsCount(reps.length)
      setSwingPhaseChecks(phaseChecks)
      setConsistencyLevel(consistency?.level ?? null)
      setConfidenceNotes(notes)
      setSummary(generateSwingSummary(phaseChecks, tSwingSummary))
      logAnalysisEvent({
        source: 'practice', step: 'analyzed', clip_id: clip.id, student_id: student?.id ?? null,
        duration_ms: performance.now() - tAnalysis,
        detail: {
          clip_type: 'swing', frames: frameRows.length, sampled: totalFrames, fps, model_complexity: 1,
          reps: reps.length, refined: tempo.length > 0, consistency: consistency?.level ?? null,
          compare_version: compareVersion, angle_mismatch: angleMismatch, focus: focus.length ? focus : null,
          score_ok: phaseChecks.flatMap(pc => pc.checks).filter(c => c.status === 'ok').length,
          score_total: phaseChecks.flatMap(pc => pc.checks).length,
        },
      })

      if (student && clip) {
        const allChecks = phaseChecks.flatMap(pc => pc.checks)
        const overall_score = allChecks.length > 0
          ? Math.round(allChecks.filter(c => c.status === 'ok').length / allChecks.length * 100)
          : 0
        // Persist the real measured value + signed deviation (in effective-σ
        // units) per phase/metric — the Saturday review and any trend
        // analysis need more than a traffic-light status.
        const resultsMap: Record<string, unknown> = Object.fromEntries(
          phaseChecks.flatMap(pc =>
            pc.checks.map(c => {
              const value = avgPhases.find(p => p.phase === pc.phase)?.metrics[c.id]
              return [`${pc.phase}__${c.id}`, { value: value ?? 0, deviation: c.deviation ?? 0, status: c.status }]
            })
          )
        )
        // Session metadata under `_meta` (readers skip `_`-prefixed keys).
        // `tempo` is captured for future validation only — never shown to the
        // student until it's validated against slow-motion ground truth.
        resultsMap._meta = {
          reps: reps.length,
          consistency: consistency?.level ?? null,
          consistency_spread: consistency ? Number(consistency.spread.toFixed(2)) : null,
          tempo,
          confidence: reps.length === 1 || angleMismatch ? 'low' : 'normal',
          unreliable_reason: angleMismatch ? 'angle_mismatch' : null,
          metrics_evaluated: allChecks.length,
        }
        const { data: sessionRow, error: insErr } = await supabase.from('practice_sessions').insert({
          student_id: student.id,
          clip_id: clip.id,
          class_id: clip.class_id,
          checkpoint_id: null,
          date: new Date().toISOString(),
          duration_seconds: Math.round(frameRows.length / fps),
          results: resultsMap,
          overall_score,
        }).select('id').single()

        if (insErr) {
          console.error('practice_sessions insert failed', insErr)
          logAnalysisEvent({
            source: 'practice', step: 'save_failed', status: 'error', clip_id: clip.id, student_id: student.id,
            detail: { error: insErr.message?.slice(0, 300) ?? 'unknown' },
          })
          setError(t('saveFailed'))
        } else if (sessionRow?.id && frameRows.length > 0) {
          try { await insertSessionFrames(sessionRow.id, frameRows) } catch (err) { console.error('session_frames insert failed', err) }
        }
      }

      setStage('results')
    } else {
      // Position mode: evaluate only the stable, in-position stretches, then
      // aggregate per metric with presence accounting (a frame where a metric
      // wasn't measurable is a visibility gap, not a technique failure).
      if (frameRows.length === 0) {
        setError(t('positionNotDetected'))
        URL.revokeObjectURL(url)
        return
      }

      const stable = selectStableFrames(frameRows)
      const evalMetrics = stable.map((r) =>
        calculateMetrics(r.landmarks, clip.camera_angle, compareVersion, metricOpts),
      )
      const aggregated = aggregatePositionChecks(
        evalMetrics,
        clip.baseline as Baseline,
        clip.selected_metrics,
      )

      if (!aggregated.length) {
        setError(t('positionNotDetected'))
        URL.revokeObjectURL(url)
        return
      }

      // Confidence notes: little stable material or few measurable metrics →
      // the verdict is orientative, and we say so instead of pretending.
      const stableSeconds = stable.length / fps
      const expectedMetrics = clip.selected_metrics?.length
        ? clip.selected_metrics.length
        : (METRICS_BY_ANGLE[clip.camera_angle] ?? []).length
      if (stableSeconds < 2) notes.push(t('confidenceShortHold'))
      if (expectedMetrics > 0 && aggregated.length / expectedMetrics < 0.5) {
        notes.push(t('confidenceFewMetrics'))
      }
      const lowConfidence = notes.length > 0 || angleMismatch

      // Order the metric list the same way we pick the primary instruction:
      // worst first, instructor-annotated zones before the rest, then by
      // deviation magnitude.
      const rank = { bad: 2, warn: 1, ok: 0 } as const
      const ordered = [...aggregated].sort(
        (a, b) =>
          rank[b.status] - rank[a.status] ||
          Number(focus.includes(b.id)) - Number(focus.includes(a.id)) ||
          Math.abs(b.deviation) - Math.abs(a.deviation),
      )

      setPreviewUrl(url)
      setPositionChecks(ordered)
      setEvaluatedSeconds(Math.round(stableSeconds))
      setConfidenceNotes(notes)
      setSummary(generateBaselineSummary(aggregated, tBaselineSummary, focus))
      logAnalysisEvent({
        source: 'practice', step: 'analyzed', clip_id: clip.id, student_id: student?.id ?? null,
        duration_ms: performance.now() - tAnalysis,
        detail: {
          clip_type: 'position', frames: frameRows.length, sampled: totalFrames, fps, model_complexity: 1,
          stable_seconds: Number(stableSeconds.toFixed(1)), metrics_evaluated: aggregated.length, expected_metrics: expectedMetrics,
          compare_version: compareVersion, angle_mismatch: angleMismatch, low_confidence: lowConfidence,
          focus: focus.length ? focus : null,
          score_ok: aggregated.filter(c => c.status === 'ok').length, score_total: aggregated.length,
        },
      })

      if (student && clip) {
        const overall_score = Math.round(
          aggregated.filter(c => c.status === 'ok').length / aggregated.length * 100
        )
        // Real measured values + signed deviations, not zero placeholders.
        const resultsMap: Record<string, unknown> = Object.fromEntries(
          aggregated.map(c => [c.id, { value: c.value, deviation: c.deviation, status: c.status }])
        )
        resultsMap._meta = {
          confidence: lowConfidence ? 'low' : 'normal',
          unreliable_reason: angleMismatch ? 'angle_mismatch' : null,
          stable_seconds: Number(stableSeconds.toFixed(1)),
          metrics_evaluated: aggregated.length,
          expected_metrics: expectedMetrics,
        }
        const { data: sessionRow, error: insErr } = await supabase.from('practice_sessions').insert({
          student_id: student.id,
          clip_id: clip.id,
          class_id: clip.class_id,
          checkpoint_id: null,
          date: new Date().toISOString(),
          duration_seconds: Math.round(frameRows.length / fps),
          results: resultsMap,
          overall_score,
        }).select('id').single()

        if (insErr) {
          console.error('practice_sessions insert failed', insErr)
          logAnalysisEvent({
            source: 'practice', step: 'save_failed', status: 'error', clip_id: clip.id, student_id: student.id,
            detail: { error: insErr.message?.slice(0, 300) ?? 'unknown' },
          })
          setError(t('saveFailed'))
        } else if (sessionRow?.id && frameRows.length > 0) {
          try { await insertSessionFrames(sessionRow.id, frameRows) } catch (err) { console.error('session_frames insert failed', err) }
        }
      }

      setStage('results')
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // A full-screen error would throw away results the student already earned:
  // the analysis takes 30-60 s on a phone, and a save hiccup at the very end
  // must not wipe the screen. Once we have results, the error is shown as a
  // banner INSIDE them instead.
  if (error && stage !== 'results') return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4 text-center">
      <p className="text-muted-foreground">{error}</p>
      <Link href={`/student/clip/${clipId}`} className="text-ok hover:underline text-sm">{tCommon('back')}</Link>
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
                {/* Placement + visibility guidance during recording. One chip,
                    highest-priority problem first: a wrong distance/view makes
                    the whole attempt unusable, partial coverage only degrades it. */}
                {recordingVisibleCount >= 0 && clip && (() => {
                  const expected = clip.selected_metrics?.length
                    ? clip.selected_metrics
                    : METRICS_BY_ANGLE[clip.camera_angle] ?? []
                  const placementText =
                    recordingPlacement === 'too_far' ? tp('tooFar')
                    : recordingPlacement === 'too_close' ? tp('tooClose')
                    : recordingPlacement === 'wrong_angle' ? tp('wrongAngle', {
                        expected: clip.camera_angle === 'dtl' ? tp('dtl') : tp('faceOn'),
                      })
                    : null
                  const text = placementText ?? (
                    expected.length > 0 && recordingVisibleCount < expected.length
                      ? t('showFullBody', { visible: recordingVisibleCount, total: expected.length })
                      : null
                  )
                  if (!text) return null
                  return (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 bg-warn/90 backdrop-blur rounded-full px-4 py-2 max-w-xs text-center">
                      <span className="text-black text-sm font-medium">{text}</span>
                    </div>
                  )
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
              {/* Save failed but the evaluation is intact — say so without
                  throwing the results away. */}
              {error && (
                <div className="bg-warn/10 border border-warn/20 rounded-xl px-4 py-3 mb-4">
                  <p className="text-warn text-sm font-medium">{error}</p>
                  <p className="text-muted-foreground text-xs mt-1">{t('saveFailedKeepResults')}</p>
                </div>
              )}

              {/* Camera-angle mismatch — the comparison is unreliable, say so */}
              {detectedAngle && (
                <div className="bg-warn/10 border border-warn/20 rounded-xl px-4 py-3 mb-4">
                  <p className="text-warn text-sm font-medium">
                    {t('angleMismatchTitle')}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {t('angleMismatchDesc', {
                      expected: clip.camera_angle === 'face_on' ? t('angleFaceOnLower') : t('angleDtlLower'),
                      detected: detectedAngle === 'face_on' ? t('angleFaceOnLower') : t('angleDtlLower'),
                    })}
                  </p>
                </div>
              )}

              {/* Low-confidence notes — the results stand, with honesty about
                  how solid they are. */}
              {confidenceNotes.length > 0 && (
                <div className="bg-paper-2 border border-rule rounded-md px-4 py-3 mb-4">
                  {confidenceNotes.map((n, i) => (
                    <p key={i} className="text-muted-foreground text-xs leading-snug">{n}</p>
                  ))}
                </div>
              )}

              {/* Swing mode: reps detected + rep-to-rep consistency */}
              {swingPhaseChecks.length > 0 && repsCount > 0 && (
                <p className="text-muted-foreground text-xs mb-3">
                  {t('repsDetected', { count: repsCount })}
                  {consistencyLevel && (
                    <> · {t(
                      consistencyLevel === 'high' ? 'consistencyHigh'
                      : consistencyLevel === 'medium' ? 'consistencyMedium'
                      : 'consistencyLow'
                    )}</>
                  )}
                </p>
              )}

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
              {positionChecks.length > 0 && (() => {
                const expected = clip.selected_metrics?.length
                  ? clip.selected_metrics
                  : METRICS_BY_ANGLE[clip.camera_angle] ?? []
                const detected = positionChecks.map(c => c.id)
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
              {positionChecks.length > 0 && evaluatedSeconds > 0 && (
                <p className="text-muted-foreground text-xs mb-3">
                  {t('evaluatedStable', { seconds: evaluatedSeconds })}
                </p>
              )}
              {positionChecks.length > 0 && (
                <div className="flex flex-col gap-2 mb-6">
                  {positionChecks.map(check => {
                    const okPct = Math.round(check.okPct * 100)
                    const warnPct = Math.round(check.warnPct * 100)
                    const badPct = Math.max(0, 100 - okPct - warnPct)

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
                  onClick={() => { setStage('input'); setPositionChecks([]); setSwingPhaseChecks([]); setRepsCount(0); setDetectedAngle(null); setConfidenceNotes([]); setConsistencyLevel(null); setSummary(''); setError(''); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl('') } }}
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
