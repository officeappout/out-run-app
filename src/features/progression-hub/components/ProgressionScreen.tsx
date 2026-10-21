'use client';

/**
 * ProgressionScreen — the "התקדמות" bottom-nav tab.
 *
 * A stack of <section>s under one shared AppHeader (the same header
 * Home/Profile use):
 *   hero (identity/XP/streak, IS_XP_ENABLED)
 *   "התוכניות שלי"     — main active program ("ראשי"), its assessed child
 *                        programs, other active programs, tracked programs
 *                        by level
 *   "עוד לא בדקת רמה"  — programs the workouts leave out until their level
 *                        is checked, each with a "בדקו רמה" CTA
 *   "גלה עוד"          — everything else, collapsed, last
 *
 * One hook (useProgressHubBuckets) computes all three lists from the same
 * data via the pure, unit-tested bucketForProgressHub, so a program can
 * never show in two sections. Nothing renders until the profile and the
 * id→slug map are ready (no flash of a wrong section).
 *
 * Tapping a card opens that program's map in view mode; a parent program
 * (no map of its own) opens ParentProgramSheet instead. Under enable_home_v2
 * the whole tab is ProgressScreenV2 (../v2/components).
 */
import AppHeader from '@/components/ui/AppHeader';
import { IdentityHeroCard } from '@/features/user/progression/components/IdentityHeroCard';
import { IS_XP_ENABLED } from '@/config/feature-flags';
import { useProgressHubBuckets } from '@/features/progression-map/hooks/useProgressHubBuckets';
import { MyProgramsSection } from './MyProgramsSection';
import { NeedsAssessmentSection } from './NeedsAssessmentSection';
import { DiscoverMoreSection } from './DiscoverMoreSection';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import ProgressScreenV2 from '../v2/components/ProgressScreenV2';
import ScreenSkeleton from '@/components/ui/v2/ScreenSkeleton';

export function ProgressionScreen() {
  // enable_home_v2: the tab holds everything about what you did (P-1…P-4).
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, ready } = useFeatureFlags(isSuperAdmin);
  const v2 = flags.enableHomeV2;
  // Flags unknown: a neutral skeleton, never v1 first and then v2.
  if (!ready) return <ScreenSkeleton />;
  if (v2) return <ProgressScreenV2 />;
  return <ProgressionScreenV1 />;
}

/** Flag-off: exactly today's screen. */
function ProgressionScreenV1() {
  const { ready, buckets } = useProgressHubBuckets();
  return (
    <div className="min-h-screen bg-[#F8FAFC]" dir="rtl">
      <AppHeader />

      <div className="max-w-md mx-auto px-4 py-5 space-y-6">
        <h1 className="text-xl font-black text-gray-900">התקדמות</h1>

        {/* IS_XP_ENABLED gate — the whole card is XP/level/lemur, nothing
            else, so hide it outright rather than leave an empty shell. */}
        {IS_XP_ENABLED && <IdentityHeroCard />}

        {ready && (
          <>
            <MyProgramsSection
              items={buckets.mine}
              hasPendingAssessment={buckets.needsAssessment.length > 0}
            />

            <NeedsAssessmentSection items={buckets.needsAssessment} />

            <DiscoverMoreSection items={buckets.discover} />
          </>
        )}
      </div>
    </div>
  );
}
