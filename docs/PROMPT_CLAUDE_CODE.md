# forat.golf — Prompt para Claude Code

> Este documento describe todos los cambios a implementar para migrar de Sweep a forat.golf.
> Leer el CLAUDE.md completo antes de empezar. Cada decisión técnica tiene una razón.
> Trabajar en el orden de las secciones. No saltear pasos.

---

## Contexto

Esta app era "Sweep". Ahora se llama **forat.golf**. El stack técnico no cambia (Next.js 15 + Supabase + MediaPipe + Tailwind v4). Lo que cambia es el modelo de datos, el flujo del instructor, la pantalla principal del alumno, y se agrega un canvas de anotación vectorial.

Lee el CLAUDE.md antes de empezar. Todas las decisiones están explicadas ahí.

---

## 1. Renombrar el producto

**Objetivo:** Reemplazar todas las referencias a "Sweep" por "forat.golf".

**Qué cambiar:**
- `app/layout.tsx`: metadata title y description
- `manifest.json`: name y short_name
- Todos los componentes que muestran el nombre "Sweep" en UI
- El logo SVG se mantiene igual, solo cambia el nombre que lo acompaña
- El tagline pasa a ser: ES → "Practica con la guía de tu profesor" / EN → "Practice with your coach's guidance"
- Dominio en footer y metadata: `forat.golf`

**No cambiar:** nombres de variables internas, nombres de tablas en Supabase, nombres de archivos. Solo lo visible en UI.

---

## 2. Implementar i18n con next-intl

**Objetivo:** Toda string visible en UI debe estar en archivos de traducción. Nunca hardcodeada en componentes.

**Por qué:** Es una decisión de día 1. Retrofitear i18n después es costoso y propenso a errores.

**Pasos:**

1. Instalar `next-intl`.

2. Crear estructura:
```
/messages
  es.json
  en.json
```

3. Configurar next-intl en `next.config.ts` y `app/layout.tsx`.

4. Detectar idioma del navegador automáticamente. Fallback: español.

5. Migrar todas las strings hardcodeadas de todos los componentes a los archivos de traducción. Empezar por las pantallas más usadas:
   - `app/page.tsx` (landing)
   - `app/instructor/login/page.tsx`
   - `app/student/login/page.tsx`
   - `app/student/journey/page.tsx`
   - `app/instructor/dashboard/page.tsx`

6. Las strings de feedback al alumno (mensajes de postura, instrucciones) tienen que estar en ambos idiomas con el mismo tono positivo.

7. Las strings técnicas internas (nombres de métricas en código, schemas de DB) quedan en inglés siempre.

**Regla:** si un texto es visible para el usuario, tiene que estar en `messages/es.json` y `messages/en.json`.

---

## 3. Migrar el modelo de datos: de Checkpoint a Clip + Class

**Objetivo:** Reemplazar el concepto de `checkpoint` suelto por `clip` dentro de `class`. La clase se crea automáticamente.

**Por qué:** El instructor no piensa en "checkpoints". Piensa en "lo que grabé hoy con este alumno". La clase como contenedor refleja ese modelo mental.

### Schema nuevo en Supabase

Ejecutar estas migraciones en orden:

**Tabla `classes`:**
```sql
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES instructors(id),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar la clase más reciente de un alumno
CREATE INDEX idx_classes_student_date ON classes(student_id, date DESC);
```

