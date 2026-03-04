'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Checkpoint } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { METRIC_LABELS } from '@/lib/baseline'
import { VideoTogglePlayer } from '@/components/VideoTogglePlayer'
import Link from 'next/link'

const ACTIONS = [
  {
    href: (id: string) => `/student/checkpoint/${id}/mirror`,
    color: 'ok',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: 'Espejo inteligente',
    desc: 'Revisa tu postura en tiempo real antes de cada swing',
    tag: 'Tiempo real',
  },
  {
    href: (id: string) => `/student/checkpoint/${id}/practice`,
    color: 'blue',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
      </svg>
    ),
    title: 'Grabar práctica',
    desc: 'Graba tu swing y compara cuadro a cuadro con tu referencia',
    tag: 'Análisis post-swing',
  },
  {
    href: (id: string) => `/student/checkpoint/${id}/history`,
    color: 'muted-foreground',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
    title: 'Historial',
    desc: 'Ve tu progreso y sesiones de práctica anteriores',
    tag: 'Seguimiento',
  },
]

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center gap-3">
          <Link href="/student/journey" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Mis ejercicios
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 py-10">
        {/* Checkpoint title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-ok border-ok/20 bg-ok/10 text-xs">
              Calibrado
            </Badge>
            <Badge variant="outline" className="text-muted-foreground border-border text-xs">
              {cp.camera_angle === 'face_on' ? 'De frente' : 'De perfil'}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{cp.name}</h1>
          {cp.baseline && (
            <p className="text-muted-foreground text-sm mt-1">
              {cp.calibration_marks?.length ?? 0} posiciones calibradas · referencia personal activa
            </p>
          )}
        </div>

        {/* Instructor note */}
        {(cp.instructor_note || cp.instructor_audio_url) && (
          <div className="bg-blue/5 border border-blue/20 rounded-xl px-4 py-4 mb-8">
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

        {/* Reference video */}
        {(cp.calibration_video_url || cp.calibration_skeleton_url) && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Referencia de tu instructor</p>
            <VideoTogglePlayer
              videoUrl={cp.calibration_video_url}
              skeletonUrl={cp.calibration_skeleton_url}
              className="bg-card border border-border rounded-xl overflow-hidden p-3"
            />
          </div>
        )}

        {/* Baseline summary */}
        {cp.baseline && (
          <div className="bg-card border border-border rounded-xl px-4 py-4 mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tu referencia personal</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(cp.baseline).map(([key, val]) => (
                <div key={key} className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">{METRIC_LABELS[key] ?? key.replace(/_/g, ' ')}: </span>
                  <span className="text-ok font-mono font-semibold">{typeof val.mean === 'number' ? val.mean.toFixed(1) : val.mean}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator className="mb-8" />

        {/* Action cards */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">¿Qué quieres hacer?</p>
        <div className="flex flex-col gap-3">
          {ACTIONS.map(action => (
            <Link key={action.title} href={action.href(cpId)}>
              <div className={cn(
                "group flex items-center gap-4 p-4 rounded-xl border border-border bg-card transition-all cursor-pointer",
                action.color === 'ok' && "hover:border-ok/40 hover:bg-ok/5",
                action.color === 'blue' && "hover:border-blue/40 hover:bg-blue/5",
                action.color === 'muted-foreground' && "hover:border-border hover:bg-secondary/50"
              )}>
                <div className={cn(
                  "size-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                  action.color === 'ok' && "bg-ok/10 border-ok/20 text-ok group-hover:bg-ok/20",
                  action.color === 'blue' && "bg-blue/10 border-blue/20 text-blue group-hover:bg-blue/20",
                  action.color === 'muted-foreground' && "bg-secondary border-border text-muted-foreground group-hover:bg-secondary/80"
                )}>
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-foreground">{action.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{action.desc}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className={cn("text-xs font-medium hidden sm:block",
                    action.color === 'ok' && "text-ok/70",
                    action.color === 'blue' && "text-blue/70",
                    action.color === 'muted-foreground' && "text-muted-foreground"
                  )}>{action.tag}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" /></div>
}
