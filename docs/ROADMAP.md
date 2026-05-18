# parell.golf — Roadmap

> Mayo 2026

---

## Visión

parell.golf empieza como una herramienta para el instructor individual. Escala hacia una plataforma que conecta academias, alumnos y eventualmente produce su propio modelo de análisis de movimiento entrenado con datos reales de instructores expertos.

---

## Fase 1 — Instructor Individual (MVP)

**Objetivo:** Un instructor puede usarlo con sus alumnos desde el primer día. Flujo completo funcionando.

**Quién:** Un instructor, sus alumnos, sin estructura de academia.

**Features:**
- Auth del instructor (email + password)
- Auth del alumno (código de 6 letras)
- Lista de alumnos
- Grabación de clips durante la clase
- Canvas de anotación vectorial + audio simultáneo
- Clase automática (umbral 24hs)
- Vista del alumno: "Practicá esto hoy" con priorización simple
- Espejo en tiempo real con indicadores
- Grabación de práctica del alumno + resultados
- Vista del instructor del progreso semanal
- Almacenamiento de todos los landmarks de todos los frames
- i18n: español + inglés
- PWA instalable

**Modelo de negocio:**
- Free trial: 2 alumnos activos, sin límite de tiempo
- Plan Starter: hasta 15 alumnos — precio a definir
- Plan Pro: hasta 50 alumnos — precio a definir

**Métricas de éxito:**
- Instructor graba al menos 1 clip por clase con cada alumno
- Alumno practica al menos 2 veces por semana
- Churn mensual < 10%

---

## Fase 2 — Academia y Multi-instructor

**Objetivo:** Un director de academia puede invitar a su equipo de instructores y gestionar todos los alumnos desde un panel central.

**Quién:** Academias de golf con 2-10 instructores y 50-300 alumnos.

**Features nuevas:**
- Estructura de Academia: el director crea la cuenta, invita instructores
- Un alumno puede tener más de un instructor (ej: instructor principal + especialista en putting)
- El director ve el progreso de todos los alumnos de todos los instructores
- Transferencia de alumno entre instructores
- Plantillas de ejercicios compartidas entre instructores de la misma academia
- Notificaciones push: "Tu alumno practicó hoy", "Nuevo clip de tu instructor"
- Billing por academia (no por instructor individual)

**Modelo de negocio:**
- Plan Academia: por cantidad de alumnos activos totales en la academia
- El director paga, los instructores acceden incluidos

**Métricas de éxito:**
- Al menos 3 instructores activos por academia
- Retención de academia > 90% mensual

---

## Fase 3 — Modelo Propio de ML

**Objetivo:** Usar los datos capturados en las Fases 1 y 2 para entrenar un modelo de análisis de movimiento que no requiera calibración manual por alumno.

**Cuándo:** Cuando tengamos suficiente volumen de datos etiquetados. Estimación: 500+ alumnos activos, 6+ meses de datos.

**Qué datos tenemos para ese momento:**
- Landmarks de todos los frames de todos los clips de todos los instructores
- Anotaciones vectoriales: qué frame pausó el instructor, dónde dibujó, qué dijo
- Transcripciones de audio de las explicaciones de los instructores
- Historial de progreso de los alumnos: qué métricas tardan más en mejorar
- Recalibraciones implícitas: cuando el instructor graba un nuevo clip del mismo movimiento

**Qué permite el modelo propio:**
- Detección automática de errores técnicos sin que el instructor los marque explícitamente
- Recomendaciones generadas por el modelo, no solo por reglas hardcodeadas
- Predicción de cuánto le llevará a un alumno específico mejorar una métrica
- Eventualmente: análisis sin necesidad de calibración por alumno (el modelo ya sabe qué es un buen address)

**Qué NO hace el modelo propio:**
- Reemplazar al instructor. El instructor sigue siendo la autoridad.
- Dar feedback contradictorio a lo que calibró el instructor.

**Stack de ML:**
- A definir cuando lleguemos. Candidatos: fine-tune de un modelo de video existente, modelo propio de landmarks sobre secuencias temporales (LSTM / Transformer).

---

## Fase 4 — Plataforma

**Objetivo:** parell.golf se convierte en la infraestructura estándar de enseñanza de golf a nivel global.

**Features:**
- Marketplace de instructores: alumnos encuentran instructores certificados en parell.golf
- Clases remotas: el instructor puede calibrar a un alumno que mandó un video desde otro país
- Certificación parell: instructores que usan parell.golf obtienen una certificación de metodología
- API para fabricantes de equipamiento: integrar datos de swing con datos del palo, la pelota, el campo
- Integración con torneos y handicap oficial

**Modelo de negocio:**
- Take rate sobre reservas de clases a través del marketplace
- Licencia de API para fabricantes
- Certificación de instructores (revenue por examen + renovación anual)

---

## Decisiones técnicas que habilitan el roadmap

| Decisión | Por qué importa para escalar |
|----------|------------------------------|
| Guardar todos los landmarks desde el día 1 | Sin esto, Fase 3 es imposible. Los datos no se recuperan retroactivamente. |
| Anotaciones vectoriales (no imagen) | Permite procesarlas automáticamente para ML. Una imagen es opaca. |
| Audio transcripto | Las transcripciones son labels textuales para el modelo. |
| i18n desde el día 1 | Fase 4 requiere múltiples idiomas. Retrofitear i18n es costoso. |
| Schema multi-tenant desde Fase 2 | Diseñar la DB pensando en academias desde el inicio evita migraciones dolorosas. |
| PWA en lugar de app nativa | Distribución sin app store, actualizaciones instantáneas, menor fricción de adopción. |

---

## Lo que NO está en el roadmap

- **Análisis de ronda real / campo:** parell.golf es para el rango y la clase, no para el campo.
- **Video de torneos:** fuera de scope. Ese es otro producto.
- **Wearables / sensores físicos:** MediaPipe es suficiente para el problema que resolvemos ahora.
- **Social / feed:** no es una red social. La relación es instructor-alumno, no pública.
