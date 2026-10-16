import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isDesignLabEnabled } from '../_shared/demo-access';
import HomeLab from './HomeLab';

/**
 * Design lab — the home screen in the site's design language (v2): the
 * strength workout card, the weekly schedule, the widgets, and the workout
 * drawer. Fixture data only; nothing here is wired to the real home.
 *
 *   ?state=planned | done | rest     ?drawer=1
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design lab · בית', robots: { index: false, follow: false } };

export default function Page() {
  if (!isDesignLabEnabled()) notFound();
  return <HomeLab />;
}
