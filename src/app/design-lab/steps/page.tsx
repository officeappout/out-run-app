import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isDesignLabEnabled } from '../_shared/demo-access';
import StepsLab from './StepsLab';

/** Design lab — צעדים in the site's design language. Fixture data only. */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design lab · צעדים', robots: { index: false, follow: false } };

export default function Page() {
  if (!isDesignLabEnabled()) notFound();
  return <StepsLab />;
}
