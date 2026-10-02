import type { Metadata } from 'next';

/** Not indexed by search engines; no Referer sent on outbound links. */
export const metadata: Metadata = {
  title: 'תכנון חתונה',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function WeddingShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
