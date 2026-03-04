# Sweep — Cómo funciona por dentro

Este documento explica la lógica interna de Sweep para que el instructor entienda qué pasa cuando calibra, qué captura el botón "Bien", cómo se construye la referencia personal, y cómo el alumno se compara contra ella.

Sweep tiene **dos modos de captura**: **Postura** (posiciones estáticas) y **Swing** (análisis del movimiento completo por fases).

---

## 1. Qué detecta la cámara

Sweep usa **MediaPipe Pose** (de Google), que corre directamente en el celular/iPad del usuario — no envía video a ningún servidor. MediaPipe detecta **33 puntos del cuerpo** en cada frame de la cámara:

- Nariz, ojos, orejas
- Hombros, codos, muñecas
- Caderas, rodillas, tobillos
- Pies, manos (menos precisos)

Cada punto tiene coordenadas (x, y, z) y un **score de visibilidad** (0 a 1) que indica qué tan seguro está MediaPipe de que ese punto es real. Si la visibilidad es menor al **65%**, Sweep ignora ese punto — no inventa datos.

**Importante:** MediaPipe necesita ver el cuerpo completo para funcionar bien. Si solo se ve la cara y los hombros, solo se pueden calcular las métricas que usan esos puntos. El resto se omite. La app muestra un aviso amarillo cuando no ve todo el cuerpo.

---

## 2. Las métricas que se calculan

### De frente (face-on)

| Métrica | Qué mide | Puntos que usa |
|---------|----------|----------------|
| **Posición de cabeza** | Si la cabeza está centrada sobre las caderas | Nariz + caderas |
| **Extensión de brazos** | Ángulo de extensión de ambos brazos | Hombros + codos + muñecas |
| **Nivel de hombros** | Si un hombro está más alto que otro | Hombro izq + hombro der |
| **Balanceo de cadera** | Si las caderas están centradas sobre los pies | Caderas + tobillos |
| **Ancho de stance** | Separación de pies relativa al ancho de hombros | Hombros + tobillos |
| **Distribución de peso** | Si el peso está centrado sobre los pies | Hombros + tobillos |

### De perfil (down-the-line)

| Métrica | Qué mide | Puntos que usa |
|---------|----------|----------------|
| **Inclinación de columna** | Ángulo del torso respecto a la vertical | Hombros + caderas |
| **Flexión de rodillas** | Ángulo de las rodillas | Caderas + rodillas + tobillos |
| **Cabeza adelante** | Si la cabeza está adelantada respecto a los hombros | Nariz + hombros |
| **Bisagra de cadera** | Ángulo de la articulación de cadera | Hombros + caderas + rodillas |
| **Brazo trasero** | Extensión del brazo más alejado de la cámara | Hombros + codos + muñecas |
| **Altura de cabeza** | Posición vertical de la cabeza respecto a las caderas | Nariz + caderas |

---

## 3. Los dos modos de captura

Al crear un ejercicio, el instructor elige entre dos modos:

| Modo | Para qué sirve | Ejemplo |
|------|----------------|---------|
| **Postura** | Verificar posiciones estáticas | Address, setup, postura sentado |
| **Swing** | Analizar el movimiento completo | Full swing, backswing, chip shot |

---

## 4. Modo Postura — Calibración de posiciones estáticas

### Concepto clave: Sweep captura POSICIONES, no movimientos

El botón "Bien" captura una **foto estabilizada** de la posición del alumno en ese instante.

### El proceso exacto

1. La cámara corre a ~10-15 frames por segundo
2. Cada frame se analiza con MediaPipe y se guarda en un **buffer circular de 30 frames** (~2-3 segundos)
3. Cuando el instructor toca "Bien":
   - Se toman los **últimos 6 frames** del buffer (~0.4-0.6 segundos)
   - Se **promedian**: para cada uno de los 33 puntos, se calcula el promedio de x, y, z entre los 6 frames
   - Este promedio suaviza micro-temblores y da una lectura estable
   - Se calculan las métricas (ángulos, distancias) a partir de esos puntos promediados
   - Se guarda como una **marca** con sus métricas y el timestamp

### ¿Por qué 6 frames y no más?

- **6 frames ≈ 0.5 segundos** — suficiente para estabilizar una posición estática
- Si se usaran más frames (ej: 30 = 2-3 segundos), se mezclarían posiciones diferentes si la persona se movió
- El diseño asume que **el alumno está quieto** cuando el instructor toca "Bien"

