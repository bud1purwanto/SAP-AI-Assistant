import { useCallback, useEffect, useState } from 'react';

export const THEME_KEY = 'sap_assistant_theme';

/** Pilihan tema: hanya light dan dark. */
export const THEME_OPTIONS = ['light', 'dark'];

const isValid = (value) => value === 'light' || value === 'dark';

export function readStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return isValid(saved) ? saved : 'light';
  } catch {
    return 'light';
  }
}

/** Tema yang aktif ('light' atau 'dark'). */
export function resolveTheme(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

/**
 * Menerapkan tema ke <html>.
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  const target = resolveTheme(theme);
  root.setAttribute('data-theme', target);
  root.classList.toggle('dark', target === 'dark');
  root.style.colorScheme = target === 'dark' ? 'dark' : 'only light';

  try {
    const metaTheme = document.getElementById('meta-theme-color') || document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', target === 'dark' ? '#09090b' : '#f8fafc');
    }
  } catch {}
}

/**
 * Sumber kebenaran tunggal untuk tema (Dark & Light).
 * Default saat pengguna pertama kali masuk adalah 'light'.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* penyimpanan tidak tersedia (mode privat) — tema tetap berlaku untuk sesi ini */
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(isValid(next) ? next : 'light');
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, resolvedTheme: resolveTheme(theme), setTheme, cycleTheme };
}
