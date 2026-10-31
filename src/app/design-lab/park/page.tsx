import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isDesignLabEnabled } from '../_shared/demo-access';
import ParkLab from './ParkLab';

/** Design lab — פארק in the site's design language. Fixture data only. */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design lab · פארק', robots: { index: false, follow: false } };

export default function Page() {
  if (!isDesignLabEnabled()) notFound();
  return <ParkLab />;
}
