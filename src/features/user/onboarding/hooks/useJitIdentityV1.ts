'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

/**
 * `enable_jit_identity_v1` — ask for name / gender / birth date before the
 * health declaration in the JIT workout-start gate. Same read as
 * useOnboardingV2 (super admins preview it via superAdminValue).
 */
export function useJitIdentityV1(): boolean {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags } = useFeatureFlags(isSuperAdmin);
  return flags.enableJitIdentityV1;
}
