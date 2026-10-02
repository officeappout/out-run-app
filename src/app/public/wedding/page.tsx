'use client';
export const dynamic = 'force-dynamic';

import { WeddingPlanner } from '@/features/wedding/components/WeddingPlanner';

/**
 * /public/wedding — the owner's wedding planner, open link, no login
 * (David's explicit choice, 02.10.2026). /public/* bypasses the
 * middleware's admin gating and the app's bottom navigation.
 */
export default function WeddingPage() {
  return (
    <div className="h-[100dvh] overflow-y-auto bg-gray-50">
      <WeddingPlanner />
    </div>
  );
}
