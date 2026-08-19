import { useCallback, useEffect, useState } from 'react';

export const THEME_KEY = 'sap_assistant_theme';

/** Tiga pilihan tema. "system" mengikuti preferensi sistem operasi. */
export const THEME_OPTIONS = ['light', 'dark', 'system'];

const isValid = (value) => THEME_OPTIONS.includes(value);

export function readStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return isValid(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** Tema yang benar-benar tampil, setelah "system" diterjemahkan. */
export function resolveTheme(theme) {
  if (theme !== 'system') return theme;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Menerapkan tema ke <html>.
 *
 * Untuk mode "system" atribut data-theme sengaja dikosongkan agar CSS
 * (@media prefers-color-scheme) yang memutuskan — tanpa perlu JavaScript
 * ikut campur setiap kali preferensi OS berubah.
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  // Kelas .dark dipertahankan untuk utilitas dark: warisan.
  root.classList.toggle('dark', resolveTheme(theme) === 'dark');
}

/**
 * Sumber kebenaran tunggal untuk tema.
 *
 * Sebelumnya App.jsx dan ChatLayout.jsx sama-sama menyimpan state tema dan
 * menulis ke key localStorage yang sama dengan nilai default berbeda, sehingga
 * keduanya saling menimpa saat pemuatan pertama.
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

  // Saat mode "system", ikuti perubahan preferensi OS secara langsung.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(isValid(next) ? next : 'system');
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => THEME_OPTIONS[(THEME_OPTIONS.indexOf(prev) + 1) % THEME_OPTIONS.length]);
  }, []);

  return { theme, resolvedTheme: resolveTheme(theme), setTheme, cycleTheme };
}
