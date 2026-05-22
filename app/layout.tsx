import type { Metadata } from 'next'
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { siteUrl } from '@/lib/siteUrl'
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
  const url = siteUrl()

  return {
    metadataBase: new URL(url),
    applicationName: t('appName'),
    title,
    description,
    manifest: '/manifest.json',
    alternates: { canonical: '/' },
    keywords: ['golf', 'práctica de golf', 'instructor de golf', 'clases de golf', 'análisis de swing', 'app de golf'],
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

  // Structured data (schema.org). Helps Google rich results and helps AI search
  // (ChatGPT/Perplexity) understand what Parell is, who it's for, and that it's
  // free for students. Pinned Spanish, same as the rest of the marketing meta.
  const meta = await getTranslations({ locale: 'es', namespace: 'meta' })
  const base = siteUrl()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: meta('appName'),
        url: base,
        logo: `${base}/icon.png`,
        description: meta('tagline'),
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: base,
        name: meta('appName'),
        inLanguage: 'es',
        publisher: { '@id': `${base}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        name: meta('appName'),
        url: base,
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Web, iOS, Android',
        inLanguage: ['es', 'en'],
        description: meta('description'),
        image: `${base}/og.png`,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      },
    ],
  }

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
