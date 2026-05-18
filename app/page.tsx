'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/lib/auth'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Wordmark } from '@/components/Wordmark'
import { Stamp } from '@/components/Stamp'

export default function Home() {
  const { instructor, student, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (instructor) router.replace('/instructor/dashboard')
    else if (student) router.replace('/student/journey')
  }, [instructor, student, loading, router])

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Header />
      <Hero />
      <Manifesto />
      <ComoFunciona />
      <PlanVisual />
      <Acceso />
      <Footer />
    </div>
  )
}

/* ─── Header ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 py-4 flex items-center justify-between">
        <Link href="/" aria-label="Parell — inicio">
          <Wordmark size="md" />
        </Link>
        <nav className="flex items-center gap-6 md:gap-8">
          <a href="#metodo" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">El método</a>
          <a href="#como-funciona" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">Cómo funciona</a>
          <a href="#acceso" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">Ingresar</a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 py-16 md:py-24 grid md:grid-cols-[1.4fr_1fr] gap-12 md:gap-16 items-center">
        <div>
          <p className="small-caps font-mono text-[11px] text-accent">
            Para instructores de golf y sus alumnos
          </p>
          <h1 className="font-display font-semibold text-[44px] md:text-[68px] leading-[1.02] tracking-[-0.025em] mt-6">
            La clase del sábado<br />sigue viva el martes.
          </h1>
          <p className="text-lg md:text-[19px] text-ink-soft leading-[1.55] mt-7 max-w-[540px]">
            <span className="text-ink font-medium">Parell</span> es un cuaderno de práctica que tu alumno lleva en el bolsillo. Vos calibrás su técnica durante la clase; él practica con tu referencia exacta en el rango. La app compara, prioriza, y te devuelve la semana entera el sábado siguiente.
          </p>

          <div className="flex flex-wrap gap-3 mt-9">
            <Link
              href="/instructor/login"
              className="inline-flex items-center justify-center h-11 px-7 text-sm font-medium tracking-[0.01em] bg-primary text-primary-foreground rounded-md hover:opacity-85 transition-opacity"
            >
              Soy instructor →
            </Link>
            <Link
              href="/student/login"
              className="inline-flex items-center justify-center h-11 px-7 text-sm font-medium tracking-[0.01em] border border-ink bg-transparent text-ink rounded-md hover:opacity-75 transition-opacity"
            >
              Soy alumno
            </Link>
          </div>

          <p className="small-caps font-mono text-[10px] text-ink-mute mt-6">
            Sin tarjeta · hasta tres alumnos · español e inglés
          </p>
        </div>

        <div className="relative">
          <div className="relative border border-rule bg-paper-2 aspect-[4/5] overflow-hidden">
            <Image
              src="/images/hero-address.png"
              alt="Postura de dirección — vista de perfil, con anotaciones técnicas del instructor"
              fill
              priority
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover"
            />
            <div className="absolute top-6 right-6 z-10">
              <Stamp>PAR</Stamp>
            </div>
          </div>
          <div className="flex justify-between mt-3">
            <span className="small-caps font-mono text-[10px] text-ink-mute">Lámina 03 — Postura de dirección</span>
            <span className="small-caps font-mono text-[10px] text-ink-mute">De perfil · DTL</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Manifesto ─────────────────────────────────────────────────────────── */

