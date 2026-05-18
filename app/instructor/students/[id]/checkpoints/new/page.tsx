'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { CameraAngle, CheckpointType } from '@/lib/types'
import { METRICS_BY_ANGLE, getMetricLabel } from '@/lib/baseline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const PRESET_KEYS: { key: string; angle: CameraAngle }[] = [
  { key: 'presetAddressFaceOn',   angle: 'face_on' },
  { key: 'presetAddressDtl',      angle: 'dtl'     },
  { key: 'presetBackswingDtl',    angle: 'dtl'     },
  { key: 'presetBackswingFaceOn', angle: 'face_on' },
  { key: 'presetDownswingDtl',    angle: 'dtl'     },
  { key: 'presetFollowThrough',   angle: 'dtl'     },
  { key: 'presetSeatedPosture',   angle: 'face_on' },
  { key: 'presetPutterSetup',     angle: 'face_on' },
]

export default function NewCheckpoint() {
  const { instructor, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const recognitionRef = useRef<any>(null)
  const t = useTranslations('instructor.checkpoints')
  const tMetrics = useTranslations('metrics.labels')
  const presets = PRESET_KEYS.map(p => ({ ...p, label: t(p.key as never) }))

  const [name, setName] = useState('')
  const [checkpointType, setCheckpointType] = useState<CheckpointType>('position')
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('face_on')
  const [note, setNote] = useState('')
  const [order, setOrder] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(METRICS_BY_ANGLE['face_on'])

  useEffect(() => {
    if (authLoading) return
    if (!instructor) { router.replace('/instructor/login'); return }
    supabase.from('checkpoints').select('*', { count: 'exact', head: true }).eq('student_id', studentId)
      .then(({ count }) => setOrder((count ?? 0) + 1))
    return () => recognitionRef.current?.stop()
  }, [authLoading])

  // Reset metric selection when camera angle changes
  useEffect(() => {
    setSelectedMetrics(METRICS_BY_ANGLE[cameraAngle])
  }, [cameraAngle])

  function pickPreset(preset: { label: string; angle: CameraAngle }) {
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
        checkpoint_type: checkpointType,
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

    if (insertErr) { setError(t('createError')); return }
    router.push(`/instructor/students/${studentId}/checkpoints/${data.id}/calibrate`)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            href={`/instructor/students/${studentId}`}
            className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('backToStudent')}
          </Link>
          <span className="text-sm font-medium text-muted-foreground">{t('newTopLabel')}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">{t('newTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('newSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">

          {/* Row 1: Capture mode + Camera angle — aligned side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="flex flex-col gap-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{t('captureModeLabel')}</Label>
              <div className="flex flex-col gap-2">
                {([
                  { value: 'position' as CheckpointType, label: t('modePostureTitle'), desc: t('modePostureDesc') },
                  { value: 'swing' as CheckpointType, label: t('modeSwingTitle'), desc: t('modeSwingDesc') },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCheckpointType(opt.value)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition-all",
                      checkpointType === opt.value
                        ? "bg-ok/10 border-ok/40"
                        : "bg-card border-border hover:border-ok/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "size-4 rounded-full border-2 flex items-center justify-center shrink-0",
                        checkpointType === opt.value ? "border-ok" : "border-border"
                      )}>
                        {checkpointType === opt.value && (
                          <div className="size-2 rounded-full bg-ok" />
                        )}
                      </div>
                      <span className={cn(
                        "text-sm font-semibold",
                        checkpointType === opt.value ? "text-ok" : "text-foreground"
                      )}>{opt.label}</span>
                      <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">{opt.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{t('cameraAngleLabel')}</Label>
              <div className="flex flex-col gap-2">
                {([
                  { value: 'face_on' as CameraAngle, label: t('angleFaceOn'), desc: t('angleFaceOnDesc') },
                  { value: 'dtl' as CameraAngle, label: t('angleDtl'), desc: t('angleDtlDesc') },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCameraAngle(opt.value)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition-all",
                      cameraAngle === opt.value
                        ? "bg-ok/10 border-ok/40"
                        : "bg-card border-border hover:border-ok/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
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
                      <span className="text-xs text-muted-foreground ml-auto">{opt.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Technique + Metrics — aligned side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="flex flex-col gap-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{t('techniqueLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
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
                placeholder={t('customNamePlaceholder')}
                required
                className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{t('metricsLabel')}</Label>
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
                      {getMetricLabel(key, tMetrics)}
                    </button>
                  )
                })}
              </div>
              {selectedMetrics.length === 0 && (
                <p className="text-xs text-muted-foreground/60">{t('noMetricsHint')}</p>
              )}
            </div>
          </div>

          {/* FULL WIDTH — Note */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              {t('noteLabel')}{' '}
              <span className="normal-case tracking-normal text-muted-foreground/60 font-normal">{t('noteOptional')}</span>
            </Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('notePlaceholder')}
              rows={2}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 resize-none"
            />
            <button
              type="button"
              onPointerDown={isVoiceRecording ? stopVoice : startVoice}
              className={cn(
                "flex items-center gap-1.5 self-start px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                isVoiceRecording
                  ? "bg-bad/15 border-bad/30 text-bad animate-pulse"
                  : "border-border text-muted-foreground hover:border-ok/30 hover:text-ok"
              )}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              {isVoiceRecording ? t('dictating') : t('dictate')}
            </button>
          </div>

          {error && (
            <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
          )}

          {/* CTA */}
          <Button
            type="submit"
            disabled={loading || !name.trim()}
            className="h-12 bg-ok text-on-ok hover:bg-ok/90 font-semibold text-base"
          >
            {loading ? t('creating') : (
              <span className="flex items-center gap-2">
                {t('createCta')}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                </svg>
              </span>
            )}
          </Button>

        </form>
      </div>
    </div>
  )
}
