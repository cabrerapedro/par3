# Plan de medición — camino al "aha moment"

> **Documento de dirección, no de spec.** La fuente de verdad del producto sigue
> siendo `CLAUDE.md` (describe lo que **está** construido). Esto es hacia dónde
> vamos con la comparación profe ↔ alumno y por qué.
>
> Estados: ✅ hecho · 🔜 próximo · ❌ no construido · ❓ decisión abierta.
> Última actualización: 2026-05-22.

---

## El aha que buscamos

Que el alumno practique entre clases con **la corrección exacta de su profe**, se
vea a sí mismo, y mejore — y que el profe pueda seguirlo sin estar ahí.

---

## Dónde estamos hoy (honesto)

**Base sólida y confiable — es el motor del aha _ahora_:**
- ✅ Referencia del profe: video + dibujo + voz, reproducible cuantas veces quiera.
- ✅ Espejo: el alumno se ve y compara **visualmente** contra esa referencia.
- ✅ Loop semanal: el profe ve qué practicó el alumno.
- ✅ Se guardan todos los landmarks (clip del profe + intento del alumno) para ML futuro.

**Lo que TODAVÍA no es confiable — no apoyar el aha acá aún:**
- ❌ Comparación métrica automática "precisa". Por qué:
  - **Es 2D con una sola cámara.** El setup (distancia / ángulo / altura / zoom)
    contamina los ángulos: la *misma* postura da landmarks distintos entre el
    setup del profe y el del alumno → "diferencias" que son ruido, no técnica.
  - **Baseline estadísticamente débil** (clip corto, pocas reps); las bandas
    1σ/2σ (verde/amarillo/rojo) se apoyan en eso.
  - **El swing es mucho más difícil que la postura** (alinear fases en el tiempo;
    motion blur / oclusión hacen frágil la detección de fases).
  - **MediaPipe no ve** grip, cara del palo, ángulos de muñeca, tempo, peso real,
    calidad de impacto — justo lo que más le importa al instructor.
- Por eso ya decidimos: **mostrar engagement, no scores como verdad**
  (ver memoria del proyecto "Measurement not validated").

---

## Fases hacia una medición confiable

1. 🔜 **Estandarizar la captura** (mayor impacto). Guía de encuadre / alineación
   para que el alumno reproduzca el setup del profe. Sin esto, ninguna
   matemática alcanza.
2. 🔜 **Apoyarse en métricas de ángulo** (columna, rodilla, codo: más invariantes
   a la cámara) y bajar el peso de las de posición (head_lateral, hip_sway).
3. 🔜 **Validar contra el juicio del profe** (ver `docs/07-VALIDATION-ROADMAP.md`):
   ¿el verde/amarillo/rojo coincide con lo que diría el instructor en clips
   reales? Recién ahí mostrar la medición como señal.
4. 🔜 **Postura antes que swing.** Clavar address / postura estática (2D más
   tratable) antes de atacar el swing.

---

## Decisiones abiertas

- ❓ **Skeleton de MediaPipe:** opt-in y secundario (más para *calidad de captura*
   que para vender precisión). No hacerlo protagonista — un overlay corrido
   rompe la confianza y promete una precisión que aún no tenemos.
- ❓ ¿El aha v1 se apoya 100% en el **loop humano** (referencia + espejo + semana)
   mientras la medición madura?
- ❓ ¿Mostrar alguna vez un score numérico al alumno, o siempre traducir a lenguaje
   corporal? (hoy: lenguaje corporal, sin números — por spec.)

---

## Principios que no cambian (de `CLAUDE.md`)

- El instructor es **siempre** la autoridad.
- Una sola instrucción a la vez, en positivo, **sin números** para el alumno.
- Skeleton **opt-in**, nunca por default.
- Guardar landmarks de todos los frames, siempre.
