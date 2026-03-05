'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Checkpoint } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { METRIC_LABELS, METRIC_INFO, PHASE_LABELS, calculateBaseline, calculateSwingBaseline, isSwingBaseline } from '@/lib/baseline'
import type { SwingPhaseName } from '@/lib/types'
import { MarkGallery } from '@/components/MarkGallery'
import Link from 'next/link'

export default function InstructorCheckpointDetail() {
  const { instructor, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const checkpointId = params.checkpointId as string

  const [cp, setCp] = useState<Checkpoint | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase.from('checkpoints').select('*').eq('id', checkpointId).single()
      .then(({ data }) => { if (data) setCp(data); setLoading(false) })
  }, [authLoading])

  async function handleDeleteMark(index: number) {
    if (!cp) return
    const newMarks = cp.calibration_marks.filter((_, i) => i !== index)
    const newBaseline = newMarks.length > 0
      ? (cp.checkpoint_type === 'swing' ? calculateSwingBaseline(newMarks, cp.selected_metrics) : calculateBaseline(newMarks, cp.selected_metrics))
      : null
    const newStatus = newMarks.length > 0 ? 'calibrated' : 'pending'

    await supabase.from('checkpoints').update({
      calibration_marks: newMarks,
      baseline: newBaseline,
      status: newStatus,
    }).eq('id', cp.id)

    setCp({ ...cp, calibration_marks: newMarks, baseline: newBaseline, status: newStatus as any })
  }

  async function handleNoteChange(index: number, note: string) {
    if (!cp) return
    const newMarks = cp.calibration_marks.map((m, i) => i === index ? { ...m, note: note || undefined } : m)

    await supabase.from('checkpoints').update({
      calibration_marks: newMarks,
    }).eq('id', cp.id)

    setCp({ ...cp, calibration_marks: newMarks })
  }

  if (loading) return <LoadingScreen />
  if (!cp) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Ejercicio no encontrado.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-14 flex items-center gap-3">
          <Link href={`/instructor/students/${studentId}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Perfil del alumno
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-10">
        {/* Checkpoint title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className={cn("text-xs", cp.status === 'calibrated' ? "text-ok border-ok/20 bg-ok/10" : "text-muted-foreground border-border")}>
              {cp.status === 'calibrated' ? 'Calibrado' : 'Pendiente'}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground border-border text-xs">
              {cp.camera_angle === 'face_on' ? 'De frente' : 'De perfil'}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{cp.name}</h1>
          {cp.calibration_marks?.length > 0 && (
            <p className="text-muted-foreground text-sm mt-1">
              {cp.calibration_marks.length} posicion{cp.calibration_marks.length !== 1 ? 'es' : ''} calibrada{cp.calibration_marks.length !== 1 ? 's' : ''} · referencia personal activa
            </p>
          )}
        </div>

        {/* Instructor note */}
        {(cp.instructor_note || cp.instructor_audio_url) && (
          <div className="bg-blue/5 border border-blue/20 rounded-xl px-4 py-4 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-6 rounded-full bg-blue/10 border border-blue/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-blue/80 uppercase tracking-wide">Nota para el alumno</p>
            </div>
            {cp.instructor_audio_url && (
              <audio src={cp.instructor_audio_url} controls className="w-full h-9 mb-3" style={{ accentColor: '#60a5fa' }} />
            )}
            {cp.instructor_note && (
              <p className="text-foreground text-sm leading-relaxed">"{cp.instructor_note}"</p>
            )}
          </div>
        )}

        {/* Calibration marks gallery */}
        {cp.calibration_marks?.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Marcas de calibración</p>
            <MarkGallery
              videoUrl={cp.calibration_video_url}
              skeletonUrl={cp.calibration_skeleton_url}
              marks={cp.calibration_marks}
              cameraAngle={cp.camera_angle}
              selectedMetrics={cp.selected_metrics}
              onDeleteMark={handleDeleteMark}
              onNoteChange={handleNoteChange}
            />
          </div>
        )}

        {/* Baseline summary */}
        {cp.baseline && Object.keys(cp.baseline).length > 0 && (
          <div className="bg-card border border-border rounded-xl px-4 py-4 mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Referencia personal</p>
            {isSwingBaseline(cp.baseline) ? (
              <div className="flex flex-col gap-3">
                {Object.entries(cp.baseline.phases).map(([phase, phaseBaseline]) => (
                  <div key={phase}>
                    <p className="text-xs text-muted-foreground font-medium mb-1.5">{PHASE_LABELS[phase as SwingPhaseName] ?? phase}</p>
                    <div className="flex flex-col gap-1">
                      {Object.entries(phaseBaseline as Record<string, any>)
                        .filter(([key]) => !cp.selected_metrics?.length || cp.selected_metrics.includes(key))
                        .map(([key, val]) => {
                          const info = METRIC_INFO[key]
                          const unitSuffix = info?.unit === 'grados' ? '°' : ''
                          return (
                            <div key={key} className="flex items-center justify-between bg-secondary border border-border rounded-lg px-3 py-2 text-xs">
                              <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key}</span>
                              <span className="text-ok font-mono font-semibold">
                                {val.mean.toFixed(1)}{unitSuffix}
                                <span className="text-muted-foreground/60 font-normal ml-1.5">
                                  ({val.min.toFixed(1)} – {val.max.toFixed(1)})
                                </span>
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(cp.baseline)
                  .filter(([key]) => !cp.selected_metrics?.length || cp.selected_metrics.includes(key))
                  .map(([key, val]) => {
                    const info = METRIC_INFO[key]
                    const unitSuffix = info?.unit === 'grados' ? '°' : ''
                    return (
                      <div key={key} className="flex items-center justify-between bg-secondary border border-border rounded-lg px-3 py-2 text-xs">
                        <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key.replace(/_/g, ' ')}</span>
                        <span className="text-ok font-mono font-semibold">
                          {val.mean.toFixed(1)}{unitSuffix}
                          <span className="text-muted-foreground/60 font-normal ml-1.5">
                            ({val.min.toFixed(1)} – {val.max.toFixed(1)})
                          </span>
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        <Separator className="mb-8" />

        {/* Action cards */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Acciones</p>
        <div className="flex flex-col lg:flex-row gap-3">
          <Link href={`/instructor/students/${studentId}/checkpoints/${checkpointId}/calibrate`} className="lg:flex-1">
            <div className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-ok/40 hover:bg-ok/5 transition-all cursor-pointer">
              <div className="size-12 rounded-xl flex items-center justify-center shrink-0 border bg-ok/10 border-ok/20 text-ok group-hover:bg-ok/20 transition-colors">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground">{cp.status === 'calibrated' ? 'Recalibrar' : 'Calibrar'}</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                  {cp.status === 'calibrated' ? 'Grabar nueva referencia para este ejercicio' : 'Grabar la primera referencia de este ejercicio'}
                </p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50 shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </Link>

          <Link href={`/instructor/students/${studentId}/checkpoints/${checkpointId}/edit`} className="lg:flex-1">
            <div className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-blue/40 hover:bg-blue/5 transition-all cursor-pointer">
              <div className="size-12 rounded-xl flex items-center justify-center shrink-0 border bg-blue/10 border-blue/20 text-blue group-hover:bg-blue/20 transition-colors">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground">Editar</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">Cambiar nombre, angulo o nota del ejercicio</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50 shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" /></div>
}
