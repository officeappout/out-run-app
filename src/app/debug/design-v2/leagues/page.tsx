import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isDesignDemoEnabled } from '../demo-access';
import LeaguesPreview from './LeaguesPreview';

/**
 * Dev-only design preview for the leagues tab (design language v2 rollout).
 * Renders the real presentational views with fixture data — no Firebase, no
 * auth. 404s outside `next dev` and Vercel previews.
 *
 *   ?state=full | top | sparse | empty | battle | groups | units
 *   ?mode=distance | general | steps
 */
// Evaluate the env gate per request, not at build time (see demo-access.ts).
export const dynamic = 'force-dynamic';

export default function Page() {
  if (!isDesignDemoEnabled()) notFound();
  return (
    <Suspense fallback={null}>
      <LeaguesPreview />
    </Suspense>
  );
}
