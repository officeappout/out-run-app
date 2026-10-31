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

/** Same, read once outside React (pure display helpers that cannot call a hook). */
export function getContentLanguage(): AppLanguage {
  const { locale, contentLocaleOn } = useLocaleStore.getState();
  return contentLanguage(locale, contentLocaleOn);
}
