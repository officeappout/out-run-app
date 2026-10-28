'use client';

import { useLocaleStore } from '@/store/useLocaleStore';
import { contentLanguage } from './content-locale';
import type { AppLanguage } from './localized-text.types';

/** The language user-facing content (exercise names etc.) resolves in. 'he' while enable_content_locale is off. */
export function useContentLanguage(): AppLanguage {
  const locale = useLocaleStore((s) => s.locale);
  const on = useLocaleStore((s) => s.contentLocaleOn);
  return contentLanguage(locale, on);
}
