import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isDesignDemoEnabled } from '../demo-access';
import GuidedPreview from './GuidedPreview';

/**
 * Dev-only preview of the guided station layer (design v2, task 4d) with fixture data —
 * no Firebase, no auth. 404s outside `next dev` and Vercel previews.
 *
 *   ?state=welcome | coach (&step=0..2) | find | find-tabata | gate | complete | complete-fast
 */
// Evaluate the env gate per request, not at build time (see demo-access.ts).
export const dynamic = 'force-dynamic';

export default function Page() {
  if (!isDesignDemoEnabled()) notFound();
  return (
    <Suspense fallback={null}>
      <GuidedPreview />
    </Suspense>
  );
}
