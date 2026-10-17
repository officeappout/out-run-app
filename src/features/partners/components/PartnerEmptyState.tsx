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
import { Users, SlidersHorizontal } from 'lucide-react';
import LemurAvatar from '@/features/user/progression/components/LemurAvatar';
import { useUserStore } from '@/features/user';
import { g } from '@/lib/utils/gendered-text';
import { IS_XP_ENABLED } from '@/config/feature-flags';

interface PartnerEmptyStateProps {
  tab: 'live' | 'scheduled';
  /** Home v2: calm white-card variant (the host renders the card chrome). */
  v2?: boolean;
  /** Home v2: the one secondary action (PartnerOverlay → opens the filter sheet). */
  onAction?: () => void;
  actionLabel?: string;
}

export function PartnerEmptyState({ tab, v2 = false, onAction, actionLabel }: PartnerEmptyStateProps) {
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

  if (v2) {
    return (
      <div dir="rtl" className="flex w-full flex-col items-center justify-center px-6 py-8 text-center">
        {IS_XP_ENABLED ? (
          <div className="mb-4 opacity-60">
            <LemurAvatar level={1} size="large" />
          </div>
        ) : (
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-v2-tint">
            <Users className="h-7 w-7 text-v2-deep" aria-hidden />
          </div>
        )}
        <p className="max-w-[280px] text-[16px] font-black leading-snug !tracking-[-0.01em] text-v2-ink">
          {title}
        </p>
        <p className="mt-1.5 max-w-[280px] text-[13px] font-bold leading-snug text-v2-muted">
          {sub}
        </p>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-[14px] font-extrabold text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <SlidersHorizontal size={15} className="text-v2-deep" aria-hidden />
            {actionLabel ?? 'שינוי סינון'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="flex flex-col items-center justify-center text-center px-8 py-10 w-full"
    >
      {/* IS_XP_ENABLED gate (round 5 — a missed gamification-character
          instance). Default: a neutral icon placeholder, consistent with
          the profile header's initials-avatar approach — no specific user
          here to show initials for, so a generic icon instead. */}
      <div className="opacity-50 mb-4">
        {IS_XP_ENABLED ? (
          <LemurAvatar level={1} size="large" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
        )}
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