### Instrucciones para el instructor (Postura)

**CUÁNDO tocar "Bien":**
- Cuando el alumno está **quieto** en la posición correcta
- No durante un movimiento, sino cuando mantiene una postura
- Puede pedirle al alumno que "congele" la posición

**Ejemplos:**
- **Address de frente:** El alumno se para en su setup mirando a la cámara → "Bien"
- **Address de perfil:** Lo mismo pero con la cámara al costado → "Bien"
- **Top del backswing:** El alumno sube el palo y se detiene arriba → "Bien"
- **Postura sentado:** El alumno adopta la postura y la mantiene → "Bien"

**CUÁNTAS veces:** 2-5 marcas del mismo ejercicio. Más marcas = referencia más confiable.

**QUÉ NO hacer:**
- No tocar "Bien" mientras el alumno está en movimiento
- No tocar "Bien" si la cámara no ve el cuerpo completo (aviso amarillo)
- No hacer solo 1 marca (no se puede calcular variación)

---

## 5. Modo Swing — Análisis del movimiento por fases

### Concepto clave: Sweep descompone el swing en 4 fases

En vez de capturar una posición estática, Sweep analiza el **movimiento completo** del swing y lo descompone automáticamente en **4 fases**:

| Fase | Qué es | Cómo la detecta |
|------|--------|-----------------|
| **Address** | Posición inicial antes de mover | Primeros frames del movimiento |
| **Top** | Top del backswing (manos arriba) | Punto donde las muñecas están en su posición más alta |
| **Impacto** | Momento del golpe (manos abajo) | Punto donde las muñecas están en su posición más baja |
| **Finish** | Follow-through (manos arriba de nuevo) | Posición final después del impacto |

### Cómo detecta las fases

Sweep rastrea la posición vertical (Y) de las muñecas a lo largo del swing:

```
   Altura de muñecas
   ▲
   │    *              *
   │   * *            * *
   │  *   *          *   *
   │ *     *        *     *
   │*       *      *
   │         *    *
   │          *  *
   │           **
   ├──────────────────────→ Tiempo
   address  top  impact  finish
```

El algoritmo busca:
1. **Top**: El primer pico donde las muñecas llegan a su punto más alto (mínimo Y en coordenadas de pantalla)
2. **Impacto**: El punto más bajo de las muñecas después del top (máximo Y)
3. **Address**: Posición al inicio, antes del movimiento
4. **Finish**: Posición al final, después del impacto

### El proceso de calibración en modo Swing

1. La cámara corre con un **buffer de 45 frames** (~3-4 segundos, más largo que en modo Postura)
2. El alumno hace un swing completo
3. Cuando el instructor toca "Buen swing":
   - Se toman los **últimos 30 frames** del buffer (~2-3 segundos)
   - Se ejecuta el **algoritmo de detección de fases** sobre esos frames
   - Si se detectan las 4 fases exitosamente:
     - Se extrae el frame exacto de cada fase
     - Se calculan las métricas de cada frame
     - Se guarda como una marca con las **4 fases** y sus métricas
   - Si **NO** se detectan las fases (movimiento insuficiente):
     - Se muestra un aviso: "No se detectó un swing completo"
     - El instructor puede reintentar

### Instrucciones para el instructor (Swing)

**CUÁNDO tocar "Buen swing":**
- **DESPUÉS** de que el alumno termine el swing completo (no durante)
- Esperar ~1 segundo después del finish para que el buffer tenga todo el movimiento
- El alumno puede hacer el swing normalmente, sin pausar

**CUÁNTAS veces:** 2-5 swings buenos. Cada "Buen swing" debe ser un swing completo que el instructor considere correcto.

**QUÉ NO hacer:**
- No tocar durante el swing — esperar a que termine
- No tocar si el alumno no hizo un movimiento completo (ej: solo backswing sin golpe)
- No tocar si la cámara no ve el cuerpo completo

### La referencia por fases

Cuando se guardan múltiples swings, Sweep calcula una referencia **por fase**. Es decir:

- **Address**: Media y std de las métricas en el address de todos los swings buenos
- **Top**: Media y std de las métricas en el top de todos los swings buenos
- **Impacto**: Media y std de las métricas en el impacto de todos los swings buenos
- **Finish**: Media y std de las métricas en el finish de todos los swings buenos

Esto permite que cada fase tenga su propio rango de tolerancia. Por ejemplo, es normal que la inclinación de columna sea diferente en el address que en el impacto.

