import { notFound } from 'next/navigation';
import SummaryPreview from './SummaryPreview';

/**
 * Route: /debug/design-v2/summary — dev-only fixture preview of the
 * post-workout summary screens (design-v2 rollout screenshots).
 * 404s outside `next dev`; no Firebase/auth, fixtures only.
 *
 *   ?variant=running | walking | group | hybrid | strength
 *   &snap=collapsed  (drawer variants: open the sheet at its peek snap)
 */
export const dynamic = 'force-dynamic';

export default function Page({
  searchParams,
}: {
  searchParams: { variant?: string; snap?: string };
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <SummaryPreview variant={searchParams.variant ?? 'running'} snap={searchParams.snap} />;
}
