import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  type ColorTheme,
  buildThemeCss,
  colorThemes,
  getColorTheme,
  DEFAULT_COLOR_THEME,
  DEFAULT_RADIUS,
} from '@papaya/shared-ui/lib/themes';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** Light / dark / system preference */
  theme: Theme;
  /** Computed: always 'light' or 'dark' */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;

  /** Active color theme name */
  colorTheme: string;
  setColorTheme: (name: string) => void;

  /** Border radius in rem */
  radius: number;
  setRadius: (r: number) => void;
}

const STORAGE_KEY = 'oasis-theme';
const COLOR_THEME_KEY = 'oasis-color-theme';
const RADIUS_KEY = 'oasis-radius';
const STYLE_ID = 'oasis-theme-vars';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => {},
  radius: DEFAULT_RADIUS,
  setRadius: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function getStoredColorTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_COLOR_THEME;
  return localStorage.getItem(COLOR_THEME_KEY) ?? DEFAULT_COLOR_THEME;
}

function getStoredRadius(): number {
  if (typeof window === 'undefined') return DEFAULT_RADIUS;
  const stored = localStorage.getItem(RADIUS_KEY);
  if (stored !== null) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_RADIUS;
}

function applyMode(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function applyColorTheme(theme: ColorTheme, radius: number) {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const css = buildThemeCss(theme, radius);

  if (!css) {
    // Default theme — remove any overrides
    styleEl?.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [colorThemeName, setColorThemeState] = useState<string>(getStoredColorTheme);
  const [radius, setRadiusState] = useState<number>(getStoredRadius);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange(e: MediaQueryListEvent) {
      setSystemTheme(e.matches ? 'dark' : 'light');
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Apply dark/light mode to DOM
  useEffect(() => {
    applyMode(resolvedTheme);
  }, [resolvedTheme]);

  // Apply color theme CSS variables
  useEffect(() => {
    const ct = getColorTheme(colorThemeName) ?? colorThemes[0]!;
    applyColorTheme(ct, radius);
  }, [colorThemeName, radius]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  const setColorTheme = useCallback((name: string) => {
    setColorThemeState(name);
    localStorage.setItem(COLOR_THEME_KEY, name);
  }, []);

  const setRadius = useCallback((r: number) => {
    setRadiusState(r);
    localStorage.setItem(RADIUS_KEY, String(r));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      colorTheme: colorThemeName,
      setColorTheme,
      radius,
      setRadius,
    }),
    [theme, resolvedTheme, setTheme, colorThemeName, setColorTheme, radius, setRadius],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
