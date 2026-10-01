'use client';

/**
 * IdentityHeroCard — Progression System v2, Phase 4a.
 *
 * The identity/XP/streak cluster (lemur / שלב / XP / 🔥 רצף) extracted so
 * the Progression ("התקדמות") screen's hero can reuse it — this exact
 * extraction was already anticipated in the original Progression Map plan
 * ("Lemur hero card — extract from existing, currently inline in
 * DashboardTab.tsx, extract to a shared component if Meta needs the same
 * identity"). Self-contained: reads its own stores/hooks (same ones
 * DashboardTab.tsx's inline "BLOCK 1" already reads) rather than taking
 * them as props, so it renders correctly wherever it's mounted.
 *
 * Deliberately NOT wired into DashboardTab.tsx this round — that file is
 * live/shipped and this phase has no way to visually re-verify it after an
 * edit; retrofitting DashboardTab to use this component (eliminating the
 * small duplication) is a safe, low-risk fast-follow, not done here. This
 * component reuses the SAME data sources (stores/hooks), not a rebuilt
 * approximation of them.
 *
 * Deliberately excludes DashboardTab's Profile-specific chrome (settings/
 * bookmark buttons, tappable workout-history count) — those aren't
 * "identity/XP/streak", per the brief's own enumeration, and pull in
 * dependencies (useWorkoutHistory, onOpenSettings) this component doesn't
 * need.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getLevelName } from '@/features/user/progression/config/lemur-stages';
import { useLevelConfig } from '@/features/user/progression/hooks/useLevelConfig';
import { auth } from '@/lib/firebase';

const LEMUR_IMG = '/assets/lemur/king-lemur.png';

export interface IdentityHeroCardProps {
  className?: string;
}

export function IdentityHeroCard({ className = '' }: IdentityHeroCardProps) {
  const { globalXP, globalLevel, currentStreak, isHydrated, hydrateFromFirestore } = useProgressionStore();
  const { profile } = useUserStore();
  const gender = profile?.core?.gender ?? 'male';
  const userId = profile?.id ?? auth.currentUser?.uid ?? null;

  const hydrationAttemptedRef = useRef(false);
  useEffect(() => {
    if (hydrationAttemptedRef.current) return;
    if (!userId) return;
    hydrationAttemptedRef.current = true;
    hydrateFromFirestore(userId);
    // hydrateFromFirestore is a stable Zustand action — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const { getEntry, getNextThreshold, calcProgress } = useLevelConfig();
  const currentStageConfig = getEntry(globalLevel);
  const isMaxLevel = globalLevel >= 10;
  const nextLevelXP = isMaxLevel ? currentStageConfig.maxXP : getNextThreshold(globalLevel);

  const progress = useMemo(
    () => calcProgress(globalXP, globalLevel),
    [globalXP, globalLevel, calcProgress],
  );

  // Stable bar target — animates exactly once after hydration, then follows XP.
  const [barTarget, setBarTarget] = useState(0);
  const barSettledRef = useRef(false);
  useEffect(() => {
    if (!isHydrated) return;
    if (!barSettledRef.current || progress !== barTarget) {
      setBarTarget(progress);
      barSettledRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, progress]);

  const levelName = getLevelName(globalLevel, gender);

  return (
    <div className={`flex flex-col items-center ${className}`} dir="rtl">
      {/* Lemur image — 88px circle, green border, streak badge bottom-right */}
      <div className="relative" style={{ width: 88, height: 88 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LEMUR_IMG}
          alt="Lemur"
          width={88}
          height={88}
          className="w-full h-full rounded-full object-cover border-[3px] border-emerald-400 shadow-md bg-white"
        />
        <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-gray-100 flex items-center gap-0.5">
          <Flame className="w-3.5 h-3.5 text-orange-500" fill="currentColor" />
          <span className="text-[11px] font-black text-gray-900 tabular-nums">{currentStreak}</span>
        </div>
      </div>

      {/* Level title (gendered) */}
      <h2 className="text-xl font-black text-gray-900 mt-3">{levelName}</h2>
      <span className="text-xs font-bold text-[#00ADEF] mt-0.5">שלב {globalLevel}</span>

      {/* XP progress bar */}
      <div className="w-full mt-4">
        {!isHydrated ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3.5 bg-gray-100 rounded-full" />
            <div className="h-3 bg-gray-100 rounded w-1/2 mx-auto" />
          </div>
        ) : isMaxLevel ? (
          <div className="bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] rounded-full py-2 px-4 text-center">
            <span className="text-white text-xs font-black">הגעת לשיא!</span>
          </div>
        ) : (
          <>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barTarget}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2]"
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 px-0.5" dir="ltr">
              <span className="text-[11px] font-bold text-gray-500 tabular-nums">
                {globalXP.toLocaleString()} / {nextLevelXP.toLocaleString()} XP
              </span>
              <span className="text-[11px] font-bold text-[#00ADEF]">
                שלב {globalLevel + 1} →
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default IdentityHeroCard;
