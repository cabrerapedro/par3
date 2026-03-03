'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Student } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type StudentWithCps = Student & { checkpoints: { id: string; status: string }[] }

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function InstructorDashboard() {
  const { instructor, logout, loading } = useAuth()
  const router = useRouter()
  const [students, setStudents] = useState<StudentWithCps[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    loadStudents()
  }, [instructor, loading])

  async function loadStudents() {
    setFetching(true)
    const { data } = await supabase
      .from('students')
      .select('*, checkpoints(id, status)')
      .eq('instructor_id', instructor!.id)
      .order('created_at', { ascending: false })
    setStudents((data as StudentWithCps[]) ?? [])
    setFetching(false)
  }

  async function copyCode(code: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  const filtered = useMemo(() =>
    students.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.access_code.toLowerCase().includes(search.toLowerCase())
    ), [students, search])

  const totalCalibrated = students.reduce((sum, s) =>
    sum + s.checkpoints.filter(c => c.status === 'calibrated').length, 0)
  const totalCheckpoints = students.reduce((sum, s) => sum + s.checkpoints.length, 0)

  if (loading || !instructor) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-foreground tracking-tight shrink-0">
            par<span className="text-ok">3</span>
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu
              name={instructor.name}
              email={instructor.email}
              role="instructor"
              profileHref="/instructor/profile"
              onLogout={() => { logout(); router.replace('/') }}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-10">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-sm text-muted-foreground mb-1">Hola, {instructor.name.split(' ')[0]}</p>
          <div className="flex items-end justify-between gap-4">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Mis Alumnos</h1>
            <Button asChild size="sm" className="bg-ok text-background hover:bg-ok/90 font-semibold shrink-0">
              <Link href="/instructor/students/new">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Nuevo alumno
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        {students.length > 0 && !fetching && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Alumnos', value: students.length },
              { label: 'Checkpoints', value: totalCheckpoints },
              { label: 'Calibrados', value: totalCalibrated },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-xl px-4 py-3 text-center">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        {students.length > 2 && (
          <div className="relative mb-4">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar alumno o código..."
              className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground/60 h-10 focus-visible:border-ok/50 focus-visible:ring-0"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
        )}

        {/* Student list */}
        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-2xl">
            <div className="w-14 h-14 bg-secondary rounded-2xl flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-foreground font-semibold mb-1">Sin alumnos todavía</p>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              Crea el primer perfil para empezar a calibrar su técnica
            </p>
            <Button asChild size="sm" className="bg-ok text-background hover:bg-ok/90 font-semibold">
              <Link href="/instructor/students/new">Crear primer alumno</Link>
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No se encontró ningún alumno con "{search}"
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {filtered.map(s => {
              const total = s.checkpoints.length
              const cal = s.checkpoints.filter(c => c.status === 'calibrated').length
              return (
                <Link key={s.id} href={`/instructor/students/${s.id}`}>
                  <div className="group flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/50 transition-colors cursor-pointer">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="bg-secondary text-muted-foreground text-xs font-semibold group-hover:bg-ok/10 group-hover:text-ok transition-colors">
                        {initials(s.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {total === 0
                          ? 'Sin checkpoints aún'
                          : `${cal} de ${total} checkpoint${total !== 1 ? 's' : ''} calibrado${cal !== 1 ? 's' : ''}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={e => copyCode(s.access_code, e)}
                            className={cn(
                              "font-mono text-xs px-2 py-1 rounded-md border transition-all",
                              copied === s.access_code
                                ? "bg-ok/10 border-ok/30 text-ok"
                                : "bg-secondary border-border text-muted-foreground hover:border-ok/30 hover:text-foreground"
                            )}
                          >
                            {copied === s.access_code ? '✓ copiado' : s.access_code}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          Copiar código de acceso
                        </TooltipContent>
                      </Tooltip>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" />
    </div>
  )
}
