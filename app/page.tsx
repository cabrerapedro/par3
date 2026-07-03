'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/lib/auth'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Wordmark } from '@/components/Wordmark'
import { Stamp } from '@/components/Stamp'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

export default function Home() {
  const { instructor, student, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (instructor) router.replace('/instructor/dashboard')
    else if (student) router.replace('/student/journey')
  }, [instructor, student, loading, router])

  // Render the landing immediately (server-side) so crawlers and AI bots see the
  // full marketing content + FAQ, not a spinner. Logged-in users are redirected
  // by the effect above once auth resolves.
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Header />
      <main>
        <Hero />
        <Manifesto />
        <ComoFunciona />
        <TresPrincipios />
        <Faq />
        <Testimonial />
        <Acceso />
        <Cierre />
      </main>
      <Footer />
    </div>
  )
}

/* ─── Preguntas frecuentes (FAQ) ────────────────────────────────────────── */

// Answers may contain <strong> for emphasis — rendered with dangerouslySetInnerHTML
// since these are static strings we control. The FAQPage JSON-LD strips the tags.
const FAQS: { q: string; a: string }[] = [
  {
    q: '¿Qué es forat.golf?',
    a: '<strong>forat.golf</strong> es una app de entrenamiento de golf para instructores profesionales y sus alumnos. El instructor graba y anota la técnica correcta del alumno durante la clase. El alumno practica solo en el campo entre clases con esa referencia en su dispositivo y recibe feedback en tiempo real mediante análisis de postura con inteligencia artificial.',
  },
  {
    q: '¿Qué problema resuelve?',
    a: 'Los alumnos de golf olvidan lo que el instructor enseñó. Practican sin guía entre clases y refuerzan malos hábitos sin saberlo. El instructor repite las mismas correcciones semana tras semana sin poder saber qué practicó el alumno ni cómo. forat.golf cierra ese ciclo: el sábado el instructor y el alumno hablan sobre <strong>una semana real de práctica</strong>, no empiezan desde cero.',
  },
  {
    q: '¿Para quién es forat.golf?',
    a: '<strong>Para instructores profesionales de golf</strong> que enseñan en academias o clubs y quieren que su método tenga continuidad entre clases. El instructor es quien paga y quien decide usarlo. <strong>Para sus alumnos</strong> — principiantes e intermedios — que practican en el campo y quieren saber exactamente qué trabajar y si lo están haciendo bien. El alumno accede gratis.',
  },
  {
    q: '¿Forat reemplaza al instructor?',
    a: 'No. El instructor es siempre la autoridad. forat.golf guarda su calibración, sus dibujos y su voz, y guía al alumno con esa referencia personalizada. La app <strong>extiende el impacto del instructor entre clases</strong>; no lo reemplaza ni contradice su criterio.',
  },
  {
    q: '¿Cómo graba y anota el instructor?',
    a: 'Durante la clase, el instructor graba clips cortos (15–30 segundos) del movimiento correcto del alumno. Pausa en el fotograma clave, dibuja con el dedo —flechas, líneas, círculos— y habla explicando lo que marca. El audio y el dibujo se graban a la vez. Sin formularios, sin pasos extra.',
  },
  {
    q: '¿Cómo practica el alumno entre clases?',
    a: 'El alumno abre la app en su dispositivo, ve el clip que grabó su instructor con los dibujos superpuestos y escucha la explicación. Luego practica con la cámara en modo espejo: la app compara su postura en tiempo real contra la referencia del instructor y le indica <strong>una sola corrección a la vez</strong>, en lenguaje simple y sin jerga técnica.',
  },
  {
    q: '¿Necesita sensores o equipo especial?',
    a: 'No. Solo un dispositivo con cámara. El análisis de postura corre directamente en el dispositivo con la cámara, usando inteligencia artificial. No hace falta ningún sensor ni equipo adicional.',
  },
  {
    q: '¿El alumno paga?',
    a: 'No. El alumno accede gratis con un código que le da su instructor. El instructor tiene una suscripción mensual que varía según el número de alumnos activos.',
  },
  {
    q: '¿Qué pasa con mis videos?',
    a: 'El análisis de postura se ejecuta en tu dispositivo: el video <strong>no sale del dispositivo</strong> durante el análisis. Los clips y las prácticas se guardan de forma privada en tu cuenta para que puedas repasarlos con tu instructor.',
  },
  {
    q: '¿En qué dispositivos funciona?',
    a: 'En cualquier dispositivo moderno con cámara y navegador — móvil, tablet, u ordenador. El instructor suele usar una tablet durante la clase; el alumno, su teléfono en el campo. forat.golf está disponible en español e inglés.',
  },
]

