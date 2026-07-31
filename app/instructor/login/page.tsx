'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wordmark } from '@/components/Wordmark'

export default function InstructorLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <InstructorLogin />
    </Suspense>
  )
}

function InstructorLogin() {
  const { instructorLogin, instructorCodeLogin, instructorSignup } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('auth.instructor')
  const tAuth = useTranslations('auth')
  const tErrors = useTranslations('auth.errors')

  // Deep-link: /instructor/login?mode=signup opens straight on the signup form
  // (the landing "Crear cuenta" CTA uses this). 'code' is the passwordless
  // access-code login (same UX as the student code).
  const [mode, setMode] = useState<'login' | 'signup' | 'code'>(
    searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function resolveError(code?: string): string {
    if (!code) return ''
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
    const result = mode === 'code'
      ? await instructorCodeLogin(accessCode)
      : mode === 'login'
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
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm mb-5">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          {tAuth('back')}
        </Link>
      </div>

      <div className="mb-9 text-center">
        <Link href="/" className="inline-block">
          <Wordmark size="lg" />
        </Link>
        <p className="small-caps font-mono text-[11px] text-ink-mute mt-3">
          {tAuth('instructorRole')}
        </p>
      </div>

      <div className="w-full max-w-sm border border-rule bg-paper-2">
        <div className="px-7 pt-6 pb-5 border-b border-rule">
          <h1 className="font-display font-semibold text-2xl leading-tight">
            {mode === 'login' ? t('loginTitle') : mode === 'signup' ? t('signupTitle') : t('codeTitle')}
          </h1>
          <p className="text-ink-soft text-sm mt-1.5">
            {mode === 'login' ? t('loginSubtitle') : mode === 'signup' ? t('signupSubtitle') : t('codeSubtitle')}
          </p>
        </div>

        <div className="px-7 py-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {mode === 'signup' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="small-caps font-mono text-[11px] text-ink-mute">
                  {t('nameLabel')}
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  required
                  className="h-11 text-base"
                />
              </div>
            )}

            {mode === 'code' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accessCode" className="small-caps font-mono text-[11px] text-ink-mute">
                  {t('codeLabel')}
                </Label>
                <Input
                  id="accessCode"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={accessCode}
                  onChange={e => setAccessCode(e.target.value.toUpperCase())}
                  placeholder={t('codePlaceholder')}
                  required
                  minLength={8}
                  maxLength={8}
                  className="h-12 text-lg font-mono tracking-[0.3em] text-center uppercase"
                />
                <p className="text-ink-mute text-xs leading-snug">{t('codeHelp')}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="small-caps font-mono text-[11px] text-ink-mute">
                    {t('emailLabel')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    required
                    className="h-11 text-base"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="small-caps font-mono text-[11px] text-ink-mute">
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
                    className="h-11 text-base"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="text-bad text-sm border border-bad/40 bg-bad/5 px-4 py-3 leading-snug">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-11 bg-primary text-primary-foreground font-medium tracking-[0.01em] hover:opacity-85 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading
                ? t('loading')
                : mode === 'login' ? t('loginCta') : mode === 'signup' ? t('signupCta') : t('codeCta')}
            </button>
          </form>

          {mode !== 'code' && (
            <p className="text-center text-ink-soft text-sm mt-6">
              {mode === 'login' ? t('switchToSignupPrompt') : t('switchToLoginPrompt')}{' '}
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
                className="text-primary hover:underline underline-offset-2 font-medium"
              >
                {mode === 'login' ? t('switchToSignup') : t('switchToLogin')}
              </button>
            </p>
          )}
          <p className="text-center text-ink-soft text-sm mt-3">
            <button
              onClick={() => { setMode(mode === 'code' ? 'login' : 'code'); setError('') }}
              className="text-primary hover:underline underline-offset-2 font-medium"
            >
              {mode === 'code' ? t('switchToPassword') : t('switchToCode')}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
