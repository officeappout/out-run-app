'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RunningScheduleStep from '@/features/user/onboarding/components/steps/RunningScheduleStep';
import RunSignupScheduleFlow, { RUN_SIGNUP_SUBSTEPS } from '@/features/user/onboarding/components/running-v2/signup-schedule/RunSignupScheduleFlow';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useOnboardingV2State } from '@/features/user/onboarding/hooks/useOnboardingV2';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { runScheduleStepMode } from '@/features/schedule/utils/runWeekRecommendation';
import { ADD_TRACK_COMBINED_WEEK_ROUTE, runSignupNextRoute } from '@/features/user/onboarding/utils/run-signup-routing';

/**
 * /onboarding-new/running-schedule
 *
 * Reached after the dynamic running tree terminates (at q_run_beginner_ability,
 * q_run_pace_input, or q_run_maintain_distance depending on path).
 *
 * 2a (idempotent-booping-sunrise.md, 02.09.2026): RunningScheduleStep no
 * longer collects anything here in signup mode — it silently writes a
 * system default and advances (real day-picking now happens later, in
 * LifestyleWizard). handleNext below uses router.replace, not .push
 * (changed as part of this same commit, not incidental): a pass-through
 * screen that writes-and-advances on mount would otherwise still leave
 * itself as a distinct back-history entry, so pressing "back" from
 * running-plan-length would land here, immediately re-fire the same
 * write-and-advance, and bounce right back to running-plan-length --
 * a back button that visibly does nothing. .replace() removes this route
 * from the back-stack instead, matching health/page.tsx's own
 * already-accepted auto-skip precedent (:129), so "back" from
 * running-plan-length correctly lands on dynamic's own last real question.
 *
 * enable_home_v2 (journey 2, J2-06..J2-09): a REAL step instead — the
 * recommended week (engine v2), days + time of day, the week, then the
 * shared reminders step; reached after running-plan-length and followed by
 * running-summary (run-signup-routing.ts). A user who already trains
 * strength is handed to the add-track combined week
 * (ADD_TRACK_COMBINED_WEEK_ROUTE → /onboarding-new/add-track-week, journey J3).
 *
 * Route guard: when enable_running_programs is false, immediately redirects to /home.
 */
export default function RunningSchedulePage() {
  const router = useRouter();
  const { flags, loading } = useFeatureFlags();
  const { v2, ready: v2Ready } = useOnboardingV2State();
  const profile = useUserStore((s) => s.profile);
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const [sub, setSub] = useState(0);

  const mode = runScheduleStepMode(profile);
  const showV2Flow = v2 && hasHydrated && mode === 'run_only';
  const handOffToAddTrack = v2 && hasHydrated && mode === 'add_track' && ADD_TRACK_COMBINED_WEEK_ROUTE !== null;

  useEffect(() => {
    if (!loading && !flags.enableRunningPrograms) {
      router.replace('/home');
    }
  }, [loading, flags.enableRunningPrograms, router]);

  useEffect(() => {
    if (handOffToAddTrack && ADD_TRACK_COMBINED_WEEK_ROUTE) router.replace(ADD_TRACK_COMBINED_WEEK_ROUTE);
  }, [handOffToAddTrack, router]);

  // Wait for the flag (and, under v2, the profile) so a v2 user never
  // mounts the legacy pass-through, which writes a default on mount.
  if (loading || !flags.enableRunningPrograms || !v2Ready || (v2 && !hasHydrated) || handOffToAddTrack) return null;

  const handleNext = () => {
    firePhaseConfetti();
    router.replace(runSignupNextRoute('running-schedule', v2));
  };

  if (showV2Flow) {
    return (
      <OnboardingLayout
        headerType="progress"
        totalSegments={RUNNING_PHASES.TOTAL}
        currentSegment={RUNNING_PHASES.SCHEDULE}
        // Plan length (v2: just before this step) fills the first 20%.
        segmentFillPercent={20 + Math.round(((sub + 1) / RUN_SIGNUP_SUBSTEPS) * 80)}
        phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.SCHEDULE]}
        onBack={sub > 0 ? () => setSub(sub - 1) : undefined}
        hideContinueButton
      >
        <RunSignupScheduleFlow
          sub={sub}
          setSub={setSub}
          onDone={() => {
            firePhaseConfetti();
            router.push(runSignupNextRoute('running-schedule', true));
          }}
        />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      headerType="progress"
      totalSegments={RUNNING_PHASES.TOTAL}
      currentSegment={RUNNING_PHASES.SCHEDULE}
      phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.SCHEDULE]}
      hideContinueButton
    >
      <RunningScheduleStep onNext={handleNext} />
    </OnboardingLayout>
  );
}
