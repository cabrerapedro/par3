# forat.golf — CLAUDE.md

> Documento vivo. Actualizado: Mayo 2026.
> Fuente de verdad del producto para Claude Code y cualquier colaborador técnico.
> "Forat" significa "par" en catalán.

---

## Qué es forat.golf

forat.golf es un **copiloto de práctica de golf** para instructores profesionales y sus alumnos.

El instructor graba el movimiento correcto del alumno durante la clase, lo anota con voz, texto y dibujo, y construye una referencia personal. El alumno practica solo en el rango con esa referencia en su teléfono. La app compara su técnica en tiempo real contra lo que el instructor calibró, prioriza qué practicar según su progreso, y cierra el loop para que el sábado instructor y alumno puedan hablar sobre una semana real de práctica.

**Principio irrenunciable:** El instructor es siempre la autoridad. forat.golf complementa su método, nunca lo contradice ni lo reemplaza.

**Dominio:** forat.golf
**Idiomas:** Español e inglés desde el inicio. i18n en todas las strings desde el día 1.
**Modelo de negocio:** Suscripción mensual del instructor. El precio varía según la cantidad de alumnos activos incluidos. El alumno accede gratis.

---

## Los dos usuarios

### Instructor (cliente que paga)

- Enseña en academia o club. Target: 30+ alumnos activos.
- Usa forat.golf en **iPad durante la clase** — no entre clases.
- Durante una clase trabaja varios movimientos según cómo avanza el alumno.
- No es técnico. La app tiene que ser obvia sin explicaciones.
- Su workflow natural: graba → pausa en el frame clave → dibuja y explica con voz → guarda.

### Alumno (usuario final, accede gratis)

- Practica en el rango entre clases, típicamente durante la semana.
- Usa forat.golf en su **teléfono**.
- Quiere saber exactamente qué practicar y si lo está haciendo bien.
- No quiere pensar — quiere instrucciones claras y feedback inmediato.

---

## Flujo del Instructor

El instructor está en la academia con su alumno. Saca el iPad.

**1. Acceso al alumno**
- Abre forat.golf → ve su lista de alumnos.
- Selecciona al alumno. La clase del día se crea automáticamente si pasaron más de 24 horas desde la última grabación con ese alumno. Sin fricción, sin botón "crear clase".

**2. Durante la clase — grabar un clip**
- Cuando quiere dejar un baseline de un movimiento específico:
  - Toca "Grabar" → apunta el iPad → graba 15-30 segundos (2-3 repeticiones del movimiento correcto del alumno).
  - Para la grabación.
  - El video se graba limpio. Sin overlay de skeleton durante la grabación.

**3. Post-grabación — revisar y anotar**
- Revisa el clip. Puede activar el overlay de skeleton si quiere ver los ángulos (opt-in, no default).
- Pausa en el frame clave que quiere marcar.
- Activa "Anotar":
  - Dibuja con el dedo: líneas, flechas, círculos para señalar lo que importa.
  - Mientras dibuja, habla — el audio se graba automáticamente y simultáneamente.
  - Puede agregar texto si quiere.
- Toca "Listo" → el clip con sus anotaciones queda disponible para el alumno de inmediato.

**4. Repite durante la clase**
- Vuelve al perfil del alumno y graba otro clip cuando lo necesita.
- Todos los clips del día quedan agrupados bajo la clase automática.

**5. El sábado — ver lo que hizo el alumno**
- Desde el perfil del alumno puede ver:
  - Cuántas veces practicó esa semana y en qué días.
  - En qué clips mejoró, en cuáles está estancado.
  - Los intentos grabados del alumno — puede reproducirlos para dar feedback específico en clase.

---

## Flujo del Alumno

El alumno llega al rango. Saca el teléfono.

**1. Pantalla principal — qué practicar hoy**
- Ve "Practicá esto hoy" — 1-2 clips priorizados automáticamente según su progreso.
- La priorización considera: días sin practicar ese clip + score promedio reciente.
- Puede ver también todos los clips de su última clase y el historial completo.

**2. Repasar el clip del instructor**
- Ve el video del instructor con los dibujos superpuestos en el frame anotado.
- Escucha el audio del instructor explicando.
- Puede activar el skeleton del instructor si quiere ver los ángulos técnicos.

**3. Practicar — espejo en tiempo real**
- Toca "Practicar esto".
- La cámara se activa en modo espejo: el alumno se ve en tiempo real.
- Ve indicadores de colores (verde / amarillo / rojo) por métrica.
- Ve UNA sola instrucción de texto a la vez: "Inclinarte más desde las caderas hasta sentir la misma posición que en el video."
- Skeleton opt-in — oculto por default.
- Cuando está listo, toca "Grabar".

**4. Post-práctica — resultados**
- Ve su video con la evaluación superpuesta.
- Ve comparación contra el clip del instructor (toggle o lado a lado).
- Ve qué estuvo bien y UNA cosa para mejorar.
- El intento queda guardado automáticamente.

