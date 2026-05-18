'use client'

/**
 * Vista previa aislada del lenguaje visual "Cuaderno" — iteración 02.
 * Sin serif. Golf implícito via diagrama Hogan + scorecard yardage book + notación de score.
 * Hardcodeada a propósito. Para descartar: borrar /app/preview/cuaderno entero.
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

export default function CuadernoPreview() {
  const [dark, setDark] = useState(false)
  const c = dark ? DARK : LIGHT

  return (
    <div
      style={{
        minHeight: '100vh',
        background: c.paper,
        color: c.ink,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 15,
        lineHeight: 1.55,
        WebkitFontSmoothing: 'antialiased',
        transition: 'background 200ms ease, color 200ms ease',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400;12..96,75..100,500;12..96,75..100,600;12..96,75..100,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; font-variation-settings: 'wdth' 100, 'opsz' 96; letter-spacing: -0.018em; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
        .num { font-variant-numeric: tabular-nums; }
        .small-caps { text-transform: uppercase; letter-spacing: 0.16em; font-weight: 500; }
      `}</style>

      <Header dark={dark} setDark={setDark} c={c} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '0 32px 96px' }}>

        {/* Manifiesto */}
        <div style={{ padding: '52px 0 60px' }}>
          <p className="small-caps mono" style={{ color: c.accent, fontSize: 11, marginBottom: 20 }}>
            Lenguaje visual · Ensayo 02
          </p>
          <h1 className="display" style={{ fontSize: 60, lineHeight: 1.02, fontWeight: 600, margin: 0, maxWidth: 760 }}>
            Cuaderno — un manual de campo para el golf que se enseña.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: c.inkSoft, maxWidth: 580, marginTop: 24 }}>
            Inspirado en los yardage books de los caddies, los manuales clásicos de instrucción y la sobriedad editorial del golf. Sin estridencias. Autoridad técnica.
          </p>
        </div>

        <Section c={c} numeral="I" title="Tipografía" caption="Bricolage Grotesque para títulos. Inter para cuerpo. JBM para datos.">
          <div style={{ display: 'grid', gap: 28 }}>
            <TypeRow c={c} label="Display 60 · Bricolage 600">
              <span className="display" style={{ fontSize: 60, lineHeight: 1.02, fontWeight: 600 }}>
                Postura abierta
              </span>
            </TypeRow>
            <TypeRow c={c} label="Display 36 · Bricolage 600">
              <span className="display" style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 600 }}>
                Esta semana practicaste cuatro días
              </span>
            </TypeRow>
            <TypeRow c={c} label="Display 22 · Bricolage 500">
              <span className="display" style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 500 }}>
                Calibración completa
              </span>
            </TypeRow>
            <TypeRow c={c} label="Body 16 · Inter 400">
              <span style={{ fontSize: 16, lineHeight: 1.55, maxWidth: 580, display: 'block' }}>
                Tu profesor calibró tres ejercicios la semana pasada. La técnica que más practicaste fue la inclinación de columna en posición de dirección.
              </span>
            </TypeRow>
            <TypeRow c={c} label="Body 14 · Inter 400">
              <span style={{ fontSize: 14, lineHeight: 1.5, color: c.inkSoft, maxWidth: 580, display: 'block' }}>
                Texto secundario, descripciones, notas al pie. La voz que acompaña al título, nunca lo opaca.
              </span>
            </TypeRow>
            <TypeRow c={c} label="Mono 11 · JBM, small-caps">
              <span className="mono small-caps" style={{ fontSize: 11, color: c.inkMute }}>
                Pedro Cabrera / Postura abierta / Sesión 03
              </span>
            </TypeRow>
            <TypeRow c={c} label="Score · JBM, tabular">
              <span className="mono" style={{ fontSize: 24, fontWeight: 500, letterSpacing: '0.02em' }}>
                <span style={{ color: c.ok }}>E</span>
                <span style={{ color: c.inkMute }}> · </span>
                <span style={{ color: c.warn }}>+1</span>
                <span style={{ color: c.inkMute }}> · </span>
                <span style={{ color: c.bad }}>+3</span>
              </span>
            </TypeRow>
          </div>
        </Section>

        <Section c={c} numeral="II" title="Paleta" caption="Papel, tinta, verde-tinta de fondo, cognac como sello.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 24 }}>
            <Swatch c={c} name="paper" hex={c.paper} swatchBg={c.paper} note="Fondo página" />
            <Swatch c={c} name="paper-2" hex={c.paper2} swatchBg={c.paper2} note="Superficie card" />
            <Swatch c={c} name="paper-3" hex={c.paper3} swatchBg={c.paper3} note="Área secundaria" />
            <Swatch c={c} name="rule" hex={c.rule} swatchBg={c.rule} note="Hairline" />
            <Swatch c={c} name="ink" hex={c.ink} swatchBg={c.ink} note="Texto principal" textOnSwatch={c.paper} />
            <Swatch c={c} name="ink-soft" hex={c.inkSoft} swatchBg={c.inkSoft} note="Texto secundario" textOnSwatch={c.paper} />
            <Swatch c={c} name="primary" hex={c.primary} swatchBg={c.primary} note="Marca, foco" textOnSwatch={c.paper} />
            <Swatch c={c} name="accent" hex={c.accent} swatchBg={c.accent} note="Sello, énfasis" textOnSwatch={c.paper} />
            <Swatch c={c} name="ok" hex={c.ok} swatchBg={c.ok} note="Par / correcto" textOnSwatch={c.paper} />
            <Swatch c={c} name="warn" hex={c.warn} swatchBg={c.warn} note="+1/+2" textOnSwatch={c.ink} />
            <Swatch c={c} name="bad" hex={c.bad} swatchBg={c.bad} note="+3 o más" textOnSwatch={c.paper} />
            <div />
          </div>
        </Section>

        <Section c={c} numeral="III" title="Botones" caption="Una escala. Radius 2px. Sin gradientes ni sombras.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Btn c={c} variant="primary">Grabar ejercicio</Btn>
            <Btn c={c} variant="secondary">Revisar más tarde</Btn>
            <Btn c={c} variant="ghost">Cancelar</Btn>
            <Btn c={c} variant="accent">Compartir</Btn>
            <Btn c={c} variant="danger">Archivar alumno</Btn>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 18 }}>
            <Btn c={c} variant="primary" size="sm">Continuar</Btn>
            <Btn c={c} variant="secondary" size="sm">Volver</Btn>
            <Btn c={c} variant="primary" size="lg">Practicar ahora</Btn>
          </div>
        </Section>

        <Section c={c} numeral="IV" title="Formularios" caption="Inputs como líneas escritas a mano sobre papel.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, maxWidth: 720 }}>
            <Field c={c} label="Nombre del alumno" placeholder="Pedro Cabrera" />
            <Field c={c} label="Código de acceso" placeholder="A7K-2QP" mono />
            <Field c={c} label="Buscar" placeholder="Nombre o código…" icon="search" />
            <Field c={c} label="Nota del instructor" placeholder="Recordá inclinarte desde la cadera…" multiline />
          </div>
        </Section>

        <Section c={c} numeral="V" title="Estados" caption="Notación de score como en el yardage book. E = par.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <StatePill c={c} kind="ok">Par — dentro del rango</StatePill>
            <StatePill c={c} kind="warn">+1 — pequeña desviación</StatePill>
            <StatePill c={c} kind="bad">+3 — corregir</StatePill>
            <StatePill c={c} kind="neutral">Pendiente</StatePill>
          </div>

          <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Inclinación de columna', score: 'E',   value: '32°',  target: '28–34°', state: 'ok'   as const },
              { label: 'Apertura de hombros',   score: '+1',  value: '18°',  target: '22–28°', state: 'warn' as const },
              { label: 'Distribución de peso',  score: '+3',  value: '71/29', target: '50/50',  state: 'bad'  as const },
            ].map(m => <MetricBar key={m.label} c={c} {...m} />)}
          </div>
        </Section>

        <Section c={c} numeral="VI" title="Sellos" caption="Como tinta estampada sobre papel. Usan el lenguaje del scorecard.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
            <Stamp c={c}>PAR</Stamp>
            <Stamp c={c} variant="outline">SESIÓN 03</Stamp>
            <Stamp c={c} variant="ink">REVISAR</Stamp>
            <Stamp c={c} variant="accent-fill">+1 PROMEDIO</Stamp>
            <Stamp c={c}>E ESTA SEMANA</Stamp>
          </div>
        </Section>

        <Section c={c} numeral="VII" title="Cita del instructor" caption="La nota como pull-quote editorial.">
          <PullQuote c={c}>
            Fijate que la columna está más erguida de lo que necesitamos. Inclinate desde las caderas, no desde los hombros, hasta que sientas peso en la planta del pie.
          </PullQuote>
          <p className="mono small-caps" style={{ fontSize: 11, color: c.inkMute, marginTop: 14 }}>
            Tomás Vidal — Postura abierta · 18 May 2026
          </p>
        </Section>

        <Section c={c} numeral="VIII" title="Lista de alumnos" caption="Sin cards. Hairlines como en una página impresa.">
          <Roster c={c} />
        </Section>

        <Section c={c} numeral="IX" title="Ejercicio" caption="El frame anotado como un diagrama de manual clásico.">
          <ExerciseCard c={c} />
        </Section>

        <Section c={c} numeral="X" title="Plan semanal" caption="Scorecard de práctica. Cada ejercicio es un hoyo. E = baseline del instructor.">
          <YardageBook c={c} />
        </Section>

        <Section c={c} numeral="XI" title="Vacío" caption="Cuando no hay datos, no hay emoji. Hay una línea y una frase.">
          <EmptyState c={c} />
        </Section>

        <Footer c={c} />
      </main>
    </div>
  )
}

