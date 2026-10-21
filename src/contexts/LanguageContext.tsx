'use client';

/**
 * useLanguage — the legacy he/en language of the old dictionary screens
 * (challenge pages, LiveWorkoutOverlay, old onboarding components).
 *
 * It used to be a React Context (LanguageProvider in ClientLayout). axioms §7
 * allows no new Contexts and the i18n layer is Zustand, so since i18n wave 1 it is
 * a plain hook over useAppStore with the same return shape; LanguageProvider is
 * gone and its <html lang dir> effect moved, unchanged, to
 * src/components/system/LocaleSync.tsx. New code uses useT() (docs/i18n/HOW-TO.md).
 * TODO(i18n wave 2D/2I): move these screens to useT() and delete this file
 * (tracked in docs/i18n/PLAN.md §1.4).
 */
import { useAppStore } from '@/store/useAppStore';
import type { AppLanguage } from '@/features/content/shared';

interface LanguageValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  direction: 'rtl' | 'ltr';
}

export function useLanguage(): LanguageValue {
  const language = useAppStore((s) => s.language);
  const direction = useAppStore((s) => s.direction);
  const setStoreLanguage = useAppStore((s) => s.setLanguage);
  return {
    language,
    direction,
    // The store holds 'he' | 'en'; legacy 'es' maps to English.
    setLanguage: (lang: AppLanguage) => setStoreLanguage(lang === 'es' ? 'en' : lang),
  };
}
