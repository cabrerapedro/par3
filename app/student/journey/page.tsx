'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Checkpoint } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function StudentJourney() {
  const { student, logout, loading } = useAuth()
  const router = useRouter()
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!student) { router.replace('/student/login'); return }
    supabase
      .from('checkpoints')
      .select('*')
      .eq('student_id', student.id)
      .order('display_order')
      .then(({ data }) => { setCheckpoints(data ?? []); setFetching(false) })
  }, [student, loading])

  if (loading || !student) return <LoadingScreen />

  const calibrated = checkpoints.filter(c => c.status === 'calibrated').length
  const progress = checkpoints.length > 0 ? Math.round((calibrated / checkpoints.length) * 100) : 0

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
            <svg width="16" height="16" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" className="text-ok">
              <path d="M6 30 Q6 6 30 6" />
              <circle cx="30" cy="6" r="2.8" fill="currentColor" stroke="none" />
            </svg>
            <span className="text-sm font-bold text-foreground tracking-tight">
              Sweep
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu
              name={student.name}
              role="student"
              avatarUrl={student.avatar_url}
              profileHref="/student/profile"
              onLogout={() => { logout(); router.replace('/') }}
            />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-sm text-muted-foreground mb-1">Hola, {student.name.split(' ')[0]}</p>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Mis Ejercicios</h1>
          <p className="text-muted-foreground text-sm">Técnicas calibradas por tu instructor</p>
        </div>

        {/* Progress */}
        {checkpoints.length > 0 && !fetching && (
          <div className="bg-card border border-border rounded-xl px-5 py-4 mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">Ejercicios calibrados</p>
              <span className="text-sm font-bold text-ok">{calibrated}/{checkpoints.length}</span>
            </div>
            <Progress value={progress} className="h-2 bg-secondary [&>div]:bg-ok" />
            <p className="text-xs text-muted-foreground mt-2">
              {calibrated === 0
                ? 'Tu instructor está preparando tus técnicas'
                : calibrated === checkpoints.length
                  ? '¡Todas las técnicas listas para practicar!'
                  : `${checkpoints.length - calibrated} pendiente${checkpoints.length - calibrated !== 1 ? 's' : ''} de calibrar con tu instructor`}
            </p>
          </div>
        )}

        {/* Checkpoint list */}
        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" />
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-2xl text-center">
            <div className="text-5xl mb-4">🏌️</div>
            <p className="text-foreground font-semibold mb-1">Tu instructor aún no creó ejercicios</p>
            <p className="text-muted-foreground text-sm max-w-xs">Cuando tu instructor calibre tu técnica, aparecerán aquí listos para practicar</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line — only on single column */}
            <div className="absolute left-[19px] top-8 bottom-8 w-px bg-border md:hidden" />

            <div className="flex flex-col md:grid md:grid-cols-2 gap-3 md:gap-4">
              {checkpoints.map((cp, i) => {
                const isReady = cp.status === 'calibrated'
                return (
                  <Link
                    key={cp.id}
                    href={isReady ? `/student/checkpoint/${cp.id}` : '#'}
                    className={cn(!isReady && 'pointer-events-none')}
                  >
                    <div className={cn(
                      "relative flex items-start gap-4 pl-2 pr-4 py-4 rounded-xl border transition-all",
                      isReady
                        ? "border-border bg-card hover:border-ok/40 hover:bg-secondary/50 cursor-pointer"
                        : "border-border bg-card/50 opacity-60"
                    )}>
                      {/* Timeline dot */}
                      <div className={cn(
                        "relative z-10 size-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 shrink-0 bg-background",
                        isReady ? "border-ok text-ok" : "border-border text-muted-foreground"
                      )}>
                        {isReady ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <span>{i + 1}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-semibold truncate", isReady ? "text-foreground" : "text-muted-foreground")}>{cp.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {cp.checkpoint_type === 'swing' ? 'Swing' : 'Postura'} · {cp.camera_angle === 'face_on' ? 'De frente' : 'De perfil'}
                            </p>
                            {cp.instructor_note && isReady && (
                              <p className="text-xs text-muted-foreground/80 mt-2 italic line-clamp-1">"{cp.instructor_note}"</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <Badge variant="outline" className={cn("text-xs",
                              isReady ? "text-ok border-ok/20 bg-ok/10" : "text-muted-foreground border-border bg-transparent"
                            )}>
                              {isReady ? 'Listo' : 'Pendiente'}
                            </Badge>
                            {isReady && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50">
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" /></div>
}
