'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  calculateMetrics, compareToBaseline, baselineMetricsVersion, METRICS_BY_ANGLE,
  METRIC_ZONES, SKELETON_SEGMENTS, zoneStatuses, checkPlacement,
} from '@/lib/baseline'
import { loadMediaPipe, createPose, createCamera } from '@/lib/mediapipe'
import type { PoseInstance, CameraInstance, PoseResults } from '@/lib/mediapipe'
import { createOneEuroState, filterLandmarks } from '@/lib/oneEuroFilter'
import type { Clip } from '@/lib/classes'
import type { Baseline, Landmark } from '@/lib/types'
import type { BaselineCheck, BodyZone, PlacementStatus } from '@/lib/baseline'
import Link from 'next/link'

const STATUS_COLORS = {
  ok: '#34d178',
  warn: '#e8b930',
  bad: '#f04848',
}

// Skeleton segments for zones we didn't measure — visible but muted, so an
// unmeasured zone never reads as "approved green".
const NEUTRAL_SEGMENT_COLOR = 'rgba(255, 255, 255, 0.45)'

function buildActionHints(t: (key: string) => string): Record<string, { high: string; low: string }> {
  return {
    head_lateral:   { high: `← ${t('actionCenter')}`,    low: `→ ${t('actionCenter')}` },
    shoulder_level: { high: t('actionLevel'),             low: t('actionLevel') },
    arm_angle:      { high: `↓ ${t('actionRelax')}`,     low: `↑ ${t('actionExtend')}` },
    spine_angle:    { high: `↓ ${t('actionTilt')}`,      low: `↑ ${t('actionStraighten')}` },
    knee_flex:      { high: `↑ ${t('actionExtend')}`,    low: `↓ ${t('actionFlex')}` },
    head_forward:   { high: `← ${t('actionBack')}`,      low: `→ ${t('actionForward')}` },
    hip_sway:       { high: `← ${t('actionCenter')}`,    low: `→ ${t('actionCenter')}` },
    hip_hinge:      { high: `↑ ${t('actionLess')}`,      low: `↓ ${t('actionMore')}` },
    trail_arm:      { high: `↓ ${t('actionRelax')}`,     low: `↑ ${t('actionExtend')}` },
    head_height:    { high: `↓ ${t('actionLower')}`,     low: `↑ ${t('actionRaise')}` },
    stance_width:   { high: `→← ${t('actionTogether')}`, low: `←→ ${t('actionApart')}` },
    weight_shift:   { high: `← ${t('actionCenter')}`,    low: `→ ${t('actionCenter')}` },
  }
}

