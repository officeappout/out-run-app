/**
 * Shared Localization Types
 * Used across all content domains for multi-language support
 */

import type { LegacyContentLanguage } from '@/lib/i18n/locales';

// Subset of the one locale type (src/lib/i18n/locales.ts); 'es' is a legacy content-only slot.
export type AppLanguage = LegacyContentLanguage;

export interface LocalizedText {
  he: string;
  en: string;
  es?: string;
}

/**
 * Helper: Resolve localized text by language with graceful fallback.
 */
export function getLocalizedText(
  value: LocalizedText | undefined,
  language: AppLanguage = 'he'
): string {
  if (!value) return '';
  if (language === 'he' && value.he) return value.he;
  if (language === 'en' && value.en) return value.en;
  if (language === 'es' && value.es) return value.es || value.en || value.he;
  // Fallback order: he -> en -> es
  return value.he || value.en || value.es || '';
}