/* ─── Header ────────────────────────────────────────────────────────────── */

function Header({ dark, setDark, c }: { dark: boolean; setDark: (b: boolean) => void; c: typeof LIGHT }) {
  return (
    <header style={{ borderBottom: `1px solid ${c.rule}` }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span className="display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
            parell
          </span>
          <span style={{ display: 'inline-block', width: 6, height: 6, background: c.accent, borderRadius: '50%', marginLeft: 3, marginBottom: 3 }} />
          <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, marginLeft: 14 }}>
            Cuaderno · vista previa
          </span>
        </div>

        <button
          onClick={() => setDark(!dark)}
          style={{
            fontFamily: 'inherit',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: c.inkSoft,
            background: 'transparent',
            border: `1px solid ${c.rule}`,
            padding: '7px 14px',
            cursor: 'pointer',
            borderRadius: 2,
          }}
        >
          {dark ? 'Modo papel' : 'Modo nocturno'}
        </button>
      </div>
    </header>
  )
}

/* ─── Section wrapper ───────────────────────────────────────────────────── */

function Section({ c, numeral, title, caption, children }: { c: typeof LIGHT; numeral: string; title: string; caption: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: `1px solid ${c.rule}`, padding: '56px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 48, marginBottom: 36, alignItems: 'baseline' }}>
        <div>
          <span className="mono" style={{ fontSize: 11, color: c.accent, letterSpacing: '0.16em' }}>
            {numeral}
          </span>
          <h2 className="display" style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 600, margin: '4px 0 0' }}>
            {title}
          </h2>
        </div>
        <p style={{ fontSize: 14, color: c.inkSoft, lineHeight: 1.55, maxWidth: 420, margin: 0 }}>
          {caption}
        </p>
      </div>
      <div>{children}</div>
    </section>
  )
}

