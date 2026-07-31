# Roadmap — próximos releases

> Actualizado: julio 2026. Items acordados con Pedro y aplazados a propósito;
> el contexto técnico de cada uno ya está analizado (ver notas) para no
> re-descubrirlo al retomarlos.

## 1. Guardar el vídeo del intento del alumno — `M`

Hoy la práctica del alumno guarda landmarks y evaluación, pero **descarta el
vídeo**. El spec (CLAUDE.md, flujo del sábado) dice que el instructor debe
poder reproducir los intentos para dar feedback específico en clase.

- Reutilizar la cola de subida en segundo plano (`lib/clipSaveQueue.ts`) y la
  subida resumable TUS (`lib/tusUpload.ts`) — hacen el ~80% del trabajo.
- Detalle clave: el alumno **no tiene sesión de Supabase Auth** (código +
  rol anon). La subida TUS necesita adaptarse al token anónimo y hay que
  revisar la política del bucket `practice-videos`.
- Añadir el reproductor en "Intentos del alumno" del detalle de clip del
  instructor (la sección ya existe, con el 👍/👎).

## 2. Swing lado a lado por fases — `M`

El swing no tiene espejo en tiempo real (físicamente imposible con MediaPipe
lite). Su equivalente: tras grabar el intento, mostrar las 4 fases (address /
top / impacto / finish) del alumno **en pares** con las del profesor.

- `detectSwingReps` ya devuelve `frame_index` por fase y por repetición;
  falta extraer los stills de ambos vídeos (seek + canvas) y la UI de pares.

## 3. Fase 2 del espejo — el fantasma del profesor — `L`

Silueta semitransparente de la pose calibrada del profesor superpuesta al
alumno en el espejo ("métete en la silueta"). Viable gracias a las zonas
marcadas del range (encuadre reproducible).

- Al calibrar, guardar una pose de referencia (frame estable mediano del
  clip; `selectStableFrames` ya identifica el tramo) en la fila del clip.
- En el espejo: escalar por torso y anclar a la cadera del alumno.
- Lo delicado es que la alineación "se vea bien" — requiere 2-3 iteraciones
  con iPad real en el range. No construir sin dispositivo a mano.

## 4. Fase 3 del espejo — feedback por audio — `M`

Con el dispositivo en la zona marcada a metros, el alumno no puede leer la
pantalla en postura. Cues de voz/tono al cambiar el estado + confirmación al
mantener verde ~2 s.

- Web Speech API / beeps con debounce sobre los checks suavizados del espejo.
- Riesgo conocido: iOS Safari y audio sin interacción del usuario — arrancar
  el audio desde el gesto de inicio de sesión de práctica. Probar en iPhone.

## 5. Validación de la medición (continuo)

El 👍/👎 del instructor sobre cada intento (ya desplegado, columna
`instructor_feedback`) va acumulando labels. Cuando haya volumen:

- comparar el semáforo con el criterio del instructor,
- ajustar umbrales (±1σ/±2σ, floors) por métrica,
- decidir si los scores pueden pesar más en la UI del alumno
  (hoy: engagement-first, ver memoria "measurement not validated").

## Deuda técnica menor

- Los clips calibrados antes de las métricas v2 siguen en v1 hasta
  regrabarse (badge "Calibración antigua" ya visible en el detalle).
- `app/api/baseline-summary` aún escribe en la tabla legacy `checkpoints`
  cuando recibe `checkpointId`; limpiar cuando muera el flujo legacy.
- `mirror`/`practice` PoC genéricos (`app/mirror`, `app/analysis`) usan
  tokens viejos; borrar cuando se confirme que nadie los usa.

## Recordatorio operativo

Cada release que toque `supabase/schema.sql` requiere **re-ejecutar el
archivo en el SQL editor de Supabase** (todo es idempotente). El último
cambio añadió `instructors.access_code` y
`practice_sessions.instructor_feedback`.
