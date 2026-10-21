'use client';

export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import IdentityProfileScreen from '@/features/user/onboarding/components/IdentityProfileScreen';
import EarlyPushSoftAskGate from '@/features/user/onboarding/components/push-early/EarlyPushSoftAskGate';

/**
 * /onboarding-new/profile — the identity screen (gender, birth date, name).
 * The screen itself lives in IdentityProfileScreen so the JIT workout-start
 * gate can render the same screen inline (enable_jit_identity_v1); this route
 * only passes the ?context= query through.
 */
export default function IdentityProfilePage() {
  const searchParams = useSearchParams();
  // hostPadsTop: ClientLayout's <main> already pads the top safe-area inset here.
  // enable_home_v2: the early push soft-ask, once, before identity (renders the screen untouched otherwise).
  return (
    <EarlyPushSoftAskGate context={searchParams.get('context')}>
      <IdentityProfileScreen context={searchParams.get('context')} hostPadsTop />
    </EarlyPushSoftAskGate>
  );
}
