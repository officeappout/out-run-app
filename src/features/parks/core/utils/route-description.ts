import { resolveContentText, type StoredText } from '@/features/content/shared/content-locale';
import type { AppLanguage } from '@/features/content/shared/localized-text.types';
import { isStoredLocalized } from '@/features/content/shared/stored-text-fields';

/**
 * Route docs (official_routes / curated_routes) keep `description` as a Hebrew string, or, after the English content import, a
 * { he, en } pair in the same field. Readers that expect a string go through here: Hebrew by default, the pair's slot in `lang`.
 * Pure: no React, no Firebase.
 */
export function routeDescriptionText(value: unknown, lang: AppLanguage = 'he'): string {
  if (typeof value === 'string') return value;
  return isStoredLocalized(value) ? resolveContentText(value as StoredText, lang) : '';
}
