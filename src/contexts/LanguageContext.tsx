'use client';

import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { AppLanguage } from '@/features/content/shared';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  direction: 'rtl' | 'ltr';
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language, setLanguage, direction } = useAppStore();

  // Update HTML dir and lang attributes when language changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      html.setAttribute('dir', direction);
      html.setAttribute('lang', language === 'es' ? 'es' : language);
    }
  }, [language, direction]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      direction,
      setLanguage: (lang: AppLanguage) => {
        // Underlying store currently supports 'he' | 'en'. Map 'es' to English as fallback.
        if (lang === 'es') {
          setLanguage('en');
        } else {
          setLanguage(lang);
        }
      },
    }),
    [language, direction, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

