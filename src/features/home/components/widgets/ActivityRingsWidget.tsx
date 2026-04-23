'use client';

/**
 * ActivityRingsWidget — Home-page widget for daily activity rings.
 *
 * Native Phase, Apr 2026.
 *
 * Wraps the existing ConcentricRingsProgress (the same SVG +
 * framer-motion ring used by the Strength Programs) and feeds it the
 * sensor-aware `useLiveDailyActivity` data. Stays OUTSIDE the schedule
 * (לוח לא נוגעים) — this is its own widget block on the home page.
 *
 * Trust model recap (David, locked):
 *   • Passive sensor data → Global XP only (Lemur rank).
 *   • Passive activeMinutes → cardio bucket → Aerobic minutes rollup.
 *   • Strength program XP / coins are NEVER touched here.
 */

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Activity, TrendingUp } from 'lucide-react';
import ConcentricRingsProgress from '@/features/home/components/rings/ConcentricRingsProgress';
import { useLiveDailyActivity } from '@/features/activity/hooks/useLiveDailyActivity';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';

interface ActivityRingsWidgetProps {
  className?: string;
}

export default function ActivityRingsWidget({ className = '' }: ActivityRingsWidgetProps) {
  const {
    ringData,
    totalMinutesToday,
    stepsToday,
    caloriesToday,
    isLoading,
    hasLiveOverlay,
    passiveXpAwardedToday,
  } = useLiveDailyActivity();

  const globalLevel = useProgressionStore((s) => s.globalLevel);
  const globalXP = useProgressionStore((s) => s.globalXP);

  return (
    <div
      dir="rtl"
      className={
        'bg-white rounded-2xl shadow-card border border-gray-100 ' +
        'p-4 flex flex-col gap-3 w-full ' +
        className
      }
    >
      {/* Header — title + Lemur level chip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-start">
          <div className="w-8 h-8 rounded-full bg-out-blue/10 flex items-center justify-center">
            <Activity size={16} className="text-out-blue" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-extrabold text-gray-900">
              פעילות יומית
            </span>
            <span className="text-[11px] text-gray-500">
              צעדים, קלוריות ודקות אירוביות
            </span>
          </div>
        </div>

        <Link
          href="/profile"
          aria-label="פתח פרופיל וצפה ברמה הגלובלית"
          className="flex items-center gap-1.5 bg-out-blue/10 text-out-blue rounded-full px-2.5 py-1 text-[11px] font-bold hover:bg-out-blue/15 transition-colors"
        >
          <TrendingUp size={12} />
          <span>רמה {globalLevel}</span>
          <span className="text-out-blue/70 font-semibold" dir="ltr">
            {globalXP.toLocaleString()} XP
          </span>
        </Link>
      </div>

      {/* Rings (reuses Strength Program ring component) */}
      <div className="flex justify-center">
        <ConcentricRingsProgress
          size={180}
          strokeWidth={14}
          showCenter
          centerMode="minutes"
          showLegend
          dynamicCenterColor
          ringData={ringData.length > 0 ? ringData : undefined}
        />
      </div>

      {/* Footer stats — steps, calories, passive XP, live indicator */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
        <FooterStat label="צעדים" value={stepsToday.toLocaleString()} />
        <FooterStat
          label="קלוריות"
          value={caloriesToday > 0 ? Math.round(caloriesToday).toLocaleString() : '—'}
        />
        <FooterStat
          label="דקות פעילות"
          value={totalMinutesToday > 0 ? `${totalMinutesToday}` : '—'}
        />
      </div>

      {(passiveXpAwardedToday > 0 || hasLiveOverlay) && (
        <div className="flex items-center justify-between text-[11px] text-gray-500 ps-1 pe-1">
          {passiveXpAwardedToday > 0 ? (
            <span className="text-out-blue font-semibold">
              +{passiveXpAwardedToday} XP גלובלי היום מסנסורים
            </span>
          ) : (
            <span />
          )}
          {hasLiveOverlay && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse" />
              <span>סנכרון חי</span>
            </motion.span>
          )}
        </div>
      )}

      {isLoading && ringData.length === 0 && (
        <div className="text-center text-[11px] text-gray-400">טוען נתוני פעילות…</div>
      )}
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-[15px] font-extrabold text-gray-900">{value}</span>
      <span className="text-[10px] text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}
