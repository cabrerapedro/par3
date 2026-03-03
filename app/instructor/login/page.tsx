'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function InstructorLogin() {
  const { instructorLogin, instructorSignup } = useAuth()
  const router = useRouter()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = mode === 'login'
      ? await instructorLogin(email, password)
      : await instructorSignup(email, password, name)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      router.replace('/instructor/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-10">

      {/* Brand */}
      <div className="mb-8 text-center" style={{ animation: 'fade-up 0.8s ease-out both' }}>
        <Link href="/" className="inline-flex flex-col items-center gap-3 group">
          <div className="w-14 h-14 rounded-[20px] bg-ok/10 border border-ok/20 flex items-center justify-center group-hover:bg-ok/20 transition-colors duration-300">
            <svg width="26" height="26" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" className="text-ok">
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
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <h1 className="text-xl font-bold text-foreground">
            {mode === 'login' ? 'Bienvenido, instructor' : 'Crear cuenta'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === 'login'
              ? 'Accede a tu panel de alumnos'
              : 'Configura tu cuenta de instructor'}
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {mode === 'signup' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  Nombre
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Tu nombre completo"
                  required
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ok/50 focus-visible:ring-ok/10 h-12 text-base"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Correo electrónico
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ok/50 focus-visible:ring-ok/10 h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
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
              className="h-12 bg-ok text-black font-semibold rounded-xl hover:bg-ok/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base mt-1"
            >
              {loading
                ? 'Cargando...'
                : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <p className="text-center text-muted-foreground text-sm mt-6">
            {mode === 'login' ? '¿Primera vez?' : '¿Ya tienes cuenta?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              className="text-ok hover:underline underline-offset-2 font-medium"
            >
              {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
