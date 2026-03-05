'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { calculateMetrics, compareToBaseline, baselineOverallStatus, METRICS_BY_ANGLE } from '@/lib/baseline'
import { loadMediaPipe, createPose, createCamera } from '@/lib/mediapipe'
import type { Checkpoint, Baseline } from '@/lib/types'
import type { BaselineCheck } from '@/lib/baseline'
import Link from 'next/link'

const STATUS_CONFIG = {
  ok: { color: '#34d178', label: 'Postura correcta' },
  warn: { color: '#e8b930', label: 'Ajustar postura' },
  bad: { color: '#f04848', label: 'Corregir postura' },
}

// Short action hints per metric+direction, visible at a distance
const ACTION_HINTS: Record<string, { high: string; low: string }> = {
  head_lateral:   { high: '← Centrar',    low: '→ Centrar' },
  shoulder_level: { high: 'Nivelar',       low: 'Nivelar' },
  arm_angle:      { high: '↓ Relajar',    low: '↑ Extender' },
  spine_angle:    { high: '↓ Inclinar',   low: '↑ Erguir' },
  knee_flex:      { high: '↑ Extender',   low: '↓ Flexionar' },
  head_forward:   { high: '← Atrás',      low: '→ Adelante' },
  hip_sway:       { high: '← Centrar',    low: '→ Centrar' },
  hip_hinge:      { high: '↑ Menos',      low: '↓ Más' },
  trail_arm:      { high: '↓ Relajar',    low: '↑ Extender' },
  head_height:    { high: '↓ Bajar',      low: '↑ Subir' },
  stance_width:   { high: '→← Juntar',    low: '←→ Separar' },
  weight_shift:   { high: '← Centrar',    low: '→ Centrar' },
}

