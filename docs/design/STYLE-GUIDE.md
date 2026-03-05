# par3 — Style Guide

> Versión 1.0 — 2026-03-04

---

## Marca

- **Nombre:** par3 (siempre minúscula, sin espacio)
- **El "3" es siempre en color `ok` (verde)** — ej. `par<span class="text-ok">3</span>`
- **Tagline:** "Practica con la guía de tu profesor"
- **Dominio:** par3.app

### Logo

Pin de bandera minimalista. SVG inline, `currentColor` para compatibilidad dark/light:

```svg
<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4"
     strokeLinecap="round" strokeLinejoin="round">
  <line x1="18" y1="5" x2="18" y2="28"/>
  <polygon points="18,5 28,10 18,15" fill="currentColor" opacity="0.3" stroke="currentColor"/>
  <ellipse cx="18" cy="30" rx="7" ry="2.5" opacity="0.5"/>
</svg>
```

---

## Colores

### Sistema de identidad

| Elemento | Color | Uso |
|----------|-------|-----|
| Instructor | Verde (`#34d178` / `text-ok`) | Cards, CTAs, acciones del instructor |
| Alumno | Azul (`#60a5fa` / `text-blue`) | Cards, CTAs, acciones del alumno |
| OK / Bien | Verde (`text-ok`) | Estado correcto en análisis de postura |
| Advertencia | Ámbar (`text-warn`) | Ajuste necesario |
| Error | Rojo (`text-bad`) | Fuera de rango, error |

### Tokens de color

```
bg-bg       — Fondo de página (#09090b dark / #fff light)
bg-s1       — Card / surface elevado (#111113 dark)
bg-s2       — Input / surface secundario (#1c1c1f dark)
bg-s3       — Hover state (#28282c dark)
border-border — Borde por defecto
text-txt    — Texto principal
text-muted  — Texto secundario / muted-foreground
text-dim    — Placeholder / deshabilitado
text-ok / bg-ok / border-ok — Verde
text-warn / bg-warn / border-warn — Ámbar
text-bad / bg-bad / border-bad — Rojo
text-blue / bg-blue / border-blue — Azul
```

**Regla:** La información nunca depende solo del color. Siempre acompañar con icono o texto.

---

## Tipografía

| Rol | Font | Peso | Tamaño | Uso |
|-----|------|------|--------|-----|
| Display | DM Serif Display | 400 | 42px | Solo títulos hero de landing |
| Heading | DM Sans | 700 | 22px | Títulos de sección, headers de página |
| Title | DM Sans | 600 | 18px | Títulos de card |
| Body | DM Sans | 400–500 | 16px | Texto principal |
| Caption | DM Sans | 400 | 13px | Etiquetas, metadatos (mínimo absoluto) |
| Mono | JetBrains Mono | 400 | 14px | Números, códigos, datos técnicos |

**Reglas:**
- **Mínimo 15px para body text** — usuarios de 40-60 años
- **Nunca menos de 13px** para ningún texto visible
- El display font (DM Serif Display) solo en heroes — no en formularios ni UI funcional
- Usar `font-mono` para scores (%), códigos de acceso, timestamps

---

## Componentes

### Cards

```
bg-s1 border border-border rounded-[20px] p-6
hover: border-ok/40 bg-s3/50 (instructor)
hover: border-blue/40 bg-s3/50 (alumno)
shadow en light mode: shadow-md
Entrada: animate-fade-up, stagger 150ms entre items
```

### Botones

```
Altura mínima: 48px (touch target)
Padding: px-5 py-3 (primary), px-4 py-2.5 (secondary)
Primary instructor: bg-ok text-black font-semibold rounded-xl
Primary alumno: bg-blue text-white font-semibold rounded-xl
Ghost: border border-border text-txt hover:bg-s3
Disabled: opacity-40 cursor-not-allowed
```

### Inputs / Formularios

```
Altura mínima: 48px
Border: border-border, focus: border-ok ring-ok/20
Background: bg-s2 (dark) / bg-s2 (light)
Label: SIEMPRE visible encima, text-muted text-sm, mb-1.5
Placeholder: Solo hint secundario, nunca el único label
Error: text-bad text-sm mt-1, con icono
```

### Iconos

```
Librería: Lucide (via lucide-react)
Contenedor: w-14 h-14 rounded-2xl bg-ok/10 border border-ok/20
Icono dentro: text-ok, tamaño 22-24px
Para alumno: bg-blue/10 border-blue/20, text-blue
```

### Pills / Badges

```
rounded-full px-2.5 py-0.5 text-xs
ok: bg-ok/10 border border-ok/20 text-ok
warn: bg-warn/10 border border-warn/20 text-warn
bad: bg-bad/10 border border-bad/20 text-bad
```

---

## Layout

| Contexto | Max width |
|----------|-----------|
| Formularios / auth | max-w-md (448px) |
| Vistas de contenido | max-w-2xl (672px) |
| Dashboards | max-w-7xl (1280px) |

- Padding horizontal base: `px-4` mobile, `px-6` tablet, `px-8` desktop
- Padding de página: `py-8` entre header y contenido
- Entre secciones: `gap-y-12` o `mb-12`
- Cards en grid: `gap-3` o `gap-4`

---

## Animaciones

| Animación | Clase | Descripción |
|-----------|-------|-------------|
| Entrada de página | `animate-fade-up` | opacity 0→1 + translateY 20px→0, 0.8s ease-out |
| Cards escalonadas | `animation-delay-[150ms]`, `[300ms]`... | Entrada stagger 150ms entre items |
| Hover de card | `transition-all duration-300` | Border + bg |
| Tema | transition en `:root` | background + color 400ms |

**Regla:** Animaciones siempre sutiles. Premium = restringido.

---

## Accesibilidad

- **Touch targets ≥ 48px** en TODO elemento interactivo — innegociable
- **Texto ≥ 15px** para body
- Focus-visible: `outline-2 outline-primary outline-offset-2`
- Contraste mínimo WCAG AA para todo texto visible
- La información nunca depende solo del color

---

## Naming en UI (español)

| Concepto técnico | UI visible |
|-----------------|------------|
| `checkpoint` | Ejercicio |
| `baseline` | Tu referencia / Tu postura de referencia |
| `calibration` | Calibración |
| `practice_session` | Sesión de práctica |
| `instructor` | Instructor |
| `student` | Alumno |
| `camera_angle: face_on` | De frente |
| `camera_angle: dtl` | De perfil |

---

## Copy

**Verbos del usuario, no jerga técnica:**
- "Graba tu swing" no "Iniciar análisis de video"
- "Practica" no "Ejecutar comparación con baseline"
- "Mirá tu postura" no "Smart Mirror"

**Para personas mayores — sé explícito:**
- "Ingresa el código de 6 letras que te dio tu instructor" no "Ingresar con código"
- "Volver a tus ejercicios" no solo "← Volver"

**Framing positivo:**
- "Tu columna mejoró un 12%" no "Tu columna estaba mal antes"
- "Ajusta un poco la columna" no "Error en columna"

**Un solo CTA principal por sección.** El botón más importante es el más grande.

**Idioma:** Español de España. Excepciones: texto técnico en código (inglés).
