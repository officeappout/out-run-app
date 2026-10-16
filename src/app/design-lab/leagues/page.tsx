import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isDesignLabEnabled } from '../_shared/demo-access';
import LeaguesLab from './LeaguesLab';

/**
 * Design lab — leagues in the site's design language: personal divisions with
 * promotion/relegation, neighborhood head-to-head, cities and brigades, all
 * scored per active member so small groups can win. Fixture data only.
 *
 *   ?tab=people | neighborhoods | cities | units
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design lab · ליגות', robots: { index: false, follow: false } };

export default function Page() {
  if (!isDesignLabEnabled()) notFound();
  return <LeaguesLab />;
}
