import { siteUrl } from '@/lib/siteUrl'

// /llms.txt — emerging convention to describe the product for LLMs/AI search.
// Plain text/markdown, served from the real production domain.
export function GET() {
  const base = siteUrl()
  const body = `# Parell Golf

> Parell Golf es un copiloto de práctica de golf para instructores profesionales y sus alumnos. El instructor graba y anota la técnica correcta del alumno; el alumno la practica solo entre clases con esa referencia en el teléfono y recibe feedback en tiempo real, una indicación a la vez.

## Qué es
- App web instalable (PWA) para instructores de golf y sus alumnos. Idiomas: español e inglés.
- Instructor (cliente que paga, suscripción según alumnos activos): graba clips cortos en el iPad durante la clase, pausa en el frame clave, dibuja y explica con la voz. Crea una referencia personal por alumno.
- Alumno (acceso gratis con un código que le da su instructor): practica en el rango con la cámara en modo espejo; la app compara su técnica contra lo que el instructor calibró y le da una sola corrección a la vez, en lenguaje simple.
- Principio irrenunciable: el instructor es siempre la autoridad. Parell complementa su método, no lo reemplaza.

## Cómo funciona
1. En la clase, el instructor graba la técnica correcta del alumno y la anota (dibujo + voz).
2. Entre clases, el alumno practica con esa referencia; la app lo corrige en tiempo real, una cosa a la vez.
3. Antes de la próxima clase, el instructor ve qué practicó el alumno durante la semana.

## Tecnología
- Análisis de pose con MediaPipe, ejecutado en el dispositivo.
- Sin sensores ni equipo especial: solo un iPad o un teléfono con cámara.

## Enlaces
- Inicio: ${base}/
`
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
