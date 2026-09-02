'use client';

/**
 * ConnectStepsCard — shared "connect your steps" CTA, shown in place of a
 * real steps-based suggestion (rest-day walking route / post-workout route /
 * pre-workout safety-net slot) when `useHealthConnected()` is explicitly
 * `false`. Never shown for `null` (still loading, native) — callers gate
 * that themselves, same as `useHealthConnected`'s own doc comment says.
 *
 * Copy mirrors StepsSummaryCard.tsx's own connectPromptLabel logic exactly
 * (healthPermissionAsked distinguishes "never asked" from "declined before")
 * — one place instead of three independent copies.
 */

import { useSettingsStore } from '@/features/home/store/useSettingsStore';

interface ConnectStepsCardProps {
  onConnect: () => void;
  variant?: 'compact' | 'card';
}

const BRAND = '#00ADEF';

export function ConnectStepsCard({ onConnect, variant = 'card' }: ConnectStepsCardProps) {
  const healthPermissionAsked = useSettingsStore((s) => s.healthPermissionAsked);
  const subtitle = healthPermissionAsked ? 'דחית קודם, רוצה לחבר?' : 'עוד לא חובר';

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onConnect}
        dir="rtl"
        className="w-full bg-white rounded-2xl p-3 shadow-[0_6px_16px_rgba(0,0,0,0.10)] text-right"
      >
        <p className="text-[13px] font-black text-gray-900">חבר את הצעדים שלך</p>
        <p className="text-[11px] font-semibold text-gray-500 mt-0.5">{subtitle}</p>
      </button>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div
        dir="rtl"
        className="w-full bg-white rounded-3xl p-5 shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
      >
        <div>
          <h3 className="text-[15px] font-black text-gray-900 leading-tight">חבר את הצעדים שלך</h3>
          <p className="text-[13px] font-semibold text-gray-500 mt-1.5 leading-snug">
            כדי לקבל הצעת הליכה מותאמת ליעד הצעדים היומי שלך
          </p>
          <p className="text-[13px] font-normal text-gray-600 mt-1.5">{subtitle}</p>
        </div>

        <button
          type="button"
          onClick={onConnect}
          className="mt-4 w-full rounded-full py-2.5 text-[14px] font-black text-white transition-opacity"
          style={{ background: BRAND }}
        >
          חבר עכשיו
        </button>
      </div>
    </div>
  );
}