### Diferencias con modo Postura

| | Postura | Swing |
|---|---------|-------|
| Qué captura | 6 frames promediados (0.5s) | 30 frames secuenciales (2-3s) |
| Buffer | 30 frames | 45 frames |
| Referencia | Una sola referencia por métrica | Una referencia por fase (×4) |
| Espejo | Sí (tiempo real) | No (solo grabación) |
| Botón | "Bien" | "Buen swing" |

---

## 6. La referencia personal — Cómo se construye

Cuando el instructor guarda el ejercicio, se toman todas las marcas y se calcula la **referencia personal (baseline)** del alumno.

### El cálculo (modo Postura)

Para cada métrica, se toman los valores de TODAS las marcas y se calculan:

| Estadístico | Qué es | Para qué sirve |
|-------------|--------|----------------|
| **Media** | El promedio de todas las marcas | El "centro" de la referencia |
| **Desviación estándar (std)** | Qué tan consistentes fueron las marcas | Define los márgenes de tolerancia |
| **Mínimo** | El valor más bajo entre marcas | Informativo |
| **Máximo** | El valor más alto entre marcas | Informativo |

### Ejemplo concreto

El instructor calibra "Address de perfil" y marca 4 posiciones buenas.
La inclinación de columna en cada marca fue: **28°, 30°, 29°, 31°**

- Media = **29.5°**
- Desviación estándar = **1.12°**
- Min = 28°, Max = 31°

### Propiedad auto-calibrante

**Si el instructor marca posiciones muy consistentes** (ej: 29°, 29.5°, 29°, 30°):
- Std será bajo (~0.4°)
- Los márgenes serán estrictos
- El alumno tiene que ser muy preciso para estar en verde

**Si hay más variación natural** (ej: 26°, 32°, 28°, 34°):
- Std será alto (~3.3°)
- Los márgenes serán amplios
- Más flexibilidad para el alumno

Esto significa que **la referencia se adapta al nivel de exigencia del instructor**. Si marca con precisión, el estándar es alto. Si es más permisivo, el estándar es más amplio.

### El cálculo (modo Swing)

En modo Swing, el mismo cálculo se hace **por cada fase**. Ejemplo con 3 swings buenos calibrados:

- **Address**: inclinación de columna fue 28°, 29°, 28.5° → media 28.5°, std 0.41°
- **Top**: inclinación de columna fue 45°, 43°, 44° → media 44°, std 0.82°
- **Impacto**: inclinación de columna fue 32°, 33°, 31° → media 32°, std 0.82°
- **Finish**: inclinación de columna fue 20°, 22°, 21° → media 21°, std 0.82°

Cada fase tiene su propio centro y sus propios márgenes.

---

## 7. La comparación — Los márgenes de tolerancia

Tanto el Espejo como la Grabación usan la misma lógica para comparar la postura actual contra la referencia:

### Las zonas

```
                    ← 2 std →     ← 1 std →   media   ← 1 std →     ← 2 std →
    ──────────────|──────────────|───────────|─────────|───────────|──────────────|──────────
       ROJO              AMARILLO       VERDE    ●    VERDE       AMARILLO              ROJO
      (Corregir)        (Ajustar)      (OK)   media   (OK)       (Ajustar)          (Corregir)
```

| Desviación | Color | Significado |
|-----------|-------|-------------|
| Dentro de **1 std** de la media | 🟢 Verde | Dentro del rango normal del alumno |
| Entre **1 y 2 std** de la media | 🟡 Amarillo | Cerca del límite, ajustar ligeramente |
| Más de **2 std** de la media | 🔴 Rojo | Fuera del rango, necesita corrección |

### Con el ejemplo anterior (columna: media 29.5°, std 1.12°)

| Rango | Estado |
|-------|--------|
| 28.4° — 30.6° | 🟢 Verde |
| 27.3° — 28.4° | 🟡 Amarillo (muy erguido) |
| 30.6° — 31.7° | 🟡 Amarillo (muy inclinado) |
| Menos de 27.3° | 🔴 Rojo (muy erguido) |
| Más de 31.7° | 🔴 Rojo (muy inclinado) |

---

## 8. Espejo (Smart Mirror) — Tiempo real (solo modo Postura)

