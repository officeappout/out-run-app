import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import StepsPreview from './StepsPreview';

// Dev-only design-v2 preview of the Steps page + steps widgets, rendered from
// fixtures (no Firebase/auth). 404s outside `next dev`.
export const dynamic = 'force-dynamic';

export default function StepsDesignPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <Suspense fallback={null}>
      <StepsPreview />
    </Suspense>
  );
}