/* ─── Type sample row ───────────────────────────────────────────────────── */

function TypeRow({ c, label, children }: { c: typeof LIGHT; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 48, alignItems: 'baseline', borderBottom: `1px solid ${c.ruleSoft}`, paddingBottom: 20 }}>
      <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>{label}</span>
      <div>{children}</div>
    </div>
  )
}

/* ─── Swatch ────────────────────────────────────────────────────────────── */

function Swatch({ c, name, hex, swatchBg, note, textOnSwatch }: { c: typeof LIGHT; name: string; hex: string; swatchBg: string; note: string; textOnSwatch?: string }) {
  return (
    <div>
      <div
        style={{
          height: 88,
          background: swatchBg,
          border: `1px solid ${c.rule}`,
          padding: 12,
          color: textOnSwatch ?? c.inkSoft,
          display: 'flex',
          alignItems: 'flex-end',
          fontSize: 11,
        }}
        className="mono"
      >
        {hex}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: c.inkSoft }}>
        <span className="mono" style={{ color: c.ink }}>{name}</span>
        <span style={{ color: c.inkMute }}> · {note}</span>
      </p>
    </div>
  )
}

/* ─── Button ────────────────────────────────────────────────────────────── */

function Btn({ c, variant = 'primary', size = 'md', children }: { c: typeof LIGHT; variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'; size?: 'sm' | 'md' | 'lg'; children: React.ReactNode }) {
  const padding = size === 'sm' ? '6px 14px' : size === 'lg' ? '14px 28px' : '10px 20px'
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 14

  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: c.primary, color: c.paper, border: `1px solid ${c.primary}` },
    secondary: { background: 'transparent', color: c.ink, border: `1px solid ${c.ink}` },
    ghost:     { background: 'transparent', color: c.inkSoft, border: `1px solid transparent` },
    accent:    { background: c.accent, color: c.paper, border: `1px solid ${c.accent}` },
    danger:    { background: 'transparent', color: c.bad, border: `1px solid ${c.bad}` },
  }

  return (
    <button
      style={{
        ...styles[variant],
        padding,
        fontSize,
        fontFamily: 'inherit',
        fontWeight: 500,
        letterSpacing: '0.01em',
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'opacity 150ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.82')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {children}
    </button>
  )
}

