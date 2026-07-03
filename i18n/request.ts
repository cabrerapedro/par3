import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

// Locale resolution for server components.
//
// Spanish-first product: the app always defaults to ES. English is opt-in via
// the in-app toggle, which writes the `NEXT_LOCALE` cookie. We intentionally do
// NOT auto-detect from Accept-Language — an English-language browser should
// still land in Spanish. Resolution order:
//   1. `NEXT_LOCALE` cookie (the user toggle, or the value synced from the DB at login)
//   2. Fallback to DEFAULT_LOCALE (`es`)

export const SUPPORTED_LOCALES = ['es', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

function isSupportedLocale(value: string | undefined | null): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  if (isSupportedLocale(cookieLocale)) return cookieLocale
  return DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages }
})
