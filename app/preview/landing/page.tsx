'use client'

/**
 * Vista previa aislada de la landing — lenguaje "Cuaderno".
 * Hardcodeada a propósito. Para descartar: borrar /app/preview/landing entero.
 */

import { useState } from 'react'

const LIGHT = {
  paper:    '#EFE9DC',
  paper2:   '#F6F1E4',
  paper3:   '#E5DDC9',
  ink:      '#1A1814',
  inkSoft:  '#4A4438',
  inkMute:  '#8A8270',
  rule:     'rgba(26,24,20,0.18)',
  ruleSoft: 'rgba(26,24,20,0.08)',
  primary:  '#1F3A38',
  accent:   '#9B5B2A',
  ok:       '#5A7460',
  warn:     '#8C7424',
  bad:      '#A14F3C',
}

const DARK = {
  paper:    '#13110E',
  paper2:   '#1C1916',
  paper3:   '#26221C',
  ink:      '#EFE9DC',
  inkSoft:  '#B5AC97',
  inkMute:  '#76705F',
  rule:     'rgba(239,233,220,0.10)',
  ruleSoft: 'rgba(239,233,220,0.05)',
  primary:  '#7AA7A3',
  accent:   '#C68A5A',
  ok:       '#8FB593',
  warn:     '#D9B26C',
  bad:      '#C97B66',
}