export default function StudentMirror() {
  const { student } = useAuth()
  const router = useRouter()
  const params = useParams()
  const cpId = params.id as string

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const checkpointRef = useRef<Checkpoint | null>(null)
  // Smoothing buffer for baseline checks
  const smoothRef = useRef<Array<Array<{ id: string; status: string; direction: string }>>>([])

  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
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
    const { data } = await supabase.from('checkpoints').select('*').eq('id', cpId).single()
    if (!data?.baseline || Object.keys(data.baseline).length === 0) { setError('Este ejercicio aún no tiene referencia. Pide a tu instructor que calibre primero.'); return }
    if (data.checkpoint_type === 'swing') { setError('El espejo inteligente funciona solo con ejercicios de postura. Para analizar tu swing, usa "Grabar práctica".'); return }
    setCheckpoint(data)
    checkpointRef.current = data
    await startCamera('environment')
    setReady(true)
  }

  async function startCamera(facing: 'user' | 'environment') {
    try {
      await loadMediaPipe()
      const pose = await createPose(onResults)
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
      setError('Error al iniciar la cámara.')
    }
  }

  async function flipCamera() {
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    smoothRef.current = []
    await startCamera(newFacing)
  }

  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    const cp = checkpointRef.current
    if (!canvas || !video || !cp?.baseline) return

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const lm = results.poseLandmarks
    if (!lm) { setPoseDetected(false); return }

    setPoseDetected(true)
    const metrics = calculateMetrics(lm, cp.camera_angle)
    const expected = cp.selected_metrics?.length
      ? cp.selected_metrics
      : METRICS_BY_ANGLE[cp.camera_angle] ?? []
    setExpectedCount(expected.length)
    setDetectedCount(Object.keys(metrics).filter(k => expected.includes(k)).length)
    const rawChecks = compareToBaseline(metrics, cp.baseline as Baseline, cp.selected_metrics)

    // 6-frame majority vote smoothing
    smoothRef.current.push(rawChecks.map(c => ({ id: c.id, status: c.status, direction: c.direction })))
    if (smoothRef.current.length > 6) smoothRef.current.shift()

    const smoothed = rawChecks.map((check, i) => {
      const votes: Record<string, number> = {}
      const dirVotes: Record<string, number> = {}
      for (const frame of smoothRef.current) {
        const s = frame[i]?.status ?? 'ok'
        const d = frame[i]?.direction ?? 'center'
        votes[s] = (votes[s] ?? 0) + 1
        dirVotes[d] = (dirVotes[d] ?? 0) + 1
      }
      const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] as 'ok' | 'warn' | 'bad'
      const bestDir = Object.entries(dirVotes).sort((a, b) => b[1] - a[1])[0][0] as 'high' | 'low' | 'center'
      return { ...check, status: best, direction: bestDir }
    })

    setChecks(smoothed)

    // Draw skeleton with status colors
    const drawConnectors = (window as any).drawConnectors
    const drawLandmarks = (window as any).drawLandmarks
    const POSE_CONNECTIONS = (window as any).POSE_CONNECTIONS
    if (drawConnectors && POSE_CONNECTIONS) {
      const overall = baselineOverallStatus(smoothed)
      const color = STATUS_CONFIG[overall]?.color ?? '#34d178'
      const isTablet = canvas.width >= 768
      drawConnectors(ctx, lm, POSE_CONNECTIONS, { color, lineWidth: isTablet ? 5 : 3 })
      drawLandmarks(ctx, lm, { color: '#060a08', fillColor: color, lineWidth: 1, radius: isTablet ? 6 : 4 })
    }
  }, [])

  const overall = checks.length ? baselineOverallStatus(checks) : null

  if (error) return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5 gap-4 text-center">
      <p className="text-muted-foreground">{error}</p>
      <Link href={`/student/checkpoint/${cpId}`} className="text-ok hover:underline text-sm">← Volver</Link>
    </main>
  )

  return (
    <main className="min-h-screen bg-background flex flex-col md:flex-row overflow-hidden" style={{ height: '100dvh' }}>
      {/* Phone restriction — show message instead of camera on small screens */}
      <div className="flex md:hidden flex-col items-center justify-center flex-1 px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-blue/10 border border-blue/20 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue">
            <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <p className="text-foreground font-semibold">Usa un iPad o tablet para el espejo</p>
        <p className="text-muted-foreground text-sm max-w-xs">El espejo inteligente necesita una pantalla más grande para que puedas verte a distancia.</p>
        <Link href={`/student/checkpoint/${cpId}`} className="text-ok hover:underline text-sm mt-2">← Volver al ejercicio</Link>
      </div>

      {/* Video area — hidden on phone */}
      <div className="relative flex-1 bg-black overflow-hidden hidden md:block" style={{ minHeight: 0 }}>
        <video ref={videoRef} className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} playsInline muted />
        <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />

        {/* Top bar — hidden in kiosk */}
        {!kiosk && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <Link href={`/student/checkpoint/${cpId}`} className="bg-background/70 backdrop-blur border border-border rounded-xl px-3 py-3 text-muted-foreground text-sm hover:text-foreground transition-colors">
              ←
            </Link>
            {hasMultipleCameras && (
              <button
                onClick={flipCamera}
                title="Cambiar cámara"
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
          title={kiosk ? 'Salir de pantalla completa' : 'Pantalla completa'}
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

        {/* Checkpoint name — hidden in kiosk */}
        {!kiosk && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background/70 backdrop-blur border border-border rounded-xl px-4 py-2">
            <p className="text-foreground text-sm md:text-base font-medium">{checkpoint?.name}</p>
          </div>
        )}

        {/* Status pill */}
        {overall && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 md:gap-3 bg-background/80 backdrop-blur border rounded-full px-4 md:px-6 py-2 md:py-3"
            style={{ borderColor: STATUS_CONFIG[overall].color + '40' }}
          >
            <div
              className="w-3 h-3 md:w-4 md:h-4 rounded-full animate-pulse"
              style={{ backgroundColor: STATUS_CONFIG[overall].color }}
            />
            <span className="text-sm md:text-lg font-semibold" style={{ color: STATUS_CONFIG[overall].color }}>
              {STATUS_CONFIG[overall].label}
            </span>
          </div>
        )}

        {/* Visibility warning — not enough body visible */}
        {poseDetected && expectedCount > 0 && detectedCount < expectedCount && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-warn/90 backdrop-blur rounded-full px-5 py-2.5 max-w-sm text-center">
            <span className="text-black text-sm md:text-base font-medium">
              Muestra todo el cuerpo — {detectedCount}/{expectedCount} métricas visibles
            </span>
          </div>
        )}

        {!poseDetected && ready && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-background/80 backdrop-blur border border-warn/30 rounded-full px-5 py-2.5">
            <span className="text-warn text-sm md:text-base">Ponte en el encuadre</span>
          </div>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <div className="w-8 h-8 rounded-full border-2 border-ok border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Panel — hidden in kiosk mode, hidden on phone */}
      {!kiosk && (
        <div className="flex-shrink-0 md:w-80 lg:w-96 bg-card border-t md:border-t-0 md:border-l border-border overflow-y-auto hidden md:block">
          <div className="p-3 md:p-4">
            {checks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm md:text-base">Esperando detección de pose...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {checks.map(check => {
                  const hint = check.status !== 'ok' && check.direction !== 'center'
                    ? ACTION_HINTS[check.id]?.[check.direction] ?? ''
                    : ''
                  return (
                    <div
                      key={check.id}
                      className="flex items-center gap-3 md:gap-4 rounded-xl px-3 md:px-4 h-14 md:h-16"
                      style={{ backgroundColor: STATUS_CONFIG[check.status]?.color + '10' }}
                    >
                      <div
                        className="flex-shrink-0 w-4 h-4 md:w-5 md:h-5 rounded-full"
                        style={{ backgroundColor: STATUS_CONFIG[check.status]?.color }}
                      />
                      <span className="flex-1 text-foreground font-medium text-base md:text-lg truncate">{check.label}</span>
                      {check.status === 'ok' ? (
                        <span className="text-ok font-bold text-xl md:text-2xl shrink-0">✓</span>
                      ) : (
                        <span
                          className="font-semibold text-sm md:text-base shrink-0"
                          style={{ color: STATUS_CONFIG[check.status]?.color }}
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
