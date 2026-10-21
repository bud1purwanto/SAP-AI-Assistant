import { useCallback, useEffect, useState } from 'react';

export const THEME_KEY = 'sap_assistant_theme';
/** Penanda bahwa tema di THEME_KEY dipilih sendiri oleh pengguna (bukan default lama). */
export const THEME_EXPLICIT_KEY = 'sap_assistant_theme_explicit';

/** Pilihan tema: hanya light dan dark. */
export const THEME_OPTIONS = ['light', 'dark'];

const isValid = (value) => value === 'light' || value === 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme() {
  try {
    return window.matchMedia && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Tema pilihan pengguna, atau null bila belum pernah memilih.
 * Versi lama selalu menyimpan 'light' sebagai default; nilai itu tanpa penanda
 * eksplisit tidak dianggap pilihan pengguna. 'dark' selalu merupakan pilihan sendiri.
 */
export function readStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (!isValid(saved)) return null;
    if (saved === 'dark' || localStorage.getItem(THEME_EXPLICIT_KEY) === '1') return saved;
    return null;
  } catch {
    return null;
  }
}

/** Tema yang aktif ('light' atau 'dark'). */
export function resolveTheme(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

/**
 * Menerapkan tema ke <html>.
 * Meta color-scheme ikut disesuaikan agar browser seperti Samsung Internet tidak
 * menggelapkan paksa tampilan terang ("only light"), dan memakai tema gelap aplikasi sendiri.
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
    const metaScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaScheme) {
      metaScheme.setAttribute('content', target === 'dark' ? 'dark' : 'only light');
    }
  } catch {}
}

/**
 * Sumber kebenaran tunggal untuk tema (Dark & Light).
 * Selama pengguna belum memilih, tema mengikuti preferensi sistem/browser.
 */
export function useTheme() {
  const [chosen, setChosen] = useState(readStoredTheme);
  const [system, setSystem] = useState(systemTheme);
  const theme = chosen || system;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (chosen) return undefined;
    let media;
    try {
      media = window.matchMedia && window.matchMedia(DARK_QUERY);
    } catch {
      return undefined;
    }
    if (!media) return undefined;
    const onChange = (e) => setSystem(e.matches ? 'dark' : 'light');
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [chosen]);

  const choose = useCallback((next) => {
    const value = isValid(next) ? next : 'light';
    setChosen(value);
    try {
      localStorage.setItem(THEME_KEY, value);
      localStorage.setItem(THEME_EXPLICIT_KEY, '1');
    } catch {
      /* penyimpanan tidak tersedia (mode privat) — tema tetap berlaku untuk sesi ini */
    }
  }, []);

  const setTheme = useCallback((next) => choose(next), [choose]);

  const cycleTheme = useCallback(() => {
    choose(theme === 'light' ? 'dark' : 'light');
  }, [choose, theme]);

  return { theme, resolvedTheme: resolveTheme(theme), setTheme, cycleTheme };
}
