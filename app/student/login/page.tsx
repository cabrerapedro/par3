'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

export default function StudentLogin() {
  const { studentLogin } = useAuth()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await studentLogin(code)
    setLoading(false)
    if (result.error) { setError(result.error) }
    else { router.replace('/student/journey') }
  }

  function handleCodeInput(val: string) {
    setCode(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-10">

      {/* Brand */}
      <div className="mb-8 text-center" style={{ animation: 'fade-up 0.8s ease-out both' }}>
        <Link href="/" className="inline-flex flex-col items-center gap-3 group">
          <div className="w-14 h-14 rounded-[20px] bg-blue/10 border border-blue/20 flex items-center justify-center group-hover:bg-blue/20 transition-colors duration-300">
            <svg width="26" height="26" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" className="text-blue">
              <line x1="18" y1="5" x2="18" y2="28" />
              <polygon points="18,5 28,10 18,15" fill="currentColor" opacity="0.3" stroke="currentColor" />
              <ellipse cx="18" cy="30" rx="7" ry="2.5" opacity="0.5" />
            </svg>
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">
            par<span className="text-ok">3</span>
          </span>
        </Link>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm bg-card border border-border rounded-[20px] overflow-hidden"
        style={{ animation: 'fade-up 0.8s ease-out 100ms both' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-border text-center">
          <h1 className="text-xl font-bold text-foreground">Ingresa tu código</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Escribe el código de 6 letras que te dio tu instructor
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
        </div>
      </div>
    </div>
  )
}
