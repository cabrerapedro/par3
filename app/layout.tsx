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
  const t = await getTranslations('meta')
  return {
    title: `${t('appName')} — ${t('tagline')}`,
    description: t('description'),
    manifest: '/manifest.json',
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
