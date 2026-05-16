import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'
type FontFamily = 'inter' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  defaultFont?: FontFamily
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  font: FontFamily
  setFont: (font: FontFamily) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  font: 'system',
  setFont: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  defaultFont = 'system',
  storageKey = 'ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )
  const [font, setFont] = useState<FontFamily>(
    () => (localStorage.getItem(`${storageKey}-font`) as FontFamily) || defaultFont
  )

  useEffect(() => {
    const root = window.document.documentElement

    // Updates classList for Tailwind dark mode
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme])
  
  // Font application
  useEffect(() => {
    const root = window.document.documentElement
    if (font === 'inter') {
      root.dataset.font = 'inter'
    } else {
      delete root.dataset.font
    }
  }, [font])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
    font,
    setFont: (font: FontFamily) => {
      localStorage.setItem(`${storageKey}-font`, font)
      setFont(font)
    }
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
