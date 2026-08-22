# Validación del motor de análisis — protocolo de una tarde

> Objetivo: sustituir las constantes elegidas a mano por números medidos.
> Todo lo que hay debajo se hace en el range, con Steve y un alumno, en
> ~90 minutos. No requiere tocar código: solo grabar de forma controlada y
> leer lo que el motor registra en `analysis_events`.

## Qué constantes están sin validar

| Constante | Dónde | Valor actual | Qué la valida |
|-----------|-------|--------------|---------------|
| Suelos de ruido por métrica | `METRIC_STD_FLOORS` (lib/baseline.ts) | 2-3° ángulos · 0,025-0,04 torsos distancias · 0,05 ratio | Prueba A |
| Invariancia a la cámara (v2) | `NORMALIZED_METRICS` | normalización por torso | Prueba A |
| Umbral de quietud | `STABLE_MAX_SPEED` = 0,35 torsos/s | — | Prueba B |
| Detector de swings | bandas 35 % / 20 %, salida del top en 4 frames | — | Prueba C |
| Impacto del segundo pase | 30 fps, ventana −200/+300 ms | — | Prueba C (cámara lenta) |
| Umbral de colocación | torso entre 0,11 y 0,42 del encuadre | — | Prueba A |
| "Sesión OK" para calibrar `_k` | ≥ 60 % métricas en verde | — | Prueba D |

## Prueba A — la misma postura, tres cámaras (20 min)

1. Alumno en postura de address, quieto. Steve graba **tres clips** de 15 s
   sin que el alumno se mueva entre ellos:
   - iPad a la distancia habitual de la zona marcada,
   - iPad un metro más lejos,
   - iPad desplazado ~30° a un lado (no perpendicular).
2. Calibra los tres como clips normales (mismo nombre + sufijo A1/A2/A3).

**Qué mirar:** en el SQL editor,

```sql
select name, baseline from clips where name like 'A%' order by created_at desc limit 3;
```

Las `mean` de cada métrica deben ser **casi iguales** entre A1 y A2 (si no,
la invariancia por torso no funciona para esa métrica) y los ángulos deben
moverse poco entre A1 y A3 (si se mueven >5°, la proyección 2D nos está
engañando y hay que acelerar los landmarks 3D). La `std` intra-clip de cada
métrica ES el ruido de medición real: si una `std` es mayor que el suelo de
`METRIC_STD_FLOORS`, el suelo está bajo.

## Prueba B — quieto vs moviéndose (10 min)

1. Un clip de 20 s: el alumno **entra en plano caminando**, se coloca, aguanta
   10 s, se relaja y sale.
2. Calibrar.

**Qué mirar:** `analysis_events` → el evento `clip_queue/analyze` de ese
clip. Y en el clip, `detection_ratio`. Luego, que el alumno practique esa
postura una vez: el evento `practice/analyzed` trae `stable_seconds` — debe
rondar los 10 s, no los 20. Si se acerca a 20, el umbral de quietud es
demasiado permisivo; si baja de 6, demasiado estricto.

## Prueba C — swing con cámara lenta al lado (30 min)

1. Steve graba un clip de swing normal (3 swings) con el iPad. A la vez,
   **alguien graba lo mismo con un móvil a cámara lenta** (240 fps) desde el
   mismo sitio.
2. Calibrar. Después el alumno hace un intento de práctica de 3 swings.

**Qué mirar:**
- `analysis_events` → `clip_queue/refine_swing`: `reps` debe ser 3. Si es
  6, hay reps fantasma (el finish se confunde con un top); si es 1-2, el
  detector está perdiendo swings.
- `practice/analyzed` → `reps`, `consistency`, y `duration_ms` (cuánto tarda
  el segundo pase en ESE móvil — si pasa de 60 s hay que recortar la ventana).
- En la sesión guardada, `results._meta.tempo` tiene `backswingMs` y
  `downswingMs` por rep. Compáralos con el vídeo a cámara lenta (contando
  frames/240): el error del impacto debería ser < 30 ms. Si es > 50, el
  segundo pase no está acertando y NO se debe exponer el tempo.

## Prueba D — 5 bien, 5 mal (20 min)

1. Sobre un clip ya calibrado, el alumno hace **10 intentos de práctica**:
   Steve le indica 5 veces que lo haga bien y 5 que exagere el error que
   corrigió en clase.
2. Steve, en el detalle del clip, marca 👍/👎 en cada intento **sin mirar el
   score**, solo el vídeo/su criterio.

**Qué mirar:** con 10 labels, la app ajusta `_k` sola (evento
`band_calibration/k_updated`). Además, comparar: ¿los 5 "mal" salieron con
semáforo peor que los 5 "bien"? Si el semáforo no los separa, las bandas
están mal para ese clip y hay que revisar qué métrica no discrimina
(`practice_sessions.results` tiene la desviación por métrica).

## Cómo leer lo que registró el motor

```sql
select created_at, source, step, status, duration_ms, detail
from analysis_events
order by created_at desc
limit 50;
```

Cada fila es un paso del motor con su duración y su detalle (frames
analizados, reps detectadas, confianza, razón de rechazo…). Es lo que
permite diagnosticar desde casa lo que pasó en el range.

## Después: convertir esos clips en tests de regresión

Los clips de esta tarde son los primeros de **cuerpo entero** en la base (los
de pruebas anteriores eran de escritorio, sin piernas en plano — inútiles como
ruido real). Con ellos:

```bash
node scripts/export-fixtures.mjs
npm test
```

El script exporta como fixture el mejor clip de posición y el mejor de swing
(solo landmarks, nada identificable) y la suite `realFixtures.test.ts`, que
hasta entonces se salta sola, pasa a ejecutar los detectores contra ruido de
MediaPipe real en cada cambio de código.

## Qué haré con los resultados

Con la tabla A ajusto los suelos por métrica (percentil 50 de la `std`
intra-clip de cuerpos quietos). Con B ajusto el umbral de quietud. Con C
decido si el segundo pase se queda como está, se recorta, o se desactiva en
móviles lentos — y si el tempo se puede mostrar. Con D verificamos que el
loop de `_k` converge en vez de oscilar. Todo son cambios de constantes
con test, sin tocar arquitectura.