/* ─── Field ─────────────────────────────────────────────────────────────── */

function Field({ c, label, placeholder, mono, multiline, icon }: { c: typeof LIGHT; label: string; placeholder: string; mono?: boolean; multiline?: boolean; icon?: 'search' }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="small-caps mono" style={{ fontSize: 10, color: c.inkMute, display: 'block', marginBottom: 8 }}>{label}</span>
      <div style={{ position: 'relative' }}>
        {icon === 'search' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.inkMute} strokeWidth="1.6" strokeLinecap="round"
            style={{ position: 'absolute', left: 0, top: 12 }}>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16" y2="16" />
          </svg>
        )}
        {multiline ? (
          <textarea
            placeholder={placeholder}
            rows={3}
            style={{
              width: '100%', background: 'transparent', border: 'none',
              borderBottom: `1px solid ${c.rule}`,
              padding: '8px 0', paddingLeft: icon ? 22 : 0,
              fontFamily: 'inherit', fontSize: 15, color: c.ink, outline: 'none', resize: 'none',
            }}
          />
        ) : (
          <input
            placeholder={placeholder}
            className={mono ? 'mono' : undefined}
            style={{
              width: '100%', background: 'transparent', border: 'none',
              borderBottom: `1px solid ${c.rule}`,
              padding: '8px 0', paddingLeft: icon ? 22 : 0,
              fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
              fontSize: 15, color: c.ink, outline: 'none',
              letterSpacing: mono ? '0.06em' : undefined,
            }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = c.primary)}
            onBlur={e => (e.currentTarget.style.borderBottomColor = c.rule)}
          />
        )}
      </div>
    </label>
  )
}

/* ─── Status pill + metric ──────────────────────────────────────────────── */

function StatePill({ c, kind, children }: { c: typeof LIGHT; kind: 'ok' | 'warn' | 'bad' | 'neutral'; children: React.ReactNode }) {
  const colorMap = { ok: c.ok, warn: c.warn, bad: c.bad, neutral: c.inkMute }
  const color = colorMap[kind]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontSize: 12, color: c.ink,
      padding: '4px 10px 4px 8px',
      border: `1px solid ${c.rule}`, borderRadius: 2,
    }}>
      <span style={{ width: 6, height: 6, background: color, borderRadius: '50%' }} />
      {children}
    </span>
  )
}

