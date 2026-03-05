'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student, Checkpoint } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function StudentProfile() {
  const { instructor, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string

  const [student, setStudent] = useState<Student | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleteCpDialog, setDeleteCpDialog] = useState<Checkpoint | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    loadData()
  }, [authLoading, studentId])

  async function loadData() {
    setLoading(true)
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).single(),
      supabase.from('checkpoints').select('*').eq('student_id', studentId).order('display_order'),
    ])
    if (s) setStudent(s)
    setCheckpoints(c ?? [])
    setLoading(false)
  }

  async function copyCode() {
    if (!student) return
    await navigator.clipboard.writeText(student.access_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function shareLink() {
    if (!student) return
    const url = `${window.location.origin}/student/login?code=${student.access_code}`
    const shareData = {
      title: 'Sweep - Acceso de práctica',
      text: `${student.name}, usa este enlace para acceder a tus ejercicios de práctica en Sweep`,
      url,
    }
    if (navigator.share) {
      try { await navigator.share(shareData); return } catch {}
    }
    await navigator.clipboard.writeText(url)
    setShared(true)
    setTimeout(() => setShared(false), 1500)
  }

  async function deleteStudent() {
    setDeleting(true)
    await supabase.from('students').delete().eq('id', studentId)
    router.replace('/instructor/dashboard')
  }

  async function deleteCheckpoint(cp: Checkpoint) {
    await supabase.from('checkpoints').delete().eq('id', cp.id)
    setCheckpoints(prev => prev.filter(c => c.id !== cp.id))
    setDeleteCpDialog(null)
  }

  if (loading) return <LoadingScreen />
  if (!student) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Alumno no encontrado.</p>
    </div>
  )

  const calibrated = checkpoints.filter(c => c.status === 'calibrated').length

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <Link href="/instructor/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Mis alumnos
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild><Link href={`/instructor/students/${studentId}/edit`}>Editar alumno</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={copyCode}>Copiar código de acceso</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialog(true)}>Eliminar alumno</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-5 py-10">
        <div className="flex items-start gap-5 mb-10">
          <Avatar className="size-16 shrink-0">
            <AvatarFallback className="bg-secondary text-muted-foreground text-xl font-semibold">
              {student.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{student.name}</h1>
            {student.email && <p className="text-muted-foreground text-sm mt-0.5">{student.email}</p>}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={copyCode} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all", copied ? "bg-ok/10 border-ok/30 text-ok" : "bg-secondary border-border text-muted-foreground hover:border-ok/30 hover:text-foreground")}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {copied ? <polyline points="20 6 9 17 4 12" /> : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
                    </svg>
                    {copied ? 'Copiado!' : student.access_code}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Copiar código de acceso del alumno</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={shareLink} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all", shared ? "bg-ok/10 border-ok/30 text-ok" : "bg-secondary border-border text-muted-foreground hover:border-blue/30 hover:text-foreground")}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {shared ? <polyline points="20 6 9 17 4 12" /> : <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></>}
                    </svg>
                    {shared ? 'Copiado!' : 'Compartir enlace'}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Enviar enlace de acceso al alumno</TooltipContent>
              </Tooltip>
              {checkpoints.length > 0 && (
                <Badge variant="outline" className={cn("text-xs", calibrated === checkpoints.length && calibrated > 0 ? "text-ok border-ok/20 bg-ok/10" : "text-muted-foreground border-border")}>
                  {calibrated}/{checkpoints.length} calibrado{calibrated !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator className="mb-8" />

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Ejercicios de práctica</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{checkpoints.length === 0 ? 'Crea el primer ejercicio para comenzar' : `${checkpoints.length} técnica${checkpoints.length !== 1 ? 's' : ''}`}</p>
          </div>
          <Link
            href={`/instructor/students/${studentId}/checkpoints/new`}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold border border-border rounded-lg hover:border-ok/40 hover:bg-ok/5 text-foreground transition-all duration-300"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Ejercicio
          </Link>
        </div>

        {checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 border border-dashed border-border rounded-2xl text-center">
            <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v8M8 12h8" strokeLinecap="round" /></svg>
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Sin ejercicios todavía</p>
            <p className="text-xs text-muted-foreground mb-4">Empieza calibrando la primera técnica de {student.name.split(' ')[0]}</p>
            <Link href={`/instructor/students/${studentId}/checkpoints/new`} className="inline-flex h-8 px-3 text-xs border border-border rounded-lg hover:border-ok/40 items-center transition-all">Crear primer ejercicio</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {checkpoints.map((cp, i) => (
              <div key={cp.id} className="group relative flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border bg-card hover:border-ok/30 hover:bg-secondary/40 transition-all">
                <div className={cn("size-8 rounded-full flex items-center justify-center text-xs font-mono font-semibold border shrink-0", cp.status === 'calibrated' ? "bg-ok/10 border-ok/20 text-ok" : "bg-secondary border-border text-muted-foreground")}>
                  {i + 1}
                </div>
                <Link href={cp.status === 'calibrated' ? `/instructor/students/${studentId}/checkpoints/${cp.id}` : `/instructor/students/${studentId}/checkpoints/${cp.id}/calibrate`} className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{cp.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {cp.camera_angle === 'face_on' ? 'De frente' : 'De perfil'}
                    {cp.calibration_marks?.length > 0 && <span className="ml-2 text-muted-foreground/60">· {cp.calibration_marks.length} marca{cp.calibration_marks.length !== 1 ? 's' : ''}</span>}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={cn("text-xs hidden sm:inline-flex", cp.status === 'calibrated' ? "text-ok border-ok/20 bg-ok/10" : "text-muted-foreground border-border")}>
                    {cp.status === 'calibrated' ? 'Calibrado' : 'Pendiente'}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground" onClick={e => e.stopPropagation()}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      {cp.status === 'calibrated' && (
                        <DropdownMenuItem asChild><Link href={`/instructor/students/${studentId}/checkpoints/${cp.id}`}>Ver detalle</Link></DropdownMenuItem>
                      )}
                      <DropdownMenuItem asChild><Link href={`/instructor/students/${studentId}/checkpoints/${cp.id}/calibrate`}>{cp.status === 'calibrated' ? 'Recalibrar' : 'Calibrar'}</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link href={`/instructor/students/${studentId}/checkpoints/${cp.id}/edit`}>Editar</Link></DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteCpDialog(cp)}>Eliminar</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar a {student.name}</DialogTitle>
            <DialogDescription>Se eliminarán todos sus ejercicios, referencias y sesiones de práctica. Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={deleteStudent} disabled={deleting}>{deleting ? 'Eliminando...' : 'Eliminar alumno'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteCpDialog} onOpenChange={v => { if (!v) setDeleteCpDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar "{deleteCpDialog?.name}"</DialogTitle>
            <DialogDescription>Se eliminará la referencia y todas las sesiones de práctica de este ejercicio. Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCpDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteCpDialog && deleteCheckpoint(deleteCpDialog)}>Eliminar ejercicio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" /></div>
}
