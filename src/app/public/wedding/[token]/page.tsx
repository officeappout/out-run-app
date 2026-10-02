'use client';
export const dynamic = 'force-dynamic';

import { useParams } from 'next/navigation';
import { WeddingPlanner } from '@/features/wedding/components/WeddingPlanner';

/**
 * /public/wedding/<token> — the wedding planner without a login.
 * /public/* already bypasses the middleware's admin gating and the app's
 * bottom navigation. The token is checked by /api/public/wedding on every
 * request; this page only passes it along.
 */
export default function WeddingSharePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  return (
    <div className="h-[100dvh] overflow-y-auto bg-gray-50">
      <WeddingPlanner access={{ mode: 'share', token }} />
    </div>
  );
}