function MetricBar({ c, label, score, value, target, state }: { c: typeof LIGHT; label: string; score: string; value: string; target: string; state: 'ok' | 'warn' | 'bad' }) {
  const colorMap = { ok: c.ok, warn: c.warn, bad: c.bad }
  const color = colorMap[state]
  const numeric = state === 'ok' ? 12 : state === 'warn' ? 38 : 72
  return (
    <div style={{ borderTop: `1px solid ${c.rule}`, paddingTop: 12 }}>
      <p style={{ fontSize: 13, color: c.inkSoft, margin: 0 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="display num" style={{ fontSize: 28, fontWeight: 600, color }}>
            {score}
          </span>
          <span className="mono" style={{ fontSize: 12, color: c.inkSoft }}>
            {value}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: c.inkMute }}>
          ref {target}
        </span>
      </div>
      <div style={{ height: 2, background: c.rule, marginTop: 10, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(numeric, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

/* ─── Stamp ─────────────────────────────────────────────────────────────── */

function Stamp({ c, children, variant = 'default' }: { c: typeof LIGHT; children: React.ReactNode; variant?: 'default' | 'outline' | 'ink' | 'accent-fill' }) {
  const styles: Record<string, React.CSSProperties> = {
    default:       { color: c.accent, border: `1.5px solid ${c.accent}` },
    outline:       { color: c.inkSoft, border: `1px solid ${c.inkSoft}` },
    ink:           { color: c.ink,     border: `1.5px solid ${c.ink}` },
    'accent-fill': { color: c.paper,   background: c.accent, border: `1.5px solid ${c.accent}` },
  }
  return (
    <span
      className="mono"
      style={{
        ...styles[variant],
        display: 'inline-block',
        padding: '5px 10px 4px',
        fontSize: 11,
        letterSpacing: '0.20em',
        textTransform: 'uppercase',
        transform: 'rotate(-1.5deg)',
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}

/* ─── Pull quote ────────────────────────────────────────────────────────── */

function PullQuote({ c, children }: { c: typeof LIGHT; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 36 }}>
      <span className="display" aria-hidden style={{ position: 'absolute', left: -4, top: -20, fontSize: 84, lineHeight: 1, color: c.accent, fontWeight: 600 }}>
        “
      </span>
      <p className="display" style={{ fontSize: 23, lineHeight: 1.4, fontWeight: 500, margin: 0, color: c.ink, maxWidth: 640 }}>
        {children}
      </p>
    </div>
  )
}

/* ─── Roster (mock alumnos) ─────────────────────────────────────────────── */

const STUDENTS = [
  { name: 'Pedro Cabrera',     code: 'A7K-2QP', total: 4, calibrated: 3, last: 'hace 2 días',  avg: '+1' },
  { name: 'Lucía Fernández',   code: 'N3M-9XR', total: 6, calibrated: 6, last: 'ayer',         avg: 'E'  },
  { name: 'Joaquín Almada',    code: 'Q1T-5BV', total: 2, calibrated: 0, last: 'sin ensayos',  avg: '—'  },
  { name: 'Mariana Ortiz',     code: 'F8P-4LH', total: 5, calibrated: 4, last: 'hace 4 días',  avg: '+2' },
  { name: 'Tomás Vidal',       code: 'Z2W-7DK', total: 3, calibrated: 2, last: 'hoy',          avg: 'E'  },
]

function Roster({ c }: { c: typeof LIGHT }) {
  return (
    <div style={{ borderTop: `1px solid ${c.rule}` }}>
      {/* Header row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 110px 130px 70px 50px',
        gap: 24, padding: '10px 0', borderBottom: `1px solid ${c.rule}`,
      }}>
        <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Alumno</span>
        <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Código</span>
        <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Ejercicios</span>
        <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, textAlign: 'right' }}>Promedio</span>
        <span />
      </div>
      {STUDENTS.map(s => {
        const scoreColor = s.avg === 'E' ? c.ok : s.avg === '+1' ? c.warn : s.avg === '—' ? c.inkMute : c.bad
        return (
          <div
            key={s.code}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 110px 130px 70px 50px',
              gap: 24,
              padding: '18px 0',
              borderBottom: `1px solid ${c.rule}`,
              alignItems: 'center',
            }}
          >
            <div>
              <p className="display" style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{s.name}</p>
              <p style={{ fontSize: 12, color: c.inkMute, margin: '2px 0 0' }}>{s.last}</p>
            </div>
            <span className="mono" style={{ fontSize: 12, color: c.inkSoft, letterSpacing: '0.06em' }}>
              {s.code}
            </span>
            <div>
              <span className="display num" style={{ fontSize: 18, color: c.ink, fontWeight: 500 }}>
                {s.calibrated}
              </span>
              <span className="mono" style={{ fontSize: 12, color: c.inkMute }}>
                {' '}/ {s.total}
              </span>
            </div>
            <span className="mono num" style={{ fontSize: 16, color: scoreColor, textAlign: 'right', fontWeight: 500 }}>
              {s.avg}
            </span>
            <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, textAlign: 'right' }}>
              Ver →
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Exercise card (Hogan-style figure) ────────────────────────────────── */

function ExerciseCard({ c }: { c: typeof LIGHT }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 40, alignItems: 'start' }}>
      <div style={{ position: 'relative', aspectRatio: '3 / 4', background: c.paper2, border: `1px solid ${c.rule}` }}>
        <HoganFigure c={c} />
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <Stamp c={c}>PAR</Stamp>
        </div>
        <div style={{
          position: 'absolute', bottom: 8, left: 12, right: 12,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 10,
        }}>
          <span className="mono small-caps" style={{ color: c.inkMute }}>De perfil · DTL</span>
          <span className="mono small-caps" style={{ color: c.inkMute }}>Frame 38 / 92</span>
        </div>
      </div>

      <div>
        <p className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, margin: 0 }}>
          Postura · Hoyo 03
        </p>
        <h3 className="display" style={{ fontSize: 32, fontWeight: 600, margin: '4px 0 16px', lineHeight: 1.1 }}>
          Inclinación de columna en dirección
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: c.inkSoft, maxWidth: 480, margin: '0 0 24px' }}>
          Calibrado por Tomás Vidal el 14 de mayo. La referencia se construyó sobre 92 frames del clip original.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: `1px solid ${c.rule}`, borderBottom: `1px solid ${c.rule}` }}>
          {[
            { label: 'Ensayos',   value: '12',  color: c.ink },
            { label: 'Mejor',     value: 'E',   color: c.ok },
            { label: 'Promedio',  value: '+1',  color: c.warn },
          ].map((m, i) => (
            <div key={m.label} style={{ padding: '14px 16px', borderLeft: i > 0 ? `1px solid ${c.rule}` : 'none' }}>
              <p className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, margin: 0 }}>{m.label}</p>
              <p className="display num" style={{ fontSize: 28, fontWeight: 600, margin: '4px 0 0', color: m.color }}>
                {m.value}
              </p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Btn c={c} variant="primary">Practicar ahora</Btn>
          <Btn c={c} variant="secondary">Ver historial</Btn>
        </div>
      </div>
    </div>
  )
}

function HoganFigure({ c }: { c: typeof LIGHT }) {
  // Stick golfer at address, side view (dtl). Body in ink, annotation in cognac.
  return (
    <svg viewBox="0 0 120 160" width="100%" height="100%" style={{ display: 'block' }}>
      {/* Reference vertical (cognac dashed) — to show spine angle */}
      <line x1="60" y1="46" x2="60" y2="92" stroke={c.accent} strokeWidth="0.5" strokeDasharray="1.5 1.5" opacity="0.55" />

      {/* Body */}
      <g stroke={c.ink} strokeWidth="0.9" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Head */}
        <circle cx="59" cy="34" r="5" />
        {/* Neck */}
        <line x1="59" y1="39" x2="59" y2="46" />
        {/* Spine (with forward lean) */}
        <line x1="59" y1="46" x2="67" y2="90" />
        {/* Shoulder line */}
        <line x1="55" y1="50" x2="64" y2="50" />
        {/* Arms — straight, hanging to grip */}
        <line x1="60" y1="51" x2="76" y2="90" />
        <line x1="61" y1="51" x2="78" y2="90" />
        {/* Hands (grip) */}
        <circle cx="77" cy="91" r="1.4" fill={c.ink} />
        {/* Hips/pelvis line */}
        <line x1="64" y1="89" x2="71" y2="91" />
        {/* Back leg */}
        <line x1="66" y1="91" x2="62" y2="118" />
        <line x1="62" y1="118" x2="59" y2="140" />
        {/* Front leg */}
        <line x1="69" y1="91" x2="72" y2="118" />
        <line x1="72" y1="118" x2="74" y2="140" />
        {/* Feet */}
        <line x1="55" y1="140" x2="63" y2="140" strokeWidth="1.1" />
        <line x1="70" y1="140" x2="80" y2="140" strokeWidth="1.1" />
      </g>

      {/* Club */}
      <g stroke={c.ink} strokeWidth="0.8" fill="none" strokeLinecap="round">
        <line x1="77" y1="91" x2="100" y2="139" />
        {/* Clubhead */}
        <line x1="98" y1="139" x2="104" y2="141" strokeWidth="2.2" />
      </g>

      {/* Ball */}
      <circle cx="92" cy="140" r="1.8" fill={c.ink} />

      {/* Ground line */}
      <line x1="14" y1="142" x2="108" y2="142" stroke={c.ink} strokeWidth="0.4" opacity="0.5" />

      {/* Spine angle annotation — small arc + label */}
      <path d="M 59,60 A 14 14 0 0 1 63,58" fill="none" stroke={c.accent} strokeWidth="0.7" />
      <text x="64" y="62" fontSize="4.5" fill={c.accent} fontFamily="JetBrains Mono" fontWeight="500">32°</text>

      {/* Pointer line to spine label */}
      <line x1="80" y1="68" x2="68" y2="65" stroke={c.accent} strokeWidth="0.45" />
      <text x="82" y="69" fontSize="4" fill={c.accent} fontFamily="JetBrains Mono" letterSpacing="0.4">
        columna
      </text>

      {/* Ball callout */}
      <line x1="92" y1="138" x2="92" y2="125" stroke={c.accent} strokeWidth="0.45" strokeDasharray="1 1.2" />
      <text x="89" y="123" fontSize="3.8" fill={c.accent} fontFamily="JetBrains Mono" letterSpacing="0.4">
        bola
      </text>
    </svg>
  )
}