function Manifesto() {
  return (
    <section id="metodo" className="border-b border-rule py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 grid md:grid-cols-[180px_1fr] gap-12 md:gap-16">
        <p className="small-caps font-mono text-[11px] text-accent">El método</p>

        <div className="max-w-[720px]">
          <p className="font-display font-medium text-2xl md:text-[30px] leading-[1.28]">
            El instructor enseña una hora a la semana. El alumno practica seis. Entre la clase y la práctica suele caer la mitad de lo aprendido — no por falta de esfuerzo, sino porque la memoria es frágil y el cuerpo se acomoda a sus viejos hábitos en cuanto cierra la puerta de la academia.
          </p>

          <p className="text-[17px] leading-[1.6] text-ink-soft mt-8">
            Parell es un cuaderno. El instructor lo escribe durante la clase: graba el movimiento correcto del alumno, lo anota con su voz y su dedo sobre el frame clave, lo guarda. El alumno lo abre cada vez que va al rango. La técnica no es un recuerdo borroso del sábado — es una referencia visible, comparable, exacta.
          </p>

          <div className="border-t border-rule mt-12 pt-12">
            <p className="font-display font-semibold text-[28px] md:text-[34px] leading-[1.2] relative pl-9">
              <span aria-hidden className="absolute left-[-2px] top-[-12px] text-[80px] leading-none text-accent font-semibold">“</span>
              No reemplazamos al instructor. Lo extendemos.
            </p>
            <p className="small-caps font-mono text-[11px] text-ink-mute mt-4 ml-9">
              Principio irrenunciable
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Cómo funciona ─────────────────────────────────────────────────────── */

function ComoFunciona() {
  return (
    <section id="como-funciona" className="border-b border-rule py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="grid md:grid-cols-[180px_1fr] gap-12 md:gap-16 items-baseline mb-12 md:mb-14">
          <p className="small-caps font-mono text-[11px] text-accent">Cómo funciona</p>
          <h2 className="font-display font-semibold text-3xl md:text-[40px] leading-[1.1] max-w-[640px]">
            Tres momentos. Uno por persona, uno por día, uno por semana.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 border-t border-b border-rule">
          <Panel
            numeral="I"
            who="Durante la clase"
            title="El instructor calibra."
            body="Con el iPad en mano, graba 15 segundos del movimiento correcto del alumno. Pausa, dibuja con el dedo sobre el frame clave, habla. Lo guarda. La técnica queda como un manual técnico — exacto, suyo."
            imageSrc="/images/como-calibra.png"
            imageAlt="Instructor con iPad junto a alumno en posición de address"
          />
          <Panel
            numeral="II"
            who="Entre clases"
            title="El alumno practica."
            body="Abre el teléfono en el rango. Ve la referencia de su profesor, la escucha, la entiende. Activa el espejo. La app le dice qué corregir, una cosa a la vez, en lenguaje corporal — sin jerga, sin números."
            imageSrc="/images/como-practica.png"
            imageAlt="Alumno practicando solo en el rango con el teléfono en un trípode mostrando feedback"
            divider
          />
          <Panel
            numeral="III"
            who="El sábado siguiente"
            title="La conversación se reanuda."
            body="El instructor abre el perfil del alumno y ve la semana entera como un yardage book: qué practicó, qué le costó, qué mejoró. La clase del sábado deja de empezar de cero."
            imageSrc="/images/como-revisa.png"
            imageAlt="Dos pares de manos revisando un iPad con el scorecard semanal del alumno"
            divider
          />
        </div>
      </div>
    </section>
  )
}

function Panel({ numeral, who, title, body, imageSrc, imageAlt, divider }: { numeral: string; who: string; title: string; body: string; imageSrc: string; imageAlt: string; divider?: boolean }) {
  return (
    <div className={`px-7 py-10 ${divider ? 'md:border-l border-rule' : ''}`}>
      <div className="relative aspect-[4/3] bg-paper-2 border border-rule mb-6 overflow-hidden">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover"
        />
      </div>
      <p className="small-caps font-mono text-[10px] text-accent">{numeral} · {who}</p>
      <h3 className="font-display font-semibold text-[22px] leading-[1.2] mt-2">{title}</h3>
      <p className="text-sm leading-[1.6] text-ink-soft mt-3">{body}</p>
    </div>
  )
}

/* ─── Plan visual (yardage book) ────────────────────────────────────────── */

function PlanVisual() {
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const rows = [
    { exercise: 'Postura abierta',        scores: ['+1', '+1', 'E', '—', 'E', '—', 'E'],   total: 'E' },
    { exercise: 'Apertura de hombros',    scores: ['+3', '+2', '+1', '+1', 'E', '—', '—'], total: '+1' },
    { exercise: 'Distribución de peso',   scores: ['+5', '+3', '+3', '+2', '+1', '+1', '+1'], total: '+2' },
    { exercise: 'Inclinación de columna', scores: ['E', 'E', 'E', '+1', 'E', 'E', '+1'],  total: 'E' },
  ]
  const colorFor = (s: string) => s === 'E' ? 'var(--color-ok)' : s === '+1' ? 'var(--color-warn)' : s === '—' ? 'var(--color-ink-mute)' : 'var(--color-bad)'

  return (
    <section className="border-b border-rule py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="grid md:grid-cols-[180px_1fr] gap-12 md:gap-16 items-baseline mb-12 md:mb-14">
          <p className="small-caps font-mono text-[11px] text-accent">La semana, vista</p>
          <div className="max-w-[640px]">
            <h2 className="font-display font-semibold text-3xl md:text-[40px] leading-[1.1]">
              La práctica del alumno se lee como un scorecard.
            </h2>
            <p className="text-base leading-[1.6] text-ink-soft mt-5">
              Cada ejercicio es un hoyo. La referencia que vos calibraste es el par. Lo que el alumno hace cada día queda registrado en la misma página, lista para revisarla juntos el sábado.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-[200px_1fr] gap-8 md:gap-10 items-start">
          <div>
            <HoleMapLarge />
            <p className="small-caps font-mono text-[10px] text-ink-mute mt-4">Pedro Cabrera · Sem. 19</p>
            <p className="text-sm leading-[1.5] text-ink-soft mt-2">Cuatro hoyos. Siete días. Una página.</p>
          </div>

          <div className="border border-rule overflow-x-auto">
            <div className="grid bg-paper-2 border-b border-rule" style={{ gridTemplateColumns: `1.6fr 56px repeat(${days.length}, 1fr) 64px` }}>
              <div className="px-3.5 py-2.5"><span className="small-caps font-mono text-[10px] text-ink-mute">Ejercicio</span></div>
              <div className="px-2 py-2.5 text-center border-l border-rule"><span className="small-caps font-mono text-[10px] text-ink-mute">Ref</span></div>
              {days.map(d => (
                <div key={d} className="py-2.5 text-center border-l border-rule">
                  <span className="small-caps font-mono text-[10px] text-ink-mute">{d}</span>
                </div>
              ))}
              <div className="px-2 py-2.5 text-center border-l border-rule"><span className="small-caps font-mono text-[10px] text-ink-mute">Sem</span></div>
            </div>
            {rows.map((row, ri) => (
              <div key={row.exercise} className={`grid ${ri < rows.length - 1 ? 'border-b border-rule' : ''}`} style={{ gridTemplateColumns: `1.6fr 56px repeat(${days.length}, 1fr) 64px` }}>
                <div className="px-3.5 py-3.5"><span className="text-sm text-ink">{row.exercise}</span></div>
                <div className="px-2 py-3.5 text-center border-l border-rule">
                  <span className="small-caps font-mono text-[10px] text-ink-mute" style={{ letterSpacing: '0.18em' }}>PAR</span>
                </div>
                {row.scores.map((s, i) => (
                  <div key={i} className="py-3.5 text-center border-l border-rule">
                    <span className="font-mono tabular-nums text-sm font-medium" style={{ color: colorFor(s) }}>{s}</span>
                  </div>
                ))}
                <div className="px-2 py-3.5 text-center border-l border-rule bg-paper-2">
                  <span className="font-mono tabular-nums text-sm font-semibold" style={{ color: colorFor(row.total) }}>{row.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function HoleMapLarge() {
  return (
    <svg viewBox="0 0 200 240" className="w-full max-w-[200px] block text-ink">
      <rect x="84" y="220" width="32" height="8" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <text x="72" y="238" fontSize="7" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.5">TEE</text>

      <path d="M 100,220 C 94,170 112,130 118,90" fill="none" style={{ stroke: 'var(--color-rule)' }} strokeWidth="16" strokeLinecap="round" />

      <path d="M 100,36 C 76,36 64,60 76,80 C 88,98 124,96 134,76 C 146,60 132,36 110,36 Z" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M 104,46 C 90,48 82,62 92,76 C 104,88 124,80 126,68 C 128,56 118,44 104,46 Z" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.55" />
      <path d="M 106,56 C 98,58 96,68 104,72 C 114,76 118,68 116,62 C 114,58 112,54 106,56 Z" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.55" />

      <line x1="110" y1="46" x2="110" y2="68" stroke="currentColor" strokeWidth="0.9" />
      <polygon points="110,46 120,50 110,55" style={{ fill: 'var(--color-accent)' }} />

      <text x="130" y="54" fontSize="7.5" style={{ fill: 'var(--color-accent)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.5" fontWeight="500">163y</text>

      <g style={{ stroke: 'var(--color-ink-mute)' }} fill="none" strokeWidth="0.7">
        <line x1="20" y1="26" x2="46" y2="44" />
        <polyline points="40,40 46,44 41,49" />
      </g>
      <text x="20" y="18" fontSize="6.5" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.4">SW · 12mph</text>

      <line x1="92" y1="130" x2="108" y2="130" stroke="currentColor" strokeWidth="0.5" />
      <text x="114" y="133" fontSize="6.5" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)">100</text>
      <line x1="98" y1="180" x2="108" y2="180" stroke="currentColor" strokeWidth="0.5" />
      <text x="114" y="183" fontSize="6.5" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)">50</text>
    </svg>
  )
}

/* ─── Acceso ───────────────────────────────────────────────────────────── */

function Acceso() {
  return (
    <section id="acceso" className="border-b border-rule py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="grid md:grid-cols-[180px_1fr] gap-12 md:gap-16 items-baseline mb-12 md:mb-14">
          <p className="small-caps font-mono text-[11px] text-accent">Acceso</p>
          <h2 className="font-display font-semibold text-3xl md:text-[40px] leading-[1.1]">
            Dos puertas. La que te corresponda.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 border-t border-rule">
          <AccessBlock
            numeral="I"
            who="Para instructores"
            title="Empezá con tres alumnos."
            body="Sin tarjeta. Calibrá un par de ejercicios con cada alumno, mirá qué tal lo siente la primera semana. Si funciona, escalás."
            ctaText="Crear cuenta"
            ctaHref="/instructor/login"
            secondaryText="Ya tengo cuenta"
            secondaryHref="/instructor/login"
            stamp="GRATIS HASTA 3 ALUMNOS"
          />
          <AccessBlock
            numeral="II"
            who="Para alumnos"
            title="Ingresá con tu código."
            body="Tu instructor te dio un código de seis caracteres. Es todo lo que necesitás — el acceso es gratis y no requiere tarjeta."
            ctaText="Ingresar con código"
            ctaHref="/student/login"
            secondaryText="¿No tenés código?"
            secondaryHref="#"
            stamp="ACCESO LIBRE"
            divider
          />
        </div>
      </div>
    </section>
  )
}

function AccessBlock({ numeral, who, title, body, ctaText, ctaHref, secondaryText, secondaryHref, stamp, divider }: {
  numeral: string; who: string; title: string; body: string;
  ctaText: string; ctaHref: string; secondaryText: string; secondaryHref: string;
  stamp: string; divider?: boolean
}) {
  return (
    <div className={`relative px-10 py-12 border-b border-rule ${divider ? 'md:border-l' : ''}`}>
      <div className="absolute top-8 right-8">
        <Stamp>{stamp}</Stamp>
      </div>
      <p className="small-caps font-mono text-[10px] text-accent">{numeral} · {who}</p>
      <h3 className="font-display font-semibold text-2xl md:text-[28px] leading-[1.15] mt-2 max-w-[380px]">
        {title}
      </h3>
      <p className="text-[15px] leading-[1.6] text-ink-soft mt-4 mb-8 max-w-[400px]">
        {body}
      </p>
      <div className="flex items-center gap-3">
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium tracking-[0.01em] bg-primary text-primary-foreground rounded-md hover:opacity-85 transition-opacity"
        >
          {ctaText}
        </Link>
        <Link
          href={secondaryHref}
          className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:decoration-ink-soft transition-colors"
        >
          {secondaryText}
        </Link>
      </div>
    </div>
  )
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="py-12">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 flex flex-col md:flex-row justify-between items-start md:items-baseline gap-6">
        <Wordmark size="sm" />
        <div className="flex gap-8">
          <a href="#" className="text-xs text-ink-mute hover:text-ink-soft transition-colors">Contacto</a>
          <a href="#" className="text-xs text-ink-mute hover:text-ink-soft transition-colors">Privacidad</a>
          <a href="#" className="text-xs text-ink-mute hover:text-ink-soft transition-colors">Términos</a>
        </div>
        <span className="small-caps font-mono text-[10px] text-ink-mute">
          Hecho con tempo · Barcelona
        </span>
      </div>
    </footer>
  )
}

/* ─── Loading ───────────────────────────────────────────────────────────── */

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}
