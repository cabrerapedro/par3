import type { Metadata } from 'next'
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif',
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
    <html lang={locale} className={`${dmSans.variable} ${dmSerif.variable} ${jbMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#09090b" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <TooltipProvider delayDuration={300}>
              <AuthProvider>
                {/* Global background: radial glow + grain — fixed, behind all content */}
                <div
                  className="pointer-events-none fixed inset-0 z-0"
                  style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(52, 209, 120, 0.04) 0%, transparent 60%)' }}
                />
                <div
                  className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }}
                />
                {children}
              </AuthProvider>
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