**Tabla `clips`** (reemplaza `checkpoints`):
```sql
CREATE TABLE clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id),
  instructor_id UUID REFERENCES instructors(id),
  name TEXT NOT NULL,
  camera_angle TEXT NOT NULL CHECK (camera_angle IN ('face_on', 'dtl')),
  clip_type TEXT NOT NULL DEFAULT 'position' CHECK (clip_type IN ('position', 'swing')),
  display_order INTEGER DEFAULT 0,
  video_url TEXT,
  skeleton_url TEXT,
  baseline JSONB,
  baseline_summary TEXT,
  selected_metrics TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'calibrated', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Tabla `clip_frames`** (raw landmarks de todos los frames — para ML futuro):
```sql
CREATE TABLE clip_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  landmarks JSONB NOT NULL, -- array de 33 landmarks con x, y, z, visibility
  metrics JSONB, -- métricas calculadas para ese frame
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clip_frames_clip ON clip_frames(clip_id, frame_index);
```

**Tabla `clip_annotations`** (anotaciones vectoriales del instructor):
```sql
CREATE TABLE clip_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  frame_timestamp_ms INTEGER NOT NULL,
  strokes JSONB NOT NULL DEFAULT '[]',
  -- strokes es array de: { type: "arrow"|"line"|"circle", color, points[], label? }
  audio_url TEXT,
  audio_transcript TEXT,
  text_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Modificar `practice_sessions`:**
```sql
ALTER TABLE practice_sessions
  ADD COLUMN clip_id UUID REFERENCES clips(id),
  ADD COLUMN class_id UUID REFERENCES classes(id);
-- Mantener checkpoint_id por compatibilidad durante migración, luego se elimina
```

**Tabla `session_frames`** (raw landmarks de intentos del alumno — para ML futuro):
```sql
CREATE TABLE session_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES practice_sessions(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  landmarks JSONB NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_frames_session ON session_frames(session_id, frame_index);
```

### Lógica de clase automática

Implementar en `lib/classes.ts`:

```typescript
// Obtener o crear la clase de hoy para un alumno
// Umbral: si la última clase del alumno fue hace menos de 24hs, usar esa clase.
// Si no, crear una nueva con la fecha de hoy.
export async function getOrCreateTodayClass(
  studentId: string,
  instructorId: string
): Promise<Class> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: existingClass } = await supabase
    .from('classes')
    .select('*')
    .eq('student_id', studentId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingClass) return existingClass

  const { data: newClass } = await supabase
    .from('classes')
    .insert({
      student_id: studentId,
      instructor_id: instructorId,
      date: new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  return newClass
}
```

### Rutas a actualizar

Todas las rutas que usan `checkpoints` tienen que migrarse a `clips`:

| Ruta actual | Ruta nueva |
|-------------|-----------|
| `/instructor/students/[id]/checkpoints/new` | `/instructor/students/[id]/clips/new` |
| `/instructor/students/[id]/checkpoints/[checkpointId]` | `/instructor/students/[id]/clips/[clipId]` |
| `/instructor/students/[id]/checkpoints/[checkpointId]/calibrate` | Reemplazado por flujo de grabación directa — ver sección 4 |
| `/instructor/students/[id]/checkpoints/[checkpointId]/edit` | `/instructor/students/[id]/clips/[clipId]/edit` |
| `/student/checkpoint/[id]` | `/student/clip/[id]` |
| `/student/checkpoint/[id]/mirror` | `/student/clip/[id]/mirror` |
| `/student/checkpoint/[id]/practice` | `/student/clip/[id]/practice` |
| `/student/checkpoint/[id]/history` | `/student/clip/[id]/history` |

---

## 4. Nuevo flujo de grabación del instructor

**Objetivo:** Reemplazar el flujo de "sesión larga con botón Bien" por un flujo de "clip corto intencional con anotación post-grabación".

**Flujo nuevo:**

### Paso 1 — Grabar

Nueva página: `/instructor/students/[id]/clips/new/record`

- Pantalla de grabación limpia: solo el feed de la cámara y un botón grande "Grabar / Parar".
- Sin overlay de skeleton durante la grabación.
- Sin botón "Bien". El instructor simplemente graba 15-30 segundos y para.
- Indicador de tiempo transcurrido visible.
- Botón de flip de cámara si hay múltiples cámaras.
- Al parar: ir automáticamente al paso 2.

### Paso 2 — Revisar y anotar

Nueva página: `/instructor/students/[id]/clips/new/annotate`