export default function StudentClipMirror() {
  const { student, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.mirror')
  const tp = useTranslations('student.placement')
  const ACTION_HINTS = buildActionHints(t)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef<PoseInstance | null>(null)
  const cameraRef = useRef<CameraInstance | null>(null)
  const clipRef = useRef<Clip | null>(null)
  // Smoothing buffer for baseline checks — keyed by metric id, NOT array
  // position: the set of detectable metrics changes frame to frame (a landmark
  // dips below the visibility threshold), so positional indexing would mix
  // votes from different metrics.
  const smoothRef = useRef<Array<Record<string, { status: 'ok' | 'warn' | 'bad'; direction: 'high' | 'low' | 'center' }>>>([])
  const filterStateRef = useRef(createOneEuroState())
  const frameTimeRef = useRef(0)

  const [clip, setClip] = useState<Clip | null>(null)
  const [checks, setChecks] = useState<BaselineCheck[]>([])
  const [detectedCount, setDetectedCount] = useState(0)
  const [expectedCount, setExpectedCount] = useState(0)
  const [poseDetected, setPoseDetected] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [kiosk, setKiosk] = useState(false)
  // Skeleton is opt-in (product principle): off by default, the student can turn
  // it on. onResults reads it via a ref since it's a stable [] callback.
  const [showSkeleton, setShowSkeleton] = useState(false)
  const showSkeletonRef = useRef(false)
  useEffect(() => { showSkeletonRef.current = showSkeleton }, [showSkeleton])

  // Placement assistant: the session opens in 'setup' — a non-blocking guide
  // to the marked range spot (distance, view, full body). It flips to 'live'
  // automatically after ~1.5s of solid placement, or on "Empezar ya".
  const [phase, setPhase] = useState<'setup' | 'live'>('setup')
  const phaseRef = useRef<'setup' | 'live'>('setup')
  const [setupStatus, setSetupStatus] = useState<PlacementStatus>('no_person')
  const recentPoseRef = useRef<Landmark[][]>([])
  const okStreakRef = useRef(0)

  const startLive = useCallback(() => {
    phaseRef.current = 'live'
    setPhase('live')
  }, [])

  useEffect(() => {
    // Wait for auth to hydrate before redirecting. On a hard load this effect
    // runs before AuthProvider populates `student`; gating on authLoading
    // avoids bouncing a logged-in student to login. authLoading flips exactly
    // once (true→false), so the camera init still runs only once.
    if (authLoading) return
    if (!student) { router.replace('/student/login'); return }
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setHasMultipleCameras(devices.filter(d => d.kind === 'videoinput').length > 1)
    }).catch(() => {})
    init()
    return () => { cameraRef.current?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  async function init() {
    const { data } = await supabase.from('clips').select('*').eq('id', clipId).single()
    if (!data) { setError(t('errorNoBaseline')); return }
    // Swing clips have no real-time mirror — redirect to practice flow
    if (data.clip_type === 'swing') {
      router.replace(`/student/clip/${clipId}/practice`)
      return
    }
    // `_`-prefixed keys are internal (metrics-version stamp), not metrics.
    if (!data.baseline || Object.keys(data.baseline).filter(k => !k.startsWith('_')).length === 0) { setError(t('errorNoBaseline')); return }
    setClip(data as Clip)
    clipRef.current = data as Clip
    // Front camera so the student sees themselves — it's a mirror, not the
    // rear-facing view.
    await startCamera('user')
    setReady(true)
  }

  async function startCamera(facing: 'user' | 'environment') {
    try {
      await loadMediaPipe()
      // Lite model: smooth real-time on a phone. Smoothing on to reduce jitter
      // in the live overlay.
      const pose = await createPose(onResults, { modelComplexity: 0, smoothLandmarks: true })
      poseRef.current = pose

      if (videoRef.current) {
        cameraRef.current?.stop()
        const cam = createCamera(videoRef.current, async () => {
          if (poseRef.current && videoRef.current) {
            try { await poseRef.current.send({ image: videoRef.current }) } catch {}
          }
        }, facing)
        cameraRef.current = cam
        try {
          await cam.start()
          setFacingMode(facing)
        } catch {
          // Fall back to the other camera if the requested one isn't available.
          const alt = facing === 'user' ? 'environment' : 'user'
          const fallback = createCamera(videoRef.current, async () => {
            if (poseRef.current && videoRef.current) {
              try { await poseRef.current.send({ image: videoRef.current }) } catch {}
            }
          }, alt)
          cameraRef.current = fallback
          await fallback.start()
          setFacingMode(alt)
        }
      }
    } catch {
      setError(t('errorCamera'))
    }
  }

  async function flipCamera() {
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    smoothRef.current = []
    filterStateRef.current = createOneEuroState()
    // New camera → new framing: run the placement guide again.
    phaseRef.current = 'setup'
    setPhase('setup')
    setSetupStatus('no_person')
    recentPoseRef.current = []
    okStreakRef.current = 0
    await startCamera(newFacing)
  }

  const onResults = useCallback((results: PoseResults) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    const c = clipRef.current
    if (!canvas || !video || !c?.baseline) return

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const lm = results.poseLandmarks
    const expected = c.selected_metrics?.length
      ? c.selected_metrics
      : METRICS_BY_ANGLE[c.camera_angle] ?? []
    const version = baselineMetricsVersion(c.baseline)

    if (!lm) {
      setPoseDetected(false)
      if (phaseRef.current === 'setup') {
        recentPoseRef.current = []
        okStreakRef.current = 0
        setSetupStatus('no_person')
      }
      return
    }
    setPoseDetected(true)

    // ---- Setup phase: guide the placement, don't judge the pose yet ------
    if (phaseRef.current === 'setup') {
      recentPoseRef.current.push(lm.map(l => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })))
      if (recentPoseRef.current.length > 15) recentPoseRef.current.shift()
      const placement = checkPlacement(recentPoseRef.current, c.camera_angle, expected, version)
      setSetupStatus(placement)
      if (placement === 'ok') {
        okStreakRef.current++
        // ~1.5s of solid placement at MediaPipe's ~12-15 fps → go live.
        if (okStreakRef.current >= 15) startLive()
      } else {
        okStreakRef.current = 0
      }
      return
    }

    // ---- Live phase -------------------------------------------------------
    // Compute metrics with the SAME version the baseline was built with —
    // v2 baselines store body-normalized distances, v1 (legacy) raw ones.
    const metrics = calculateMetrics(lm, c.camera_angle, version)
    setExpectedCount(expected.length)
    setDetectedCount(Object.keys(metrics).filter(k => expected.includes(k)).length)
    const rawChecks = compareToBaseline(metrics, c.baseline as Baseline, c.selected_metrics)

    // 6-frame majority vote smoothing, keyed by metric id.
    smoothRef.current.push(Object.fromEntries(
      rawChecks.map(c => [c.id, { status: c.status, direction: c.direction }]),
    ))
    if (smoothRef.current.length > 6) smoothRef.current.shift()

    const smoothed = rawChecks.map((check) => {
      const votes: Record<string, number> = {}
      const dirVotes: Record<string, number> = {}
      // Skip frames where this metric isn't present (landmark dipped, baseline
      // missing the key, etc.). Defaulting to 'ok' would silently bias the
      // vote toward a happy result and violate CLAUDE.md's "no wrong feedback"
      // principle.
      for (const frame of smoothRef.current) {
        const entry = frame[check.id]
        if (!entry) continue
        votes[entry.status] = (votes[entry.status] ?? 0) + 1
        dirVotes[entry.direction] = (dirVotes[entry.direction] ?? 0) + 1
      }
      // No usable history yet — show this frame's raw read instead of inventing
      // a status.
      if (Object.keys(votes).length === 0) return check
      const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] as 'ok' | 'warn' | 'bad'
      const bestDir = Object.entries(dirVotes).sort((a, b) => b[1] - a[1])[0][0] as 'high' | 'low' | 'center'
      return { ...check, status: best, direction: bestDir }
    })

    setChecks(smoothed)

    // Filter landmarks for smooth drawing
    frameTimeRef.current += 1 / 15  // approximate ~15fps from MediaPipe
    const filteredLm = filterLandmarks(filterStateRef.current, lm, frameTimeRef.current)
    const px = (i: number) => ({
      x: filteredLm[i].x * canvas.width,
      y: filteredLm[i].y * canvas.height,
      v: filteredLm[i].visibility ?? 0,
    })
    const zones = zoneStatuses(smoothed)
    const isTablet = canvas.width >= 768

    // Opt-in skeleton, colored PER ZONE: red knees + green everything else
    // tells the student where to look. Unmeasured zones draw neutral — we
    // never green-flag what we didn't measure.
    if (showSkeletonRef.current) {
      ctx.lineCap = 'round'
      ctx.lineWidth = isTablet ? 5 : 3
      for (const [zone, segments] of Object.entries(SKELETON_SEGMENTS) as [BodyZone, [number, number][]][]) {
        const status = zones[zone]
        ctx.strokeStyle = status ? STATUS_COLORS[status] : NEUTRAL_SEGMENT_COLOR
        for (const [a, b] of segments) {
          const pa = px(a), pb = px(b)
          if (pa.v < 0.5 || pb.v < 0.5) continue
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.stroke()
        }
      }
    }

    // Pulsing halo on the ONE zone to fix — always drawn, independent of the
    // skeleton toggle. This is the "una instrucción a la vez" made visible on
    // the student's own body.
    const primary = smoothed.find(ch => ch.status === 'bad') ?? smoothed.find(ch => ch.status === 'warn')
    if (primary) {
      const anchors = (METRIC_ZONES[primary.id]?.anchors ?? []).map(px).filter(p => p.v >= 0.5)
      if (anchors.length > 0) {
        const cx = anchors.reduce((s, p) => s + p.x, 0) / anchors.length
        const cy = anchors.reduce((s, p) => s + p.y, 0) / anchors.length
        // Radius scales with the on-screen torso so the halo hugs the zone at
        // any camera distance.
        const s11 = px(11), s12 = px(12), h23 = px(23), h24 = px(24)
        const torsoPx = Math.hypot(
          (s11.x + s12.x) / 2 - (h23.x + h24.x) / 2,
          (s11.y + s12.y) / 2 - (h23.y + h24.y) / 2,
        ) || canvas.height * 0.25
        const pulse = 0.78 + 0.22 * Math.sin(performance.now() / 260)
        const radius = torsoPx * 0.42 * pulse
        const color = STATUS_COLORS[primary.status]
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fillStyle = color + '22'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = isTablet ? 6 : 4
        ctx.stroke()
      }
    }
  }, [startLive])

  if (error) return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4 text-center">
      <p className="text-muted-foreground">{error}</p>
      <Link href={`/student/clip/${clipId}`} className="text-ok hover:underline text-sm">{t('backToCheckpoint')}</Link>
    </main>
  )

  // Guidance line for the setup overlay, mapped from the placement status.
  const placementMessage = (() => {
    switch (setupStatus) {
      case 'no_person': return tp('noPerson')
      case 'too_far': return tp('tooFar')
      case 'too_close': return tp('tooClose')
      case 'wrong_angle': return tp('wrongAngle', {
        expected: clip?.camera_angle === 'dtl' ? tp('dtl') : tp('faceOn'),
      })
      case 'partial': return tp('partial')
      case 'ok': return tp('ready')
    }
  })()

  return (
    <main className="min-h-screen bg-background flex flex-col md:flex-row overflow-hidden" style={{ height: '100dvh' }}>
      {/* Video area. Phones are welcome now: the range has marked spots for
          the device, and the phone UI is the big-type overlay below ("modo
          rango") instead of the side panel. */}
      <div className="relative flex-1 bg-black overflow-hidden block" style={{ minHeight: 0 }}>
        <video ref={videoRef} className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} playsInline muted />
        <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />

        {/* Top bar — hidden in kiosk */}
        {!kiosk && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <Link href={`/student/clip/${clipId}`} className="bg-background/70 backdrop-blur border border-border rounded-xl px-3 py-3 text-muted-foreground text-sm hover:text-foreground transition-colors">
              ←
            </Link>
            <span className="bg-background/70 backdrop-blur border border-border rounded-xl px-4 py-2.5 text-foreground text-sm md:text-base font-medium">
              {clip?.name}
            </span>
            {hasMultipleCameras && (
              <button
                onClick={flipCamera}
                title={t('flipCameraTitle')}
                className="bg-background/70 backdrop-blur border border-border rounded-xl w-12 h-12 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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
            {/* Skeleton opt-in toggle */}
            <button
              onClick={() => setShowSkeleton(s => !s)}
              title={showSkeleton ? t('skeletonHide') : t('skeletonShow')}
              className={`backdrop-blur border rounded-xl w-12 h-12 flex items-center justify-center transition-colors ${showSkeleton ? 'bg-ok/20 border-ok/50 text-ok' : 'bg-background/70 border-border text-muted-foreground hover:text-foreground'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="2" /><path d="M12 7v6" /><path d="m9 21 3-8 3 8" /><path d="M6 11h12" />
              </svg>
            </button>
          </div>
        )}

        {/* Kiosk toggle — always visible, top right */}
        <button
          onClick={() => setKiosk(!kiosk)}
          title={kiosk ? t('kioskExit') : t('kioskEnter')}
          className="absolute top-4 right-4 z-10 bg-background/70 backdrop-blur border border-border rounded-xl w-12 h-12 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {kiosk ? (
              <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
            ) : (
              <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>
            )}
          </svg>
        </button>

        {/* Setup overlay — the "colócate" guide. Non-blocking: auto-advances
            after ~1.5s of solid placement, or "Empezar ya" skips it. */}
        {phase === 'setup' && ready && (
          <div className="absolute inset-0 z-20 flex items-end md:items-center justify-center pb-28 md:pb-0 pointer-events-none">
            <div className="pointer-events-auto bg-background/85 backdrop-blur border border-border rounded-md px-6 py-5 max-w-sm mx-4 flex flex-col items-center text-center gap-2.5">
              <p className="text-foreground font-semibold text-lg">{tp('setupTitle')}</p>
              <p className="text-muted-foreground text-sm">{tp('setupHint')}</p>
              <p className={`text-base md:text-lg font-semibold ${setupStatus === 'ok' ? 'text-ok' : 'text-warn'}`}>
                {placementMessage}
              </p>
              <button
                onClick={startLive}
                className="min-h-[44px] px-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
              >
                {tp('skip')}
              </button>
            </div>
          </div>
        )}

        {/* Big instruction overlay — the "modo rango" readout. Always on for
            phones (no side panel there), and on any device in kiosk mode, so
            the student can read it from meters away. */}
        {phase === 'live' && poseDetected && checks.length > 0 && (
          <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[92%] ${kiosk ? 'flex' : 'flex md:hidden'}`}>
            {(() => {
              const primary = checks.find(c => c.status === 'bad') ?? checks.find(c => c.status === 'warn')
              if (!primary) {
                return (
                  <div className="rounded-2xl px-6 py-3.5 text-center backdrop-blur bg-black/70 border-2 border-ok flex items-center gap-3">
                    <span className="text-ok text-3xl leading-none">✓</span>
                    <span className="text-white font-semibold text-xl md:text-2xl">{t('allGood')}</span>
                  </div>
                )
              }
              const hint = primary.direction !== 'center' ? ACTION_HINTS[primary.id]?.[primary.direction] ?? '' : ''
              return (
                <div
                  className="rounded-2xl px-6 py-3.5 text-center backdrop-blur bg-black/70"
                  style={{ border: `2px solid ${STATUS_COLORS[primary.status]}` }}
                >
                  <p className="text-white font-semibold text-lg md:text-xl leading-tight">{primary.label}</p>
                  {hint && (
                    <p className="font-bold text-2xl md:text-3xl leading-tight" style={{ color: STATUS_COLORS[primary.status] }}>
                      {hint}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Visibility warning — top center, where clip name used to be */}
        {phase === 'live' && poseDetected && expectedCount > 0 && detectedCount < expectedCount && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-warn/90 backdrop-blur rounded-md px-5 py-2.5 text-center">
            <p className="text-black text-sm md:text-base font-medium">{t('showBodyTitle')}</p>
            <p className="text-black/70 text-xs md:text-sm">{t('metricsVisible', { visible: detectedCount, total: expectedCount })}</p>
          </div>
        )}

        {phase === 'live' && !poseDetected && ready && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-background/80 backdrop-blur border border-warn/30 rounded-full px-5 py-2.5">
            <span className="text-warn text-sm md:text-base">{t('stepIntoFrame')}</span>
          </div>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Panel — hidden in kiosk mode, hidden on phone */}
      {!kiosk && (
        <div className="flex-shrink-0 md:w-80 lg:w-[26rem] bg-card border-t md:border-t-0 md:border-l border-border hidden md:flex flex-col h-dvh">
          <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0 justify-center">
            {checks.length === 0 ? (
              <p className="text-muted-foreground text-center text-sm md:text-base">{t('waitingPose')}</p>
            ) : (() => {
              // One instruction at a time: the single most urgent thing to fix
              // (a red first, then a yellow). If nothing's off, celebrate.
              const primary = checks.find(c => c.status === 'bad') ?? checks.find(c => c.status === 'warn')
              if (!primary) {
                return (
                  <div className="flex flex-col items-center text-center gap-3">
                    <span className="text-ok text-5xl">✓</span>
                    <p className="text-foreground font-semibold text-xl lg:text-2xl">{t('allGood')}</p>
                  </div>
                )
              }
              const hint = primary.direction !== 'center' ? ACTION_HINTS[primary.id]?.[primary.direction] ?? '' : ''
              return (
                <div
                  className="flex flex-col items-center text-center gap-4 rounded-2xl px-6 py-8"
                  style={{ backgroundColor: STATUS_COLORS[primary.status] + '14' }}
                >
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: STATUS_COLORS[primary.status] }} />
                  <p className="text-foreground font-semibold text-2xl lg:text-3xl leading-tight">{primary.label}</p>
                  {hint && (
                    <p className="font-bold text-3xl lg:text-4xl" style={{ color: STATUS_COLORS[primary.status] }}>{hint}</p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </main>
  )
}