### Cómo funciona
1. La cámara corre en vivo con MediaPipe
2. En cada frame: calcula métricas → compara contra referencia → muestra resultado
3. **Suavizado de 6 frames**: para evitar que los indicadores parpadeen con cada micro-movimiento, se toman los resultados de los últimos 6 frames y se usa "voto mayoritario"
   - Ejemplo: si en los últimos 6 frames una métrica dio Verde, Verde, Amarillo, Verde, Verde, Verde → muestra Verde (4 de 6)
4. Se muestran flechas direccionales: "↓ Flexionar", "← Centrar", etc.

### Para qué sirve
- Para que el alumno verifique su **postura de setup** antes de tirar
- El alumno se pone en posición, mira el espejo, ajusta hasta que todo esté en verde, y luego tira
- **No es para analizar el swing** — es para verificar la posición estática

---

## 9. Grabación (Video Analysis) — Post-análisis

### Modo Postura — Comparación frame a frame

1. El alumno graba un video (5-15 segundos)
2. La app procesa el video **frame por frame** a 10 fps
3. Cada frame: calcula métricas → compara contra referencia
4. **Sin suavizado** — cada frame se evalúa independientemente
5. Al final, agrega los resultados de TODOS los frames:

| Regla de agregación | Resultado |
|---------------------|-----------|
| Más del **40%** de frames dio 🔴 Rojo | → Resultado final: 🔴 Rojo |
| Más del **60%** de frames dio 🟢 Verde | → Resultado final: 🟢 Verde |
| Si no se cumple ninguna | → Resultado final: 🟡 Amarillo |

6. Se muestra el porcentaje exacto: "78% dentro de tu rango"
7. Se guarda la sesión para el historial de evolución

### Modo Swing — Comparación por fases

1. El alumno graba un video de su swing (5-15 segundos)
2. La app procesa el video frame por frame a 10 fps para obtener los **landmarks de cada frame**
3. Después de procesar todo el video, ejecuta el **algoritmo de detección de fases**
4. Extrae los 4 frames clave (address, top, impacto, finish)
5. Compara cada fase contra la referencia por fases del instructor
6. Muestra resultado **por fase**: qué fases están bien y cuáles necesitan corrección
7. Score general = % de métricas dentro del rango, sumando todas las fases

**Diferencia clave**: En modo Postura se evalúa CADA frame del video. En modo Swing se buscan los 4 momentos clave y se evalúan solo esos.

### Diferencia entre Espejo y Grabación
- El Espejo muestra el estado ACTUAL (frame actual con suavizado) — solo modo Postura
- La Grabación evalúa todo el video y da un resultado agregado — ambos modos

---

## 10. Qué NO puede detectar MediaPipe

| Cosa | Por qué no |
|------|-----------|
| Grip (agarre del palo) | Los dedos se ocultan detrás del palo |
| Posición del palo | MediaPipe trackea el cuerpo, no objetos |
| Tempo del swing | No tiene referencia temporal del "tempo correcto" |
| Ángulos de muñeca | Precisión insuficiente en puntos tan pequeños |
| Calidad del impacto | No detecta la bola ni el palo |
| Distribución de peso real | Solo estima por posición de hombros, no mide presión en los pies |

---

## 11. Limitaciones y consideraciones

### Precisión de MediaPipe
- MediaPipe tiene una precisión de ±2-3° en ángulos grandes (columna, rodillas)
- Es menos preciso en distancias absolutas — por eso se usan distancias relativas (ej: cabeza respecto a caderas, no centímetros)
- La precisión baja si hay poca luz, ropa holgada, o el cuerpo está parcialmente oculto

### La cámara importa
- Mejor con buena iluminación
- El cuerpo completo debe estar visible (de cabeza a pies)
- La cámara debe estar fija (trípode recomendado para grabación)
- Distancia recomendada: 2-3 metros para que entre el cuerpo completo

### La referencia es PERSONAL
- No hay ángulos "universales" correctos
- La referencia de cada alumno es SU propia postura marcada por SU instructor
- Lo que es correcto para un alumno puede no serlo para otro
- El instructor es siempre la autoridad sobre qué es "bueno"

---

## Resumen

> **Modo Postura:** El instructor marca las posiciones buenas del alumno (estáticas) → se promedian y se calcula la variación natural → el alumno se compara contra SU referencia personal.
>
> **Modo Swing:** El instructor marca los swings buenos del alumno → se detectan automáticamente 4 fases (address, top, impacto, finish) → se construye una referencia por fase → el alumno graba su swing y se compara fase por fase.
>
> En ambos modos: dentro de 1 desviación estándar = verde, entre 1 y 2 = amarillo, más de 2 = rojo.
