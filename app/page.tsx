'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { ThemeToggle } from '@/components/ThemeToggle'
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
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" className="text-ok">
            <line x1="18" y1="5" x2="18" y2="28" />
            <polygon points="18,5 28,10 18,15" fill="currentColor" opacity="0.3" stroke="currentColor" />
            <ellipse cx="18" cy="30" rx="7" ry="2.5" opacity="0.5" />
          </svg>
          <span className="text-sm font-bold text-foreground tracking-tight">
            par<span className="text-ok">3</span>
          </span>
        </div>
        <ThemeToggle />
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">

        {/* Logo mark */}
        <div
          className="mb-8 w-20 h-20 rounded-[20px] bg-ok/10 border border-ok/20 flex items-center justify-center mx-auto"
          style={{ animation: 'fade-up 0.8s ease-out both' }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" className="text-ok">
            <line x1="18" y1="5" x2="18" y2="28" />
            <polygon points="18,5 28,10 18,15" fill="currentColor" opacity="0.3" stroke="currentColor" />
            <ellipse cx="18" cy="30" rx="7" ry="2.5" opacity="0.5" />
          </svg>
        </div>

        {/* Heading */}
        <div style={{ animation: 'fade-up 0.8s ease-out 100ms both' }}>
          <h1
            className="text-5xl sm:text-6xl tracking-tight text-foreground mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            par<span className="text-ok">3</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Practica con la guía<br className="hidden sm:block" /> de tu profesor
          </p>
        </div>

        {/* Role cards */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg mt-12"
          style={{ animation: 'fade-up 0.8s ease-out 200ms both' }}
        >
          {/* Instructor */}
          <Link href="/instructor/login" className="group text-left">
            <div className="h-full bg-card border border-border rounded-[20px] p-6 hover:border-ok/40 hover:bg-secondary/40 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-ok/10 border border-ok/20 flex items-center justify-center mb-5 group-hover:bg-ok/20 transition-colors duration-300">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ok">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                  <path d="M19 8v6M22 11h-6" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-foreground font-semibold text-lg mb-1.5">Soy Instructor</p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                Calibra a tus alumnos y crea su referencia personal de técnica
              </p>
              <span className="inline-flex items-center gap-1.5 text-ok text-sm font-medium">
                Iniciar sesión
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </div>
          </Link>

          {/* Alumno */}
          <Link href="/student/login" className="group text-left">
            <div className="h-full bg-card border border-border rounded-[20px] p-6 hover:border-blue/40 hover:bg-secondary/40 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-blue/10 border border-blue/20 flex items-center justify-center mb-5 group-hover:bg-blue/20 transition-colors duration-300">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-foreground font-semibold text-lg mb-1.5">Soy Alumno</p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                Ingresa el código de 6 letras que te dio tu instructor para acceder a tus ejercicios
              </p>
              <span className="inline-flex items-center gap-1.5 text-blue text-sm font-medium">
                Ingresar con código
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-5 text-center">
        <p className="text-xs text-muted-foreground/50 font-mono">par3.app</p>
      </div>
    </div>
  )
}
