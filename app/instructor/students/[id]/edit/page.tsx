'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function EditStudent() {
  const { instructor, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase.from('students').select('*').eq('id', studentId).single()
      .then(({ data }) => {
        if (data) {
          setName(data.name)
          setEmail(data.email ?? '')
        }
        setLoading(false)
      })
  }, [authLoading])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { error: updateErr } = await supabase
      .from('students')
      .update({ name: name.trim(), email: email.trim() || null })
      .eq('id', studentId)
    setSaving(false)
    if (updateErr) { setError('Error al guardar los cambios.'); return }
    router.push(`/instructor/students/${studentId}`)
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-ok border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-sm mx-auto px-5 h-14 flex items-center justify-between">
          <Link href={`/instructor/students/${studentId}`} className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Perfil del alumno
          </Link>
          <span className="text-sm font-medium text-muted-foreground">Editar</span>
        </div>
      </header>

      <div className="max-w-sm mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight mb-1">Editar Alumno</h1>
          <p className="text-muted-foreground text-sm">Actualiza el nombre o correo del alumno</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-muted-foreground text-xs uppercase tracking-wide">Nombre</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre del alumno"
              required
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-muted-foreground text-xs uppercase tracking-wide">
              Correo <span className="normal-case font-normal text-muted-foreground/60">(opcional)</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="alumno@correo.com"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
            />
          </div>

          {error && (
            <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
          )}

          <Button
            type="submit"
            disabled={saving || !name.trim()}
            className="h-11 bg-ok text-background font-semibold hover:bg-ok/90 mt-2"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </div>
    </div>
  )
}
