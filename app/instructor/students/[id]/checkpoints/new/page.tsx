'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { CameraAngle } from '@/lib/types'
import { METRICS_BY_ANGLE, METRIC_LABELS } from '@/lib/baseline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const PRESETS: { label: string; angle: CameraAngle }[] = [
  { label: 'Address de frente',   angle: 'face_on' },
  { label: 'Address de perfil',   angle: 'dtl'     },
  { label: 'Backswing de perfil', angle: 'dtl'     },
  { label: 'Backswing de frente', angle: 'face_on' },
  { label: 'Downswing de perfil', angle: 'dtl'     },
  { label: 'Follow-through',      angle: 'dtl'     },
  { label: 'Postura sentado',     angle: 'face_on' },
  { label: 'Setup de putter',     angle: 'face_on' },
]

export default function NewCheckpoint() {
  const { instructor } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const recognitionRef = useRef<any>(null)

  const [name, setName] = useState('')
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('face_on')
  const [note, setNote] = useState('')
  const [order, setOrder] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(METRICS_BY_ANGLE['face_on'])

  useEffect(() => {
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase.from('checkpoints').select('id', { count: 'exact' }).eq('student_id', studentId)
      .then(({ count }) => setOrder((count ?? 0) + 1))
    return () => recognitionRef.current?.stop()
  }, [instructor])

  // Reset metric selection when camera angle changes
  useEffect(() => {
    setSelectedMetrics(METRICS_BY_ANGLE[cameraAngle])
  }, [cameraAngle])

  function pickPreset(preset: typeof PRESETS[0]) {
    setName(preset.label)
    setCameraAngle(preset.angle)
    setSelectedPreset(preset.label)
  }

  function handleNameChange(val: string) {
    setName(val)
    if (selectedPreset && val !== selectedPreset) setSelectedPreset(null)
  }

  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'es-MX'
    r.continuous = true
    r.interimResults = false
    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .filter((res: any) => res.isFinal)
        .map((res: any) => res[0].transcript)
        .join(' ')
      if (transcript) setNote(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    r.onend = () => setIsVoiceRecording(false)
    recognitionRef.current = r
    r.start()
    setIsVoiceRecording(true)
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    setIsVoiceRecording(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: insertErr } = await supabase
      .from('checkpoints')
      .insert({
        student_id: studentId,
        name,
        camera_angle: cameraAngle,
        display_order: order,
        instructor_note: note || null,
        selected_metrics: selectedMetrics,
        calibration_marks: [],
        baseline: null,
        status: 'pending',
      })
      .select()
      .single()

    setLoading(false)

    if (insertErr) { setError('Error al crear ejercicio.'); return }
    router.push(`/instructor/students/${studentId}/checkpoints/${data.id}/calibrate`)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-lg lg:max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            href={`/instructor/students/${studentId}`}
            className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Perfil del alumno
          </Link>
          <span className="text-sm font-medium text-muted-foreground">Nuevo ejercicio</span>
        </div>
      </header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Nuevo ejercicio</h1>
          <p className="text-muted-foreground text-sm">Define la técnica que vas a calibrar</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">

          {/* Technique name */}
          <div className="flex flex-col gap-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Técnica</Label>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => pickPreset(p)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-all font-medium",
                    selectedPreset === p.label
                      ? "bg-ok/10 border-ok/40 text-ok"
                      : "bg-card border-border text-muted-foreground hover:border-ok/30 hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <Input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="O escribe un nombre personalizado..."
              required
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
            />
          </div>

          {/* Camera angle */}
          <div className="flex flex-col gap-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Ángulo de cámara</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'face_on' as CameraAngle, label: 'De frente', desc: 'Cabeza, brazos y hombros' },
                { value: 'dtl' as CameraAngle, label: 'De perfil', desc: 'Columna, rodillas y cabeza' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCameraAngle(opt.value)}
                  className={cn(
                    "rounded-xl border px-4 py-4 text-left transition-all",
                    cameraAngle === opt.value
                      ? "bg-ok/10 border-ok/40"
                      : "bg-card border-border hover:border-ok/20"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn(
                      "size-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      cameraAngle === opt.value ? "border-ok" : "border-border"
                    )}>
                      {cameraAngle === opt.value && (
                        <div className="size-2 rounded-full bg-ok" />
                      )}
                    </div>
                    <span className={cn(
                      "text-sm font-semibold",
                      cameraAngle === opt.value ? "text-ok" : "text-foreground"
                    )}>{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Metrics to track */}
          <div className="flex flex-col gap-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Métricas a evaluar</Label>
            <div className="flex flex-wrap gap-2">
              {METRICS_BY_ANGLE[cameraAngle].map(key => {
                const selected = selectedMetrics.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedMetrics(prev =>
                      selected ? prev.filter(k => k !== key) : [...prev, key]
                    )}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border transition-all font-medium",
                      selected
                        ? "bg-ok/10 border-ok/40 text-ok"
                        : "bg-card border-border text-muted-foreground hover:border-ok/30 hover:text-foreground"
                    )}
                  >
                    {METRIC_LABELS[key]}
                  </button>
                )
              })}
            </div>
            {selectedMetrics.length === 0 && (
              <p className="text-xs text-muted-foreground/60">Sin métricas seleccionadas — solo referencia visual</p>
            )}
          </div>

          {/* Note with voice dictation */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              Nota para el alumno{' '}
              <span className="normal-case tracking-normal text-muted-foreground/60 font-normal">(opcional)</span>
            </Label>
            <div className="flex gap-2 items-start">
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Escribe o dicta una nota que verá el alumno al practicar..."
                rows={3}
                className="flex-1 bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 resize-none"
              />
              <button
                type="button"
                onPointerDown={isVoiceRecording ? stopVoice : startVoice}
                title={isVoiceRecording ? 'Detener dictado' : 'Dictar nota'}
                className={cn(
                  "size-10 rounded-xl border flex items-center justify-center transition-all mt-0.5 shrink-0",
                  isVoiceRecording
                    ? "bg-bad/10 border-bad/40 text-bad animate-pulse"
                    : "bg-card border-border text-muted-foreground hover:border-ok/40 hover:text-ok"
                )}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </button>
            </div>
            {isVoiceRecording && (
              <p className="text-xs text-bad flex items-center gap-1.5">
                <span className="inline-block size-1.5 rounded-full bg-bad animate-pulse" />
                Dictando... presiona el micrófono para detener
              </p>
            )}
          </div>

          {error && (
            <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
          )}

          {/* CTA */}
          <div className="flex flex-col gap-3 pt-2">
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="h-12 bg-ok text-on-ok hover:bg-ok/90 font-semibold text-base"
            >
              {loading ? 'Creando ejercicio...' : (
                <span className="flex items-center gap-2">
                  Crear y calibrar
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                  </svg>
                </span>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Después de crear el ejercicio, podrás iniciar la sesión de calibración
            </p>
          </div>

        </form>
      </div>
    </div>
  )
}
