import type { Metadata } from 'next'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jb-mono',
})

export const metadata: Metadata = {
  title: 'par3 — Tu copiloto de practica',
  description: 'Análisis de postura para golf con MediaPipe Pose',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${dmSans.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
