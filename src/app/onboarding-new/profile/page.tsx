'use client';

export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import IdentityProfileScreen from '@/features/user/onboarding/components/IdentityProfileScreen';

/**
 * /onboarding-new/profile — the identity screen (gender, birth date, name).
 * The screen itself lives in IdentityProfileScreen so the JIT workout-start
 * gate can render the same screen inline (enable_jit_identity_v1); this route
 * only passes the ?context= query through.
 */
export default function IdentityProfilePage() {
  const searchParams = useSearchParams();
  return <IdentityProfileScreen context={searchParams.get('context')} />;
}
