'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const themeRef = useRef<Theme>('light');

  useEffect(() => {
    // The bootstrap script has already applied this before the first paint.
    // Do not persist the initial light state over a saved dark preference.
    const current = document.documentElement.dataset.theme;
    if (current === 'dark' || current === 'light') {
      themeRef.current = current;
      setThemeState(current);
    }
  }, []);

  const setTheme = (next: Theme) => {
    themeRef.current = next;
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem('novarquiz-theme', next); } catch {}
  };
  const toggleTheme = () => setTheme(themeRef.current === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
