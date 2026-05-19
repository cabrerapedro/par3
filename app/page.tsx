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
      <TresPrincipios />
      <Acceso />
      <Cierre />
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
          <a href="#principios" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">Tecnología</a>
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
            Una app para instructores de golf
          </p>
          <h1 className="font-display font-semibold text-[40px] md:text-[60px] leading-[1.05] tracking-[-0.025em] mt-6">
            Tu alumno practica con tu referencia exacta,<br className="hidden md:inline" /> no con un estándar genérico.
          </h1>
          <p className="text-lg md:text-[19px] text-ink-soft leading-[1.55] mt-7 max-w-[560px]">
            Calibras la técnica de tu alumno una vez. Él la practica toda la semana con esa referencia en su teléfono. La app te devuelve cada sesión — no un score genérico.
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
            Sin tarjeta · español e inglés
          </p>
        </div>

        <div className="relative">
          <div className="relative border border-rule bg-paper-2 aspect-[4/5] overflow-hidden">
            <Image
              src="/images/hero-address-light.png"
              alt="Postura de dirección — vista de perfil, con anotaciones técnicas del instructor"
              fill
              priority
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover block dark:hidden"
            />
            <Image
              src="/images/hero-address-dark.png"
              alt=""
              fill
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover hidden dark:block"
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

          <div className="border-t border-rule mt-12 pt-12">
            <p className="font-display font-semibold text-[28px] md:text-[34px] leading-[1.2] relative pl-9">
              <span aria-hidden className="absolute left-[-2px] top-[-12px] text-[80px] leading-none text-accent font-semibold">“</span>
              No reemplazamos al instructor.<br />Lo extendemos.
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
            Tres momentos:<br />la clase, la práctica, el repaso.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 border-t border-b border-rule">
          <Panel
            numeral="I"
            who="Durante la clase"
            title="El instructor calibra."
            body="Con el iPad en mano, graba 15 segundos del movimiento correcto del alumno. Pausa, dibuja con el dedo sobre el frame clave, habla. Lo guarda. La técnica queda como un manual técnico — exacto, suyo."
            imageBase="como-calibra"
            imageAlt="Instructor con iPad junto a alumno en posición de address"
          />
          <Panel
            numeral="II"
            who="Entre clases"
            title="El alumno practica."
            body="Abre el teléfono en el rango. Ve la referencia de su profesor, la escucha, la entiende. Activa el espejo. La app le dice qué corregir, una cosa a la vez, en lenguaje corporal — sin jerga, sin números."
            imageBase="como-practica"
            imageAlt="Alumno practicando solo en el rango con el teléfono en un trípode mostrando feedback"
            divider
          />
          <Panel
            numeral="III"
            who="El sábado siguiente"
            title="La conversación se reanuda."
            body="El instructor abre el perfil del alumno y ve la semana entera como un yardage book: qué practicó, qué le costó, qué mejoró. La clase del sábado deja de empezar de cero."
            imageBase="como-revisa"
            imageAlt="Dos pares de manos revisando un iPad con el scorecard semanal del alumno"
            divider
          />
        </div>
      </div>
    </section>
  )
}

function Panel({ numeral, who, title, body, imageBase, imageAlt, divider }: { numeral: string; who: string; title: string; body: string; imageBase: string; imageAlt: string; divider?: boolean }) {
  return (
    <div className={`px-7 py-10 ${divider ? 'md:border-l border-rule' : ''}`}>
      <div className="relative aspect-[4/3] bg-paper-2 border border-rule mb-6 overflow-hidden">
        <Image
          src={`/images/${imageBase}-light.png`}
          alt={imageAlt}
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover block dark:hidden"
        />
        <Image
          src={`/images/${imageBase}-dark.png`}
          alt=""
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover hidden dark:block"
        />
      </div>
      <p className="small-caps font-mono text-[10px] text-accent">{numeral} · {who}</p>
      <h3 className="font-display font-semibold text-[22px] leading-[1.2] mt-2">{title}</h3>
      <p className="text-sm leading-[1.6] text-ink-soft mt-3">{body}</p>
    </div>
  )
}

/* ─── Inteligencia artificial ─────────────────────────────────────────── */