export default function LandingPreview() {
  const [dark, setDark] = useState(false)
  const c = dark ? DARK : LIGHT

  return (
    <div style={{
      minHeight: '100vh',
      background: c.paper,
      color: c.ink,
      fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      fontSize: 15,
      lineHeight: 1.55,
      WebkitFontSmoothing: 'antialiased',
      transition: 'background 200ms ease, color 200ms ease',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400;12..96,75..100,500;12..96,75..100,600;12..96,75..100,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; font-variation-settings: 'wdth' 100, 'opsz' 96; letter-spacing: -0.018em; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
        .num { font-variant-numeric: tabular-nums; }
        .small-caps { text-transform: uppercase; letter-spacing: 0.16em; font-weight: 500; }
      `}</style>

      <Header c={c} dark={dark} setDark={setDark} />
      <Hero c={c} />
      <Manifesto c={c} />
      <ComoFunciona c={c} />
      <PlanVisual c={c} />
      <Acceso c={c} />
      <Footer c={c} />
    </div>
  )
}

/* ─── Header ────────────────────────────────────────────────────────────── */

function Header({ c, dark, setDark }: { c: typeof LIGHT; dark: boolean; setDark: (b: boolean) => void }) {
  return (
    <header style={{ borderBottom: `1px solid ${c.rule}`, position: 'sticky', top: 0, background: c.paper, zIndex: 10 }}>
      <div style={{
        maxWidth: 1180, margin: '0 auto', padding: '18px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="display" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>parell</span>
          <span style={{ display: 'inline-block', width: 5.5, height: 5.5, background: c.accent, borderRadius: '50%', marginLeft: 3, marginBottom: 2 }} />
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#manifiesto" style={{ fontSize: 13, color: c.inkSoft, textDecoration: 'none' }}>El método</a>
          <a href="#como-funciona" style={{ fontSize: 13, color: c.inkSoft, textDecoration: 'none' }}>Cómo funciona</a>
          <a href="#acceso" style={{ fontSize: 13, color: c.inkSoft, textDecoration: 'none' }}>Ingresar</a>
          <button
            onClick={() => setDark(!dark)}
            style={{
              fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: c.inkSoft, background: 'transparent',
              border: `1px solid ${c.rule}`, padding: '6px 12px', cursor: 'pointer', borderRadius: 2,
            }}
          >
            {dark ? 'Papel' : 'Nocturno'}
          </button>
        </nav>
      </div>
    </header>
  )
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero({ c }: { c: typeof LIGHT }) {
  return (
    <section style={{ borderBottom: `1px solid ${c.rule}` }}>
      <div style={{
        maxWidth: 1180, margin: '0 auto', padding: '80px 32px 96px',
        display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 64, alignItems: 'center'
      }}>
        <div>
          <p className="mono small-caps" style={{ fontSize: 11, color: c.accent, margin: 0 }}>
            Para instructores de golf y sus alumnos
          </p>
          <h1 className="display" style={{
            fontSize: 76, lineHeight: 0.98, fontWeight: 600, margin: '24px 0 0',
            letterSpacing: '-0.025em',
          }}>
            La clase del sábado <br />
            sigue viva el martes.
          </h1>
          <p style={{
            fontSize: 19, lineHeight: 1.55, color: c.inkSoft, margin: '28px 0 0', maxWidth: 540,
          }}>
            <span style={{ color: c.ink, fontWeight: 500 }}>Parell</span> es un cuaderno de práctica que tu alumno lleva en el bolsillo. Vos calibrás su técnica durante la clase; él practica con tu referencia exacta en el rango. La app compara, prioriza, y te devuelve la semana entera el sábado siguiente.
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
            <Btn c={c} variant="primary" size="lg">Soy instructor →</Btn>
            <Btn c={c} variant="secondary" size="lg">Soy alumno</Btn>
          </div>

          <p className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, marginTop: 24 }}>
            Sin tarjeta · hasta tres alumnos · español e inglés
          </p>
        </div>

        {/* Hero visual: Hogan figure grande */}
        <div style={{ position: 'relative' }}>
          <div style={{ border: `1px solid ${c.rule}`, background: c.paper2, padding: 24, aspectRatio: '4 / 5' }}>
            <HoganLarge c={c} />
            <div style={{
              position: 'absolute', top: 36, right: 36,
            }}>
              <Stamp c={c}>PAR</Stamp>
            </div>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 10, marginTop: 12,
          }}>
            <span className="mono small-caps" style={{ color: c.inkMute }}>Lámina 03 — Postura de dirección</span>
            <span className="mono small-caps" style={{ color: c.inkMute }}>De perfil · DTL</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function HoganLarge({ c }: { c: typeof LIGHT }) {
  // Versión grande, más anotada, con más elementos del manual clásico
  return (
    <svg viewBox="0 0 240 320" width="100%" height="100%" style={{ display: 'block' }}>
      {/* Reference vertical desde cadera */}
      <line x1="120" y1="100" x2="120" y2="190" stroke={c.accent} strokeWidth="0.7" strokeDasharray="2 2.5" opacity="0.5" />

      {/* Body */}
      <g stroke={c.ink} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Head */}
        <circle cx="118" cy="76" r="10" />
        {/* Neck */}
        <line x1="118" y1="86" x2="118" y2="100" />
        {/* Spine (forward lean) */}
        <line x1="118" y1="100" x2="134" y2="186" />
        {/* Shoulder line */}
        <line x1="110" y1="106" x2="128" y2="106" />
        {/* Arms */}
        <line x1="120" y1="108" x2="154" y2="190" />
        <line x1="122" y1="108" x2="158" y2="190" />
        {/* Hands (grip) */}
        <circle cx="156" cy="191" r="2.6" fill={c.ink} />
        {/* Pelvis line */}
        <line x1="130" y1="184" x2="142" y2="188" />
        {/* Back leg */}
        <line x1="134" y1="188" x2="126" y2="240" />
        <line x1="126" y1="240" x2="120" y2="284" />
        {/* Front leg */}
        <line x1="140" y1="188" x2="146" y2="240" />
        <line x1="146" y1="240" x2="150" y2="284" />
        {/* Feet */}
        <line x1="112" y1="284" x2="128" y2="284" strokeWidth="1.8" />
        <line x1="142" y1="284" x2="160" y2="284" strokeWidth="1.8" />
      </g>

      {/* Club */}
      <g stroke={c.ink} strokeWidth="1.2" fill="none" strokeLinecap="round">
        <line x1="156" y1="191" x2="202" y2="280" />
        {/* Clubhead */}
        <line x1="198" y1="280" x2="210" y2="283" strokeWidth="3.6" />
      </g>

      {/* Ball */}
      <circle cx="188" cy="282" r="3" fill={c.ink} />

      {/* Ground line */}
      <line x1="28" y1="286" x2="216" y2="286" stroke={c.ink} strokeWidth="0.6" opacity="0.5" />

      {/* Spine angle annotation */}
      <path d="M 118,128 A 24 24 0 0 1 126,124" fill="none" stroke={c.accent} strokeWidth="1" />
      <text x="128" y="130" fontSize="9" fill={c.accent} fontFamily="JetBrains Mono" fontWeight="500">32°</text>

      {/* Spine label */}
      <line x1="60" y1="148" x2="118" y2="134" stroke={c.accent} strokeWidth="0.7" />
      <text x="18" y="146" fontSize="8" fill={c.accent} fontFamily="JetBrains Mono" letterSpacing="1">
        columna
      </text>
      <text x="18" y="158" fontSize="6.5" fill={c.inkMute} fontFamily="JetBrains Mono" letterSpacing="0.5">
        ref 28–34°
      </text>

      {/* Knee flex annotation */}
      <line x1="180" y1="232" x2="148" y2="240" stroke={c.accent} strokeWidth="0.7" />
      <text x="184" y="234" fontSize="8" fill={c.accent} fontFamily="JetBrains Mono" letterSpacing="1">
        rodillas
      </text>
      <text x="184" y="246" fontSize="6.5" fill={c.inkMute} fontFamily="JetBrains Mono" letterSpacing="0.5">
        flex 22°
      </text>

      {/* Ball callout */}
      <line x1="188" y1="278" x2="188" y2="262" stroke={c.accent} strokeWidth="0.7" strokeDasharray="2 2" />
      <text x="180" y="258" fontSize="7" fill={c.accent} fontFamily="JetBrains Mono" letterSpacing="1">
        bola
      </text>

      {/* Stance width measure */}
      <line x1="112" y1="296" x2="160" y2="296" stroke={c.inkMute} strokeWidth="0.5" />
      <line x1="112" y1="293" x2="112" y2="299" stroke={c.inkMute} strokeWidth="0.5" />
      <line x1="160" y1="293" x2="160" y2="299" stroke={c.inkMute} strokeWidth="0.5" />
      <text x="124" y="306" fontSize="6.5" fill={c.inkMute} fontFamily="JetBrains Mono" letterSpacing="0.5">
        stance 48cm
      </text>
    </svg>
  )
}

/* ─── Manifesto ─────────────────────────────────────────────────────────── */

function Manifesto({ c }: { c: typeof LIGHT }) {
  return (
    <section id="manifiesto" style={{ borderBottom: `1px solid ${c.rule}`, padding: '96px 0' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px', display: 'grid', gridTemplateColumns: '180px 1fr', gap: 64 }}>
        <div>
          <p className="mono small-caps" style={{ fontSize: 11, color: c.accent, margin: 0 }}>
            El método
          </p>
        </div>

        <div style={{ maxWidth: 720 }}>
          <p className="display" style={{ fontSize: 32, lineHeight: 1.25, fontWeight: 500, margin: 0, color: c.ink }}>
            El instructor enseña una hora a la semana. El alumno practica seis. Entre la clase y la práctica suele caer la mitad de lo aprendido — no por falta de esfuerzo, sino porque la memoria es frágil y el cuerpo se acomoda a sus viejos hábitos en cuanto cierra la puerta de la academia.
          </p>

          <p style={{ fontSize: 17, lineHeight: 1.6, color: c.inkSoft, margin: '36px 0 0' }}>
            Parell es un cuaderno. El instructor lo escribe durante la clase: graba el movimiento correcto del alumno, lo anota con su voz y su dedo sobre el frame clave, lo guarda. El alumno lo abre cada vez que va al rango. La técnica no es un recuerdo borroso del sábado — es una referencia visible, comparable, exacta.
          </p>

          <div style={{ borderTop: `1px solid ${c.rule}`, marginTop: 48, paddingTop: 48 }}>
            <p className="display" style={{
              fontSize: 36, lineHeight: 1.2, fontWeight: 600, margin: 0,
              color: c.ink, position: 'relative', paddingLeft: 36,
            }}>
              <span aria-hidden style={{
                position: 'absolute', left: -4, top: -10, fontSize: 80, lineHeight: 1, color: c.accent, fontWeight: 600,
              }}>“</span>
              No reemplazamos al instructor. Lo extendemos.
            </p>
            <p className="mono small-caps" style={{ fontSize: 11, color: c.inkMute, marginTop: 16, marginLeft: 36 }}>
              Principio irrenunciable
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Cómo funciona ─────────────────────────────────────────────────────── */

function ComoFunciona({ c }: { c: typeof LIGHT }) {
  return (
    <section id="como-funciona" style={{ borderBottom: `1px solid ${c.rule}`, padding: '96px 0' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 64, alignItems: 'baseline', marginBottom: 56 }}>
          <p className="mono small-caps" style={{ fontSize: 11, color: c.accent, margin: 0 }}>
            Cómo funciona
          </p>
          <h2 className="display" style={{ fontSize: 40, lineHeight: 1.1, fontWeight: 600, margin: 0, maxWidth: 640 }}>
            Tres momentos. Uno por persona, uno por día, uno por semana.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: `1px solid ${c.rule}`, borderBottom: `1px solid ${c.rule}` }}>
          <Panel
            c={c}
            numeral="I"
            who="Durante la clase"
            title="El instructor calibra."
            body="Con el iPad en mano, graba 15 segundos del movimiento correcto del alumno. Pausa, dibuja con el dedo sobre el frame clave, habla. Lo guarda. La técnica queda como un manual técnico — exacto, suyo."
            visual={<MiniHogan c={c} />}
          />
          <Panel
            c={c}
            numeral="II"
            who="Entre clases"
            title="El alumno practica."
            body="Abre el teléfono en el rango. Ve la referencia de su profesor, la escucha, la entiende. Activa el espejo. La app le dice qué corregir, una cosa a la vez, en lenguaje corporal — sin jerga, sin números."
            visual={<MiniMirror c={c} />}
            divider
          />
          <Panel
            c={c}
            numeral="III"
            who="El sábado siguiente"
            title="La conversación se reanuda."
            body="El instructor abre el perfil del alumno y ve la semana entera como un yardage book: qué practicó, qué le costó, qué mejoró. La clase del sábado deja de empezar de cero."
            visual={<MiniScorecard c={c} />}
            divider
          />
        </div>
      </div>
    </section>
  )
}

function Panel({ c, numeral, who, title, body, visual, divider }: { c: typeof LIGHT; numeral: string; who: string; title: string; body: string; visual: React.ReactNode; divider?: boolean }) {
  return (
    <div style={{ padding: '40px 32px', borderLeft: divider ? `1px solid ${c.rule}` : 'none' }}>
      <div style={{ aspectRatio: '4 / 3', background: c.paper2, border: `1px solid ${c.rule}`, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {visual}
      </div>
      <p className="mono small-caps" style={{ fontSize: 10, color: c.accent, margin: 0 }}>
        {numeral} · {who}
      </p>
      <h3 className="display" style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 600, margin: '8px 0 0', color: c.ink }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: c.inkSoft, margin: '12px 0 0' }}>
        {body}
      </p>
    </div>
  )
}

/* Mini ilustraciones para los 3 paneles */

function MiniHogan({ c }: { c: typeof LIGHT }) {
  return (
    <svg viewBox="0 0 120 100" width="80%" height="80%">
      <g stroke={c.ink} strokeWidth="0.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="58" cy="22" r="4" />
        <line x1="58" y1="26" x2="58" y2="34" />
        <line x1="58" y1="34" x2="66" y2="62" />
        <line x1="60" y1="38" x2="74" y2="62" />
        <line x1="61" y1="38" x2="76" y2="62" />
        <circle cx="75" cy="63" r="1.4" fill={c.ink} />
        <line x1="65" y1="62" x2="62" y2="82" />
        <line x1="62" y1="82" x2="58" y2="94" />
        <line x1="68" y1="62" x2="70" y2="82" />
        <line x1="70" y1="82" x2="72" y2="94" />
        <line x1="54" y1="94" x2="62" y2="94" strokeWidth="1.1" />
        <line x1="68" y1="94" x2="76" y2="94" strokeWidth="1.1" />
      </g>
      <line x1="75" y1="63" x2="96" y2="93" stroke={c.ink} strokeWidth="0.7" strokeLinecap="round" />
      <line x1="94" y1="93" x2="100" y2="94.6" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="89" cy="94" r="1.6" fill={c.ink} />
      <line x1="18" y1="96" x2="106" y2="96" stroke={c.ink} strokeWidth="0.4" opacity="0.5" />
      <path d="M 58,42 A 12 12 0 0 1 62,40" stroke={c.accent} strokeWidth="0.7" fill="none" />
      <text x="63" y="44" fontSize="4" fill={c.accent} fontFamily="JetBrains Mono">32°</text>
    </svg>
  )
}

function MiniMirror({ c }: { c: typeof LIGHT }) {
  // Phone frame con el "score" del espejo
  return (
    <div style={{
      width: 120, height: 168,
      border: `1px solid ${c.rule}`,
      background: c.paper,
      padding: 14,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div>
        <p className="mono small-caps" style={{ fontSize: 7, color: c.inkMute, margin: 0 }}>En espejo</p>
        <p style={{ fontSize: 9, color: c.ink, margin: '4px 0 0', lineHeight: 1.3 }}>
          Inclinate desde la cadera hasta sentir peso en el pie.
        </p>
      </div>
      <div style={{ textAlign: 'center', borderTop: `1px solid ${c.rule}`, borderBottom: `1px solid ${c.rule}`, padding: '10px 0' }}>
        <p className="display num" style={{ fontSize: 32, fontWeight: 600, color: c.warn, margin: 0, lineHeight: 1 }}>
          +1
        </p>
        <p className="mono small-caps" style={{ fontSize: 7, color: c.inkMute, margin: '4px 0 0' }}>
          Columna
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 7, color: c.ok }}>● hombros</span>
        <span style={{ fontSize: 7, color: c.bad }}>● peso</span>
      </div>
    </div>
  )
}

function MiniScorecard({ c }: { c: typeof LIGHT }) {
  const cells = [
    ['Postura',  'E',  '+1', 'E',  '—',  'E'],
    ['Hombros',  '+1', 'E',  '+1', 'E',  'E'],
    ['Peso',     '+3', '+2', '+1', '+1', '+1'],
  ]
  const scoreColor = (s: string) => s === 'E' ? c.ok : s === '+1' ? c.warn : s === '—' ? c.inkMute : c.bad
  return (
    <div style={{ width: '85%', border: `1px solid ${c.rule}`, background: c.paper }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(5, 1fr)', borderBottom: `1px solid ${c.rule}`, background: c.paper2 }}>
        <div style={{ padding: 6 }}><span className="mono small-caps" style={{ fontSize: 7, color: c.inkMute }}>Ej.</span></div>
        {['L','M','M','J','V'].map((d, i) => (
          <div key={i} style={{ padding: 6, textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
            <span className="mono small-caps" style={{ fontSize: 7, color: c.inkMute }}>{d}</span>
          </div>
        ))}
      </div>
      {cells.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(5, 1fr)', borderBottom: ri === cells.length - 1 ? 'none' : `1px solid ${c.rule}` }}>
          <div style={{ padding: 6 }}>
            <span style={{ fontSize: 8, color: c.ink }}>{row[0]}</span>
          </div>
          {row.slice(1).map((s, i) => (
            <div key={i} style={{ padding: 6, textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
              <span className="mono num" style={{ fontSize: 9, color: scoreColor(s), fontWeight: 500 }}>{s}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ─── Plan visual (large yardage book teaser) ──────────────────────────── */

function PlanVisual({ c }: { c: typeof LIGHT }) {
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const rows = [
    { exercise: 'Postura abierta',         scores: ['+1', '+1', 'E',  '—',  'E',  '—',  'E'],  total: 'E'  },
    { exercise: 'Apertura de hombros',     scores: ['+3', '+2', '+1', '+1', 'E',  '—',  '—'],  total: '+1' },
    { exercise: 'Distribución de peso',    scores: ['+5', '+3', '+3', '+2', '+1', '+1', '+1'], total: '+2' },
    { exercise: 'Inclinación de columna',  scores: ['E',  'E',  'E',  '+1', 'E',  'E',  '+1'], total: 'E'  },
  ]
  const scoreColor = (s: string) => s === 'E' ? c.ok : s === '+1' ? c.warn : s === '—' ? c.inkMute : c.bad

  return (
    <section style={{ borderBottom: `1px solid ${c.rule}`, padding: '96px 0' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 64, alignItems: 'baseline', marginBottom: 56 }}>
          <p className="mono small-caps" style={{ fontSize: 11, color: c.accent, margin: 0 }}>
            La semana, vista
          </p>
          <div style={{ maxWidth: 640 }}>
            <h2 className="display" style={{ fontSize: 40, lineHeight: 1.1, fontWeight: 600, margin: 0 }}>
              La práctica del alumno se lee como un scorecard.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: c.inkSoft, margin: '20px 0 0' }}>
              Cada ejercicio es un hoyo. La referencia que vos calibraste es el par. Lo que el alumno hace cada día queda registrado en la misma página, lista para revisarla juntos el sábado.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 40, alignItems: 'start' }}>
          {/* Hole map */}
          <div>
            <HoleMapLarge c={c} />
            <p className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, marginTop: 16 }}>
              Pedro Cabrera · Sem. 19
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: c.inkSoft, margin: '8px 0 0' }}>
              Cuatro hoyos. Siete días. Una página.
            </p>
          </div>

          {/* Scorecard */}
          <div style={{ border: `1px solid ${c.rule}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: `1.6fr 56px repeat(${days.length}, 1fr) 64px`, borderBottom: `1px solid ${c.rule}`, background: c.paper2 }}>
              <div style={{ padding: '11px 14px' }}><span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Ejercicio</span></div>
              <div style={{ padding: '11px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}><span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Ref</span></div>
              {days.map(d => (
                <div key={d} style={{ padding: '11px 0', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
                  <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>{d}</span>
                </div>
              ))}
              <div style={{ padding: '11px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}><span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Sem</span></div>
            </div>
            {rows.map((row, ri) => (
              <div key={row.exercise} style={{ display: 'grid', gridTemplateColumns: `1.6fr 56px repeat(${days.length}, 1fr) 64px`, borderBottom: ri === rows.length - 1 ? 'none' : `1px solid ${c.rule}` }}>
                <div style={{ padding: '14px' }}>
                  <span style={{ fontSize: 14, color: c.ink }}>{row.exercise}</span>
                </div>
                <div style={{ padding: '14px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
                  <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, letterSpacing: '0.18em' }}>PAR</span>
                </div>
                {row.scores.map((s, i) => (
                  <div key={i} style={{ padding: '14px 0', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
                    <span className="mono num" style={{ fontSize: 14, color: scoreColor(s), fontWeight: 500 }}>{s}</span>
                  </div>
                ))}
                <div style={{ padding: '14px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}`, background: c.paper2 }}>
                  <span className="mono num" style={{ fontSize: 14, color: scoreColor(row.total), fontWeight: 600 }}>{row.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function HoleMapLarge({ c }: { c: typeof LIGHT }) {
  return (
    <svg viewBox="0 0 200 240" width="100%" style={{ display: 'block', maxWidth: 200 }}>
      <rect x="84" y="220" width="32" height="8" fill="none" stroke={c.ink} strokeWidth="0.7" />
      <text x="72" y="238" fontSize="7" fill={c.inkMute} fontFamily="JetBrains Mono" letterSpacing="0.5">TEE</text>

      <path d="M 100,220 C 94,170 112,130 118,90" fill="none" stroke={c.rule} strokeWidth="16" strokeLinecap="round" />

      <path d="M 100,36 C 76,36 64,60 76,80 C 88,98 124,96 134,76 C 146,60 132,36 110,36 Z"
            fill="none" stroke={c.ink} strokeWidth="1" />

      <path d="M 104,46 C 90,48 82,62 92,76 C 104,88 124,80 126,68 C 128,56 118,44 104,46 Z"
            fill="none" stroke={c.ink} strokeWidth="0.5" opacity="0.55" />
      <path d="M 106,56 C 98,58 96,68 104,72 C 114,76 118,68 116,62 C 114,58 112,54 106,56 Z"
            fill="none" stroke={c.ink} strokeWidth="0.5" opacity="0.55" />

      <line x1="110" y1="46" x2="110" y2="68" stroke={c.ink} strokeWidth="0.9" />
      <polygon points="110,46 120,50 110,55" fill={c.accent} />

      <text x="130" y="54" fontSize="7.5" fill={c.accent} fontFamily="JetBrains Mono" letterSpacing="0.5" fontWeight="500">
        163y
      </text>

      <g stroke={c.inkMute} strokeWidth="0.7" fill="none">
        <line x1="20" y1="26" x2="46" y2="44" />
        <polyline points="40,40 46,44 41,49" />
      </g>
      <text x="20" y="18" fontSize="6.5" fill={c.inkMute} fontFamily="JetBrains Mono" letterSpacing="0.4">
        SW · 12mph
      </text>

      <line x1="92" y1="130" x2="108" y2="130" stroke={c.ink} strokeWidth="0.5" />
      <text x="114" y="133" fontSize="6.5" fill={c.inkMute} fontFamily="JetBrains Mono">100</text>
      <line x1="98" y1="180" x2="108" y2="180" stroke={c.ink} strokeWidth="0.5" />
      <text x="114" y="183" fontSize="6.5" fill={c.inkMute} fontFamily="JetBrains Mono">50</text>
    </svg>
  )
}

/* ─── Acceso ───────────────────────────────────────────────────────────── */

function Acceso({ c }: { c: typeof LIGHT }) {
  return (
    <section id="acceso" style={{ borderBottom: `1px solid ${c.rule}`, padding: '96px 0' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 64, alignItems: 'baseline', marginBottom: 56 }}>
          <p className="mono small-caps" style={{ fontSize: 11, color: c.accent, margin: 0 }}>
            Acceso
          </p>
          <h2 className="display" style={{ fontSize: 40, lineHeight: 1.1, fontWeight: 600, margin: 0 }}>
            Dos puertas. La que te corresponda.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: `1px solid ${c.rule}` }}>
          <AccessBlock
            c={c}
            numeral="I"
            who="Para instructores"
            title="Empezá con tres alumnos."
            body="Sin tarjeta. Calibrá un par de ejercicios con cada alumno, mirá qué tal lo siente la primera semana. Si funciona, escalás."
            cta="Crear cuenta"
            secondaryCta="Ya tengo cuenta"
            stamp="GRATIS HASTA 3 ALUMNOS"
          />
          <AccessBlock
            c={c}
            numeral="II"
            who="Para alumnos"
            title="Ingresá con tu código."
            body="Tu instructor te dio un código de seis caracteres. Es todo lo que necesitás — el acceso es gratis y no requiere tarjeta."
            cta="Ingresar con código"
            secondaryCta="¿No tenés código?"
            stamp="ACCESO LIBRE"
            divider
          />
        </div>
      </div>
    </section>
  )
}

function AccessBlock({ c, numeral, who, title, body, cta, secondaryCta, stamp, divider }: {
  c: typeof LIGHT; numeral: string; who: string; title: string; body: string; cta: string; secondaryCta: string; stamp: string; divider?: boolean
}) {
  return (
    <div style={{ padding: '48px 40px', borderLeft: divider ? `1px solid ${c.rule}` : 'none', borderBottom: `1px solid ${c.rule}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 32, right: 32 }}>
        <Stamp c={c}>{stamp}</Stamp>
      </div>
      <p className="mono small-caps" style={{ fontSize: 10, color: c.accent, margin: 0 }}>
        {numeral} · {who}
      </p>
      <h3 className="display" style={{ fontSize: 30, fontWeight: 600, margin: '8px 0 0', lineHeight: 1.15, maxWidth: 380 }}>
        {title}
      </h3>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: c.inkSoft, margin: '16px 0 32px', maxWidth: 400 }}>
        {body}
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Btn c={c} variant="primary">{cta}</Btn>
        <a href="#" style={{ fontSize: 13, color: c.inkSoft, textDecoration: 'underline', textDecorationColor: c.rule, textUnderlineOffset: 4 }}>
          {secondaryCta}
        </a>
      </div>
    </div>
  )
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

function Footer({ c }: { c: typeof LIGHT }) {
  return (
    <footer style={{ padding: '48px 32px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span className="display" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>parell</span>
          <span style={{ display: 'inline-block', width: 4, height: 4, background: c.accent, borderRadius: '50%', marginLeft: 2 }} />
        </div>

        <div style={{ display: 'flex', gap: 32 }}>
          <a href="#" style={{ fontSize: 12, color: c.inkMute, textDecoration: 'none' }}>Contacto</a>
          <a href="#" style={{ fontSize: 12, color: c.inkMute, textDecoration: 'none' }}>Privacidad</a>
          <a href="#" style={{ fontSize: 12, color: c.inkMute, textDecoration: 'none' }}>Términos</a>
        </div>

        <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>
          Hecho con tempo · Barcelona
        </span>
      </div>
    </footer>
  )
}

/* ─── Shared bits ───────────────────────────────────────────────────────── */

function Btn({ c, variant = 'primary', size = 'md', children }: { c: typeof LIGHT; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'; children: React.ReactNode }) {
  const padding = size === 'sm' ? '6px 14px' : size === 'lg' ? '14px 28px' : '10px 20px'
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 15 : 14
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: c.primary, color: c.paper, border: `1px solid ${c.primary}` },
    secondary: { background: 'transparent', color: c.ink, border: `1px solid ${c.ink}` },
    ghost:     { background: 'transparent', color: c.inkSoft, border: `1px solid transparent` },
  }
  return (
    <button
      style={{
        ...styles[variant], padding, fontSize,
        fontFamily: 'inherit', fontWeight: 500, letterSpacing: '0.01em',
        borderRadius: 2, cursor: 'pointer', transition: 'opacity 150ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {children}
    </button>
  )
}

function Stamp({ c, children }: { c: typeof LIGHT; children: React.ReactNode }) {
  return (
    <span
      className="mono"
      style={{
        color: c.accent, border: `1.5px solid ${c.accent}`,
        display: 'inline-block', padding: '5px 10px 4px',
        fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase',
        transform: 'rotate(-1.5deg)', fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}