**5. Progreso**
- Puede ver su evolución por clip a lo largo del tiempo.
- La app genera un resumen en lenguaje simple de cómo avanzó esa semana.

---

## Modelo de datos

La unidad central es el **Clip**, agrupado en **Clases** automáticas por fecha, dentro del perfil de un **Alumno** que pertenece a un **Instructor**.

```
Instructor
└── Alumno
    └── Clase (agrupación automática, umbral 24hs desde última grabación)
        └── Clip
            ├── Video original (almacenado completo en Supabase Storage)
            ├── Landmarks de TODOS los frames (raw, para ML futuro)
            ├── Métricas calculadas por frame
            ├── Tipo: postura | swing
            ├── Ángulo de cámara: face_on | dtl
            ├── Baseline (calculado del clip completo)
            ├── Anotaciones
            │   ├── frame_timestamp_ms (dónde pausó el instructor)
            │   ├── strokes (vectorial JSON — tipo, color, puntos)
            │   ├── audio_url + audio_transcript
            │   └── text_note (opcional)
            └── Sesiones de práctica del alumno
                ├── Video del intento
                ├── Landmarks de TODOS los frames (raw, para ML futuro)
                ├── Métricas por frame
                ├── Score general (%)
                └── Score por métrica
```

### Schema de anotaciones (vectorial, no rasterizado)

```json
{
  "frame_timestamp_ms": 2340,
  "strokes": [
    {
      "type": "arrow",
      "color": "#ef4444",
      "points": [[0.42, 0.31], [0.38, 0.55]],
      "label": "columna"
    },
    {
      "type": "circle",
      "color": "#f59e0b",
      "center": [0.55, 0.48],
      "radius": 0.06
    }
  ],
  "audio_url": "https://...",
  "audio_transcript": "Fijate cómo la columna está más erguida de lo ideal...",
  "text_note": null
}
```

Las anotaciones se guardan como vectores (no como imagen) para poder escalar, reusar y etiquetar automáticamente en el futuro.

### Tablas principales (Supabase / PostgreSQL)

| Tabla | Descripción |
|-------|-------------|
| `instructors` | Cuenta del instructor, plan de suscripción |
| `students` | Alumnos, vinculados al instructor, código de acceso |
| `classes` | Agrupación automática por fecha (umbral 24hs por alumno) |
| `clips` | Metadata de cada grabación, baseline calculado |
| `clip_frames` | Landmarks de todos los frames de cada clip (raw para ML) |
| `clip_annotations` | Dibujos vectoriales, audio, texto por clip |
| `practice_sessions` | Intentos del alumno por clip |
| `session_frames` | Landmarks de todos los frames de cada intento (raw para ML) |

---

## Arquitectura técnica

### Stack (mantener)

| Componente | Tecnología |
|-----------|-----------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Estilos | Tailwind CSS v4 + shadcn/ui |
| Pose detection | MediaPipe Pose (CDN, on-device, sin enviar video a servidores) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) |
| Hosting | Vercel |
| LLM para feedback | Anthropic Claude API |
| Transcripción de audio | Whisper API (a implementar) |
| Email | Resend |
| i18n | next-intl |

### Cambios de arquitectura requeridos respecto a Sweep

| Área | Antes (Sweep) | Ahora (forat.golf) |
|------|--------------|---------------------|
| Unidad central | `checkpoint` suelto | `clip` dentro de `class` |
| Creación de clase | Manual por el instructor | Automática (umbral 24hs) |
| Grabación | Sesión larga con botón "Bien" | Clip corto intencional |
| Landmarks guardados | Solo frames marcados como buenos | Todos los frames de todos los clips |
| Anotaciones | Texto + audio separados | Canvas vectorial + audio simultáneo |
| Pantalla principal alumno | Lista de checkpoints | "Practicá esto hoy" (priorizado) |
| Nombre del producto | Sweep | forat.golf |
| i18n | No | Sí, desde el día 1 |

---

## Análisis de pose

### MediaPipe — comportamiento

- 33 landmarks por frame, coordenadas normalizadas (0-1).
- On-device: el video nunca sale del dispositivo.
- Visibilidad mínima requerida: 0.65. Por debajo se ignora, nunca se inventa.
- Si el cuerpo no está completo en el encuadre, se muestran solo las métricas detectables.

### Métricas por ángulo de cámara

**De frente (face_on):** posición lateral de cabeza, extensión de brazos, nivel de hombros, balanceo de cadera, ancho de stance, distribución de peso.

**De perfil (dtl):** inclinación de columna, flexión de rodillas, cabeza adelante, bisagra de cadera, brazo trasero, altura de cabeza.

### Modos

**Postura:** baseline del clip completo, comparación frame a frame en espejo.

