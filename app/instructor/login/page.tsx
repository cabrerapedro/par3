'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function InstructorLogin() {
  const { instructorLogin, instructorSignup } = useAuth()
  const router = useRouter()
  const t = useTranslations('auth.instructor')
  const tAuth = useTranslations('auth')
  const tErrors = useTranslations('auth.errors')
  const tMeta = useTranslations('meta')

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function resolveError(code?: string): string {
    if (!code) return ''
    // Known error codes have translations; otherwise show raw message (e.g. Supabase auth errors).
    try {
      return tErrors(code as never)
    } catch {
      return code
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = mode === 'login'
      ? await instructorLogin(email, password)
      : await instructorSignup(email, password, name)
    setLoading(false)
    if (result.error) {
      setError(resolveError(result.error))
    } else {
      router.replace('/instructor/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-10">

      {/* Back link */}
      <div className="relative z-10 w-full max-w-sm mb-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          {tAuth('back')}
        </Link>
      </div>

      {/* Brand */}
      <div className="relative z-10 mb-8 text-center" style={{ animation: 'fade-up 0.8s ease-out both' }}>
        <Link href="/" className="inline-flex flex-col items-center gap-3 group">
          <div
            className="logo-icon-glow w-14 h-14 rounded-[18px] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #34d178, #22c55e)' }}
          >
            <svg width="26" height="26" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" className="text-background">
              <path d="M6 30 Q6 6 30 6" />
              <circle cx="30" cy="6" r="2.8" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">
            {tMeta('appName')}
          </span>
        </Link>
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm bg-card border border-border rounded-[20px] overflow-hidden"
        style={{ animation: 'fade-up 0.8s ease-out 100ms both' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <h1 className="text-xl font-bold text-foreground">
            {mode === 'login' ? t('loginTitle') : t('signupTitle')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === 'login' ? t('loginSubtitle') : t('signupSubtitle')}
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {mode === 'signup' && (
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
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ok/50 focus-visible:ring-ok/10 h-12 text-base"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                {t('emailLabel')}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ok/50 focus-visible:ring-ok/10 h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                {t('passwordLabel')}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                required
                minLength={6}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ok/50 focus-visible:ring-ok/10 h-12 text-base"
              />
            </div>

            {error && (
              <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3 leading-snug">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-12 bg-ok text-on-ok font-semibold rounded-xl hover:bg-ok/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base mt-1"
            >
              {loading
                ? t('loading')
                : mode === 'login' ? t('loginCta') : t('signupCta')}
            </button>
          </form>

          <p className="text-center text-muted-foreground text-sm mt-6">
            {mode === 'login' ? t('switchToSignupPrompt') : t('switchToLoginPrompt')}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              className="text-ok hover:underline underline-offset-2 font-medium"
            >
              {mode === 'login' ? t('switchToSignup') : t('switchToLogin')}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
