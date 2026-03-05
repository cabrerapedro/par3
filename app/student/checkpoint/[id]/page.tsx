'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Checkpoint } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { METRIC_LABELS, isSwingBaseline, PHASE_LABELS } from '@/lib/baseline'
import { MarkGallery } from '@/components/MarkGallery'
import Link from 'next/link'


export default function CheckpointDetail() {
  const { student } = useAuth()
  const router = useRouter()
  const params = useParams()
  const cpId = params.id as string

  const [cp, setCp] = useState<Checkpoint | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student) { router.replace('/student/login'); return }
    supabase.from('checkpoints').select('*').eq('id', cpId).single()
      .then(({ data }) => { if (data) setCp(data); setLoading(false) })
  }, [student])

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

        {/* Two-column layout on lg */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT — Video reference */}
          <div>
            {cp.calibration_marks?.length > 0 && (
              <div>
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
          </div>

          {/* RIGHT — Note + Baseline */}
          <div className="flex flex-col gap-6">
            {/* Instructor note */}
            {(cp.instructor_note || cp.instructor_audio_url) && (
              <div className="bg-blue/5 border border-blue/20 rounded-xl px-4 py-4">
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

            {/* Baseline summary */}
            {cp.baseline && (
              <div className="bg-card border border-border rounded-xl px-4 py-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tu referencia personal</p>
                {isSwingBaseline(cp.baseline) ? (
                  <div className="flex flex-col gap-3">
                    {Object.entries(cp.baseline.phases).map(([phase, phaseBaseline]) => (
                      <div key={phase}>
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">{PHASE_LABELS[phase as keyof typeof PHASE_LABELS] ?? phase}</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(phaseBaseline as Record<string, any>)
                            .filter(([key]) => !cp.selected_metrics?.length || cp.selected_metrics.includes(key))
                            .map(([key, val]) => (
                            <div key={key} className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs">
                              <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key}: </span>
                              <span className="text-ok font-mono font-semibold">{typeof val.mean === 'number' ? val.mean.toFixed(1) : val.mean}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(cp.baseline)
                      .filter(([key]) => !cp.selected_metrics?.length || cp.selected_metrics.includes(key))
                      .map(([key, val]) => (
                      <div key={key} className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key.replace(/_/g, ' ')}: </span>
                        <span className="text-ok font-mono font-semibold">{typeof val.mean === 'number' ? val.mean.toFixed(1) : val.mean}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" /></div>
}
