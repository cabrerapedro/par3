import { NextResponse, type NextRequest } from 'next/server'

// Spanish-first product: on the user's first visit we set the NEXT_LOCALE
// cookie to ES regardless of their browser's Accept-Language — an English
// browser should still land in Spanish. English is opt-in via the in-app
// toggle, which overwrites this cookie. From then on the cookie wins (toggle or
// the value synced from the DB at login).
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

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(COOKIE)?.value
  if (existing && (SUPPORTED as readonly string[]).includes(existing)) {
    return NextResponse.next()
  }

  const response = NextResponse.next()
  response.cookies.set({
    name: COOKIE,
    value: DEFAULT,
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
