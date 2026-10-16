import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isDesignLabEnabled } from '../_shared/demo-access';
import ScheduleLab from './ScheduleLab';

/** Design lab — תכנון אימונים in the site's design language. Fixture data only. */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design lab · תכנון אימונים', robots: { index: false, follow: false } };

export default function Page() {
  if (!isDesignLabEnabled()) notFound();
  return <ScheduleLab />;
}
