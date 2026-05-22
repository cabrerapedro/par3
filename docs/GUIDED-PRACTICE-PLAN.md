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

## Lo que NO hace (todavía)

- Evaluación automática de la técnica del alumno (la medición 2D no está validada
  — ver `MEASUREMENT-PLAN.md`).
