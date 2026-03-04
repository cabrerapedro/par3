'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { CheckPanel } from '@/components/CheckPanel'
import { StatusPill } from '@/components/StatusPill'
import {
  analyzeFaceOn, analyzeDownLine, smoothChecks, clearSmoothBuffer,
  overallStatus, getTip,
  type Check, type Status,
} from '@/lib/poseAnalysis'

type View = 'face-on' | 'down-the-line'

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export default function MirrorPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<unknown>(null)
  const viewRef = useRef<View>('face-on')

  const [view, setView] = useState<View>('face-on')
  const [checks, setChecks] = useState<Check[]>([])
  const [status, setStatus] = useState<Status>('off')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { viewRef.current = view }, [view])

  function handleViewChange(v: View) {
    clearSmoothBuffer()
    setView(v)
    setChecks([])
    setStatus('off')
  }

  useEffect(() => {
    let active = true

    async function init() {
      try {
        await loadScript(`${CDN}/pose/pose.js`)
        await loadScript(`${CDN}/drawing_utils/drawing_utils.js`)
        await loadScript(`${CDN}/camera_utils/camera_utils.js`)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any

        const pose = new w.Pose({
          locateFile: (file: string) => `${CDN}/pose/${file}`,
        })
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

        pose.onResults((results: { poseLandmarks?: { x: number; y: number; z: number }[] }) => {
          if (!active) return
          const canvas = canvasRef.current
          if (!canvas) return
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          ctx.clearRect(0, 0, canvas.width, canvas.height)

          if (results.poseLandmarks) {
            w.drawConnectors(ctx, results.poseLandmarks, w.POSE_CONNECTIONS, {
              color: 'rgba(52, 209, 120, 0.55)',
              lineWidth: 3,
            })
            w.drawLandmarks(ctx, results.poseLandmarks, {
              color: '#34d178',
              fillColor: 'rgba(52, 209, 120, 0.25)',
              lineWidth: 1,
              radius: 5,
            })

            const lm = results.poseLandmarks
            const raw = viewRef.current === 'face-on' ? analyzeFaceOn(lm) : analyzeDownLine(lm)
            const smoothed = smoothChecks(raw)
            setChecks(smoothed)
            setStatus(overallStatus(smoothed))
          } else {
            setChecks([])
            setStatus('off')
          }
        })

        const camera = new w.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current) await pose.send({ image: videoRef.current })
          },
          width: 1280,
          height: 720,
        })
        cameraRef.current = camera
        await camera.start()

        if (active) setReady(true)
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Error al iniciar la cámara')
      }
    }

    init()
    return () => {
      active = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(cameraRef.current as any)?.stop()
      clearSmoothBuffer()
    }
  }, [])

  const tip = getTip(checks)

  return (
    // Mobile: natural scroll. Desktop: fixed full-screen, no scroll.
    <div className="bg-bg flex flex-col lg:h-screen lg:overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <Link href="/" className="text-dim hover:text-txt transition-colors p-1 -m-1">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        {/* View toggle — compact labels on phones */}
        <div className="flex items-center gap-0.5 bg-s1 border border-border rounded-xl p-1">
          {(['face-on', 'down-the-line'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => handleViewChange(v)}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs font-medium transition-all duration-150 ${
                view === v ? 'bg-s3 text-ok border border-ok/20' : 'text-dim hover:text-muted'
              }`}
            >
              {/* Short on phones, full on sm+ */}
              <span className="sm:hidden">{v === 'face-on' ? 'Frente' : 'Lado'}</span>
              <span className="hidden sm:inline">{v === 'face-on' ? 'De frente' : 'De lado'}</span>
            </button>
          ))}
        </div>

        <span className="font-bold text-base">Sweep</span>
      </header>

      {/* ── Body ── */}
      {/*
        Mobile  : column — video (16:9) on top, panel below, page scrolls
        Desktop : row    — video fills left, panel fixed on right, no scroll
      */}
      <div className="flex flex-col lg:flex-row lg:flex-1 lg:overflow-hidden">

        {/* Video area */}
        <div
          className={`
            relative bg-black overflow-hidden flex-shrink-0
            aspect-video w-full
            lg:aspect-auto lg:flex-1 lg:flex-shrink
          `}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="absolute inset-0 w-full h-full scale-x-[-1]"
          />

          {/* Status pill */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <StatusPill status={status} />
          </div>

          {/* Loading */}
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-s1 z-20">
              <div className="text-center">
                <div className="w-9 h-9 border-2 border-ok/30 border-t-ok rounded-full animate-spin mx-auto mb-3" />
                <p className="text-muted text-sm">Iniciando cámara...</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-s1 z-20">
              <div className="text-center px-6 max-w-xs">
                <p className="text-bad font-semibold mb-2">Error de cámara</p>
                <p className="text-muted text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Side / bottom panel */}
        <aside
          className={`
            flex-shrink-0 bg-bg
            border-t border-border p-4
            lg:border-t-0 lg:border-l lg:w-80 lg:overflow-y-auto lg:p-5
          `}
        >
          {checks.length > 0 ? (
            <CheckPanel checks={checks} tip={tip} />
          ) : (
            <div className="flex items-center justify-center py-10 lg:h-full">
              <div className="text-center px-4">
                <div className="w-11 h-11 rounded-full border border-border flex items-center justify-center mx-auto mb-3">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-dim">
                    <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M3 16c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-dim text-sm leading-relaxed">
                  Colócate frente a la cámara para iniciar el análisis
                </p>
              </div>
            </div>
          )}
        </aside>

      </div>
    </div>
  )
}
