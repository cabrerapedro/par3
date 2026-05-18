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

/* ─── Tres principios (Inteligencia artificial) ──────────────────────────── */

function TresPrincipios() {
  return (
    <section id="principios" className="border-b border-rule py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="grid md:grid-cols-[180px_1fr] gap-12 md:gap-16 items-baseline mb-12 md:mb-14">
          <p className="small-caps font-mono text-[11px] text-accent">Inteligencia artificial</p>
          <div className="max-w-[680px]">
            <h2 className="font-display font-semibold text-3xl md:text-[40px] leading-[1.1]">
              Tres principios.
            </h2>
            <p className="text-base md:text-[17px] leading-[1.6] text-ink-soft mt-5">
              La IA que mide, compara y traduce — sin reemplazar tu criterio.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 border-t border-b border-rule">
          <Principio
            numeral="I"
            kicker="Observación"
            title="La IA lee 33 puntos del cuerpo, en el dispositivo."
            body="El esqueleto del alumno se dibuja en tiempo real desde su teléfono — cabeza, hombros, codos, muñecas, cadera, rodillas, tobillos. El análisis de pose ocurre on-device, no en un servidor de IA externo. El video se guarda en tu cuenta privada solo para tu revisión."
            diagram={<DiagramObservacion />}
          />
          <Principio
            numeral="II"
            kicker="Comparación"
            title="Tu calibración es el patrón. La IA mide cada ensayo."
            body="Un modelo propio compara cada práctica del alumno contra la referencia exacta que vos calibraste para él. No hay un “estándar de golf” — hay tu estándar para él. Cada frame se mide; cada ensayo recibe un score."
            diagram={<DiagramComparacion />}
            divider
          />
          <Principio
            numeral="III"
            kicker="Traducción"
            title="La IA traduce ángulos a lenguaje corporal."
            body="Los grados y centímetros no le sirven al alumno. La IA convierte la medición técnica en una sola instrucción que entiende: “inclinate desde la cadera”, no “−4° spine angle”. La técnica viaja; los grados no."
            diagram={<DiagramTraduccion />}
            divider
          />
        </div>

        <p
          className="font-display italic text-[17px] md:text-[19px] text-accent leading-[1.5] mt-10 md:mt-12 max-w-[640px]"
        >
          Pero ninguna decisión es de la IA. El criterio es siempre del instructor — la tecnología solo mide y traduce.
        </p>
      </div>
    </section>
  )
}

function Principio({ numeral, kicker, title, body, diagram, divider }: { numeral: string; kicker: string; title: string; body: string; diagram: React.ReactNode; divider?: boolean }) {
  return (
    <div className={`px-7 py-10 ${divider ? 'md:border-l border-rule' : ''}`}>
      <div className="aspect-[4/3] bg-paper-2 border border-rule mb-6 flex items-center justify-center">
        {diagram}
      </div>
      <p className="small-caps font-mono text-[10px] text-accent">{numeral} · {kicker}</p>
      <h3 className="font-display font-semibold text-[20px] md:text-[22px] leading-[1.2] mt-2">{title}</h3>
      <p className="text-sm leading-[1.6] text-ink-soft mt-3">{body}</p>
    </div>
  )
}

/* ─── Diagramas para los tres principios (estilo Hogan, sin imágenes) ─── */

