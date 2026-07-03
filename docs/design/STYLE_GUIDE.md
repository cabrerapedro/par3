# forat.golf — Style Guide

> Versión 2.0 — Mayo 2026
> Actualizado desde Sweep v1.0

---

## Marca

- **Nombre:** forat.golf (siempre minúscula, con el dominio como nombre completo)
- **Pronunciación:** "pa-rell" — viene de "par" en catalán
- **Tagline ES:** "Practica con la guía de tu profesor"
- **Tagline EN:** "Practice with your coach's guidance"
- **Dominio:** forat.golf

### Logo

Arco de golf minimalista. El punto final del arco representa la pelota. SVG inline, `currentColor`:

```svg
<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
  <path d="M6 30 Q6 6 30 6" />
  <circle cx="30" cy="6" r="2.8" fill="currentColor" stroke="none" />
</svg>
```

### Color del logo

Siempre en el color `ok` (verde de la marca). Nunca en gris ni en negro.

---

## Sistema de colores

### Identidad por usuario

| Elemento | Color | Uso |
|----------|-------|-----|
| Instructor | Verde (`text-ok`, `#34d178` dark / `#16a34a` light) | Cards, CTAs, acciones del instructor |
| Alumno | Azul (`text-blue`, `#60a5fa` dark / `#1d4ed8` light) | Cards, CTAs, acciones del alumno |

### Tokens

```
bg-bg       — Fondo de página
bg-s1       — Card / surface primario
bg-s2       — Surface secundario / input
bg-s3       — Hover state
border-border — Borde por defecto
text-txt    — Texto principal
text-muted  — Texto secundario
text-dim    — Placeholder / deshabilitado
text-ok     — Verde (instructor, correcto)
text-warn   — Ámbar (ajustar)
text-bad    — Rojo (corregir)
text-blue   — Azul (alumno, info)
```

**Regla:** la información nunca depende solo del color. Siempre acompañar con ícono o texto.

### Dark mode (default) / Light mode (toggle)

Dark mode es el default. El light mode está optimizado para legibilidad en exteriores (rango de golf, sol).

---

## Tipografía

| Rol | Font | Peso | Tamaño mínimo |
|-----|------|------|---------------|
| Display | DM Serif Display | 400 | 36px — solo heroes |
| Heading | DM Sans | 700 | 22px |
| Title | DM Sans | 600 | 18px |
| Body | DM Sans | 400-500 | 15px |
| Caption | DM Sans | 400 | 13px — mínimo absoluto |
| Mono | JetBrains Mono | 400 | 13px — datos técnicos, códigos |

**Regla:** mínimo 15px para cualquier texto que el usuario deba leer. El instructor y muchos alumnos tienen 40-60 años.

---

## Componentes

### Cards

```
bg-s1 border border-border rounded-[20px] p-6
hover instructor: border-ok/40 bg-s3/50
hover alumno: border-blue/40 bg-s3/50
shadow en light mode: shadow-md
Entrada: animate-fade-up
```

### Botones

```
Altura mínima: 48px (touch target)
Primary instructor: bg-ok text-on-ok font-semibold rounded-xl
Primary alumno: bg-blue text-white font-semibold rounded-xl
Ghost: border border-border text-txt hover:bg-s3
Disabled: opacity-40 cursor-not-allowed
```

### Canvas de anotación

```
Overlay sobre el video, full-width
Fondo: transparente
Strokes: 
  - Línea libre: strokeWidth 3px, color seleccionable
  - Flecha: igual + punta
  - Círculo: strokeWidth 2px
  - Colores disponibles: rojo (#ef4444), amarillo (#f59e0b), verde (#34d178), blanco
Cursor: crosshair en desktop, dedo en touch
Botón "Anotar": mínimo 56px, posición fija abajo derecha del video
Botón "Listo": bg-ok, mínimo 48px
Botón "Borrar último trazo": ghost, arriba derecha del canvas
```

### Indicadores de postura (alumno)

```
Estado OK:    círculo verde sólido + checkmark
Estado WARN:  círculo amarillo sólido + flecha direccional
Estado BAD:   círculo rojo sólido + flecha direccional
Tamaño: 48px en teléfono, 64px en tablet
Siempre visible mientras la cámara está activa
```

### Instrucción única (alumno en espejo)

```
Posición: bottom center, sobre el video
Fondo: bg-black/70 backdrop-blur
Texto: text-txt text-base font-medium
Máximo: 2 líneas de texto
Nunca mostrar más de una instrucción simultánea
```

---

## Layout

| Contexto | Max width |
|----------|-----------|
| Auth / formularios | max-w-sm (384px) |
| Formularios medianos | max-w-2xl (672px) |
| Dashboards | max-w-7xl (1280px) |
| Canvas de anotación | full-width |

- Padding horizontal: `px-4` mobile, `px-6` tablet, `px-8` desktop
- Touch targets mínimos: 48px siempre

---

## i18n

Todos los textos visibles en archivos de traducción. Nunca strings hardcodeadas en componentes.

Estructura:
```
/messages
  /es.json
  /en.json
```

Idioma por defecto: según el idioma del navegador. Fallback: español.

**Strings de feedback al alumno:** siempre en el idioma del alumno, no del instructor.

**Strings técnicas** (nombres de métricas en logs, schemas de base de datos): inglés siempre.

---

## Naming en UI

| Concepto técnico | ES | EN |
|-----------------|-----|-----|
| `clip` | Video / Clip | Clip |
| `class` | Clase | Session |
| `baseline` | Tu referencia | Your reference |
| `practice_session` | Práctica | Practice |
| `instructor` | Instructor / Profe | Coach |
| `student` | Alumno | Student |
| `face_on` | De frente | Face-on |
| `dtl` | De perfil | Down-the-line |
| `annotation` | Anotación | Annotation |

---

## Copy

**Positivo siempre:**
- ✅ "Inclinarte un poco más desde las caderas"
- ❌ "Tu columna está mal"
- ✅ "Ajusta la posición de los hombros"
- ❌ "Error en hombros"

**Explícito para no técnicos:**
- ✅ "Ingresá el código de 6 letras que te dio tu instructor"
- ❌ "Ingresar con código"

**Sin jerga técnica para el alumno:**
- ✅ "Tu columna está más derecha que en tu video de referencia. Inclinarte más."
- ❌ "Spine angle: 35.2°, expected: 29.1° ±2.3°"

**Una sola cosa a la vez:**
- Nunca mostrar 3 correcciones simultáneas. Priorizar la más importante.

---

## Animaciones

| Animación | Uso |
|-----------|-----|
| `fade-up 0.8s ease-out` | Entrada de página |
| `transition-all duration-300` | Hover de cards y botones |
| `transition background 0.4s` | Cambio de tema |
| `animate-pulse` | Indicador de grabación activa |

Sin animaciones en pantallas con análisis en tiempo real (espejo, calibración). Performance primero.
