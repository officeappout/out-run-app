'use client';

/**
 * PartnerEmptyState — shown inside PartnerOverlay when the filtered list
 * has zero results. Tab-aware copy nudges the user toward the right
 * recovery action (broaden, schedule, or share).
 *
 * Hebrew copy is gender-aware (`profile.core.gender`):
 *   - male:   "היה הראשון — סמן את עצמך פנוי…"
 *   - female: "היי הראשונה — סמני את עצמך פנויה…"
 *   - other:  falls back to male form (codebase convention).
 */

import React from 'react';
import LemurAvatar from '@/features/user/progression/components/LemurAvatar';
import { useUserStore } from '@/features/user';
import { g } from '@/lib/utils/gendered-text';

interface PartnerEmptyStateProps {
  tab: 'live' | 'scheduled';
}

export function PartnerEmptyState({ tab }: PartnerEmptyStateProps) {
  const gender = useUserStore((s) => s.profile?.core?.gender) ?? 'male';

  const title =
    tab === 'live'
      ? 'אין מתאמנים פעילים קרוב אליך עכשיו'
      : 'אין אימונים מתוכננים באזור';

  const sub =
    tab === 'live'
      ? `${g(gender, 'היה הראשון', 'היי הראשונה')} — ${g(
          gender,
          'סמן את עצמך פנוי',
          'סמני את עצמך פנויה',
        )} לפני האימון`
      : `${g(gender, 'הוסף אימון ללוז', 'הוסיפי אימון ללוז')} ושתף אותו עם הקהילה`;

  return (
    <div
      dir="rtl"
      className="flex flex-col items-center justify-center text-center px-8 py-10 w-full"
    >
      <div className="opacity-50 mb-4">
        <LemurAvatar level={1} size="large" />
      </div>
      <p className="text-sm font-black text-gray-800 max-w-[260px] leading-snug">
        {title}
      </p>
      <p className="text-xs font-bold text-gray-500 mt-1.5 max-w-[260px] leading-snug">
        {sub}
      </p>
    </div>
  );
}

export default PartnerEmptyState;
