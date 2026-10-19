'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
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
 */
export function useWizardIdentity(): { gender: WizardGender; firstName: string } {
  const profileGender = useUserStore((s) => s.profile?.core?.gender);
  const profileName = useUserStore((s) => s.profile?.core?.name);
  return useMemo(
    () => ({
      gender: resolveWizardGender(profileGender, readSession('onboarding_personal_gender')),
      firstName: resolveWizardFirstName(profileName, readSession('onboarding_personal_name')),
    }),
    [profileGender, profileName],
  );
}
