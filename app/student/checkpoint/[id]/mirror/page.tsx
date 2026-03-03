'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { calculateMetrics, compareToBaseline, baselineOverallStatus, baselineTip } from '@/lib/baseline'
import { loadMediaPipe, createPose, createCamera } from '@/lib/mediapipe'
import type { Checkpoint, Baseline } from '@/lib/types'
import type { BaselineCheck } from '@/lib/baseline'
import Link from 'next/link'

const STATUS_CONFIG = {
  ok: { color: '#34d178', label: 'Postura correcta' },
  warn: { color: '#e8b930', label: 'Ajustar postura' },
  bad: { color: '#f04848', label: 'Corregir postura' },
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
  const smoothRef = useRef<Array<Array<{ id: string; status: string }>>>([])

  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [checks, setChecks] = useState<BaselineCheck[]>([])
  const [poseDetected, setPoseDetected] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    init()
    return () => poseRef.current?.close?.()
  }, [])

  async function init() {
    const { data } = await supabase.from('checkpoints').select('*').eq('id', cpId).single()
    if (!data?.baseline || Object.keys(data.baseline).length === 0) { setError('Este ejercicio aún no tiene referencia. Pide a tu instructor que calibre primero.'); return }
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
    const rawChecks = compareToBaseline(metrics, cp.baseline as Baseline)

    // 6-frame majority vote smoothing
    smoothRef.current.push(rawChecks.map(c => ({ id: c.id, status: c.status })))
    if (smoothRef.current.length > 6) smoothRef.current.shift()

    const smoothed = rawChecks.map((check, i) => {
      const votes: Record<string, number> = {}
      for (const frame of smoothRef.current) {
        const s = frame[i]?.status ?? 'ok'
        votes[s] = (votes[s] ?? 0) + 1
      }
      const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] as 'ok' | 'warn' | 'bad'
      return { ...check, status: best }
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
  const tip = checks.length ? baselineTip(checks) : ''

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

      {/* Panel */}
      <div className="flex-shrink-0 lg:w-72 bg-card border-t lg:border-t-0 lg:border-l border-border overflow-y-auto" style={{ maxHeight: '50vh', minHeight: '120px' }}>
        <div className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Comparación con tu referencia</p>

          {checks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">Esperando detección de pose...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {checks.map(check => (
                <div key={check.id} className="bg-secondary border border-border rounded-xl px-3 py-3 flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
                    style={{ backgroundColor: STATUS_CONFIG[check.status]?.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-foreground text-sm font-medium">{check.label}</span>
                      <span className="text-xs font-mono" style={{ color: STATUS_CONFIG[check.status]?.color }}>
                        {check.status === 'ok' ? 'OK' : check.status === 'warn' ? 'Ajustar' : 'Corregir'}
                      </span>
                    </div>
                    {check.status !== 'ok' && (
                      <p className="text-muted-foreground text-xs leading-snug">{check.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tip && (
            <div className="mt-4 bg-secondary border border-border rounded-xl px-3 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Consejo principal</p>
              <p className="text-foreground text-sm leading-relaxed">{tip}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
