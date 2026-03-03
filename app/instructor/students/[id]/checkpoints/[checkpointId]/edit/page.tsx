'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { CameraAngle } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function EditCheckpoint() {
  const { instructor } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const checkpointId = params.checkpointId as string

  const [name, setName] = useState('')
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('face_on')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase.from('checkpoints').select('*').eq('id', checkpointId).single()
      .then(({ data }) => {
        if (data) {
          setName(data.name)
          setCameraAngle(data.camera_angle)
          setNote(data.instructor_note ?? '')
        }
        setLoading(false)
      })
  }, [instructor])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { error: updateErr } = await supabase
      .from('checkpoints')
      .update({
        name: name.trim(),
        camera_angle: cameraAngle,
        instructor_note: note.trim() || null,
      })
      .eq('id', checkpointId)
    setSaving(false)
    if (updateErr) { setError('Error al guardar los cambios.'); return }
    router.push(`/instructor/students/${studentId}`)
  }

  async function deleteCheckpoint() {
    setDeleting(true)
    await supabase.from('checkpoints').delete().eq('id', checkpointId)
    router.replace(`/instructor/students/${studentId}`)
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
            Ejercicios del alumno
          </Link>
          <span className="text-sm font-medium text-muted-foreground">Editar ejercicio</span>
        </div>
      </header>

      <div className="max-w-sm mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight mb-1">Editar ejercicio</h1>
          <p className="text-muted-foreground text-sm">Nombre, ángulo y nota del instructor</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name" className="text-muted-foreground text-xs uppercase tracking-wide">Nombre</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Address de frente"
              required
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Ángulo de cámara</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'face_on' as CameraAngle, label: 'De frente' },
                { value: 'dtl' as CameraAngle, label: 'De perfil' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCameraAngle(opt.value)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                    cameraAngle === opt.value
                      ? "bg-ok/10 border-ok/40 text-ok"
                      : "bg-card border-border text-muted-foreground hover:border-ok/30 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">
              Nota para el alumno <span className="normal-case font-normal text-muted-foreground/60">(opcional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Indicaciones o consejos..."
              rows={3}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 resize-none"
            />
          </div>

          {error && (
            <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
          )}

          <Button
            type="submit"
            disabled={saving || !name.trim()}
            className="h-11 bg-ok text-background font-semibold hover:bg-ok/90"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>

        <Separator className="my-8" />

        {confirmDelete ? (
          <div className="bg-bad/5 border border-bad/20 rounded-xl px-4 py-4">
            <p className="text-foreground text-sm font-medium mb-1">¿Eliminar este ejercicio?</p>
            <p className="text-muted-foreground text-xs mb-4">Se eliminará la referencia y todas las sesiones de práctica. Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <Button
                onClick={deleteCheckpoint}
                disabled={deleting}
                variant="destructive"
                className="flex-1 h-10 text-sm"
              >
                {deleting ? 'Eliminando...' : 'Eliminar ejercicio'}
              </Button>
              <Button
                onClick={() => setConfirmDelete(false)}
                variant="outline"
                className="flex-1 h-10 text-sm border-border text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-muted-foreground text-sm hover:text-bad transition-colors"
          >
            Eliminar ejercicio
          </button>
        )}
      </div>
    </div>
  )
}
