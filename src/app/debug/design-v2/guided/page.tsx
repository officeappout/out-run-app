import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import GuidedPreview from './GuidedPreview';

/**
 * Dev-only preview of the guided station layer (design v2, task 4d) with fixture data —
 * no Firebase, no auth. 404s outside `next dev`.
 *
 *   ?state=welcome | coach (&step=0..2) | find | find-tabata | gate | complete | complete-fast
 */
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <Suspense fallback={null}>
      <GuidedPreview />
    </Suspense>
  );
}