Layout en dos columnas (iPad landscape):
- **Izquierda (60%):** player del video grabado con controles (play/pause/scrub).
- **Derecha (40%):** panel de acciones.

**Controles del video:**
- Play / Pause
- Scrubber de timeline
- Botón "Activar skeleton" (opt-in, oculto por default)
- Botón de velocidad de reproducción (1x / 0.5x / 0.25x)

**Canvas de anotación (se activa al pausar):**
- Cuando el instructor pausa el video, aparece el botón "Anotar este momento".
- Al tocar "Anotar": el frame queda fijo, aparece el canvas superpuesto.
- Herramientas disponibles (toolbar simple, horizontal, abajo del video):
  - Flecha (default)
  - Línea
  - Círculo
  - Selector de color: rojo, amarillo, verde, blanco
  - Borrar último trazo
- El instructor dibuja con el dedo.
- **Simultáneamente:** botón de micrófono visible y grande. Al tocarlo, graba audio mientras sigue dibujando. El botón pulsa en rojo mientras graba. Toca de nuevo para parar.
- Campo de texto opcional debajo (no forzarlo, es opcional).
- Botón "Guardar anotación" → el frame con sus strokes y audio quedan guardados.

**Panel derecho:**
- Nombre del clip (campo de texto, el instructor lo nombra: "Address de frente", "Backswing")
- Ángulo de cámara (selector: de frente / de perfil)
- Tipo (selector: postura / swing)
- Lista de anotaciones guardadas en este clip (puede haber más de una en distintos frames)
- Botón principal "Guardar clip" — grande, verde, al fondo.

### Paso 3 — Guardado

Al tocar "Guardar clip":
1. Subir el video a Supabase Storage.
2. Procesar el video con MediaPipe en background (todos los frames, guardar landmarks en `clip_frames`).
3. Calcular el baseline del clip.
4. Guardar el clip en la tabla `clips` con su `class_id` (obtenido de `getOrCreateTodayClass`).
5. Guardar las anotaciones en `clip_annotations`.
6. Redirigir al perfil del alumno. El clip ya aparece disponible para el alumno.

**El procesamiento de MediaPipe puede ser asíncrono.** El clip se guarda primero, el baseline se calcula después. Mostrar un indicador de "Procesando..." en el clip hasta que el baseline esté listo.

---

## 5. Actualizar perfil del alumno (vista instructor)

**Objetivo:** El instructor ve una vista clara de lo que hizo el alumno esa semana.

**Cambios en `/instructor/students/[id]/page.tsx`:**

- Reemplazar la lista de checkpoints por una lista de **clases** ordenadas por fecha descendente.
- La clase más reciente está expandida por default.
- Dentro de cada clase: lista de clips con su estado (procesando / listo) y un resumen del progreso del alumno en esa semana.
- Nuevo bloque "Esta semana" al top del perfil:
  - Cuántas sesiones de práctica hizo el alumno
  - En qué clips mejoró (score subió > 10%)
  - En qué clips está estancado (score sin cambio en 3+ sesiones)
  - Acceso rápido a ver los intentos grabados del alumno

---

## 6. Pantalla principal del alumno — "Practicá esto hoy"

**Objetivo:** Reemplazar la lista de ejercicios por una vista accionable con priorización.

**Cambios en `/student/journey/page.tsx`:**

### Layout nuevo:

**Bloque superior — "Practicá esto hoy":**
- 1-2 clips priorizados, cards grandes y visuales.
- La priorización es: `(días sin practicar ese clip * 0.4) + (1 - score_promedio_reciente) * 0.6`. Más días sin practicar + peor score = mayor prioridad.
- Cada card muestra: thumbnail del video del instructor, nombre del clip, última vez practicado, score actual.
- Botón "Practicar" prominente en cada card.

**Bloque inferior — "Tu última clase":**
- Todos los clips de la clase más reciente, en orden.
- Chips de estado: "Mejorado", "Estancado", "Sin practicar".

