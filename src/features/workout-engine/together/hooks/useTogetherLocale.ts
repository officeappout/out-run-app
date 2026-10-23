'use client';

import { useLocaleStore } from '@/store/useLocaleStore';
import { dirOf } from '@/lib/i18n/locales';

/** The user's locale + text direction for the together surfaces (no hard-coded RTL). */
export function useTogetherLocale() {
  const locale = useLocaleStore((s) => s.locale);
  return { locale, dir: dirOf(locale), isRtl: dirOf(locale) === 'rtl' };
}
