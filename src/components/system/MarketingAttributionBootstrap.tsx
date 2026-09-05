'use client';

/**
 * MarketingAttributionBootstrap — root-level client component mounted in
 * the root layout, alongside NativeBootstrap.
 *
 * Calls `captureMarketingAttribution()` on every mount (any entry page,
 * any client-side navigation that changes the query string) so an inbound
 * UTM/link_id/click-id survives to the onboarding-completion write gate.
 * The capture function itself is idempotent (first-touch wins) — see
 * `src/lib/marketingAttribution.ts` — so calling it more than once per
 * session is always safe.
 *
 * Wrapped in its own <Suspense> boundary because `useSearchParams()`
 * requires one in the Next.js App Router (without it, the framework
 * bails the whole route out of static rendering at build time). The
 * fallback renders nothing — there is no UI here, only a side effect.
 */

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { captureMarketingAttribution } from '@/lib/marketingAttribution';

function CaptureOnMount() {
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  useEffect(() => {
    captureMarketingAttribution(searchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchString]);

  return null;
}

export default function MarketingAttributionBootstrap() {
  return (
    <Suspense fallback={null}>
      <CaptureOnMount />
    </Suspense>
  );
}
