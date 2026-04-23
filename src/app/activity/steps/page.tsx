'use client';

/**
 * Route: /activity/steps
 *
 * Detailed Steps Analytics page — drill-down from the dashboard
 * StepsSummaryCard. Shows Day / Week / Month / Year bar-chart history
 * with the same design language as the Exercise Statistics screen.
 */

import dynamicImport from 'next/dynamic';

// SSR-disabled: the page reads from the client-side activity store and
// uses Recharts which depends on the DOM.
const StepsAnalyticsPage = dynamicImport(
  () => import('@/features/activity/components/StepsAnalyticsPage'),
  { ssr: false },
);

export const dynamic = 'force-dynamic';

export default function StepsAnalyticsRoute() {
  return <StepsAnalyticsPage />;
}
