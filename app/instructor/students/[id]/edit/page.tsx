'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { LifecycleStage } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function EditStudent() {
  const { instructor, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const t = useTranslations('instructor.students')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState<LifecycleStage>('active')
  const [phone, setPhone] = useState('')
  const [level, setLevel] = useState('')
  const [notes, setNotes] = useState('')
  const [optIn, setOptIn] = useState(false)
  // Preserve the original consent timestamp so re-saving doesn't reset it.
  const [optInAt, setOptInAt] = useState<string | null>(null)
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
          // Prefer the explicit lifecycle_stage; fall back to legacy status.
          setStage(data.lifecycle_stage ?? (data.status === 'inactive' ? 'former' : 'active'))
          setPhone(data.phone ?? '')
          setLevel(data.level ?? '')
          setNotes(data.notes ?? '')
          setOptIn(!!data.whatsapp_opt_in_at)
          setOptInAt(data.whatsapp_opt_in_at ?? null)
        }
        setLoading(false)
      })
    // Load once when auth resolves; instructor/router/studentId aren't deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    // Opt-in: stamp a fresh consent time only on the transition to true; keep
    // the existing timestamp otherwise; clear both when consent is withdrawn.
    const optInFields = optIn
      ? {
          whatsapp_opt_in_at: optInAt ?? new Date().toISOString(),
          whatsapp_opt_in_source: optInAt ? undefined : 'manual',
        }
      : { whatsapp_opt_in_at: null, whatsapp_opt_in_source: null }
    const { error: updateErr } = await supabase
      .from('students')
      .update({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        lifecycle_stage: stage,
        // Keep the legacy status in sync for code paths still reading it.
        status: stage === 'former' ? 'inactive' : 'active',
        phone: phone.trim() || null,
        level: level.trim() || null,
        notes: notes.trim() || null,
        ...optInFields,
      })
      .eq('id', studentId)
    setSaving(false)
    if (updateErr) { setError(t('saveError')); return }
    router.push(`/instructor/students/${studentId}`)
  }

  // Email is optional (imported contacts often have only a phone); when present
  // it must look like an email.
  const emailValid = email.trim() === '' || email.includes('@')

  if (loading) return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
        <div className="max-w-sm mx-auto px-5 h-14 flex items-center justify-between">
          <Link href={`/instructor/students/${studentId}`} className="text-ink-soft text-sm hover:text-ink transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('editBackToProfile')}
          </Link>
          <span className="small-caps font-mono text-[11px] text-ink-mute">{t('editTopLabel')}</span>
        </div>
      </header>

      <div className="max-w-sm mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-display font-semibold mb-1">{t('editTitle')}</h1>
          <p className="text-ink-soft text-sm">{t('editSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="small-caps font-mono text-[11px] text-ink-mute">{t('nameLabel')}</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              required
              className="h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="small-caps font-mono text-[11px] text-ink-mute">{t('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone" className="small-caps font-mono text-[11px] text-ink-mute">
              {t('phoneLabel')} <span className="text-ink-mute/70 normal-case">{t('phoneOptional')}</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={t('phonePlaceholder')}
              className="h-11 font-mono"
            />
            <p className="text-xs text-ink-mute">{t('phoneHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="level" className="small-caps font-mono text-[11px] text-ink-mute">{t('levelLabel')}</Label>
            <Input
              id="level"
              type="text"
              value={level}
              onChange={e => setLevel(e.target.value)}
              placeholder={t('levelPlaceholder')}
              className="h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes" className="small-caps font-mono text-[11px] text-ink-mute">{t('notesLabel')}</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
              className="w-full bg-paper-2/40 border border-rule rounded-md px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-ink-soft resize-y"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="small-caps font-mono text-[11px] text-ink-mute">{t('optInLabel')}</Label>
            <button
              type="button"
              onClick={() => setOptIn(v => !v)}
              className={cn(
                'flex items-center justify-between h-11 px-3 border transition-colors text-left',
                optIn ? 'border-ok bg-ok/5 text-ink' : 'border-rule text-ink-mute hover:border-ink-soft'
              )}
            >
              <span className="text-sm font-medium">{optIn ? t('optInOn') : t('optInOff')}</span>
              <span className={cn(
                'relative w-9 h-5 rounded-full transition-colors shrink-0',
                optIn ? 'bg-ok' : 'bg-rule'
              )}>
                <span className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-paper transition-all',
                  optIn ? 'left-[18px]' : 'left-0.5'
                )} />
              </span>
            </button>
            <p className="text-xs text-ink-mute">{t('optInHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="small-caps font-mono text-[11px] text-ink-mute">{t('stageLabel')}</Label>
            <div className="flex items-center gap-1">
              {(['active', 'former', 'prospect'] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStage(key)}
                  className={cn(
                    'flex-1 small-caps font-mono text-[11px] h-10 px-1 border transition-colors',
                    stage === key
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink'
                  )}
                >
                  {key === 'active' ? t('stageActive') : key === 'former' ? t('stageFormer') : t('stageProspect')}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-mute">{t('stageHint')}</p>
          </div>

          {error && (
            <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-md px-4 py-3">{error}</p>
          )}

          <Button
            type="submit"
            disabled={saving || !name.trim() || !emailValid}
            className="h-11 bg-primary text-primary-foreground font-semibold hover:opacity-85 mt-2"
          >
            {saving ? t('saving') : t('saveCta')}
          </Button>
        </form>
      </div>
    </div>
  )
}
