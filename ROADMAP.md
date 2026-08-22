# Roadmap — próximos releases

> Actualizado: julio 2026. Items acordados con Pedro y aplazados a propósito;
> el contexto técnico de cada uno ya está analizado (ver notas) para no
> re-descubrirlo al retomarlos.

## 0. Desactivado para el piloto — reactivar con su arreglo

**Login del alumno por email (OTP)** — oculto tras `EMAIL_LOGIN_ENABLED` en
`app/student/login/page.tsx`, y la captura de email de `student/journey`
igualmente oculta. Estaba roto de punta a punta:

- `app/api/student/send-otp/route.ts` y `verify-otp/route.ts` construyen el
  cliente con la **anon key** en vez de `SUPABASE_SERVICE_ROLE_KEY`. Desde el
  endurecimiento de RLS de julio, `students_anon_select` exige
  `current_student_id()`, que una ruta de servidor no puede aportar → el
  lookup nunca encuentra al alumno → cae en la rama anti-enumeración y
  responde `{sent:true}` sin enviar nada. El alumno espera un código que no
  llega.
- Arreglo: usar el service role en ambas rutas (como hace
  `api/instructor/code-login`), y **verificar el envío real por Resend** antes
  de reactivar. No se pudo verificar antes del piloto.
- La política `student_otps_anon_all` ya se eliminó del schema; con service
  role las rutas no la necesitan.

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

## 6. Privacidad — completar a la vuelta

En el piloto se hizo el **mínimo**: se eliminó la enumeración de Storage (el
anon ya no puede listar objetos), hay casilla de consentimiento al crear
alumno y existe `/privacidad`. Queda lo estructural:

- **URLs firmadas**: los buckets siguen siendo `public = true`, así que quien
  tenga la URL exacta descarga sin credencial. Migrar a buckets privados +
  `createSignedUrl` en todos los puntos de reproducción (vídeo de clip, audio
  de anotación, snapshots, avatares).
- **Borrado real de ficheros**: no existe una sola llamada `.remove()` en el
  repo ni política DELETE sobre `storage.objects`. Borrar un alumno o un clip
  deja sus vídeos huérfanos para siempre. Es requisito del art. 17 RGPD y hoy
  está *impedido*, no solo sin implementar. La página de privacidad lo declara
  honestamente ("borrado manual a petición") — corregir ese párrafo al
  implementarlo.
- **Términos de servicio**: el pie de la landing ya no los enlaza; escribirlos
  antes de cobrar.
- Revisar `students.notes` (notas privadas del instructor) viajando al móvil
  del alumno vía `login_student` → `select *`. Acotar columnas.

## 7. Otras cosas vistas en la auditoría (no bloqueantes)

- `Math.random()` para códigos de acceso (alumno e instructor) — pasar a
  `crypto.getRandomValues`; y `generateCode()` está duplicado en tres ficheros.
- Endpoints LLM sin auth (`/api/practice-card`, `/api/transcribe`): cualquiera
  puede quemar créditos, y practice-card acepta `annotationId` arbitrario y
  escribe con service role.
- 12 sitios usan `Intl.DateTimeFormat(undefined, …)` → fechas en el idioma del
  navegador, no el de la app. Y `student/clip/[id]/history` usa `es-MX`.
- Prompt de `api/practice-card` en voseo rioplatense ("Sos", "devolvé") — el
  texto que lee el alumno sale en voseo pese a que `es.json` es peninsular.
  Además ningún prompt LLM recibe el locale (un alumno en inglés recibe
  español).
- iOS: la sesión del alumno es solo `localStorage`; ITP la borra a los 7 días
  sin uso en Safari. Instalar la PWA lo evita — hacerlo con el alumno delante.
- Falta `viewport-fit: cover` + safe-area en las pantallas a sangre completa.
- El chequeo de detección del reintento (`clips/[clipId]`) deriva la duración
  del propio número de frames, así que el umbral nunca dispara.
- Pestaña "plan" del alumno en blanco si tiene clips pero ningún plan.

## 8. Auditoría de inteligencia del análisis (ago 2026) — lo aplazado

Implementado en el release "análisis más inteligente": suelos de ruido por
métrica + puertas de confianza (`_meta` en results), anotaciones como
prioridad (`_focus`), modelo completo en batch, two-pass de impacto + señal
per-rep en swing, upgrade v1→v2 desde `clip_frames`, calibración `_k` con los
👍/👎, trail_arm por mano dominante, prompts con locale y sin voseo.

Evaluado y aplazado a propósito:

- **Landmarks 3D (`poseWorldLandmarks`)**: empezar a GUARDARLOS ya en
  clip_frames/session_frames (columna aditiva, filosofía "capturar todo") y
  migrar los ángulos a `_v3` SOLO si los datos demuestran menos varianza
  inter-sesión — la z monocular es lo más ruidoso de MediaPipe. Sin captura
  previa no hay upgrade retroactivo posible.
- **Inteligencia temporal en posición**: duración de mantenimiento ("aguantaste
  la posición 6 s"), reps de posición (los tramos estables SON las
  repeticiones; hoy `selectStableFrames` aplana los runs) y tendencia
  intra-sesión con ≥3 tramos. Traducido a lenguaje, nunca más números.
- **Bandas asimétricas**: la baseline guarda `min/max` y nadie los usa; con la
  dirección de la corrección del instructor (extraíble de `_focus` +
  transcript) una banda [μ−1σ, μ+2σ] orientada es implementable.
- **Tempo del swing**: ya se captura en `results._meta.tempo` (two-pass), pero
  NO se muestra al alumno hasta validarlo contra vídeo a cámara lenta
  (CLAUDE.md lo prohíbe con razón hasta entonces).
- **Espejo**: filtrar los VALORES de métrica (no solo el skeleton y los
  estados) para transiciones menos nerviosas cerca del borde de banda.
- **Transcripción retroactiva**: cuando OPENAI_API_KEY esté en Vercel, las
  anotaciones antiguas con audio y sin transcript se pueden backfillear (y
  regenerar `_focus`/resúmenes con la voz incluida).
- **Retry del detalle de clip**: la recalibración manual no aplica `_focus` ni
  el two-pass de swing (usa el camino coarse). Unificarla con la cola.

## 9. Solidez del motor (ago 2026) — hecho y pendiente

Hecho: motor autoalojado (`public/mediapipe`, copiado en `postinstall`, con
fallback a CDN) y precacheado por el service worker → funciona sin red tras
el primer uso; telemetría `analysis_events` en cola, práctica, upgrade y
calibración; captura de `world_landmarks` (3D) en ambas tablas de frames;
suite de tests con fixtures reales lista para activarse.

Pendiente, y requiere la tarde de validación (`docs/VALIDACION-MOTOR.md`):
- **Fixtures reales**: los clips almacenados hoy son pruebas de escritorio sin
  piernas en plano (visibilidad de cadera/rodilla/tobillo ≈ 0). En cuanto haya
  clips de cuerpo entero: `node scripts/export-fixtures.mjs` y la suite
  `realFixtures.test.ts` se activa sola.
- **Constantes medidas en vez de elegidas**: suelos de ruido, umbral de
  quietud, bandas del detector de swings, ventana del segundo pase.
- Re-ejecutar `supabase/schema.sql` (tabla `analysis_events` + columnas
  `world_landmarks`). Sin ello: la telemetría falla en silencio (por diseño) y
  los frames se guardan solo en 2D (fallback automático).
