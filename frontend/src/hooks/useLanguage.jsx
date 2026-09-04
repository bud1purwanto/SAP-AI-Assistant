import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, translate } from '../lib/i18n';

const LanguageContext = createContext(null);

export function readStoredLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const valid = SUPPORTED_LANGUAGES.some((l) => l.code === saved);
    return valid ? saved : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      document.documentElement.setAttribute('lang', language);
    } catch {
      /* Mode privat — bahasa tetap berlaku selama sesi ini */
    }
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (SUPPORTED_LANGUAGES.some((l) => l.code === code)) {
      setLanguageState(code);
    }
  }, []);

  const t = useCallback(
    (key, params) => translate(language, key, params),
    [language]
  );

  const isEn = language === 'en';
  const isId = language === 'id';

  return (
    <LanguageContext.Provider
      value={{
        language,
        isEn,
        isId,
        setLanguage,
        t,
        languages: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback bila dipakai di luar provider
    const isEn = DEFAULT_LANGUAGE === 'en';
    const isId = DEFAULT_LANGUAGE === 'id';
    return {
      language: DEFAULT_LANGUAGE,
      isEn,
      isId,
      setLanguage: () => {},
      t: (key, params) => translate(DEFAULT_LANGUAGE, key, params),
      languages: SUPPORTED_LANGUAGES,
    };
  }
  return context;
}