**Swing:** detección de 4 fases (address, top, impacto, finish) por trayectoria Y de muñecas. Baseline y comparación por fase.

### Umbrales de comparación

- ≤ 1 std de la media: verde
- 1-2 std: amarillo
- > 2 std: rojo

### Lo que MediaPipe no puede detectar

Grip, posición del palo, tempo, ángulos de muñeca, calidad del impacto, distribución real de peso. No intentar inferir estas cosas.

---

## UX — principios

**Skeleton opt-in siempre.** Nunca visible por default. El instructor lo activa al revisar si quiere ver ángulos. El alumno lo activa al practicar si quiere ver la comparación técnica.

**Una instrucción a la vez.** Nunca mostrar múltiples correcciones simultáneas al alumno.

**Feedback en positivo.** Nunca "está mal". Siempre "inclinarte hacia...".

**Sin números para el alumno.** Los grados y distancias se traducen a lenguaje corporal. "Tu columna está 4° más erguida" → "Inclinarte un poco más desde las caderas".

**El flujo de anotación es el corazón del producto.** Tiene que ser tan simple como usar el dedo en la pantalla en una conversación:
1. Pausa el video en el frame clave.
2. Toca "Anotar".
3. Dibuja con el dedo. Habla mientras dibujás. El audio se graba automáticamente.
4. Toca "Listo".

Sin formularios intermedios. Sin pasos extra. Un gesto continuo.

**Touch-first.** Targets mínimos de 48px. El instructor usa el iPad con los dedos durante la clase.

**Performance primero** en pantallas con análisis en tiempo real. Sin animaciones innecesarias.

---

## Estrategia de datos para modelo propio

### El activo diferencial

forat.golf tiene acceso a algo que ningún dataset público tiene: **anotaciones de expertos reales sobre movimientos reales de alumnos reales**. Cada vez que un instructor pausa en el frame 2.3 y dibuja una línea en la columna diciendo "esto está mal", produce un label humano de alta calidad sobre un error técnico específico.

Con suficiente volumen esto permite entrenar:
- Un detector de errores técnicos sin calibración manual por alumno.
- Un modelo que predice qué corrección funciona para cada tipo de error.
- Un modelo que estima cuánto le llevará a un alumno mejorar una métrica.

### Qué capturar sin penalizar UX

El instructor no hace nada extra. Todo se captura de lo que ya pasa naturalmente:

| Dato | Fuente | Valor para ML |
|------|--------|---------------|
| Landmarks de todos los frames del clip | Post-grabación | Ground truth de movimiento correcto |
| Landmarks de todos los frames del intento | Post-sesión | Variación respecto al correcto |
| Frame exacto donde el instructor pausa | Interacción natural | Label implícito: "este frame es importante" |
| Posición y tipo de cada stroke del dibujo | Canvas vectorial | Label explícito: "esta zona del cuerpo tiene un problema" |
| Audio transcripto | Whisper | Label textual del error y la corrección |
| Tiempo hasta mejorar por métrica | Historial de sesiones | Curva de aprendizaje por tipo de error |
| Recalibraciones (nuevo clip del mismo movimiento) | Flujo natural | Label implícito: "el anterior no era suficientemente bueno" |

---

## Alcance del MVP

### Incluido

- Auth del instructor (email + password via Supabase)
- Auth del alumno (código de 6 caracteres generado por el instructor)
- Lista de alumnos del instructor
- Creación automática de clase (umbral 24hs)
- Grabación de clips cortos durante la clase (video limpio)
- Revisión post-grabación con overlay de skeleton opt-in
- Canvas vectorial de anotación + audio simultáneo
- Almacenamiento de landmarks de todos los frames
- Vista "Practicá esto hoy" con priorización simple
- Espejo en tiempo real con indicadores de colores y una instrucción
- Grabación de práctica del alumno
- Resultados: evaluación + comparación con clip del instructor
- Vista del instructor del progreso semanal del alumno
- i18n: español e inglés
- PWA instalable en iPad y teléfono

### Fuera del MVP

- Pagos y billing
- Notificaciones push
- Modelo propio de ML (se captura la data, no se usa aún)
- Multi-instructor por academia
- Chat instructor-alumno
- Gamificación

---

## Decisiones clave — no violar

1. El instructor es siempre la autoridad. Nunca contradecir su calibración.
2. Guardar landmarks de todos los frames de todos los clips y sesiones. Siempre.
3. Anotaciones como vectores JSON, nunca como imagen rasterizada.
4. Una sola instrucción visible al alumno a la vez.
5. Skeleton opt-in, nunca default.
6. i18n desde el día 1. Ninguna string hardcodeada en componentes.
7. Audio del instructor y dibujo son simultáneos — no pasos separados.
8. La clase se crea automáticamente. El instructor nunca toca un botón para crearla.
9. Feedback siempre en positivo.
10. Performance primero en pantallas con análisis en tiempo real.
