/**
 * enable_group_fixes_v1 for plain (non-React) client code: the signed-in
 * user's own super-admin bit (preview) or a one-shot read of the panel flag.
 */
import { readFeatureFlagOnce } from '@/lib/feature-flag-once';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export async function groupFixesNow(): Promise<boolean> {
  const core = useUserStore.getState().profile?.core as { isSuperAdmin?: boolean } | undefined;
  if (core?.isSuperAdmin) return true;
  return readFeatureFlagOnce('enable_group_fixes_v1');
}
