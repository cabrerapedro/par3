'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'light'
interface ThemeState { theme: Theme; toggle: () => void }

const STORAGE_KEY = 'forat_theme'

const ThemeContext = createContext<ThemeState>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    // One-time migration from the pre-Forat key. Drop after a few releases.
    let saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (!saved) {
      const legacy = localStorage.getItem('sweep_theme') as Theme | null
      if (legacy) {
        saved = legacy
        localStorage.removeItem('sweep_theme')
      }
    }
    // `apply` is a stable function declaration within this provider; calling it
    // during the one-time mount migration is safe (hoisted, never reassigned).
    // eslint-disable-next-line react-hooks/immutability
    apply(saved ?? 'light')
  }, [])

  function apply(t: Theme) {
    setTheme(t)
    document.documentElement.classList.toggle('dark', t === 'dark')
    localStorage.setItem(STORAGE_KEY, t)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => apply(theme === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }
