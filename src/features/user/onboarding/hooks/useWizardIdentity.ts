'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveUiGender } from '@/lib/i18n/gender-copy';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import {
  resolveWizardFirstName,
  resolveWizardGender,
  type WizardGender,
} from '../utils/wizard-identity';

function readSession(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The user's gender + first name for wizard copy: profile first, the signup's
 * sessionStorage answers as the fallback (see utils/wizard-identity.ts).
 *
 * `gender` is the male/female pick (images, emoji — unknown reads 'male').
 * `copyGender` is the ICU `gender` argument for text: 'male' | 'female' | 'other',
 * where 'other' (unknown or chose "other") gets the neutral copy (owner decision 21.10.2026).
 */
export function useWizardIdentity(): { gender: WizardGender; copyGender: Gender; firstName: string } {
  const profileGender = useUserStore((s) => s.profile?.core?.gender);
  const profileName = useUserStore((s) => s.profile?.core?.name);
  return useMemo(
    () => ({
      gender: resolveWizardGender(profileGender, readSession('onboarding_personal_gender')),
      copyGender: resolveUiGender(profileGender, readSession('onboarding_personal_gender')),
      firstName: resolveWizardFirstName(profileName, readSession('onboarding_personal_name')),
    }),
    [profileGender, profileName],
  );
}
