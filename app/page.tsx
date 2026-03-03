'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { ThemeToggle } from '@/components/ThemeToggle'
import Link from 'next/link'

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`

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
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">

      {/* Radial gradient background glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(52, 209, 120, 0.04) 0%, transparent 60%)' }}
      />

      {/* Grain texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        style={{ backgroundImage: GRAIN_SVG }}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4"
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
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">

        {/* Logo mark */}
        <div
          className="logo-icon-glow mb-7 w-16 h-16 rounded-[18px] flex items-center justify-center mx-auto"
          style={{
            background: 'linear-gradient(135deg, #34d178, #22c55e)',
            animation: 'fade-up 0.8s ease-out both',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" className="text-background">
            <line x1="18" y1="5" x2="18" y2="28" />
            <polygon points="18,5 28,10 18,15" fill="currentColor" opacity="0.6" stroke="currentColor" />
            <ellipse cx="18" cy="30" rx="7" ry="2.5" opacity="0.7" />
          </svg>
        </div>

        {/* par3 wordmark */}
        <h1
          className="text-[52px] sm:text-6xl tracking-[-0.04em] text-foreground leading-none mb-5"
          style={{ fontFamily: 'var(--font-display)', animation: 'fade-up 0.8s ease-out 80ms both' }}
        >
          par<span className="text-ok">3</span>
        </h1>

        {/* Tagline + subtitle */}
        <div style={{ animation: 'fade-up 0.8s ease-out 160ms both' }}>
          <p
            className="text-[22px] text-foreground mb-3 leading-snug mx-auto"
            style={{ fontFamily: 'var(--font-display)', maxWidth: '380px' }}
          >
            Practica con la guía de tu profesor
          </p>
          <p className="text-base text-muted-foreground leading-relaxed mx-auto" style={{ maxWidth: '380px' }}>
            Tu profesor te enseña. par3 te ayuda a practicar bien entre clases.
          </p>
        </div>

        {/* Role cards */}
        <div
          className="w-full max-w-[520px] flex flex-col md:flex-row gap-4 mt-12"
          style={{ animation: 'fade-up 0.8s ease-out 240ms both' }}
        >
          {/* Instructor */}
          <Link href="/instructor/login" className="group flex-1 text-left">
            <div className="landing-card-shadow relative h-full bg-card border border-border rounded-[20px] overflow-hidden hover:-translate-y-0.5 hover:border-ok/25 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
              {/* Gradient glow overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-ok/[0.1] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              <div className="relative z-10 flex items-center md:flex-col md:items-start gap-5 p-7">
                {/* Icon */}
                <div className="w-14 h-14 rounded-2xl bg-ok/10 border border-ok/[0.15] flex items-center justify-center shrink-0 group-hover:bg-ok/20 transition-colors duration-300">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ok">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    <path d="M19 8v6M22 11h-6" />
                  </svg>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-foreground mb-1">Soy Instructor</p>
                  <p className="text-[15px] text-muted-foreground leading-snug">
                    Graba, analiza y guía la práctica de tus alumnos
                  </p>
                </div>

                {/* Arrow */}
                <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 group-hover:bg-white/[0.08] transition-all duration-300 group-hover:translate-x-0.5 md:self-end md:mt-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-muted-foreground/80">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Divider — mobile only */}
          <div className="flex items-center gap-4 md:hidden">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs text-muted-foreground/50 uppercase tracking-[0.12em] font-medium">o</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {/* Alumno */}
          <Link href="/student/login" className="group flex-1 text-left">
            <div className="landing-card-shadow relative h-full bg-card border border-border rounded-[20px] overflow-hidden hover:-translate-y-0.5 hover:border-blue/25 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
              {/* Gradient glow overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue/[0.1] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              <div className="relative z-10 flex items-center md:flex-col md:items-start gap-5 p-7">
                {/* Icon */}
                <div className="w-14 h-14 rounded-2xl bg-blue/10 border border-blue/[0.15] flex items-center justify-center shrink-0 group-hover:bg-blue/20 transition-colors duration-300">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-blue">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-foreground mb-1">Soy Alumno</p>
                  <p className="text-[15px] text-muted-foreground leading-snug">
                    Ingresa con el código que te dio tu profesor
                  </p>
                </div>

                {/* Arrow */}
                <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 group-hover:bg-white/[0.08] transition-all duration-300 group-hover:translate-x-0.5 md:self-end md:mt-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-muted-foreground/80">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 px-6 py-5 text-center">
        <p className="text-xs text-muted-foreground/50 font-mono">par3.app</p>
      </div>
    </div>
  )
}
