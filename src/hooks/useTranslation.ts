/**
 * useTranslation Hook
 * Bridges between Firestore data (like exercise names) and static UI strings
 */
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { getLocalizedText, LocalizedText } from '@/types/exercise.type';
import type { AppLanguage } from '@/types/exercise.type';

/**
 * Hook for translating static UI strings and Firestore localized content
 */
export function useTranslation() {
  const { language } = useLanguage();

  /**
   * Translate a static UI string key
   */
  const t = (key: DictionaryKey): string => {
    return getTranslation(key, language);
  };

  /**
   * Get localized text from Firestore data (e.g., exercise names, descriptions)
   */
  const getLocalized = (text: LocalizedText | undefined, fallback: string = ''): string => {
    if (!text) return fallback;
    return getLocalizedText(text, language) || fallback;
  };

  /**
   * Get the current language
   */
  const currentLang = (): AppLanguage => {
    return language;
  };

  return {
    t,
    getLocalized,
    language,
    currentLang,
  };
}
