'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { calculateMetrics, compareToBaseline, baselineOverallStatus, METRICS_BY_ANGLE } from '@/lib/baseline'
import { loadMediaPipe, createPose, createCamera } from '@/lib/mediapipe'
import { createOneEuroState, filterLandmarks } from '@/lib/oneEuroFilter'
import type { Clip } from '@/lib/classes'
import type { Baseline } from '@/lib/types'
import type { BaselineCheck } from '@/lib/baseline'
import Link from 'next/link'

const STATUS_COLORS = {
  ok: '#34d178',
  warn: '#e8b930',
  bad: '#f04848',
}

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
  const { student } = useAuth()
  const router = useRouter()
  const params = useParams()
  const clipId = params.id as string
  const t = useTranslations('student.mirror')
  const ACTION_HINTS = buildActionHints(t)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const clipRef = useRef<Clip | null>(null)
  // Smoothing buffer for baseline checks
  const smoothRef = useRef<Array<Array<{ id: string; status: string; direction: string }>>>([])
  const filterStateRef = useRef(createOneEuroState())
  const frameTimeRef = useRef(0)

  const [clip, setClip] = useState<Clip | null>(null)
  const [checks, setChecks] = useState<BaselineCheck[]>([])
  const [detectedCount, setDetectedCount] = useState(0)
  const [expectedCount, setExpectedCount] = useState(0)
  const [poseDetected, setPoseDetected] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [kiosk, setKiosk] = useState(false)

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setHasMultipleCameras(devices.filter(d => d.kind === 'videoinput').length > 1)
    }).catch(() => {})
    init()
    return () => { cameraRef.current?.stop() }
  }, [])

  async function init() {
    const { data } = await supabase.from('clips').select('*').eq('id', clipId).single()
    if (!data) { setError(t('errorNoBaseline')); return }
    // Swing clips have no real-time mirror — redirect to practice flow
    if (data.clip_type === 'swing') {
      router.replace(`/student/clip/${clipId}/practice`)
      return
    }
    if (!data.baseline || Object.keys(data.baseline).length === 0) { setError(t('errorNoBaseline')); return }
    setClip(data as Clip)
    clipRef.current = data as Clip
    await startCamera('environment')
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
          if (facing === 'environment') {
            setFacingMode('user')
            const fallback = createCamera(videoRef.current, async () => {
              if (poseRef.current && videoRef.current) {
                try { await poseRef.current.send({ image: videoRef.current }) } catch {}
              }
            }, 'user')
            cameraRef.current = fallback
            await fallback.start()
          } else throw new Error('No camera')
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
    await startCamera(newFacing)
  }

  const onResults = useCallback((results: any) => {
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
    if (!lm) { setPoseDetected(false); return }

    setPoseDetected(true)
    const metrics = calculateMetrics(lm, c.camera_angle)
    const expected = c.selected_metrics?.length
      ? c.selected_metrics
      : METRICS_BY_ANGLE[c.camera_angle] ?? []
    setExpectedCount(expected.length)
    setDetectedCount(Object.keys(metrics).filter(k => expected.includes(k)).length)
    const rawChecks = compareToBaseline(metrics, c.baseline as Baseline, c.selected_metrics)

    // 6-frame majority vote smoothing
    smoothRef.current.push(rawChecks.map(c => ({ id: c.id, status: c.status, direction: c.direction })))
    if (smoothRef.current.length > 6) smoothRef.current.shift()

    const smoothed = rawChecks.map((check, i) => {
      const votes: Record<string, number> = {}
      const dirVotes: Record<string, number> = {}
      // Skip frames where this metric isn't present (landmark dipped, baseline
      // missing the key, etc.). Defaulting to 'ok' would silently bias the
      // vote toward a happy result and violate CLAUDE.md's "no wrong feedback"
      // principle.
      for (const frame of smoothRef.current) {
        const entry = frame[i]
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

    // Filter landmarks for smooth skeleton drawing
    frameTimeRef.current += 1 / 15  // approximate ~15fps from MediaPipe
    const filteredLm = filterLandmarks(filterStateRef.current, lm, frameTimeRef.current)

    // Draw skeleton with status colors
    const drawConnectors = (window as any).drawConnectors
    const drawLandmarks = (window as any).drawLandmarks
    const POSE_CONNECTIONS = (window as any).POSE_CONNECTIONS
    if (drawConnectors && POSE_CONNECTIONS) {
      const overall = baselineOverallStatus(smoothed)
      const color = STATUS_COLORS[overall] ?? '#34d178'
      const isTablet = canvas.width >= 768
      drawConnectors(ctx, filteredLm, POSE_CONNECTIONS, { color, lineWidth: isTablet ? 5 : 3 })
      drawLandmarks(ctx, filteredLm, { color: '#060a08', fillColor: color, lineWidth: 1, radius: isTablet ? 6 : 4 })
    }
  }, [])

  if (error) return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4 text-center">
      <p className="text-muted-foreground">{error}</p>
      <Link href={`/student/clip/${clipId}`} className="text-ok hover:underline text-sm">{t('backToCheckpoint')}</Link>
    </main>
  )

  return (
    <main className="min-h-screen bg-background flex flex-col md:flex-row overflow-hidden" style={{ height: '100dvh' }}>
      {/* Phone restriction — show message instead of camera on small screens */}
      <div className="flex md:hidden flex-col items-center justify-center flex-1 px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-md bg-paper-2 border border-rule flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <p className="text-foreground font-semibold">{t('phoneRestrictionTitle')}</p>
        <p className="text-muted-foreground text-sm max-w-xs">{t('phoneRestrictionDesc')}</p>
        <Link href={`/student/clip/${clipId}`} className="text-ok hover:underline text-sm mt-2">{t('backToCheckpointFull')}</Link>
      </div>

      {/* Video area — hidden on phone */}
      <div className="relative flex-1 bg-black overflow-hidden hidden md:block" style={{ minHeight: 0 }}>
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

        {/* Visibility warning — top center, where clip name used to be */}
        {poseDetected && expectedCount > 0 && detectedCount < expectedCount && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-warn/90 backdrop-blur rounded-md px-5 py-2.5 text-center">
            <p className="text-black text-sm md:text-base font-medium">{t('showBodyTitle')}</p>
            <p className="text-black/70 text-xs md:text-sm">{t('metricsVisible', { visible: detectedCount, total: expectedCount })}</p>
          </div>
        )}

        {!poseDetected && ready && (
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
          <div className="flex-1 flex flex-col p-3 md:p-4 min-h-0">
            {checks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground text-sm md:text-base">{t('waitingPose')}</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-2">
                {checks.map(check => {
                  const hint = check.status !== 'ok' && check.direction !== 'center'
                    ? ACTION_HINTS[check.id]?.[check.direction] ?? ''
                    : ''
                  return (
                    <div
                      key={check.id}
                      className="flex items-center gap-4 rounded-xl px-4 flex-1 min-h-0"
                      style={{ backgroundColor: STATUS_COLORS[check.status] + '10' }}
                    >
                      <div
                        className="flex-shrink-0 w-5 h-5 lg:w-6 lg:h-6 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[check.status] }}
                      />
                      <span className="flex-1 text-foreground font-medium text-lg lg:text-xl truncate">{check.label}</span>
                      {check.status === 'ok' ? (
                        <span className="text-ok font-bold text-2xl lg:text-3xl shrink-0">✓</span>
                      ) : (
                        <span
                          className="font-semibold text-base lg:text-lg shrink-0"
                          style={{ color: STATUS_COLORS[check.status] }}
                        >
                          {hint}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
