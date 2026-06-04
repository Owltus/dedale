import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  /** Thème effectivement appliqué (résout 'system'). */
  resolved: 'light' | 'dark'
}

const STORAGE_KEY = 'dedale-theme'
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : 'system'
  })
  const [systemDark, setSystemDark] = useState(prefersDark)

  // Suit les changements de préférence système (utile quand theme === 'system').
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      setSystemDark(mq.matches)
    }
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
    }
  }, [])

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved,
      setTheme: (next) => {
        localStorage.setItem(STORAGE_KEY, next)
        setThemeState(next)
      },
    }),
    [theme, resolved],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error(
      'useTheme doit être utilisé à l’intérieur de <ThemeProvider>',
    )
  }
  return ctx
}
