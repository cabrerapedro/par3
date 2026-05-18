'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
          {/* TODO: cuando esté hero-address.png, reemplazar el SVG por <img> */}
          <div className="relative border border-rule bg-paper-2 aspect-[4/5] p-6">
            <HoganLarge />
            <div className="absolute top-6 right-6">
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

function HoganLarge() {
  return (
    <svg viewBox="0 0 240 320" className="w-full h-full block text-ink">
      <line x1="120" y1="100" x2="120" y2="190" style={{ stroke: 'var(--color-accent)' }} strokeWidth="0.7" strokeDasharray="2 2.5" opacity="0.5" />
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="118" cy="76" r="10" />
        <line x1="118" y1="86" x2="118" y2="100" />
        <line x1="118" y1="100" x2="134" y2="186" />
        <line x1="110" y1="106" x2="128" y2="106" />
        <line x1="120" y1="108" x2="154" y2="190" />
        <line x1="122" y1="108" x2="158" y2="190" />
        <circle cx="156" cy="191" r="2.6" fill="currentColor" />
        <line x1="130" y1="184" x2="142" y2="188" />
        <line x1="134" y1="188" x2="126" y2="240" />
        <line x1="126" y1="240" x2="120" y2="284" />
        <line x1="140" y1="188" x2="146" y2="240" />
        <line x1="146" y1="240" x2="150" y2="284" />
        <line x1="112" y1="284" x2="128" y2="284" strokeWidth="1.8" />
        <line x1="142" y1="284" x2="160" y2="284" strokeWidth="1.8" />
      </g>
      <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
        <line x1="156" y1="191" x2="202" y2="280" />
        <line x1="198" y1="280" x2="210" y2="283" strokeWidth="3.6" />
      </g>
      <circle cx="188" cy="282" r="3" fill="currentColor" />
      <line x1="28" y1="286" x2="216" y2="286" stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
      <g style={{ color: 'var(--color-accent)' }}>
        <path d="M 118,128 A 24 24 0 0 1 126,124" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="128" y="130" fontSize="9" fill="currentColor" fontFamily="var(--font-jb-mono)" fontWeight="500">32°</text>
        <line x1="60" y1="148" x2="118" y2="134" stroke="currentColor" strokeWidth="0.7" />
        <text x="18" y="146" fontSize="8" fill="currentColor" fontFamily="var(--font-jb-mono)" letterSpacing="1">columna</text>
        <text x="18" y="158" fontSize="6.5" fill="var(--color-ink-mute)" fontFamily="var(--font-jb-mono)" letterSpacing="0.5">ref 28–34°</text>
        <line x1="180" y1="232" x2="148" y2="240" stroke="currentColor" strokeWidth="0.7" />
        <text x="184" y="234" fontSize="8" fill="currentColor" fontFamily="var(--font-jb-mono)" letterSpacing="1">rodillas</text>
        <text x="184" y="246" fontSize="6.5" fill="var(--color-ink-mute)" fontFamily="var(--font-jb-mono)" letterSpacing="0.5">flex 22°</text>
        <line x1="188" y1="278" x2="188" y2="262" stroke="currentColor" strokeWidth="0.7" strokeDasharray="2 2" />
        <text x="180" y="258" fontSize="7" fill="currentColor" fontFamily="var(--font-jb-mono)" letterSpacing="1">bola</text>
      </g>
      <g style={{ color: 'var(--color-ink-mute)' }}>
        <line x1="112" y1="296" x2="160" y2="296" stroke="currentColor" strokeWidth="0.5" />
        <line x1="112" y1="293" x2="112" y2="299" stroke="currentColor" strokeWidth="0.5" />
        <line x1="160" y1="293" x2="160" y2="299" stroke="currentColor" strokeWidth="0.5" />
        <text x="124" y="306" fontSize="6.5" fill="currentColor" fontFamily="var(--font-jb-mono)" letterSpacing="0.5">stance 48cm</text>
      </g>
    </svg>
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
            visual={<MiniHogan />}
          />
          <Panel
            numeral="II"
            who="Entre clases"
            title="El alumno practica."
            body="Abre el teléfono en el rango. Ve la referencia de su profesor, la escucha, la entiende. Activa el espejo. La app le dice qué corregir, una cosa a la vez, en lenguaje corporal — sin jerga, sin números."
            visual={<MiniMirror />}
            divider
          />
          <Panel
            numeral="III"
            who="El sábado siguiente"
            title="La conversación se reanuda."
            body="El instructor abre el perfil del alumno y ve la semana entera como un yardage book: qué practicó, qué le costó, qué mejoró. La clase del sábado deja de empezar de cero."
            visual={<MiniScorecard />}
            divider
          />
        </div>
      </div>
    </section>
  )
}

function Panel({ numeral, who, title, body, visual, divider }: { numeral: string; who: string; title: string; body: string; visual: React.ReactNode; divider?: boolean }) {
  return (
    <div className={`px-7 py-10 ${divider ? 'md:border-l border-rule' : ''}`}>
      {/* TODO: reemplazar visual SVG por <img src="/images/como-*.png" /> cuando estén las láminas */}
      <div className="aspect-[4/3] bg-paper-2 border border-rule mb-6 flex items-center justify-center">
        {visual}
      </div>
      <p className="small-caps font-mono text-[10px] text-accent">{numeral} · {who}</p>
      <h3 className="font-display font-semibold text-[22px] leading-[1.2] mt-2">{title}</h3>
      <p className="text-sm leading-[1.6] text-ink-soft mt-3">{body}</p>
    </div>
  )
}

function MiniHogan() {
  return (
    <svg viewBox="0 0 120 100" className="w-[80%] h-[80%] text-ink">
      <g stroke="currentColor" strokeWidth="0.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="58" cy="22" r="4" />
        <line x1="58" y1="26" x2="58" y2="34" />
        <line x1="58" y1="34" x2="66" y2="62" />
        <line x1="60" y1="38" x2="74" y2="62" />
        <line x1="61" y1="38" x2="76" y2="62" />
        <circle cx="75" cy="63" r="1.4" fill="currentColor" />
        <line x1="65" y1="62" x2="62" y2="82" />
        <line x1="62" y1="82" x2="58" y2="94" />
        <line x1="68" y1="62" x2="70" y2="82" />
        <line x1="70" y1="82" x2="72" y2="94" />
        <line x1="54" y1="94" x2="62" y2="94" strokeWidth="1.1" />
        <line x1="68" y1="94" x2="76" y2="94" strokeWidth="1.1" />
      </g>
      <line x1="75" y1="63" x2="96" y2="93" stroke="currentColor" strokeWidth="0.7" />
      <line x1="94" y1="93" x2="100" y2="94.6" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="89" cy="94" r="1.6" fill="currentColor" />
      <line x1="18" y1="96" x2="106" y2="96" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      <path d="M 58,42 A 12 12 0 0 1 62,40" style={{ stroke: 'var(--color-accent)' }} strokeWidth="0.7" fill="none" />
      <text x="63" y="44" fontSize="4" style={{ fill: 'var(--color-accent)' }} fontFamily="var(--font-jb-mono)">32°</text>
    </svg>
  )
}

function MiniMirror() {
  return (
    <div className="w-[120px] h-[168px] border border-rule bg-paper p-3.5 flex flex-col justify-between">
      <div>
        <p className="small-caps font-mono text-[7px] text-ink-mute">En espejo</p>
        <p className="text-[9px] text-ink leading-tight mt-1">Inclinate desde la cadera hasta sentir peso en el pie.</p>
      </div>
      <div className="text-center border-y border-rule py-2.5">
        <p className="font-display font-semibold text-3xl tabular-nums text-warn leading-none">+1</p>
        <p className="small-caps font-mono text-[7px] text-ink-mute mt-1">Columna</p>
      </div>
      <div className="flex justify-between text-[7px]">
        <span className="text-ok">● hombros</span>
        <span className="text-bad">● peso</span>
      </div>
    </div>
  )
}

function MiniScorecard() {
  const cells: string[][] = [
    ['Postura', 'E', '+1', 'E', '—', 'E'],
    ['Hombros', '+1', 'E', '+1', 'E', 'E'],
    ['Peso', '+3', '+2', '+1', '+1', '+1'],
  ]
  const colorFor = (s: string) => s === 'E' ? 'var(--color-ok)' : s === '+1' ? 'var(--color-warn)' : s === '—' ? 'var(--color-ink-mute)' : 'var(--color-bad)'
  return (
    <div className="w-[85%] border border-rule bg-paper">
      <div className="grid grid-cols-[1.4fr_repeat(5,1fr)] border-b border-rule bg-paper-2">
        <div className="p-1.5"><span className="small-caps font-mono text-[7px] text-ink-mute">Ej.</span></div>
        {['L', 'M', 'M', 'J', 'V'].map((d, i) => (
          <div key={i} className="p-1.5 text-center border-l border-rule">
            <span className="small-caps font-mono text-[7px] text-ink-mute">{d}</span>
          </div>
        ))}
      </div>
      {cells.map((row, ri) => (
        <div key={ri} className={`grid grid-cols-[1.4fr_repeat(5,1fr)] ${ri < cells.length - 1 ? 'border-b border-rule' : ''}`}>
          <div className="p-1.5"><span className="text-[8px] text-ink">{row[0]}</span></div>
          {row.slice(1).map((s, i) => (
            <div key={i} className="p-1.5 text-center border-l border-rule">
              <span className="font-mono tabular-nums text-[9px] font-medium" style={{ color: colorFor(s) }}>{s}</span>
            </div>
          ))}
        </div>
      ))}
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
