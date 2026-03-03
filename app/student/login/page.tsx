'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
      <Link href="/" className="text-muted-foreground text-sm hover:text-foreground transition-colors mb-8 flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        par<span className="text-ok">3</span>
      </Link>

      <Card className="w-full max-w-sm border-border bg-card shadow-none gap-0 py-0">
        <CardHeader className="px-6 pt-6 pb-5 text-center">
          <div className="w-12 h-12 bg-blue/10 border border-blue/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
            </svg>
          </div>
          <CardTitle className="text-xl text-foreground">Ingresa tu código</CardTitle>
          <CardDescription className="text-muted-foreground">
            Tu instructor te dio un código de 6 caracteres
          </CardDescription>
        </CardHeader>

        <Separator className="bg-border" />

        <CardContent className="px-6 py-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="text"
              value={code}
              onChange={e => handleCodeInput(e.target.value)}
              placeholder="ABC123"
              maxLength={6}
              required
              autoFocus
              className="bg-secondary border-border text-foreground text-center text-3xl font-mono tracking-[0.4em] placeholder:text-muted-foreground/40 placeholder:text-xl placeholder:tracking-normal h-16 focus-visible:border-blue/50 focus-visible:ring-0"
            />

            {error && (
              <p className="text-bad text-sm bg-bad/10 border border-bad/20 rounded-xl px-4 py-3">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || code.length < 4}
              className="h-11 bg-ok text-background font-semibold hover:bg-ok/90"
            >
              {loading ? 'Verificando...' : 'Entrar a mi journey'}
            </Button>
          </form>

          <p className="text-muted-foreground text-xs text-center mt-5">
            Si no tienes código, pídele a tu instructor que cree tu perfil.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