**Botón "Ver historial":**
- Acceso a todas las clases anteriores, colapsadas.

---

## 7. Flujo de práctica del alumno — actualizar

**Objetivo:** Integrar la comparación visual contra el clip del instructor.

**Cambios en `/student/clip/[id]/practice/page.tsx`:**

### Pre-grabación:
- Mostrar el clip del instructor en un player pequeño arriba, como referencia visual.
- Debajo: espejo en tiempo real con indicadores de colores.
- Una sola instrucción de texto visible: la más urgente según el estado actual.
- Skeleton opt-in (botón pequeño, esquina).

### Post-grabación — resultados:
- Layout de dos columnas en tablet / stack en teléfono:
  - Izquierda: video del intento del alumno con indicadores superpuestos.
  - Derecha: video del instructor (el mismo clip de referencia).
- Toggle para ver lado a lado o solo el del alumno.
- Debajo: evaluación.
  - Qué estuvo bien (métricas en verde).
  - **Una sola cosa para mejorar** — la métrica con peor score, en lenguaje simple.
  - Generado por Claude API (mismo endpoint `/api/baseline-summary` adaptado).

---

## 8. Guardar todos los landmarks — siempre

**Objetivo:** Capturar todos los landmarks de todos los frames de todos los clips y sesiones, para ML futuro.

**Por qué:** Es la materia prima del modelo propio. Los datos no capturados no se recuperan.

**Implementación:**

En el procesamiento post-grabación de un clip (background job):
```typescript
// Para cada frame del video:
// 1. Extraer landmarks con MediaPipe
// 2. Calcular métricas
// 3. Insertar en clip_frames

await supabase.from('clip_frames').insert(
  frames.map((frame, index) => ({
    clip_id: clipId,
    frame_index: index,
    timestamp_ms: Math.round(index * (1000 / fps)),
    landmarks: frame.landmarks, // array de 33 landmarks
    metrics: frame.metrics,     // métricas calculadas
  }))
)
```

Lo mismo para sesiones de práctica del alumno → `session_frames`.

**Consideración de performance:** Insertar los frames en batches de 100, no uno a uno. La tabla `clip_frames` va a ser grande — asegurarse de que el índice `idx_clip_frames_clip` esté creado.

---

## 9. Canvas vectorial de anotación

**Objetivo:** Componente nuevo de canvas que permite dibujar sobre un frame de video y graba audio simultáneamente.

**Componente:** `components/AnnotationCanvas.tsx`

**Props:**
```typescript
interface AnnotationCanvasProps {
  width: number
  height: number
  onSave: (annotation: Annotation) => void
  onCancel: () => void
}
```

**Tipos:**
```typescript
interface Stroke {
  type: 'arrow' | 'line' | 'circle'
  color: string
  points: [number, number][] // coordenadas normalizadas 0-1
}

interface Annotation {
  frame_timestamp_ms: number
  strokes: Stroke[]
  audio_blob?: Blob
  audio_transcript?: string
  text_note?: string
}
```

**Comportamiento:**
- Canvas HTML5 superpuesto sobre el frame del video (position: absolute, same dimensions).
- Touch events para iPad (onTouchStart, onTouchMove, onTouchEnd).
- Mouse events para desktop.
- Coordenadas normalizadas (dividir por width/height) para que sean resolución-independientes.
- Flechas: dibujar línea + punta triangular al final.
- Círculos: drag para definir radio.
- Al tocar "Grabar audio": `navigator.mediaDevices.getUserMedia({ audio: true })`, MediaRecorder.
- El audio y el dibujo son simultáneos — el botón de audio no pausa el canvas.
- Al guardar: devolver el objeto `Annotation` con strokes normalizados y audio blob.

**Renderizado en el player del alumno:**
- Sobre el frame pausado, dibujar los strokes del JSON escalados a las dimensiones del video actual.
- Las flechas y líneas se renderizan como SVG overlay para que sean nítidas en cualquier tamaño.

