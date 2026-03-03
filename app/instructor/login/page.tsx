'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
      <Link href="/" className="text-muted-foreground text-sm hover:text-foreground transition-colors mb-8 flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        par<span className="text-ok">3</span>
      </Link>

      <Card className="w-full max-w-sm border-border bg-card shadow-none gap-0 py-0">
        <CardHeader className="px-6 pt-6 pb-5">
          <CardTitle className="text-xl text-foreground">
            {mode === 'login' ? 'Bienvenido, instructor' : 'Crear cuenta'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {mode === 'login'
              ? 'Accede a tu panel de alumnos'
              : 'Configura tu cuenta de instructor'}
          </CardDescription>
        </CardHeader>

        <Separator className="bg-border" />

        <CardContent className="px-6 py-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-muted-foreground text-xs uppercase tracking-wide">Nombre</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Tu nombre"
                  required
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-muted-foreground text-xs uppercase tracking-wide">Correo</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-muted-foreground text-xs uppercase tracking-wide">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ok/50 focus-visible:ring-0 h-11"
              />
            </div>

            {error && (
              <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-11 bg-ok text-background font-semibold hover:bg-ok/90 mt-1"
            >
              {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>

          <p className="text-center text-muted-foreground text-sm mt-5">
            {mode === 'login' ? '¿Primera vez?' : '¿Ya tienes cuenta?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              className="text-ok hover:underline underline-offset-2 font-medium"
            >
              {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
