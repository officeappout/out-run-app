import type { Metadata } from 'next';
import TvEntry from '@/features/tv-mode/tv/TvEntry';

export const metadata: Metadata = {
  title: 'OUT TV',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TvEntry />;
}