---

## 10. Transcripción de audio

**Objetivo:** Transcribir el audio del instructor automáticamente al guardar una anotación.

**Por qué:** La transcripción es un label textual para el modelo ML futuro. También mejora la accesibilidad.

**Implementación:**

Nueva API route: `/api/transcribe`

```typescript
// POST /api/transcribe
// Body: FormData con el audio blob
// Response: { transcript: string }

// Usar Whisper API de OpenAI o similar
// Si no está disponible, guardar el audio sin transcript (no bloquear el flujo)
```

El transcript se guarda en `clip_annotations.audio_transcript`.

Si la transcripción falla, no bloquear el guardado del clip — el audio queda sin transcript y se puede reintentar después.

---

## 11. RLS (Row Level Security) — actualizar

Actualizar las políticas de Supabase para las nuevas tablas:

```sql
-- classes: instructor lee/escribe sus propias clases
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instructor_own_classes" ON classes
  USING (instructor_id = auth.uid());

-- clips: instructor lee/escribe, alumno solo lee los suyos
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instructor_own_clips" ON clips
  USING (instructor_id = auth.uid());
-- Para alumno: usar service role en el endpoint de student (como ya se hace con checkpoints)

-- clip_frames: solo instructor (es data interna)
ALTER TABLE clip_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instructor_own_frames" ON clip_frames
  USING (EXISTS (
    SELECT 1 FROM clips WHERE clips.id = clip_frames.clip_id
    AND clips.instructor_id = auth.uid()
  ));

-- clip_annotations: instructor lee/escribe, alumno solo lee
ALTER TABLE clip_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instructor_own_annotations" ON clip_annotations
  USING (EXISTS (
    SELECT 1 FROM clips WHERE clips.id = clip_annotations.clip_id
    AND clips.instructor_id = auth.uid()
  ));
```

---

## 12. Storage buckets — actualizar

En Supabase Storage:

- Renombrar bucket `calibration-videos` a `clip-videos` (o crear nuevo y migrar).
- Crear bucket `clip-annotations-audio` para los audios de anotaciones.
- Mantener bucket `practice-videos` para los intentos del alumno.

Políticas: los videos del instructor son privados (solo accesibles con signed URL). Los videos del alumno también.

---

## Orden de implementación recomendado

1. **i18n** — sin esto, todo lo que se construya después hay que retroalimentarlo. Hacerlo primero.
2. **Renombrar a forat.golf** — cosmético pero importante, hacerlo temprano.
3. **Schema de DB** — crear las tablas nuevas sin eliminar las viejas todavía.
4. **`getOrCreateTodayClass`** — lógica central del nuevo modelo.
5. **Canvas de anotación** — el componente más nuevo y más importante del instructor.
6. **Nuevo flujo de grabación** — record → annotate → save.
7. **Guardar todos los landmarks** — implementar en el pipeline de procesamiento.
8. **Pantalla principal del alumno** — "Practicá esto hoy".
9. **Flujo de práctica actualizado** — comparación con clip del instructor.
10. **Vista de progreso del instructor** — "lo que hizo el alumno esta semana".
11. **Migración de datos** — migrar checkpoints existentes a clips.
12. **Eliminar código legacy** — rutas viejas, componentes no usados.

---

## Qué NO cambiar

- Stack técnico (Next.js, Supabase, MediaPipe, Tailwind, shadcn).
- Lógica de análisis de pose (`lib/baseline.ts`, `lib/mediapipe.ts`, `lib/poseAnalysis.ts`).
- Sistema de auth del instructor (Supabase email + password).
- Sistema de auth del alumno (código de 6 letras).
- Design system y tokens de color.
- PWA manifest y service worker.
- Componentes de análisis: `CheckPanel`, `StatusPill`, `ProgressChart`.
- API route de baseline summary (`/api/baseline-summary`).
