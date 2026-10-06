'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';

import { resolveTheme, THEME_KEY, type Theme } from '../client/theme-preference';

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

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'dark' ? '#171717' : '#f8f9fc';
  // Let the next server render use the same palette before JavaScript starts.
  try { document.cookie = `${THEME_KEY}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`; } catch {}
}

export function ThemeProvider({ children, initialTheme = 'light' }: { children: ReactNode; initialTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const themeRef = useRef<Theme>(initialTheme);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch {}
    // Recover the stored palette even if hydration or a blocked bootstrap
    // script changed the root attribute. Never overwrite storage with light.
    const current = resolveTheme(saved, initialTheme);
    themeRef.current = current;
    setThemeState(current);
    applyTheme(current);
  }, [initialTheme]);

  const setTheme = (next: Theme) => {
    themeRef.current = next;
    setThemeState(next);
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
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
