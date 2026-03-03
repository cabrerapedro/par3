'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/ThemeToggle'
import Link from 'next/link'

export default function InstructorProfile() {
  const { instructor, updateInstructor, logout, loading } = useAuth()
  const router = useRouter()

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [studentCount, setStudentCount] = useState<number | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    setName(instructor.name)
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('instructor_id', instructor.id)
      .then(({ count }) => setStudentCount(count ?? 0))
  }, [instructor, loading])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim() === instructor?.name) return
    setError('')
    setSaving(true)
    const result = await updateInstructor(name.trim())
    setSaving(false)
    if (result.error) { setError(result.error) }
    else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  if (loading || !instructor) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" />
    </div>
  )

  const initials = instructor.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-sm mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/instructor/dashboard" className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Dashboard
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-sm mx-auto px-5 py-10">
        {/* Avatar section */}
        <div className="flex flex-col items-center mb-8">
          <Avatar className="w-16 h-16 mb-3">
            <AvatarFallback className="bg-ok/10 text-ok text-xl font-bold border border-ok/20">
              {initials}
            </AvatarFallback>
          </Avatar>
          <p className="text-foreground font-semibold text-lg">{instructor.name}</p>
          <p className="text-muted-foreground text-sm">{instructor.email}</p>
        </div>

        {/* Stats */}
        <div className="bg-card border border-border rounded-xl px-5 py-4 mb-8 flex items-center justify-between">
          <p className="text-muted-foreground text-sm">Alumnos activos</p>
          <p className="text-foreground font-semibold font-mono text-lg">
            {studentCount === null ? '—' : studentCount}
          </p>
        </div>

        {/* Edit name form */}
        <form onSubmit={handleSave} className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-muted-foreground text-xs uppercase tracking-wide">Nombre</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setSaved(false) }}
              placeholder="Tu nombre"
              required
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Correo</Label>
            <Input
              value={instructor.email}
              disabled
              className="bg-secondary border-border text-muted-foreground cursor-not-allowed h-11"
            />
            <p className="text-muted-foreground/60 text-xs">El correo no se puede cambiar desde aquí.</p>
          </div>

          {error && (
            <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
          )}

          <Button
            type="submit"
            disabled={saving || !name.trim() || name.trim() === instructor.name}
            className={`h-11 font-semibold transition-all ${
              saved
                ? 'bg-ok/10 border border-ok/30 text-ok hover:bg-ok/10'
                : 'bg-ok text-background hover:bg-ok/90'
            }`}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>

        <Separator className="bg-border mb-6" />

        {/* Sign out */}
        {confirmSignOut ? (
          <div className="bg-bad/5 border border-bad/20 rounded-xl px-4 py-4">
            <p className="text-foreground text-sm font-medium mb-3">¿Cerrar sesión?</p>
            <div className="flex gap-2">
              <Button
                onClick={() => { logout(); router.replace('/') }}
                variant="destructive"
                className="flex-1 h-10 text-sm"
              >
                Cerrar sesión
              </Button>
              <Button
                onClick={() => setConfirmSignOut(false)}
                variant="outline"
                className="flex-1 h-10 text-sm border-border text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmSignOut(true)}
            className="w-full text-muted-foreground text-sm hover:text-bad transition-colors py-1"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  )
}
