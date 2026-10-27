'use client';

/** Settings language row state (wave 5A). `options` is empty when the row must not render. */
import { useCallback } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useLocaleStore } from '@/store/useLocaleStore';
import { languageOptions, type LanguageOption } from '@/lib/i18n/language-setting';
import { setUserLocale } from '@/lib/i18n/locale-persistence';
import type { Locale } from '@/lib/i18n/locales';

export function useLanguageSetting(): {
  options: LanguageOption[];
  locale: Locale;
  choose: (next: Locale) => Promise<void>;
} {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const uid = useUserStore((s) => s.profile?.id);
  const { flags } = useFeatureFlags(isSuperAdmin);
  const locale = useLocaleStore((s) => s.locale);
  const options = languageOptions(flags, isSuperAdmin);
  const choose = useCallback(
    async (next: Locale) => {
      if (!options.some((o) => o.value === next)) return;
      await setUserLocale(next, uid);
    },
    // options derive from flags + isSuperAdmin
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, flags.enableI18n, flags.enableLocaleEn, flags.enableLocaleRu, flags.enableLocaleDe, isSuperAdmin],
  );
  return { options, locale, choose };
}
