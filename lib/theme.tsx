'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'light'
interface ThemeState { theme: Theme; toggle: () => void }

const ThemeContext = createContext<ThemeState>({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = (localStorage.getItem('sweep_theme') as Theme) ?? 'dark'
    apply(saved)
  }, [])

  function apply(t: Theme) {
    setTheme(t)
    document.documentElement.classList.toggle('light', t === 'light')
    localStorage.setItem('sweep_theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => apply(theme === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }
