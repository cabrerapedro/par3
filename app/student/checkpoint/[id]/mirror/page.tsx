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

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    init()
    return () => { /* pose is a singleton — don't close */ }
  }, [])

  async function init() {
    const { data } = await supabase.from('checkpoints').select('*').eq('id', cpId).single()
    if (!data?.baseline || Object.keys(data.baseline).length === 0) { setError('Este ejercicio aún no tiene referencia. Pide a tu instructor que calibre primero.'); return }
    if (data.checkpoint_type === 'swing') { setError('El espejo inteligente funciona solo con ejercicios de postura. Para analizar tu swing, usa "Grabar práctica".'); return }
    setCheckpoint(data)
    checkpointRef.current = data
    await initMediaPipe()
    setReady(true)
  }

  async function initMediaPipe() {
    try {
      await loadMediaPipe()
      const pose = createPose(onResults)
      poseRef.current = pose

      if (videoRef.current) {
        const cam = createCamera(videoRef.current, async () => {
          if (poseRef.current && videoRef.current) await poseRef.current.send({ image: videoRef.current })
        })
        await cam.start()
      }
    } catch {
      setError('Error al iniciar la cámara.')
    }
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
      drawConnectors(ctx, lm, POSE_CONNECTIONS, { color, lineWidth: 3 })
      drawLandmarks(ctx, lm, { color: '#060a08', fillColor: color, lineWidth: 1, radius: 4 })
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
    <main className="min-h-screen bg-background flex flex-col lg:flex-row overflow-hidden" style={{ height: '100dvh' }}>
      {/* Video area */}
      <div className="relative flex-1 bg-black overflow-hidden" style={{ minHeight: 0 }}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />

        {/* Back button */}
        <Link href={`/student/checkpoint/${cpId}`} className="absolute top-4 left-4 z-10 bg-background/70 backdrop-blur border border-border rounded-xl px-3 py-2 text-muted-foreground text-sm hover:text-muted-foreground transition-colors">
          ←
        </Link>

        {/* Checkpoint name */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background/70 backdrop-blur border border-border rounded-xl px-3 py-1.5">
          <p className="text-foreground text-sm font-medium">{checkpoint?.name}</p>
        </div>

        {/* Status pill */}
        {overall && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/80 backdrop-blur border rounded-full px-4 py-2"
            style={{ borderColor: STATUS_CONFIG[overall].color + '40' }}
          >
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: STATUS_CONFIG[overall].color }}
            />
            <span className="text-sm font-medium" style={{ color: STATUS_CONFIG[overall].color }}>
              {STATUS_CONFIG[overall].label}
            </span>
          </div>
        )}

        {/* Visibility warning — not enough body visible */}
        {poseDetected && expectedCount > 0 && detectedCount < expectedCount && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-warn/90 backdrop-blur rounded-full px-4 py-2 max-w-xs text-center">
            <span className="text-black text-sm font-medium">
              Muestra todo el cuerpo — {detectedCount}/{expectedCount} métricas visibles
            </span>
          </div>
        )}

        {!poseDetected && ready && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-background/80 backdrop-blur border border-warn/30 rounded-full px-4 py-2">
            <span className="text-warn text-sm">Ponte en el encuadre</span>
          </div>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <div className="w-6 h-6 rounded-full border-2 border-ok border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Panel — fixed-height rows, readable at distance */}
      <div className="flex-shrink-0 lg:w-80 bg-card border-t lg:border-t-0 lg:border-l border-border overflow-y-auto" style={{ maxHeight: '50vh', minHeight: '120px' }}>
        <div className="p-3">
          {checks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">Esperando detección de pose...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {checks.map(check => {
                const hint = check.status !== 'ok' && check.direction !== 'center'
                  ? ACTION_HINTS[check.id]?.[check.direction] ?? ''
                  : ''
                return (
                  <div
                    key={check.id}
                    className="flex items-center gap-3 rounded-xl px-3 h-14"
                    style={{ backgroundColor: STATUS_CONFIG[check.status]?.color + '10' }}
                  >
                    <div
                      className="flex-shrink-0 w-3 h-3 rounded-full"
                      style={{ backgroundColor: STATUS_CONFIG[check.status]?.color }}
                    />
                    <span className="flex-1 text-foreground font-medium text-base truncate">{check.label}</span>
                    {check.status === 'ok' ? (
                      <span className="text-ok font-bold text-lg shrink-0">✓</span>
                    ) : (
                      <span
                        className="font-semibold text-sm shrink-0"
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
    </main>
  )
}
