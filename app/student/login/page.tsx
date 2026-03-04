'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

export default function StudentLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-5 h-5 rounded-full border-2 border-blue border-t-transparent animate-spin" />
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

  // Shared state
  const [tab, setTab] = useState<'code' | 'email'>('code')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoLogging, setAutoLogging] = useState(false)
  const tried = useRef(false)

  // Code tab state
  const [code, setCode] = useState('')

  // Email tab state
  const [email, setEmail] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  // Auto-login from ?code= URL parameter (shared link)
  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (!urlCode || tried.current) return
    tried.current = true
    setAutoLogging(true)
    studentLogin(urlCode).then(result => {
      if (result.error) {
        setAutoLogging(false)
        setError('El enlace no es válido. Pedí uno nuevo a tu instructor.')
      } else {
        router.replace('/student/journey')
      }
    })
  }, [searchParams])

  // Resend cooldown timer
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
    if (result.error) { setError(result.error) }
    else { router.replace('/student/journey') }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await studentOtpRequest(email)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setOtpSent(true)
    setResendCooldown(60)
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await studentOtpVerify(email, otp)
    setLoading(false)
    if (result.error) { setError(result.error) }
    else { router.replace('/student/journey') }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setError('')
    setLoading(true)
    const result = await studentOtpRequest(email)
    setLoading(false)
    if (result.error) { setError(result.error); return }
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <div className="w-5 h-5 rounded-full border-2 border-blue border-t-transparent animate-spin" />
      <p className="text-muted-foreground text-sm">Entrando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-10">

      {/* Back link */}
      <div className="relative z-10 w-full max-w-sm mb-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Volver
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
            Sweep
          </span>
        </Link>
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm bg-card border border-border rounded-[20px] overflow-hidden"
        style={{ animation: 'fade-up 0.8s ease-out 100ms both' }}
      >
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => switchTab('code')}
            className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${tab === 'code' ? 'text-foreground border-b-2 border-blue' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Código
          </button>
          <button
            onClick={() => switchTab('email')}
            className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${tab === 'email' ? 'text-foreground border-b-2 border-blue' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Email
          </button>
        </div>

        {/* Tab content */}
        <div className="px-6 py-6">
          {tab === 'code' ? (
            <>
              <p className="text-muted-foreground text-sm text-center mb-5">
                Escribe el código de 6 letras que te dio tu instructor
              </p>
              <form onSubmit={handleCodeSubmit} className="flex flex-col gap-5">
                <Input
                  type="text"
                  value={code}
                  onChange={e => handleCodeInput(e.target.value)}
                  placeholder="ABC123"
                  maxLength={6}
                  required
                  autoFocus
                  className="bg-secondary border-border text-foreground text-center text-3xl font-mono tracking-[0.4em] placeholder:text-muted-foreground/40 placeholder:text-xl placeholder:tracking-normal h-16 focus-visible:border-blue/50 focus-visible:ring-blue/10"
                />

                {error && (
                  <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3 leading-snug">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length < 4}
                  className="h-12 bg-blue text-white font-semibold rounded-xl hover:bg-blue/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base"
                >
                  {loading ? 'Verificando...' : 'Entrar a mis ejercicios'}
                </button>
              </form>

              <p className="text-muted-foreground text-sm text-center mt-6 leading-relaxed">
                Si no tienes código, pídele a tu instructor que cree tu perfil.
              </p>
            </>
          ) : !otpSent ? (
            <>
              <p className="text-muted-foreground text-sm text-center mb-5">
                Ingresa el email con el que te registró tu instructor
              </p>
              <form onSubmit={handleSendOtp} className="flex flex-col gap-5">
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoFocus
                  className="bg-secondary border-border text-foreground h-12 focus-visible:border-blue/50 focus-visible:ring-blue/10"
                />

                {error && (
                  <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3 leading-snug">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.includes('@')}
                  className="h-12 bg-blue text-white font-semibold rounded-xl hover:bg-blue/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base"
                >
                  {loading ? 'Enviando...' : 'Enviar código'}
                </button>
              </form>

              <p className="text-muted-foreground text-sm text-center mt-6 leading-relaxed">
                Te enviaremos un código de 6 dígitos a tu email.
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm text-center mb-5">
                Ingresa el código de 6 dígitos que enviamos a <span className="text-foreground font-medium">{email}</span>
              </p>
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => handleOtpInput(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  autoFocus
                  className="bg-secondary border-border text-foreground text-center text-3xl font-mono tracking-[0.4em] placeholder:text-muted-foreground/40 placeholder:text-xl placeholder:tracking-normal h-16 focus-visible:border-blue/50 focus-visible:ring-blue/10"
                />

                {error && (
                  <div className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3 leading-snug">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="h-12 bg-blue text-white font-semibold rounded-xl hover:bg-blue/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base"
                >
                  {loading ? 'Verificando...' : 'Verificar'}
                </button>
              </form>

              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-sm text-blue hover:text-blue/80 disabled:text-muted-foreground transition-colors"
                >
                  {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
                </button>
                <span className="text-muted-foreground/30">|</span>
                <button
                  onClick={() => { setOtpSent(false); setOtp(''); setError('') }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cambiar email
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
