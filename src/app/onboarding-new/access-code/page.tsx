'use client';

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import AccessCodeLinkScreen from '@/features/user/onboarding/components/AccessCodeLinkScreen';

/** /onboarding-new/access-code?code=CODE — landing for /school/CODE institution links. */
export default function AccessCodePage() {
  return (
    <Suspense fallback={null}>
      <AccessCodeLinkScreen />
    </Suspense>
  );
}
