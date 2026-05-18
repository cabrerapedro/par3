'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function NewStudent() {
  const { instructor } = useAuth()
  const router = useRouter()
  const t = useTranslations('instructor.students')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!instructor) return
    setError('')
    setLoading(true)

    const { data, error: insertErr } = await supabase
      .from('students')
      .insert({ instructor_id: instructor.id, name, email: email || null, access_code: generateCode() })
      .select()
      .single()

    setLoading(false)
    if (insertErr) { setError(t('createError')); return }
    router.push(`/instructor/students/${data.id}`)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center">
          <Link href="/instructor/dashboard" className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('backToStudents')}
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center px-5 py-10">
        <div
          className="w-full max-w-sm bg-card border border-border rounded-md overflow-hidden"
          style={{ animation: 'fade-up 0.8s ease-out both' }}
        >
          <div className="px-6 pt-6 pb-5 border-b border-border">
            <h1 className="text-xl font-display font-semibold">{t('newTitle')}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t('newSubtitle')}
            </p>
          </div>

          <div className="px-6 py-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  {t('nameLabel')}
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  required
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-primary focus-visible:ring-primary/20 h-12 text-base"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  {t('emailLabel')} <span className="font-normal text-muted-foreground">{t('emailOptional')}</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-primary focus-visible:ring-primary/20 h-12 text-base"
                />
              </div>

              {error && (
                <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3 leading-snug">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="h-12 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-85 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base mt-1"
              >
                {loading ? t('creating') : t('createCta')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
