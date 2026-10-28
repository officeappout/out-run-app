'use client';

import { useLocaleStore } from '@/store/useLocaleStore';
import { dirOf } from '@/lib/i18n/locales';

/**
 * The UI text direction for components rendered INSIDE a forced `dir="ltr"` host (carousels that set ltr for
 * scroll math). Tailwind `ltr:`/`rtl:` variants and logical classes follow ANY ancestor dir, so a card inside
 * such a host must carry its own explicit `dir`: `dir={direction}` is "rtl" in Hebrew (exactly the old
 * hard-coded `dir="rtl"`) and "ltr" in English.
 */
export function useUiDir(): { direction: 'rtl' | 'ltr'; isRtl: boolean } {
  const direction = useLocaleStore((s) => dirOf(s.locale));
  return { direction, isRtl: direction === 'rtl' };
}
