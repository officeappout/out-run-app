import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import LeaguesPreview from './LeaguesPreview';

/**
 * Dev-only design preview for the leagues tab (design language v2 rollout).
 * Renders the real presentational views with fixture data — no Firebase, no
 * auth. 404s outside `next dev`.
 *
 *   ?state=full | top | sparse | empty | battle | groups | units
 *   ?mode=distance | general | steps
 */
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <Suspense fallback={null}>
      <LeaguesPreview />
    </Suspense>
  );
}
