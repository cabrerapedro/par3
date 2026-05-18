import { NextResponse, type NextRequest } from 'next/server'

// On the user's first visit we set the NEXT_LOCALE cookie from their
// Accept-Language header. From then on the cookie wins, so the user's
// explicit toggle (or the value synced from the DB at login) is respected.
//
// We are NOT using next-intl's middleware because we're in "no routing" mode
// (no /es/... or /en/... prefixes). The cookie is the only source of truth
// for the rendered locale, and i18n/request.ts reads it on every request.
//
// Lives in proxy.ts (not middleware.ts) — Next.js 16 deprecated the
// "middleware" file convention in favor of "proxy".

const SUPPORTED = ['es', 'en'] as const
const DEFAULT = 'es' as const
const COOKIE = 'NEXT_LOCALE'

function bestLocaleFromHeader(header: string | null): (typeof SUPPORTED)[number] {
  if (!header) return DEFAULT
  const ordered = header
    .split(',')
    .map((part) => {
      const [tag, qPart] = part.trim().split(';')
      const q = qPart?.startsWith('q=') ? Number(qPart.slice(2)) : 1
      return { base: tag.split('-')[0].toLowerCase(), q: Number.isFinite(q) ? q : 1 }
    })
    .sort((a, b) => b.q - a.q)
  for (const { base } of ordered) {
    if ((SUPPORTED as readonly string[]).includes(base)) {
      return base as (typeof SUPPORTED)[number]
    }
  }
  return DEFAULT
}

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(COOKIE)?.value
  if (existing && (SUPPORTED as readonly string[]).includes(existing)) {
    return NextResponse.next()
  }

  const detected = bestLocaleFromHeader(request.headers.get('accept-language'))
  const response = NextResponse.next()
  response.cookies.set({
    name: COOKIE,
    value: detected,
    // 1 year — long enough that we never re-detect for the same user
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  })
  return response
}

// Skip static assets, API routes, and Next internals so we don't run on every
// JS/CSS/image request.
export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
}
