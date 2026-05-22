# Plan de práctica guiada del alumno — camino al "aha"

> **Documento de dirección, no de spec.** La fuente de verdad sigue siendo
> `CLAUDE.md` (lo construido). Hermano de
> [`docs/MEASUREMENT-PLAN.md`](./MEASUREMENT-PLAN.md): aquel es la capa de
> *medición confiable*; este es la capa del *loop humano* (estructurar la
> práctica a partir del contenido del profe, sin necesidad de medición precisa).
>
> Estados: ✅ hecho · 🔜 próximo · ❌ no construido · ❓ decisión abierta.
> Última actualización: 2026-05-22.

---

## El problema (en palabras del alumno)

- Hoy: clase de 1–2 h, el profe toma ~2 grabaciones, dibuja y explica en su
  escritorio. Al día siguiente el alumno **no se acuerda** y, sin guía, "tira
  bolas" sin rumbo.
- El producto **ya resuelve lo más grande**: abrir la app, ver el clip con el
  dibujo + la voz del profe, y saber qué practicar. (Eso ya funciona.)
- Falta: **guía de cómo estructurar la práctica** (calentamiento / orden) y un
  **refuerzo** — sin pisar al profe ni inventar técnica.

## Principio de diseño

Pedirle al profe **lo mínimo posible**; **nunca inventar** técnica; el instructor
es **siempre** la autoridad; la IA solo **organiza y redacta** contenido que el
profe ya generó.

---

## Modelo de 3 capas

### Capa 1 — Estructura / calentamiento → **estándar de la app**
Higiene de práctica **genérica** (no técnica), que ningún instructor discute.
MVP: **un solo** calentamiento genérico (luego se puede diferenciar por tipo).
- Movilidad + swings suaves (calentar).
- Empezar corto: wedges / medios swings → chips y pitches.
- Subir gradual hasta swing completo / driver.
- Practicar **con intención**: un foco por vez, rutina de pre-shot, **calidad >
  cantidad**.
- "Ahora estás listo → vamos a lo tuyo" (los clips del profe).
- Terminar en un buen tiro.
- **Salteable.** Es higiene genérica, **no instrucción de swing**, y el contenido
  del profe **siempre tiene prioridad**.

### Capa 2 — Qué corregir por ejercicio → **clips del profe**
Ya capturado, **cero esfuerzo extra**: el dibujo + la voz que el profe graba al
anotar. La IA transcribe (Whisper) y lo **redacta** como *foco + auto-chequeo*
("qué sentir"). 
- Fallback si la transcripción sale ruidosa/vacía: mostrar el **dibujo + audio
  crudo** para que el alumno lo escuche directo. **Nunca fabricar.**

### Capa 3 — Conclusión de la clase → **audio opcional del profe**
Un cierre **humano** que **refuerza y ata** lo de los clips ("hoy laburamos
bisagra de cadera y tempo; esta semana sentí la bisagra; vas mejorando").
- **Opcional y frictionless.** Si no lo graba, la sesión igual funciona.
- **Ideal para clases grupales**: una sola nota sirve para **todo el grupo**
  (excelente relación esfuerzo/valor).

---

## Cómo se arma la sesión guiada

- **Default (cero ask):** Capa 1 (estándar) + Capa 2 (clips de la última clase,
  en orden).
- **Si hay Capa 3:** se muestra arriba como **marco de la semana**.
- La IA organiza/redacta; el alumno **siempre ve que viene de su profe**
  (transparente — coherente con la decisión de "journey co-diseñado, no
  algoritmo opaco").

## Guardrails

- La IA **nunca** da corrección técnica propia ni contradice al profe.
- Sin contenido del profe → **no** hay "recomendación" inventada (solo el clip +
  el video).
- La capa estándar es **higiene genérica**, no instrucción de swing.
- El espejo + la comparación de pose siguen como **ayuda visual**, no puntaje,
  hasta validar la medición (ver `MEASUREMENT-PLAN.md`).

---

## Síntesis y render

**Cuándo:** la fusión se hace **una vez, al guardar** (clip / cierre de clase) y
se **persiste** — como ya hacemos con `baseline_summary`. El alumno solo
**renderiza** algo ya listo (rápido, barato, offline).

**Qué genera la IA (extraer → ficha mínima, redactando al profe):**
- Por clip: un **foco de 1 línea** + **2-3 puntos de "qué sentir / chequear"**,
  desde la transcripción (Whisper) + la nota. Los artefactos crudos (dibujo,
  audio, video) **no se resumen** — quedan como **fuente**.
- Por clase: una línea de **"foco de la semana"** desde la conclusión (Capa 3).

**Cómo se consume — revelado progresivo (no mostrar todo junto):**
1. **Vistazo:** la sesión es una lista corta de *focos*, uno por ejercicio.
2. **Hacer:** tocar un ejercicio → dibujo del profe + foco + checklist + botón
   *Practicar*.
3. **Fuente (a un toque, nunca encima):** *"Escuchar a tu profe"* (audio crudo)
   + *"Ver el clip"*.

Ejercicios como **tarjetas discretas**, no prosa mezclada; la línea de la semana
arriba da el hilo. Fallbacks: transcripción mala → *"mirá el video y el dibujo"*;
sin contenido del profe → solo video/dibujo. **Nunca inventar.**

## Estado / fases

- 🔜 **Capa 1** — calentamiento estándar (uno genérico).
- 🔜 **Capa 2** — redactar *foco + checklist* desde la transcripción del clip
  (usa la Claude API que ya tenemos: `/api/baseline-summary`, `/api/transcribe`).
- 🔜 **Capa 3** — audio de conclusión opcional (individual + grupo).

## Decisiones abiertas

- ❓ ¿Calentamiento diferenciado por tipo (día de swing vs juego corto/putting)
  más adelante? (MVP: uno solo.)
- ❓ ¿El profe puede personalizar / override el calentamiento estándar?
- ❓ La conclusión **por grupo** probablemente necesite un modelo de "grupo" en
  los datos (hoy la relación es profe → alumno individual).

## Infraestructura

**Todo corre en Vercel — no hace falta AWS** (ni para este plan ni para el MVP):
- Pose / MediaPipe → **en el dispositivo** (cliente), no en el server.
- Transcripción (Whisper) y redacción (Claude) → **APIs externas** llamadas desde
  funciones serverless de Vercel (ya existen `/api/transcribe` y
  `/api/baseline-summary`). ~1 llamada por clip al guardar, dentro de los límites
  de Vercel (`maxDuration`).
- Datos + storage → Supabase.
- Síntesis al guardar: inline alcanza para el MVP (como `baseline_summary`); si se
  quiere async, Vercel tiene `after()` o una cola (p. ej. QStash / Inngest) —
  sigue sin AWS.

**Única excepción futura:** el **modelo propio de ML (Fase 3 del roadmap)** —
entrenar / servir un modelo de movimiento es trabajo de GPU, fuera de Vercel; se
resolvería con un servicio de GPU gestionado (no necesariamente AWS) y recién
cuando haya volumen de datos. No es ahora.

## Lo que NO hace (todavía)

- Evaluación automática de la técnica del alumno (la medición 2D no está validada
  — ver `MEASUREMENT-PLAN.md`).