function TresPrincipios() {
  return (
    <section id="principios" className="border-b border-rule py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-10 md:gap-16 items-center">
          {/* Image — body schematic with landmarks + callout */}
          <div className="relative border border-rule bg-paper-2 aspect-[4/5] overflow-hidden">
            {/* Light mode: real illustration */}
            <Image
              src="/images/sistema-ia-light.png"
              alt="Esquema editorial — silueta con 33 landmarks cognac y la traducción «inclínate desde la cadera»"
              fill
              sizes="(min-width: 768px) 45vw, 100vw"
              className="object-cover block dark:hidden"
            />
            {/* Dark mode: SVG fallback until sistema-ia-dark.png is generated */}
            <div className="hidden dark:block absolute inset-0">
              <SistemaIA />
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="small-caps font-mono text-[11px] text-accent">
              Inteligencia artificial
            </p>
            <h2 className="font-display font-semibold text-3xl md:text-[44px] leading-[1.05] tracking-[-0.015em] mt-4">
              Tu corrección, en cada ensayo del alumno.
            </h2>
            <p className="text-[17px] md:text-[18px] leading-[1.6] text-ink-soft mt-7 max-w-[520px]">
              Una IA propia compara cada ensayo del alumno contra la calibración que hiciste para él y le devuelve una instrucción a la vez en lenguaje corporal: <em className="not-italic text-ink">"inclínate desde la cadera"</em>, no "−4° spine angle". Mientras él practica, tu mirada está en el rango.
            </p>
            <div className="border-t border-rule mt-10 pt-6">
              <p className="font-display italic text-[22px] md:text-[26px] text-accent leading-[1.35]">
                La IA mide. Tú enseñas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SistemaIA() {
  // Esquema editorial: silueta frontal del alumno + 33 landmarks cognac +
  // pequeño callout cognac con la traducción ("Inclinate desde la cadera.")
  // saliendo del cuerpo. Es "AI como valor" en una sola imagen: el cuerpo
  // medido junto a la frase que el alumno recibe.
  return (
    <svg viewBox="0 0 240 320" className="absolute inset-0 w-full h-full text-ink">
      {/* Marco/label superior — plate de manual */}
      <text x="16" y="22" fontSize="6.5" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)" letterSpacing="1.2">
        ESQUEMA · 33 LANDMARKS
      </text>
      <line x1="16" y1="28" x2="100" y2="28" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />

      {/* Body silhouette — front view */}
      <g stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Cabeza */}
        <circle cx="120" cy="64" r="14" />
        {/* Cuello */}
        <line x1="120" y1="78" x2="120" y2="92" />
        {/* Línea de hombros */}
        <line x1="92" y1="96" x2="148" y2="96" />
        {/* Torso (espina visible suavemente) */}
        <line x1="120" y1="92" x2="120" y2="188" />
        {/* Brazos */}
        <line x1="92" y1="96" x2="84" y2="148" />
        <line x1="84" y1="148" x2="82" y2="202" />
        <line x1="148" y1="96" x2="156" y2="148" />
        <line x1="156" y1="148" x2="158" y2="202" />
        {/* Línea de cadera */}
        <line x1="100" y1="188" x2="140" y2="188" />
        {/* Piernas */}
        <line x1="108" y1="188" x2="106" y2="244" />
        <line x1="106" y1="244" x2="104" y2="296" />
        <line x1="132" y1="188" x2="134" y2="244" />
        <line x1="134" y1="244" x2="136" y2="296" />
        {/* Pies */}
        <line x1="92" y1="296" x2="116" y2="296" strokeWidth="1.5" />
        <line x1="124" y1="296" x2="148" y2="296" strokeWidth="1.5" />
      </g>

      {/* 33 landmarks en cognac */}
      <g style={{ fill: 'var(--color-accent)' }}>
        {/* Cara — nariz, ojos, orejas, comisuras */}
        <circle cx="120" cy="64" r="2" />
        <circle cx="113" cy="58" r="1.2" />
        <circle cx="127" cy="58" r="1.2" />
        <circle cx="109" cy="60" r="1" />
        <circle cx="131" cy="60" r="1" />
        <circle cx="107" cy="66" r="0.9" />
        <circle cx="133" cy="66" r="0.9" />
        <circle cx="115" cy="72" r="1" />
        <circle cx="125" cy="72" r="1" />
        {/* Hombros */}
        <circle cx="92" cy="96" r="2.2" />
        <circle cx="148" cy="96" r="2.2" />
        {/* Codos */}
        <circle cx="84" cy="148" r="2.2" />
        <circle cx="156" cy="148" r="2.2" />
        {/* Muñecas */}
        <circle cx="82" cy="202" r="2.2" />
        <circle cx="158" cy="202" r="2.2" />
        {/* Manos — dedos representativos */}
        <circle cx="78" cy="210" r="1.2" />
        <circle cx="84" cy="212" r="1.2" />
        <circle cx="156" cy="210" r="1.2" />
        <circle cx="162" cy="212" r="1.2" />
        {/* Caderas */}
        <circle cx="108" cy="188" r="2.2" />
        <circle cx="132" cy="188" r="2.2" />
        {/* Rodillas */}
        <circle cx="106" cy="244" r="2.2" />
        <circle cx="134" cy="244" r="2.2" />
        {/* Tobillos */}
        <circle cx="104" cy="296" r="2.2" />
        <circle cx="136" cy="296" r="2.2" />
        {/* Pies — talón + punta por lado */}
        <circle cx="92" cy="296" r="1.6" />
        <circle cx="116" cy="296" r="1.6" />
        <circle cx="124" cy="296" r="1.6" />
        <circle cx="148" cy="296" r="1.6" />
      </g>

      {/* Callout cognac — la traducción saliendo del cuerpo */}
      <g style={{ stroke: 'var(--color-accent)' }} fill="none">
        <line x1="156" y1="148" x2="186" y2="138" strokeWidth="0.6" strokeDasharray="2 2" />
      </g>
      <text x="186" y="130" fontSize="8.5" style={{ fill: 'var(--color-ink)' }} fontFamily="Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif" fontStyle="italic">
        Inclínate
      </text>
      <text x="186" y="142" fontSize="8.5" style={{ fill: 'var(--color-ink)' }} fontFamily="Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif" fontStyle="italic">
        desde la
      </text>
      <text x="186" y="154" fontSize="8.5" style={{ fill: 'var(--color-ink)' }} fontFamily="Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif" fontStyle="italic">
        cadera.
      </text>

      {/* Bottom label */}
      <text x="16" y="312" fontSize="5.5" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.8">
        REF · TU CALIBRACIÓN
      </text>
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
            Empieza según tu rol.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 border-t border-rule">
          <AccessBlock
            numeral="I"
            who="Para instructores"
            title="Empieza con tres alumnos."
            body="Prueba con tus primeros tres alumnos. Si funciona, escalas."
            ctaText="Crear cuenta"
            ctaHref="/instructor/login"
            secondaryText="Ya tengo cuenta"
            secondaryHref="/instructor/login"
            stamp="GRATIS HASTA 3 ALUMNOS"
          />
          <AccessBlock
            numeral="II"
            who="Para alumnos"
            title="Entra con tu código."
            body="Tu instructor te dio un código de 6 caracteres. Es todo lo que necesitas."
            ctaText="Entrar con código"
            ctaHref="/student/login"
            secondaryText="¿No tienes código?"
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

/* ─── Cierre aspiracional ──────────────────────────────────────────────── */

function Cierre() {
  return (
    <section className="border-b border-rule py-16 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 text-center">
        <p className="font-display italic font-medium text-[28px] md:text-[40px] leading-[1.2] text-ink max-w-[760px] mx-auto">
          Tu método sigue vivo cuando no estás.
        </p>
      </div>
    </section>
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
        <span className="small-caps font-mono text-[10px] text-ink-mute inline-flex items-center gap-2">
          <span>Hecho con tempo</span>
          <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden className="shrink-0">
            <line x1="1.5" y1="11" x2="1.5" y2="1" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
            <polygon points="1.5,1 7.5,2.5 1.5,4.5" style={{ fill: 'var(--color-accent)' }} />
          </svg>
          <span>Barcelona</span>
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