function Faq() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      // Plain text for the schema — strip the inline <strong> we use for display.
      acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') },
    })),
  }
  return (
    <section id="faq" className="border-b border-rule py-14 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 grid md:grid-cols-[180px_1fr] gap-12 md:gap-16">
        <p className="small-caps font-mono text-[11px] text-accent">Preguntas frecuentes</p>
        <Accordion type="single" collapsible className="w-full max-w-[720px] border-t border-rule">
          {FAQS.map((f) => (
            <AccordionItem
              key={f.q}
              value={f.q}
              className="border-b border-rule"
            >
              <AccordionTrigger className="gap-6 py-5 font-display text-lg font-semibold text-ink transition-colors hover:text-accent hover:no-underline data-[state=open]:text-accent md:text-xl">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-6 pr-8 pt-0">
                <p
                  className="text-base md:text-[17px] leading-[1.65] text-ink-soft [&_strong]:font-medium [&_strong]:text-ink"
                  dangerouslySetInnerHTML={{ __html: f.a }}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  )
}

/* ─── Header ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 py-4 flex items-center justify-between">
        <Link
          href="/"
          aria-label="Forat, inicio"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <Wordmark size="md" />
        </Link>
        <nav className="flex items-center gap-6 md:gap-8">
          <a href="#metodo" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">El método</a>
          <a href="#como-funciona" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">Cómo funciona</a>
          <a href="#principios" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">Tecnología</a>
          <a href="#faq" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">Preguntas</a>
          <a href="#acceso" className="hidden md:inline text-sm text-ink-soft hover:text-ink transition-colors">Ingresar</a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

/* ─── Hero AI pose overlay ──────────────────────────────────────────────── */

// Coordinates are in the source image space (1024×1536); the SVG shares that
// viewBox so the skeleton lands on the figure regardless of render size.
// Real MediaPipe Pose landmarks detected on the hero image (1024×1536 space),
// so the skeleton is the genuine model output, not a hand-drawn guess. The club
// (which MediaPipe can't see) is the one manual segment, from the grip up.
const POSE_BONES: [number, number][][] = [
  [[329, 361], [505, 95]],                 // club shaft (grip → head)
  [[498, 434], [355, 501], [318, 360]],    // right arm
  [[641, 530], [466, 502], [340, 362]],    // left arm
  [[641, 530], [498, 434]],                // shoulders
  [[570, 482], [679, 466]],                // neck → nose
  [[632, 413], [679, 466], [655, 424]],    // head (ear–nose–ear)
  [[498, 434], [400, 773]],                // torso, right
  [[641, 530], [522, 797]],                // torso, left
  [[522, 797], [400, 773]],                // hips
  [[400, 773], [388, 1029], [353, 1319]],  // right leg
  [[522, 797], [614, 1048], [604, 1304]],  // left leg
  [[353, 1319], [361, 1395]],              // right foot
  [[604, 1304], [682, 1375]],              // left foot
]

const POSE_JOINTS: [number, number][] = [
  [505, 95], [318, 360], [340, 362], [355, 501], [466, 502], [498, 434],
  [641, 530], [679, 466], [655, 424], [632, 413], [400, 773], [522, 797],
  [388, 1029], [614, 1048], [353, 1319], [604, 1304], [361, 1395], [682, 1375],
]

// Measured angles (counted up from 0 in live teal). leader → joint on the body.
const POSE_LABELS: { x: number; y: number; deg: number; lx: number; ly: number }[] = [
  { x: 715, y: 440, deg: 101, lx: 641, ly: 515 }, // shoulder turn
  { x: 140, y: 505, deg: 124, lx: 355, ly: 501 }, // arm bend
  { x: 662, y: 645, deg: 38, lx: 515, ly: 635 },  // spine tilt
  { x: 686, y: 1045, deg: 22, lx: 614, ly: 1048 },// knee flex
]

function AiPoseOverlay() {
  const ref = useRef<HTMLDivElement>(null)
  // `cycle` re-keys the animated group so the whole analysis replays on re-view.
  const [cycle, setCycle] = useState(1)
  const [scan, setScan] = useState(-1) // sweep progress 0→1 (−1 = idle/cleared)
  const [nums, setNums] = useState<number[]>(POSE_LABELS.map((l) => l.deg))

  // Loop the whole analysis on a timer while the hero is on screen; pause it
  // when scrolled away so it isn't burning frames off-screen.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setInterval> | undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!timer) timer = setInterval(() => setCycle((c) => c + 1), 4200)
        } else if (timer) {
          clearInterval(timer)
          timer = undefined
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => { if (timer) clearInterval(timer); io.disconnect() }
  }, [])

  // Drive the scan sweep + the angle count-up from one rAF loop, each cycle, so
  // the reveal front and the scan line share a single progress value (in sync).
  useEffect(() => {
    const targets = POSE_LABELS.map((l) => l.deg)
    // Reduced motion: leave state at its initial rest (final numbers, no sweep).
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // First rAF tick (e≈0) resets nums→0 and scan→0, so no synchronous setState here.
    let raf = 0
    const t0 = performance.now()
    const scanDur = 2400, numBegin = 1250, numDur = 850
    const tick = (t: number) => {
      const e = t - t0
      setScan(Math.min(1, e / scanDur))
      const np = Math.min(1, Math.max(0, (e - numBegin) / numDur))
      const ease = 1 - Math.pow(1 - np, 3)
      setNums(targets.map((v) => Math.round(v * ease)))
      if (e < scanDur) raf = requestAnimationFrame(tick)
      else { setScan(-1); setNums(targets) }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cycle])

  // Sweep geometry, all derived from the single `scan` progress value.
  const easeIO = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
  const sweeping = scan >= 0
  const scanPos = sweeping ? -40 + easeIO(scan) * 1600 : 2000
  const scanOp = sweeping ? Math.sin(scan * Math.PI) : 0
  const revealH = sweeping ? Math.max(0, scanPos) : 1536 // skeleton shown above the scan

  return (
    <div ref={ref} className="absolute inset-0">
      <svg aria-hidden viewBox="0 0 1024 1536" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <clipPath id="poseReveal">
            <rect x={-100} y={-100} width={1224} height={revealH + 100} />
          </clipPath>
        </defs>
        {/* skeleton (real MediaPipe landmarks) — revealed top→bottom by the scan */}
        <g clipPath="url(#poseReveal)">
          {POSE_BONES.map((pts, i) => (
            <polyline
              key={`b${i}`}
              points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="var(--color-pose)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {POSE_JOINTS.map(([x, y], i) => (
            <circle key={`j${i}`} cx={x} cy={y} r={5.5} fill="var(--color-pose)" />
          ))}
        </g>
        {/* angle read-outs — pop in as the scan passes each joint */}
        {POSE_LABELS.map((l, i) => {
          const x1 = l.lx < l.x ? l.x - 6 : l.x + 72
          const shown = !sweeping || scanPos >= l.ly
          return (
            <g key={`l${i}`} style={{ opacity: shown ? 1 : 0, transition: 'opacity 0.25s ease-out' }}>
              <line x1={x1} y1={l.y - 11} x2={l.lx} y2={l.ly} stroke="var(--color-live)" strokeWidth={1.5} strokeDasharray="3 5" />
              <circle cx={l.lx} cy={l.ly} r={4} fill="var(--color-live)" />
              <text x={l.x} y={l.y} fill="var(--color-live)" style={{ fontFamily: 'var(--font-jb-mono), monospace', fontSize: 34, fontWeight: 500, letterSpacing: 1 }}>{nums[i]}°</text>
            </g>
          )
        })}
        {/* scan line + glow band — JS-positioned so it rides the reveal edge */}
        {sweeping && (
          <g style={{ transform: `translateY(${scanPos}px)` }} opacity={scanOp}>
            <line x1={30} y1={0} x2={994} y2={0} stroke="var(--color-live)" strokeWidth={46} opacity={0.12} />
            <line x1={30} y1={0} x2={994} y2={0} stroke="var(--color-live)" strokeWidth={4} />
          </g>
        )}
      </svg>
    </div>
  )
}

/* ─── Viewfinder marks ──────────────────────────────────────────────────── */

// Camera-through-a-lens corner crop marks. Drop inside a `relative` framed box.
function ViewfinderMarks() {
  return (
    <>
      {[
        'left-2 top-2 border-l-[1.5px] border-t-[1.5px]',
        'right-2 top-2 border-r-[1.5px] border-t-[1.5px]',
        'left-2 bottom-2 border-l-[1.5px] border-b-[1.5px]',
        'right-2 bottom-2 border-r-[1.5px] border-b-[1.5px]',
      ].map((c, i) => (
        <span key={i} aria-hidden className={`pointer-events-none absolute z-10 size-3.5 border-pose/70 ${c}`} />
      ))}
    </>
  )
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 pt-6 md:pt-12 pb-12 md:pb-24 grid md:grid-cols-[1.4fr_1fr] gap-12 md:gap-16 items-center">
        <div>
          <p className="small-caps font-mono text-[11px] text-accent">
            Una app para instructores de golf
          </p>
          <h1 className="font-display font-semibold text-[34px] sm:text-[40px] md:text-[60px] leading-[1.05] tracking-[-0.025em] mt-6">
            Tu alumno practica con tu referencia exacta,<br className="hidden md:inline" /> no con un estándar genérico.
          </h1>
          <p className="text-lg md:text-[19px] text-ink-soft leading-[1.55] mt-7 max-w-[560px]">
            Calibras la técnica de tu alumno una vez. Él la practica toda la semana con esa referencia en su teléfono. La app te devuelve cada sesión real, no un score genérico.
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

        </div>

        <div className="relative">
          <div className="relative border border-rule bg-paper-2 aspect-[2/3] overflow-hidden">
            <Image
              src="/images/sistema-ia-photo-light-wo-grades.png"
              alt="Golfista en pleno swing con líneas de análisis de IA superpuestas midiendo sus ángulos"
              fill
              priority
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover block dark:hidden"
            />
            <Image
              src="/images/sistema-ia-photo-dark-wo-grades.png"
              alt=""
              fill
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover hidden dark:block"
            />
            <AiPoseOverlay />
            <ViewfinderMarks />
          </div>
          <div className="flex justify-between mt-3">
            <span className="small-caps font-mono text-[11px] text-live inline-flex items-center gap-1.5">
              <span aria-hidden className="pulse-live inline-block size-1.5 rounded-full bg-live" />
              Análisis on-device
            </span>
            <span className="small-caps font-mono text-[11px] text-ink-mute">Face-on · 33 puntos</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Manifesto ─────────────────────────────────────────────────────────── */

function Manifesto() {
  return (
    <section id="metodo" className="border-b border-rule py-14 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 grid md:grid-cols-[180px_1fr] gap-12 md:gap-16">
        <p className="small-caps font-mono text-[11px] text-accent">El método</p>

        <div className="max-w-[720px]">
          <p className="font-display font-medium text-2xl md:text-[30px] leading-[1.28]">
            El instructor enseña una hora a la semana. El alumno practica seis. Entre la clase y la práctica suele caer la mitad de lo aprendido, y no por falta de esfuerzo: la memoria es frágil y el cuerpo se acomoda a sus viejos hábitos en cuanto cierra la puerta de la academia.
          </p>

          <div className="border-t border-rule mt-12 pt-12">
            <p className="font-display font-semibold text-[28px] md:text-[34px] leading-[1.2]">
              <span className="text-accent">“</span>No reemplazamos al instructor.<br />Lo extendemos.<span className="text-accent">”</span>
            </p>
            <p className="small-caps font-mono text-[11px] text-ink-mute mt-4">
              Principio irrenunciable
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Testimonio ────────────────────────────────────────────────────────── */

function Testimonial() {
  return (
    <section className="border-b border-rule py-14 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 grid md:grid-cols-[180px_1fr] gap-12 md:gap-16">
        <p className="small-caps font-mono text-[11px] text-accent">En sus palabras</p>

        <figure className="max-w-[760px]">
          <blockquote className="border-l-2 border-accent pl-6 md:pl-8 font-display font-medium text-2xl md:text-[32px] leading-[1.3] tracking-[-0.01em] text-ink">
            Lo que me convenció es que la app aprende mi forma de enseñar, no al revés. Mis alumnos entrenan solos entre clases, pero siguiendo <span className="text-accent">mis</span> indicaciones. Como si yo estuviera ahí.
          </blockquote>

          <figcaption className="flex items-center gap-4 mt-9 pt-6 border-t border-rule">
            {/* Avatar — reemplazar por foto real de Steve cuando esté disponible */}
            <span
              aria-hidden
              className="grid place-items-center size-12 shrink-0 rounded-full bg-paper-2 border border-rule font-display font-semibold text-lg text-ink-soft"
            >
              S
            </span>
            <span className="leading-tight">
              <span className="block font-display font-semibold text-ink">Steve</span>
              <span className="small-caps font-mono text-[11px] text-ink-mute">PGA Professional · La Roca Golf, Barcelona</span>
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

/* ─── Cómo funciona ─────────────────────────────────────────────────────── */

function ComoFunciona() {
  return (
    <section id="como-funciona" className="border-b border-rule py-14 md:py-28">
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
            title="Grabas la técnica correcta."
            body="Con el iPad, grabas 15 segundos del movimiento bien hecho de tu alumno. Pausas en el momento clave, lo marcas con el dedo y lo explicas con tu voz. Queda guardado como su referencia personal."
            imageBase="como-calibra"
            imageAlt="Instructor con iPad junto a alumno en posición de address"
          />
          <Panel
            numeral="II"
            who="Entre clases"
            title="Tu alumno practica con esa referencia."
            body="En el range abre el teléfono y ve tu video, tu dibujo y tu voz. La cámara funciona como espejo y le indica qué corregir, una cosa a la vez y en lenguaje simple, sin grados ni jerga."
            imageBase="como-practica"
            imageAlt="Alumno practicando solo en el range con el teléfono en un trípode mostrando feedback"
            divider
          />
          <Panel
            numeral="III"
            who="El sábado siguiente"
            title="Ves su semana antes de la clase."
            body="Abres su perfil y ves qué practicó, cuántas veces y qué intentó. Llegas a la clase sabiendo en qué estuvo trabajando, en vez de empezar de cero."
            imageBase="como-revisa"
            imageAlt="Dos pares de manos revisando un iPad con el resumen semanal del alumno"
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
          src={`/images/${imageBase}-light-human.png`}
          alt={imageAlt}
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover block dark:hidden"
        />
        <Image
          src={`/images/${imageBase}-dark-human.png`}
          alt=""
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover hidden dark:block"
        />
      </div>
      <p className="small-caps font-mono text-[11px] text-accent">{numeral} · {who}</p>
      <h3 className="font-display font-semibold text-[22px] leading-[1.2] mt-2">{title}</h3>
      <p className="text-sm leading-[1.6] text-ink-soft mt-3">{body}</p>
    </div>
  )
}

/* ─── Inteligencia artificial ─────────────────────────────────────────── */

function TresPrincipios() {
  return (
    <section id="principios" className="dark bg-paper text-ink border-y border-rule py-14 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-10 md:gap-16 items-center">
          {/* Image: instructor's line-drawing plate with technical annotations */}
          <div className="relative aspect-[1131/1391] overflow-hidden">
            <Image
              src="/images/hero-address-dark-human.png"
              alt="Postura de dirección, vista de perfil, con anotaciones técnicas del instructor"
              fill
              sizes="(min-width: 768px) 45vw, 100vw"
              className="object-cover"
            />
            <ViewfinderMarks />
          </div>

          {/* Text */}
          <div>
            <p className="small-caps font-mono text-[11px] text-accent">
              Inteligencia artificial
            </p>
            <h2 className="font-display font-semibold text-3xl md:text-[44px] leading-[1.05] tracking-[-0.015em] mt-4">
              Tu corrección, repetida en cada práctica.
            </h2>
            <p className="text-[17px] md:text-[18px] leading-[1.6] text-ink-soft mt-7 max-w-[520px]">
              Mientras tu alumno practica solo en el range, la app compara cada intento con la referencia que calibraste para él y le da una sola indicación a la vez, en lenguaje simple: <em className="not-italic text-ink">{'“inclínate un poco más desde la cadera”'}</em>, no {'“4° de más en la columna”'}. Como si tu corrección estuviera ahí cada vez.
            </p>
            <div className="border-t border-rule mt-10 pt-6">
              <p className="font-display font-semibold text-[26px] md:text-[32px] leading-[1.2] tracking-[-0.01em]">
                <span className="text-ink-mute">La IA mide.</span> <span className="text-accent">Tú enseñas.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Acceso ───────────────────────────────────────────────────────────── */

function Acceso() {
  const [noCodeOpen, setNoCodeOpen] = useState(false)
  const [invited, setInvited] = useState(false)

  async function inviteInstructor() {
    const url = `${window.location.origin}/instructor/login?mode=signup`
    const shareData = {
      title: 'Forat',
      text: 'Te invito a usar Forat para nuestras clases de golf. Crea tu cuenta gratis:',
      url,
    }
    if (navigator.share) {
      try { await navigator.share(shareData); return } catch { /* fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setInvited(true)
      setTimeout(() => setInvited(false), 1800)
    } catch { /* ignore */ }
  }

  return (
    <section id="acceso" className="border-b border-rule py-14 md:py-28">
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
            title="Empieza con treinta alumnos."
            body="Prueba con tus primeros treinta alumnos. Si funciona, escalas."
            ctaText="Crear cuenta"
            ctaHref="/instructor/login?mode=signup"
            secondaryText="Ya tengo cuenta"
            secondaryHref="/instructor/login"
            stamp="GRATIS HASTA 30 ALUMNOS"
          />
          <AccessBlock
            numeral="II"
            who="Para alumnos"
            title="Entra con tu código."
            body="Tu instructor te dio un código de 6 caracteres. Es todo lo que necesitas."
            ctaText="Entrar con código"
            ctaHref="/student/login"
            secondaryText="¿No tienes código?"
            secondaryOnClick={() => setNoCodeOpen(true)}
            stamp="ACCESO LIBRE"
            divider
          />
        </div>
      </div>

      <Dialog open={noCodeOpen} onOpenChange={setNoCodeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿No tienes código?</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Tu código de 6 caracteres lo crea tu instructor cuando te suma a Forat. Si tu profe todavía no lo usa, invítalo a crear su cuenta gratis.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={inviteInstructor}
              className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-85 transition-opacity"
            >
              {invited ? '✓ Enlace copiado' : 'Invitar a mi instructor'}
            </button>
            <Link
              href="/instructor/login?mode=signup"
              className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium border border-ink text-ink rounded-md hover:opacity-75 transition-opacity"
            >
              Soy instructor
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function AccessBlock({ numeral, who, title, body, ctaText, ctaHref, secondaryText, secondaryHref, secondaryOnClick, stamp, divider }: {
  numeral: string; who: string; title: string; body: string;
  ctaText: string; ctaHref: string; secondaryText: string; secondaryHref?: string; secondaryOnClick?: () => void;
  stamp: string; divider?: boolean
}) {
  return (
    <div className={`relative px-6 py-10 sm:px-8 md:px-10 md:py-12 border-b border-rule ${divider ? 'md:border-l' : ''}`}>
      {/* Stamp: in-flow on mobile (avoids overlap with title), absolute on md+ */}
      <div className="mb-6 md:mb-0 md:absolute md:top-8 md:right-8">
        <Stamp>{stamp}</Stamp>
      </div>
      <p className="small-caps font-mono text-[11px] text-accent">{numeral} · {who}</p>
      <h3 className="font-display font-semibold text-2xl md:text-[28px] leading-[1.15] mt-2 max-w-[380px]">
        {title}
      </h3>
      <p className="text-[15px] leading-[1.6] text-ink-soft mt-4 mb-8 max-w-[400px]">
        {body}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium tracking-[0.01em] bg-primary text-primary-foreground rounded-md hover:opacity-85 transition-opacity"
        >
          {ctaText}
        </Link>
        {secondaryOnClick ? (
          <button
            type="button"
            onClick={secondaryOnClick}
            className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:decoration-ink-soft transition-colors"
          >
            {secondaryText}
          </button>
        ) : (
          <Link
            href={secondaryHref ?? '#'}
            className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:decoration-ink-soft transition-colors"
          >
            {secondaryText}
          </Link>
        )}
      </div>
    </div>
  )
}

/* ─── Cierre aspiracional ──────────────────────────────────────────────── */

function Cierre() {
  return (
    <section className="border-b border-rule py-12 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 text-center">
        <p className="font-display italic font-medium text-[28px] md:text-[40px] leading-[1.2] text-ink max-w-[760px] mx-auto">
          El camino hacia un mejor golf.
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
        <span className="small-caps font-mono text-[11px] text-ink-mute inline-flex items-center gap-2">
          <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden className="shrink-0">
            <line x1="1.5" y1="11" x2="1.5" y2="1" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
            <polygon points="1.5,1 7.5,2.5 1.5,4.5" style={{ fill: 'var(--color-accent)' }} />
          </svg>
          <span>Golf + IA, desde Barcelona</span>
        </span>
      </div>
    </footer>
  )
}