function DiagramObservacion() {
  // Silueta frontal con landmarks cognac. Suficientes para sugerir los 33 puntos
  // sin volverse decorativo. Ink = cuerpo; cognac = landmarks; mono = label.
  return (
    <svg viewBox="0 0 120 90" className="w-[80%] h-[85%] text-ink">
      <g stroke="currentColor" strokeWidth="0.7" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Cabeza */}
        <circle cx="60" cy="14" r="6" />
        {/* Cuello + torso */}
        <line x1="60" y1="20" x2="60" y2="28" />
        <line x1="60" y1="28" x2="60" y2="54" />
        {/* Hombros */}
        <line x1="42" y1="30" x2="78" y2="30" />
        {/* Brazos */}
        <line x1="42" y1="30" x2="36" y2="50" />
        <line x1="36" y1="50" x2="34" y2="68" />
        <line x1="78" y1="30" x2="84" y2="50" />
        <line x1="84" y1="50" x2="86" y2="68" />
        {/* Caderas */}
        <line x1="46" y1="54" x2="74" y2="54" />
        {/* Piernas */}
        <line x1="50" y1="54" x2="48" y2="72" />
        <line x1="48" y1="72" x2="46" y2="86" />
        <line x1="70" y1="54" x2="72" y2="72" />
        <line x1="72" y1="72" x2="74" y2="86" />
      </g>
      {/* Landmarks en cognac — selección visible para representar los 33 puntos */}
      <g style={{ fill: 'var(--color-accent)' }}>
        <circle cx="60" cy="14" r="1.6" />
        <circle cx="57" cy="13" r="0.8" />
        <circle cx="63" cy="13" r="0.8" />
        <circle cx="55" cy="15" r="0.6" />
        <circle cx="65" cy="15" r="0.6" />
        <circle cx="42" cy="30" r="1.6" />
        <circle cx="78" cy="30" r="1.6" />
        <circle cx="36" cy="50" r="1.6" />
        <circle cx="84" cy="50" r="1.6" />
        <circle cx="34" cy="68" r="1.6" />
        <circle cx="86" cy="68" r="1.6" />
        <circle cx="46" cy="54" r="1.6" />
        <circle cx="74" cy="54" r="1.6" />
        <circle cx="48" cy="72" r="1.6" />
        <circle cx="72" cy="72" r="1.6" />
        <circle cx="46" cy="86" r="1.6" />
        <circle cx="74" cy="86" r="1.6" />
      </g>
      {/* Anotación cognac */}
      <g style={{ stroke: 'var(--color-accent)' }}>
        <line x1="78" y1="30" x2="100" y2="22" strokeWidth="0.4" />
      </g>
      <text x="100" y="20" fontSize="4.5" style={{ fill: 'var(--color-accent)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.4">33 pts</text>
    </svg>
  )
}

function DiagramComparacion() {
  // Dos siluetas — referencia (instructor calibró) y ensayo (alumno).
  // Línea cognac marca la diferencia.
  return (
    <svg viewBox="0 0 120 90" className="w-[80%] h-[85%] text-ink">
      {/* Silueta izquierda — REF */}
      <g stroke="currentColor" strokeWidth="0.7" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="30" cy="16" r="4" />
        <line x1="30" y1="20" x2="34" y2="46" />
        <line x1="34" y1="46" x2="42" y2="62" />
        <line x1="42" y1="62" x2="48" y2="76" />
        <line x1="30" y1="24" x2="44" y2="58" />
        <line x1="44" y1="58" x2="52" y2="68" />
        <line x1="34" y1="46" x2="28" y2="62" />
        <line x1="28" y1="62" x2="28" y2="78" />
      </g>
      <text x="22" y="86" fontSize="4" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.4">REF</text>

      {/* Silueta derecha — ENSAYO (postura ligeramente distinta) */}
      <g stroke="currentColor" strokeWidth="0.7" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="80" cy="18" r="4" />
        <line x1="80" y1="22" x2="86" y2="48" />
        <line x1="86" y1="48" x2="92" y2="64" />
        <line x1="92" y1="64" x2="96" y2="76" />
        <line x1="80" y1="26" x2="92" y2="58" />
        <line x1="92" y1="58" x2="100" y2="66" />
        <line x1="86" y1="48" x2="80" y2="62" />
        <line x1="80" y1="62" x2="80" y2="78" />
      </g>
      <text x="70" y="86" fontSize="4" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.4">ENSAYO</text>

      {/* Línea de comparación cognac */}
      <g style={{ stroke: 'var(--color-accent)' }}>
        <line x1="34" y1="30" x2="86" y2="32" strokeWidth="0.5" strokeDasharray="2 1.5" />
        <line x1="34" y1="46" x2="86" y2="48" strokeWidth="0.5" strokeDasharray="2 1.5" />
      </g>
      <text x="56" y="36" fontSize="4.5" style={{ fill: 'var(--color-accent)' }} fontFamily="var(--font-jb-mono)" fontWeight="500">+1</text>
    </svg>
  )
}

function DiagramTraduccion() {
  // Ángulo numérico (32°) → flecha cognac → instrucción corporal (handwritten-feel).
  return (
    <svg viewBox="0 0 120 90" className="w-[85%] h-[85%]">
      {/* Lado izquierdo: ángulo técnico */}
      <g style={{ stroke: 'var(--color-ink)' }} fill="none" strokeLinecap="round">
        <line x1="14" y1="60" x2="44" y2="60" strokeWidth="0.7" />
        <line x1="14" y1="60" x2="40" y2="38" strokeWidth="0.7" />
        <path d="M 24 60 A 10 10 0 0 0 30 53" strokeWidth="0.5" />
      </g>
      <text x="30" y="56" fontSize="5.5" style={{ fill: 'var(--color-ink)' }} fontFamily="var(--font-jb-mono)" fontWeight="500">32°</text>
      <text x="12" y="72" fontSize="3.8" style={{ fill: 'var(--color-ink-mute)' }} fontFamily="var(--font-jb-mono)" letterSpacing="0.4">SPINE ANGLE</text>

      {/* Flecha cognac al centro */}
      <g style={{ stroke: 'var(--color-accent)' }} fill="none" strokeLinecap="round">
        <line x1="52" y1="50" x2="68" y2="50" strokeWidth="0.7" />
        <polyline points="65,47 68,50 65,53" strokeWidth="0.7" />
      </g>

      {/* Lado derecho: instrucción corporal — italic Bricolage */}
      <text
        x="72"
        y="44"
        fontSize="6.5"
        style={{ fill: 'var(--color-ink)' }}
        fontFamily="Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
        fontStyle="italic"
      >Inclinate</text>
      <text
        x="72"
        y="52"
        fontSize="6.5"
        style={{ fill: 'var(--color-ink)' }}
        fontFamily="Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
        fontStyle="italic"
      >desde la</text>
      <text
        x="72"
        y="60"
        fontSize="6.5"
        style={{ fill: 'var(--color-ink)' }}
        fontFamily="Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
        fontStyle="italic"
      >cadera.</text>
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
