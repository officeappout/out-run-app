'use client';

/**
 * useUiGender() — the gender copy is written for (src/lib/i18n/gender-copy.ts):
 * the profile's gender, or during onboarding the gender picked on the identity screen.
 * 'other' (unknown / chose "other") → neutral copy.
 *
 *   const gender = useUiGender();
 *   pickGendered(gender, GENDERED_COPY.retry)   // נסה שוב / נסי שוב / נסו שוב
 */
import { useLocaleStore } from '@/store/useLocaleStore';
import type { Gender } from '@/lib/i18n/core/i18n-core';

export function useUiGender(): Gender {
  return useLocaleStore((s) => s.gender);
}

/** The same gender outside render (event handlers, async callbacks, class components). */
export function currentUiGender(): Gender {
  return useLocaleStore.getState().gender;
}
