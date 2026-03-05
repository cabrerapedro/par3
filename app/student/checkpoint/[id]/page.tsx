'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Checkpoint } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { isSwingBaseline } from '@/lib/baseline'
import { MarkGallery } from '@/components/MarkGallery'
import { BaselineBody, SwingPhaseFigures } from '@/components/BaselineBody'
import Link from 'next/link'


export default function CheckpointDetail() {
  const { student } = useAuth()
  const router = useRouter()
  const params = useParams()
  const cpId = params.id as string

  const [cp, setCp] = useState<Checkpoint | null>(null)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<string | null>(null)

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    supabase.from('checkpoints').select('*').eq('id', cpId).single()
      .then(({ data }) => { if (data) setCp(data); setLoading(false) })
  }, [student])

  const [summaryLoading, setSummaryLoading] = useState(false)

  // Generate baseline summary on-the-fly if missing (persisted server-side)
  useEffect(() => {
    if (!cp?.baseline || cp.baseline_summary) return
    setSummaryLoading(true)
    fetch('/api/baseline-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline: cp.baseline,
        cameraAngle: cp.camera_angle,
        checkpointName: cp.name,
        instructorNote: cp.instructor_note || null,
        selectedMetrics: cp.selected_metrics,
        marksCount: cp.calibration_marks?.length ?? 0,
        checkpointType: cp.checkpoint_type,
        checkpointId: cp.id,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.summary) setSummary(d.summary) })
      .catch(() => {})
      .finally(() => setSummaryLoading(false))
  }, [cp?.id])

  if (loading) return <LoadingScreen />
  if (!cp) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Ejercicio no encontrado.</p>
    </div>
  )
  if (cp.status === 'archived') return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-5">
      <p className="text-foreground font-medium">Este ejercicio fue archivado</p>
      <p className="text-muted-foreground text-sm text-center">Tu instructor archivó este ejercicio. Consulta con tu instructor si necesitas acceso.</p>
      <Link href="/student/journey" className="text-ok text-sm font-medium hover:underline mt-2">Volver a mis ejercicios</Link>
    </div>
  )

  const practiceHref = cp.checkpoint_type === 'swing'
    ? `/student/checkpoint/${cpId}/practice`
    : `/student/checkpoint/${cpId}/mirror`
  const practiceLabel = cp.checkpoint_type === 'swing' ? 'Grabar práctica' : 'Practicar'
  const isSwing = cp.checkpoint_type === 'swing'

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-14 flex items-center gap-3">
          <Link href="/student/journey" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Mis ejercicios
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-10">
        {/* Title + badges + action buttons */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-ok border-ok/20 bg-ok/10 text-xs">
                Calibrado
              </Badge>
              <Badge variant="outline" className="text-muted-foreground border-border text-xs">
                {cp.camera_angle === 'face_on' ? 'De frente' : 'De perfil'}
              </Badge>
              {isSwing && (
                <Badge variant="outline" className="text-blue border-blue/20 bg-blue/10 text-xs">
                  Swing
                </Badge>
              )}
            </div>
            {/* Action buttons — always visible */}
            {cp.baseline && (
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/student/checkpoint/${cpId}/history`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground transition-all"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  Historial
                </Link>
                <Link
                  href={practiceHref}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                    isSwing
                      ? "bg-blue text-white border-blue hover:bg-blue/90"
                      : "bg-ok text-black border-ok hover:bg-ok/90"
                  )}
                >
                  {isSwing ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  )}
                  {practiceLabel}
                </Link>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{cp.name}</h1>
          {cp.baseline && (
            <p className="text-muted-foreground text-sm mt-1">
              {cp.calibration_marks?.length ?? 0} {isSwing ? 'swings calibrados' : 'posiciones calibradas'} · referencia personal activa
            </p>
          )}
        </div>

        {/* Instructor note — full width at top */}
        {(cp.instructor_note || cp.instructor_audio_url) && (
          <div className="bg-blue/5 border border-blue/20 rounded-xl px-4 py-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-6 rounded-full bg-blue/10 border border-blue/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-blue/80 uppercase tracking-wide">Nota de tu instructor</p>
            </div>
            {cp.instructor_audio_url && (
              <audio src={cp.instructor_audio_url} controls className="w-full h-9 mb-3" style={{ accentColor: '#60a5fa' }} />
            )}
            {cp.instructor_note && (
              <p className="text-foreground text-sm leading-relaxed">"{cp.instructor_note}"</p>
            )}
          </div>
        )}

        {/* Video + clips — asymmetric two columns via MarkGallery */}
        {cp.calibration_marks?.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Referencia de tu instructor</p>
            <MarkGallery
              videoUrl={cp.calibration_video_url}
              skeletonUrl={cp.calibration_skeleton_url}
              marks={cp.calibration_marks}
              cameraAngle={cp.camera_angle}
              selectedMetrics={cp.selected_metrics}
            />
          </div>
        )}

        {/* Baseline summary — full width at bottom */}
        {cp.baseline && (
          <div className="bg-card border border-border rounded-xl px-5 py-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Tu referencia personal</p>

            {/* Summary — shown for both position and swing */}
            {(cp.baseline_summary || summary || summaryLoading) && (
              <div className="mb-5 pb-5 border-b border-border">
                {summaryLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-4 h-4 rounded-full border-2 border-ok/40 border-t-ok animate-spin shrink-0" />
                    <span className="text-sm">Generando resumen...</span>
                  </div>
                ) : (
                  <>
                    <p className="text-foreground text-base leading-relaxed">{cp.baseline_summary || summary}</p>
                    <div className="flex items-center gap-1.5 mt-3 text-muted-foreground/50">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                      <span className="text-xs">Resumen generado por IA. Puede contener imprecisiones.</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {isSwingBaseline(cp.baseline) ? (
              <SwingPhaseFigures
                baseline={cp.baseline}
                cameraAngle={cp.camera_angle}
                selectedMetrics={cp.selected_metrics}
              />
            ) : (
              <BaselineBody
                baseline={cp.baseline as Record<string, { mean: number; std?: number }>}
                cameraAngle={cp.camera_angle}
                selectedMetrics={cp.selected_metrics}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" /></div>
}
