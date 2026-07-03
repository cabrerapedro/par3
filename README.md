# Forat

Cuaderno de práctica de golf para instructores y sus alumnos. El instructor
graba el movimiento correcto del alumno durante la clase, lo anota con voz,
texto y dibujo, y construye una referencia personal. El alumno practica solo
en el rango con esa referencia en su teléfono. La app compara su técnica en
tiempo real contra lo que el instructor calibró, prioriza qué practicar
según su progreso, y cierra el loop para que el sábado siguiente
instructor y alumno hablen sobre una semana real de práctica.

Dominio: **forat.golf** · Idiomas: español e inglés desde el día 1.

Para el contexto completo de producto leer [`CLAUDE.md`](./CLAUDE.md).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Supabase (Postgres + Auth + Storage)
- MediaPipe Pose (on-device, CDN)
- next-intl (i18n)

## Desarrollo

```bash
npm install
npm run dev
```

Variables de entorno necesarias (en `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm run start` — servidor de producción
- `npm test` — corre tests con Vitest
- `npm run lint` — ESLint

## Deploy

Vercel auto-deploy desde `main`.
