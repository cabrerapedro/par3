'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'
import Link from 'next/link'

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function StudentProfile() {
  const { student, updateStudent, logout, loading } = useAuth()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [handicap, setHandicap] = useState('')
  const [dominantHand, setDominantHand] = useState<'right' | 'left' | ''>('')
  const [yearsPlaying, setYearsPlaying] = useState('')
  const [homeCourse, setHomeCourse] = useState('')
  const [bio, setBio] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!student) { router.replace('/student/login'); return }
    setName(student.name)
    setHandicap(student.handicap ?? '')
    setDominantHand(student.dominant_hand ?? '')
    setYearsPlaying(student.years_playing?.toString() ?? '')
    setHomeCourse(student.home_course ?? '')
    setBio(student.bio ?? '')
  }, [student, loading])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setSaved(false)
  }

  async function uploadAvatar(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${student!.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('student-avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) return null
    const { data } = supabase.storage.from('student-avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)

    let avatar_url = student?.avatar_url

    if (pendingFile) {
      const url = await uploadAvatar(pendingFile)
      if (url) avatar_url = url
      else { setError('Error al subir la foto. Los demás cambios se guardarán.'); }
    }

    const result = await updateStudent({
      name: name.trim(),
      avatar_url,
      handicap: handicap.trim() || undefined,
      dominant_hand: (dominantHand as 'right' | 'left') || undefined,
      years_playing: yearsPlaying ? parseInt(yearsPlaying) : undefined,
      home_course: homeCourse.trim() || undefined,
      bio: bio.trim() || undefined,
    })

    setSaving(false)

    if (result.error) { setError(result.error); return }
    setPendingFile(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading || !student) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-blue border-t-transparent animate-spin" />
    </div>
  )

  const currentAvatar = previewUrl || student.avatar_url

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-sm mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/student/journey" className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Mis ejercicios
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-sm mx-auto px-5 py-10">

        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="relative group cursor-pointer mb-3"
            onClick={() => fileRef.current?.click()}
          >
            <Avatar className="w-20 h-20">
              {currentAvatar && <AvatarImage src={currentAvatar} alt={student.name} className="object-cover" />}
              <AvatarFallback className="bg-blue/10 text-blue text-2xl font-bold border-2 border-blue/20">
                {initials(student.name)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-blue hover:underline underline-offset-2 font-medium"
          >
            {currentAvatar ? 'Cambiar foto' : 'Agregar foto'}
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5">

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-muted-foreground text-xs uppercase tracking-wide">Nombre</Label>
            <Input
              id="name"
              value={name}
              onChange={e => { setName(e.target.value); setSaved(false) }}
              required
              className="bg-card border-border text-foreground focus-visible:border-blue/50 focus-visible:ring-0 h-11"
            />
          </div>

          <Separator />

          {/* Golf info */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest -mb-1">Info de golf</p>

          {/* Dominant hand */}
          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Mano dominante</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'right', label: 'Diestro', icon: '🏌️' },
                { value: 'left',  label: 'Zurdo',   icon: '🏌️‍♂️' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setDominantHand(dominantHand === opt.value ? '' : opt.value); setSaved(false) }}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm font-medium transition-all text-left',
                    dominantHand === opt.value
                      ? 'bg-blue/10 border-blue/40 text-blue'
                      : 'bg-card border-border text-muted-foreground hover:border-blue/20 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Handicap + Years in a row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handicap" className="text-muted-foreground text-xs uppercase tracking-wide">Handicap</Label>
              <Input
                id="handicap"
                value={handicap}
                onChange={e => { setHandicap(e.target.value); setSaved(false) }}
                placeholder="Ej. 12, +2"
                className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-blue/50 focus-visible:ring-0 h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="years" className="text-muted-foreground text-xs uppercase tracking-wide">Años jugando</Label>
              <Input
                id="years"
                type="number"
                min="0"
                max="80"
                value={yearsPlaying}
                onChange={e => { setYearsPlaying(e.target.value); setSaved(false) }}
                placeholder="0"
                className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-blue/50 focus-visible:ring-0 h-11"
              />
            </div>
          </div>

          {/* Home course */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="course" className="text-muted-foreground text-xs uppercase tracking-wide">Club / Campo base</Label>
            <Input
              id="course"
              value={homeCourse}
              onChange={e => { setHomeCourse(e.target.value); setSaved(false) }}
              placeholder="Ej. Club de Golf Los Encinos"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-blue/50 focus-visible:ring-0 h-11"
            />
          </div>

          {/* Bio */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bio" className="text-muted-foreground text-xs uppercase tracking-wide">
              Sobre mí <span className="normal-case font-normal text-muted-foreground/60">(opcional)</span>
            </Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={e => { setBio(e.target.value); setSaved(false) }}
              placeholder="Cuéntanos algo sobre ti o tu juego..."
              rows={3}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-blue/50 focus-visible:ring-0 resize-none"
            />
          </div>

          {error && (
            <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
          )}

          <Button
            type="submit"
            disabled={saving || !name.trim()}
            className={cn(
              'h-11 font-semibold transition-all',
              saved
                ? 'bg-ok/10 border border-ok/30 text-ok hover:bg-ok/10'
                : 'bg-blue text-white hover:bg-blue/90'
            )}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>

        <Separator className="my-8" />

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
