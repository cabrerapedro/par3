'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Wordmark } from '@/components/Wordmark'

export default function StudentLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <StudentLogin />
    </Suspense>
  )
}

function StudentLogin() {
  const { studentLogin, studentOtpRequest, studentOtpVerify } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('auth.student')
  const tAuth = useTranslations('auth')
  const tErrors = useTranslations('auth.errors')

  function resolveError(code?: string): string {
    if (!code) return ''
    try {
      return tErrors(code as never)
    } catch {
      return code
    }
  }

  const [tab, setTab] = useState<'code' | 'email'>('code')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoLogging, setAutoLogging] = useState(false)
  const tried = useRef(false)

  const [code, setCode] = useState('')

  const [email, setEmail] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (!urlCode || tried.current) return
    tried.current = true
    // Auto-login from a shared ?code= link — intentional mount-time state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoLogging(true)
    studentLogin(urlCode).then(result => {
      if (result.error) {
        setAutoLogging(false)
        setError(t('invalidLink'))
      } else {
        router.replace('/student/journey')
      }
    })
  }, [searchParams])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await studentLogin(code)
    setLoading(false)
    if (result.error) { setError(resolveError(result.error)) }
    else { router.replace('/student/journey') }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await studentOtpRequest(email)
    setLoading(false)
    if (result.error) { setError(resolveError(result.error)); return }
    setOtpSent(true)
    setResendCooldown(60)
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await studentOtpVerify(email, otp)
    setLoading(false)
    if (result.error) { setError(resolveError(result.error)) }
    else { router.replace('/student/journey') }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setError('')
    setLoading(true)
    const result = await studentOtpRequest(email)
    setLoading(false)
    if (result.error) { setError(resolveError(result.error)); return }
    setOtp('')
    setResendCooldown(60)
  }

  function handleCodeInput(val: string) {
    setCode(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
  }

  function handleOtpInput(val: string) {
    setOtp(val.replace(/[^0-9]/g, '').slice(0, 6))
  }

  function switchTab(t: 'code' | 'email') {
    setTab(t)
    setError('')
  }

  if (autoLogging) return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-ink-soft text-sm">{t('entering')}</p>
    </div>
  )

  const codeInputClass = "h-16 text-center text-3xl font-mono tracking-[0.4em] placeholder:text-ink-mute/40 placeholder:text-xl placeholder:tracking-normal"
  const submitClass = "h-11 bg-primary text-primary-foreground font-medium tracking-[0.01em] hover:opacity-85 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"

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
        <p className="small-caps font-mono text-[10px] text-ink-mute mt-3">
          {tAuth('studentRole')}
        </p>
      </div>

      <div className="w-full max-w-sm border border-rule bg-paper-2">
        <div className="flex border-b border-rule">
          <button
            onClick={() => switchTab('code')}
            className={`flex-1 py-3.5 text-sm font-medium small-caps transition-colors ${tab === 'code' ? 'text-ink border-b-2 border-primary -mb-px' : 'text-ink-mute hover:text-ink'}`}
          >
            {t('tabCode')}
          </button>
          <button
            onClick={() => switchTab('email')}
            className={`flex-1 py-3.5 text-sm font-medium small-caps transition-colors ${tab === 'email' ? 'text-ink border-b-2 border-primary -mb-px' : 'text-ink-mute hover:text-ink'}`}
          >
            {t('tabEmail')}
          </button>
        </div>

        <div className="px-7 py-6">
          {tab === 'code' ? (
            <>
              <p className="text-ink-soft text-sm text-center mb-5">
                {t('codePromptText')}
              </p>
              <form onSubmit={handleCodeSubmit} className="flex flex-col gap-5">
                <Input
                  type="text"
                  value={code}
                  onChange={e => handleCodeInput(e.target.value)}
                  placeholder={t('codePlaceholder')}
                  maxLength={6}
                  required
                  autoFocus
                  className={codeInputClass}
                />

                {error && (
                  <div className="text-bad text-sm border border-bad/40 bg-bad/5 px-4 py-3 leading-snug">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || code.length < 4} className={submitClass}>
                  {loading ? t('verifying') : t('codeCta')}
                </button>
              </form>

              <p className="text-ink-soft text-sm text-center mt-6 leading-relaxed">
                {t('codeHelp')}
              </p>
            </>
          ) : !otpSent ? (
            <>
              <p className="text-ink-soft text-sm text-center mb-5">
                {t('emailPromptText')}
              </p>
              <form onSubmit={handleSendOtp} className="flex flex-col gap-5">
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  autoFocus
                  className="h-11 text-base"
                />

                {error && (
                  <div className="text-bad text-sm border border-bad/40 bg-bad/5 px-4 py-3 leading-snug">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || !email.includes('@')} className={submitClass}>
                  {loading ? t('sending') : t('sendCodeCta')}
                </button>
              </form>

              <p className="text-ink-soft text-sm text-center mt-6 leading-relaxed">
                {t('emailHelp')}
              </p>
            </>
          ) : (
            <>
              <p className="text-ink-soft text-sm text-center mb-5">
                {t('otpPromptText')} <span className="text-ink font-medium">{email}</span>
              </p>
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => handleOtpInput(e.target.value)}
                  placeholder={t('otpPlaceholder')}
                  maxLength={6}
                  required
                  autoFocus
                  className={codeInputClass}
                />

                {error && (
                  <div className="text-bad text-sm border border-bad/40 bg-bad/5 px-4 py-3 leading-snug">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || otp.length < 6} className={submitClass}>
                  {loading ? t('verifying') : t('verifyCta')}
                </button>
              </form>

              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-sm text-primary hover:opacity-80 disabled:text-ink-mute transition-opacity"
                >
                  {resendCooldown > 0 ? t('resendIn', { seconds: resendCooldown }) : t('resend')}
                </button>
                <span className="text-ink-mute/40">|</span>
                <button
                  onClick={() => { setOtpSent(false); setOtp(''); setError('') }}
                  className="text-sm text-ink-soft hover:text-ink transition-colors"
                >
                  {t('changeEmail')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
