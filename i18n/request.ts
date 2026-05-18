import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

// Locale resolution for server components.
//
// Resolution order:
//   1. `NEXT_LOCALE` cookie (set by middleware on first visit, or by the user toggle)
//   2. Accept-Language header (best-match against SUPPORTED_LOCALES)
//   3. Fallback to DEFAULT_LOCALE (`es`)
//
// We deliberately do NOT read from the database here. Logged-in users have their
// DB `preferred_locale` written to the cookie at login time (see lib/auth.tsx),
// so the cookie is always the source of truth for the rendered locale.

export const SUPPORTED_LOCALES = ['es', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

function isSupportedLocale(value: string | undefined | null): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function bestLocaleFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null
  // Parse "es-AR,es;q=0.9,en;q=0.8" → ordered list of base languages.
  const ordered = header
    .split(',')
    .map((part) => {
      const [tag, qPart] = part.trim().split(';')
      const q = qPart?.startsWith('q=') ? Number(qPart.slice(2)) : 1
      const base = tag.split('-')[0].toLowerCase()
      return { base, q: Number.isFinite(q) ? q : 1 }
    })
    .sort((a, b) => b.q - a.q)

  for (const { base } of ordered) {
    if (isSupportedLocale(base)) return base
  }
  return null
}

export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  if (isSupportedLocale(cookieLocale)) return cookieLocale

  const headerList = await headers()
  const fromHeader = bestLocaleFromAcceptLanguage(headerList.get('accept-language'))
  if (fromHeader) return fromHeader

  return DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages }
})
