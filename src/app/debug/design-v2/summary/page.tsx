import { notFound } from 'next/navigation';
import { isDesignDemoEnabled } from '../demo-access';
import SummaryPreview from './SummaryPreview';

/**
 * Route: /debug/design-v2/summary — dev-only fixture preview of the
 * post-workout summary screens (design-v2 rollout screenshots).
 * 404s outside `next dev` and Vercel previews; no Firebase/auth, fixtures only.
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
  if (!isDesignDemoEnabled()) notFound();
  return <SummaryPreview variant={searchParams.variant ?? 'running'} snap={searchParams.snap} />;
}
