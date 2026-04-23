"use client";

/**
 * PerformanceMetricsRow — "מדדי ביצועים" section.
 *
 * Layout (RTL):
 *   header = "מדדי ביצועים"
 *   right  = primary goal-exercise tile (compact, navigates to analytics)
 *   left   = `<RaceAndKmCarousel>` (compact, snap between race-pace + weekly KM)
 *
 * Visibility rules (Apr 2026 spec):
 *   - The ENTIRE row is hidden until the user has completed the strength
 *     survey. Goal exercises are derived from active strength programs;
 *     without a survey the data is meaningless. Run-only users will see
 *     race/KM under their own row once strength onboarding is complete.
 *   - When the run survey is missing, only the left half is wrapped in a
 *     `<GhostUpsell>` so the goal tile stays usable.
 *
 * Heights are matched to the Health row via shared `CompactMetricTile`
 * dimensions (~64px tall) so both sections feel like a single product.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { Footprints, Target } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useActiveProgramGoals } from '@/features/user/progression/hooks/useActiveProgramGoals';
import {
  hasStrengthSurvey,
  hasRunSurvey,
} from '@/features/home/hooks/useProgramProgress';
import SideBySideRow from './SideBySideRow';
import SectionHeader from './SectionHeader';
import GhostUpsell from './GhostUpsell';
import CompactMetricTile from '@/features/home/components/widgets/CompactMetricTile';
import RaceAndKmCarousel from './RaceAndKmCarousel';

const RUN_ONBOARDING_HREF = '/onboarding-new/program-path?track=run';

function GoalSlot() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const { goals, loading } = useActiveProgramGoals();

  const primaryGoal = goals[0];
  const userId = profile?.id ?? '';

  const handleClick = () => {
    if (!primaryGoal) return;
    router.push(
      `/profile/exercise/${encodeURIComponent(primaryGoal.exerciseId)}?name=${encodeURIComponent(primaryGoal.exerciseName)}`,
    );
  };

  if (loading) {
    return (
      <CompactMetricTile
        icon={<Target size={16} />}
        label="יעד תרגיל"
        value="—"
        unit="טוען..."
      />
    );
  }

  if (!primaryGoal) {
    return (
      <CompactMetricTile
        icon={<Target size={16} />}
        label="יעדי תרגילים"
        value="—"
        unit="התחל אימון להגדרת יעד"
      />
    );
  }

  const unitLabel = primaryGoal.unit === 'seconds' ? 'שניות' : 'חזרות';

  return (
    <CompactMetricTile
      icon={<Target size={16} />}
      label={primaryGoal.exerciseName}
      value={String(primaryGoal.targetValue)}
      unit={`יעד ${unitLabel}`}
      onClick={userId ? handleClick : undefined}
      ariaLabel={`יעד תרגיל: ${primaryGoal.exerciseName}, ${primaryGoal.targetValue} ${unitLabel}`}
    />
  );
}

function RaceSlot() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);

  if (!hasRunSurvey(profile)) {
    return (
      <GhostUpsell
        onClick={() => router.push(RUN_ONBOARDING_HREF)}
        label="הוסף תוכנית ריצה"
        ctaText="התחל סקר →"
        icon={<Footprints size={18} className="text-[#5BC2F2]" />}
      >
        <RaceAndKmCarousel />
      </GhostUpsell>
    );
  }

  return <RaceAndKmCarousel />;
}

export function PerformanceMetricsRow() {
  const profile = useUserStore((s) => s.profile);

  // Spec (Apr 2026): hide the ENTIRE Performance row until the strength
  // survey is complete. No header, no skeleton — just nothing.
  if (!hasStrengthSurvey(profile)) {
    return null;
  }

  return (
    <div className="space-y-2">
      <SectionHeader title="מדדי ביצועים" />
      <SideBySideRow right={<GoalSlot />} left={<RaceSlot />} />
    </div>
  );
}

export default PerformanceMetricsRow;
