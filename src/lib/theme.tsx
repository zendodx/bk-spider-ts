'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'eye';

const STORAGE_KEY = 'bk-spider-theme';

export const THEME_OPTIONS: { value: Theme; label: string; icon: string; desc: string }[] = [
  { value: 'light', label: '浅色', icon: '☀️', desc: '浅色模式' },
  { value: 'dark',  label: '深色', icon: '🌙', desc: '深色模式' },
  { value: 'eye',   label: '护眼', icon: '🍃', desc: '护眼模式' },
];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  // 初始化：从 localStorage 读取
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme = (saved && ['light', 'dark', 'eye'].includes(saved)) ? saved : 'light';
    setThemeState(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
