import type { Metadata } from 'next';

/**
 * Keeps the share link private-by-obscurity: not indexed, and the secret
 * path is never sent as a Referer when someone clicks an outbound link
 * (e.g. the market-price sources).
 */
export const metadata: Metadata = {
  title: 'תכנון חתונה',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function WeddingShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
