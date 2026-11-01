import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isDesignLabEnabled } from '../_shared/demo-access';
import FeedLab from './FeedLab';

/**
 * Design lab — the community feed, a post, the profile's posts and who sees
 * what. Fixture data only.
 *
 *   ?screen=feed | post | profile | share | privacy
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design lab · פיד', robots: { index: false, follow: false } };

export default function Page() {
  if (!isDesignLabEnabled()) notFound();
  return <FeedLab />;
}
