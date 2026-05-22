import type { Metadata } from 'next'
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  axes: ['opsz', 'wdth'],
})

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jb-mono',
})

export async function generateMetadata(): Promise<Metadata> {
  // The public/marketing surface (landing + shared link previews) is Spanish-
  // first, so pin the tab title + Open Graph metadata to Spanish regardless of
  // the visitor's browser language. The in-app UI stays bilingual elsewhere.
  const t = await getTranslations({ locale: 'es', namespace: 'meta' })
  const title = `${t('appName')} — ${t('tagline')}`
  const description = t('description')
  // Point OG/canonical URLs at the real production domain. On Vercel this is the
  // custom domain once configured (parell.golf), otherwise the project's
  // *.vercel.app — so og:image actually resolves instead of pointing at a domain
  // that may not be live yet. Falls back to parell.golf for local dev.
  const prodDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const url = prodDomain ? `https://${prodDomain}` : 'https://parell.golf'

  return {
    metadataBase: new URL(url),
    applicationName: t('appName'),
    title,
    description,
    manifest: '/manifest.json',
    openGraph: {
      type: 'website',
      siteName: t('appName'),
      locale: 'es_ES',
      url,
      title,
      description,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${bricolage.variable} ${jbMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#EFE9DC" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#13110E" media="(prefers-color-scheme: dark)" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <ServiceWorkerRegister />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <TooltipProvider delayDuration={300}>
              <AuthProvider>{children}</AuthProvider>
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
