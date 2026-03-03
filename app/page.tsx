'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function Home() {
  const { instructor, student, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (instructor) router.replace('/instructor/dashboard')
    else if (student) router.replace('/student/journey')
  }, [instructor, student, loading, router])

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-bold text-foreground tracking-tight">
          par<span className="text-ok">3</span>
        </span>
        <ThemeToggle />
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* Logo mark */}
        <div className="mb-8">
          <div className="w-16 h-16 rounded-2xl bg-ok/10 border border-ok/20 flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="9" r="6" fill="#34d178" />
              <line x1="26" y1="15" x2="26" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-foreground" />
              <line x1="26" y1="34" x2="17" y2="47" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="26" y1="34" x2="35" y2="47" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground mb-3">
          par<span className="text-ok">3</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-2 max-w-xs">
          Tu copiloto de práctica
        </p>
        <p className="text-sm text-muted-foreground/70 max-w-sm mb-12">
          El instructor calibra. El alumno practica con su referencia personal.
        </p>

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
          <Link href="/instructor/login" className="group">
            <div className="h-full bg-card border border-border rounded-2xl p-6 text-left hover:border-ok/40 hover:bg-secondary/50 transition-all duration-200">
              <div className="w-10 h-10 rounded-xl bg-ok/10 border border-ok/20 flex items-center justify-center mb-4 group-hover:bg-ok/20 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ok">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                  <path d="M19 8v6M22 11h-6" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-foreground font-semibold text-base mb-1">Soy Instructor</p>
              <p className="text-muted-foreground text-sm leading-relaxed">Calibra alumnos y crea su referencia personal</p>
              <p className="text-ok text-xs mt-3 font-medium flex items-center gap-1">
                Iniciar sesión
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </p>
            </div>
          </Link>

          <Link href="/student/login" className="group">
            <div className="h-full bg-card border border-border rounded-2xl p-6 text-left hover:border-blue/40 hover:bg-secondary/50 transition-all duration-200">
              <div className="w-10 h-10 rounded-xl bg-blue/10 border border-blue/20 flex items-center justify-center mb-4 group-hover:bg-blue/20 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-foreground font-semibold text-base mb-1">Soy Alumno</p>
              <p className="text-muted-foreground text-sm leading-relaxed">Practica con tu referencia personal de técnica</p>
              <p className="text-blue text-xs mt-3 font-medium flex items-center gap-1">
                Ingresar con código
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-6 text-center">
        <p className="text-xs text-muted-foreground/50 font-mono">par3.app</p>
      </div>
    </div>
  )
}