/* ─── Yardage Book (weekly scorecard + mini hole map) ───────────────────── */

function YardageBook({ c }: { c: typeof LIGHT }) {
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const rows = [
    { exercise: 'Postura abierta',         par: 'PAR', scores: ['+1', '+1', 'E',  '—',  'E',  '—',  'E'],  total: 'E'  },
    { exercise: 'Apertura de hombros',     par: 'PAR', scores: ['+3', '+2', '+1', '+1', 'E',  '—',  '—'],  total: '+1' },
    { exercise: 'Distribución de peso',    par: 'PAR', scores: ['+5', '+3', '+3', '+2', '+1', '+1', '+1'], total: '+2' },
    { exercise: 'Inclinación de columna',  par: 'PAR', scores: ['E',  'E',  'E',  '+1', 'E',  'E',  '+1'], total: 'E'  },
  ]

  const scoreColor = (s: string) => {
    if (s === 'E') return c.ok
    if (s === '+1') return c.warn
    if (s === '—') return c.inkMute
    return c.bad
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 32, alignItems: 'start' }}>
      {/* Mini hole map decorativo */}
      <div>
        <HoleMap c={c} />
        <p className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, marginTop: 12 }}>
          Semana 19 · 13–19 May
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: c.inkSoft, margin: '12px 0 0' }}>
          La semana del alumno como recorrido. Cuatro hoyos, siete días.
        </p>
      </div>

      {/* Scorecard */}
      <div style={{ border: `1px solid ${c.rule}` }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: `1.6fr 50px repeat(${days.length}, 1fr) 60px`, borderBottom: `1px solid ${c.rule}`, background: c.paper2 }}>
          <div style={{ padding: '10px 14px' }}>
            <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Ejercicio</span>
          </div>
          <div style={{ padding: '10px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
            <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Ref</span>
          </div>
          {days.map((d, i) => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
              <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>{d}</span>
            </div>
          ))}
          <div style={{ padding: '10px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
            <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>Sem</span>
          </div>
        </div>

        {/* Rows */}
        {rows.map((row, ri) => (
          <div key={row.exercise} style={{ display: 'grid', gridTemplateColumns: `1.6fr 50px repeat(${days.length}, 1fr) 60px`, borderBottom: ri === rows.length - 1 ? 'none' : `1px solid ${c.rule}` }}>
            <div style={{ padding: '14px' }}>
              <span style={{ fontSize: 14, color: c.ink }}>{row.exercise}</span>
            </div>
            <div style={{ padding: '14px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
              <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute, letterSpacing: '0.18em' }}>
                {row.par}
              </span>
            </div>
            {row.scores.map((s, i) => (
              <div key={i} style={{ padding: '14px 0', textAlign: 'center', borderLeft: `1px solid ${c.rule}` }}>
                <span className="mono num" style={{ fontSize: 14, color: scoreColor(s), fontWeight: 500 }}>
                  {s}
                </span>
              </div>
            ))}
            <div style={{ padding: '14px 8px', textAlign: 'center', borderLeft: `1px solid ${c.rule}`, background: c.paper2 }}>
              <span className="mono num" style={{ fontSize: 14, color: scoreColor(row.total), fontWeight: 600 }}>
                {row.total}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HoleMap({ c }: { c: typeof LIGHT }) {
  // Decorative aerial sketch of a green with contours, pin and wind arrow.
  return (
    <svg viewBox="0 0 160 200" width="100%" style={{ display: 'block', maxWidth: 160 }}>
      {/* Tee box (bottom) */}
      <rect x="68" y="184" width="24" height="6" fill="none" stroke={c.ink} strokeWidth="0.6" />
      <text x="58" y="198" fontSize="6" fill={c.inkMute} fontFamily="JetBrains Mono" letterSpacing="0.5">
        TEE
      </text>

      {/* Fairway corridor (very subtle) */}
      <path d="M 80,184 C 76,140 90,108 96,76" fill="none" stroke={c.rule} strokeWidth="14" strokeLinecap="round" />

      {/* Green outline — kidney shape, top */}
      <path d="M 80,30 C 60,30 50,50 60,68 C 70,82 100,80 110,64 C 120,50 110,30 90,30 Z"
            fill="none" stroke={c.ink} strokeWidth="0.8" />

      {/* Green contour (inner) */}
      <path d="M 84,40 C 72,42 66,54 74,64 C 84,74 100,68 102,56 C 104,46 96,38 84,40 Z"
            fill="none" stroke={c.ink} strokeWidth="0.4" opacity="0.5" />
      <path d="M 86,48 C 80,50 78,58 84,62 C 92,66 96,58 94,52 C 92,48 90,46 86,48 Z"
            fill="none" stroke={c.ink} strokeWidth="0.4" opacity="0.5" />

      {/* Pin + flag */}
      <line x1="88" y1="38" x2="88" y2="56" stroke={c.ink} strokeWidth="0.7" />
      <polygon points="88,38 96,42 88,46" fill={c.accent} />

      {/* Yardage label */}
      <text x="106" y="44" fontSize="6" fill={c.accent} fontFamily="JetBrains Mono" letterSpacing="0.4" fontWeight="500">
        163y
      </text>

      {/* Wind arrow (top-left) */}
      <g stroke={c.inkMute} strokeWidth="0.6" fill="none">
        <line x1="14" y1="20" x2="34" y2="34" />
        <polyline points="30,30 34,34 30,38" />
      </g>
      <text x="14" y="14" fontSize="5.5" fill={c.inkMute} fontFamily="JetBrains Mono" letterSpacing="0.4">
        SW · 12mph
      </text>

      {/* Distance markers along fairway */}
      <line x1="74" y1="110" x2="86" y2="110" stroke={c.ink} strokeWidth="0.4" />
      <text x="92" y="113" fontSize="5" fill={c.inkMute} fontFamily="JetBrains Mono">100</text>
      <line x1="78" y1="150" x2="86" y2="150" stroke={c.ink} strokeWidth="0.4" />
      <text x="92" y="153" fontSize="5" fill={c.inkMute} fontFamily="JetBrains Mono">50</text>
    </svg>
  )
}

/* ─── Empty state ───────────────────────────────────────────────────────── */

function EmptyState({ c }: { c: typeof LIGHT }) {
  return (
    <div style={{ borderTop: `1px solid ${c.rule}`, borderBottom: `1px solid ${c.rule}`, padding: '64px 0', textAlign: 'center' }}>
      <p className="mono small-caps" style={{ fontSize: 11, color: c.inkMute, margin: 0 }}>
        Sin ensayos registrados
      </p>
      <p className="display" style={{ fontSize: 28, fontWeight: 600, margin: '8px 0 0', color: c.ink }}>
        Pedro todavía no practicó esta semana.
      </p>
      <p style={{ fontSize: 14, color: c.inkSoft, margin: '12px auto 0', maxWidth: 380 }}>
        Cuando grabe su primer ensayo aparecerá aquí, junto con la comparación contra tu referencia.
      </p>
    </div>
  )
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

function Footer({ c }: { c: typeof LIGHT }) {
  return (
    <footer style={{ borderTop: `1px solid ${c.rule}`, paddingTop: 32, marginTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span className="mono small-caps" style={{ fontSize: 10, color: c.inkMute }}>
        parell · cuaderno · ensayo 02
      </span>
      <span className="mono" style={{ fontSize: 10, color: c.inkMute }}>
        — fin —
      </span>
    </footer>
  )
}
