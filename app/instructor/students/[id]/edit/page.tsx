'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
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
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
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
          setStatus(data.status === 'inactive' ? 'inactive' : 'active')
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
    const { error: updateErr } = await supabase
      .from('students')
      .update({ name: name.trim(), email: email.trim().toLowerCase(), status })
      .eq('id', studentId)
    setSaving(false)
    if (updateErr) { setError(t('saveError')); return }
    router.push(`/instructor/students/${studentId}`)
  }

  const emailValid = email.includes('@')

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
            <Label htmlFor="name" className="small-caps font-mono text-[10px] text-ink-mute">{t('nameLabel')}</Label>
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
            <Label htmlFor="email" className="small-caps font-mono text-[10px] text-ink-mute">{t('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              required
              className="h-11"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="small-caps font-mono text-[10px] text-ink-mute">{t('statusLabel')}</Label>
            <div className="flex items-center gap-1">
              {(['active', 'inactive'] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatus(key)}
                  className={cn(
                    'flex-1 small-caps font-mono text-[10px] h-10 border transition-colors',
                    status === key
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule text-ink-mute hover:border-ink-soft hover:text-ink'
                  )}
                >
                  {key === 'active' ? t('statusActive') : t('statusInactive')}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-mute">{t('statusHint')}</p>
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
