'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import HealthDeclarationStep from '@/features/user/onboarding/components/HealthDeclarationStep';
import { syncOnboardingToFirestore } from '@/features/user/onboarding/services/onboarding-sync.service';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { STRENGTH_PHASES, RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { getOnboardingPref } from '@/lib/onboardingPrefs';
import { hasAcceptedHealthDeclaration } from '@/lib/health-declaration';

export default function HealthDeclarationPage() {
  const router = useRouter();
  const { profile, refreshProfile } = useUserStore();
  const { data: onboardingData } = useOnboardingStore();
  const [mounted, setMounted] = useState(false);
  const autoSkipStartedRef = useRef(false);

  const isRunningTrack = getOnboardingPref('gateway_track') === 'RUNNING';

  // Already accepted (e.g. via the other track's onboarding) — skip this
  // screen silently rather than asking again. Matches the existing
  // precedent at OnboardingWizard.tsx's HEALTH_DECLARATION auto-skip effect,
  // useRequiredSetup.ts's hard-block check, and profile-completion.service.ts's
  // "health" completion item — none of those show a confirmation screen
  // either, they just treat it as already satisfied.
  const alreadyAccepted = !!profile && hasAcceptedHealthDeclaration(profile as any);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fires the same completion sync + navigation handleContinue's own submit
  // path would, without re-rendering HealthDeclarationStep (which would
  // re-collect a signature/PDF the user already provided the first time).
  useEffect(() => {
    if (!mounted || !alreadyAccepted || autoSkipStartedRef.current) return;
    autoSkipStartedRef.current = true;
    handleContinue(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, alreadyAccepted]);

  const handleContinue = async (_value: boolean) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        console.error('[Health] No user authenticated');
        return;
      }

      // Build payload with running schedule data from the onboarding store.
      // The sync service reads running answers from sessionStorage directly
      // and reads program assignments from sessionStorage as well (persisted
      // from the earlier PROCESSING call in dynamic/page.tsx).
      const syncPayload: Record<string, any> = {};

      if ((onboardingData as any).runningWeeklyFrequency !== undefined) {
        syncPayload.runningWeeklyFrequency = (onboardingData as any).runningWeeklyFrequency;
      }
      if ((onboardingData as any).runningScheduleDays) {
        syncPayload.runningScheduleDays = (onboardingData as any).runningScheduleDays;
      }
      if ((onboardingData as any).runningScheduleTime) {
        syncPayload.runningScheduleTime = (onboardingData as any).runningScheduleTime;
      }

      // Firestore fallback for assignedResults — sessionStorage is tab-scoped
      // and is wiped when the user closes the browser between the assessment and
      // this page. Without this, onboarding-sync.service.ts finds no
      // assignedResults in either data or sessionStorage and falls through to
      // the generic GOAL_TO_PROGRAM mapping, overwriting the assessed program
      // with a generic one. Reading from Firestore (where dynamic/page.tsx
      // already persisted the results) makes this sync idempotent across
      // tab-close / session restores.
      const storedResults = typeof window !== 'undefined'
        ? sessionStorage.getItem('onboarding_assigned_results')
        : null;
      if (!storedResults) {
        try {
          const userSnap = await getDoc(doc(db, 'users', uid));
          const firestoreAssignedResults = userSnap.data()?.assignedResults;
          if (Array.isArray(firestoreAssignedResults) && firestoreAssignedResults.length > 0) {
            syncPayload.assignedResults = firestoreAssignedResults;
            console.log(
              '[Health] Restored assignedResults from Firestore (sessionStorage empty):',
              firestoreAssignedResults.length, 'entries',
            );
          }
        } catch (e) {
          console.warn('[Health] Could not read assignedResults from Firestore fallback:', e);
        }
      }

      console.log('[Health] Calling syncOnboardingToFirestore(COMPLETED) — full running bridge + activeProgram generation');

      await syncOnboardingToFirestore('COMPLETED', syncPayload);

      console.log('[Health] Sync complete. Refreshing profile before navigation...');

      await refreshProfile();

      router.replace('/onboarding-new/health-connect');
    } catch (error) {
      console.error('[Health] Error completing onboarding:', error);
    }
  };

  // alreadyAccepted also gates the render (not just the effect above) — the
  // effect only starts the async handleContinue, it doesn't run
  // synchronously with this render, so without this check the real form
  // would still flash for a frame before the skip takes over.
  if (!mounted || alreadyAccepted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-slate-500">טוען...</div>
      </div>
    );
  }

  const content = (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center">
          <div className="text-slate-500">טוען...</div>
        </div>
      }
    >
      <HealthDeclarationStep
        title="הצהרת בריאות"
        description="כדי להתאים לך אימון בטוח, נשמח לדעת על מצבך הרפואי"
        onContinue={handleContinue}
      />
    </Suspense>
  );

  if (isRunningTrack) {
    return (
      <OnboardingLayout
        headerType="progress"
        totalSegments={RUNNING_PHASES.TOTAL}
        currentSegment={RUNNING_PHASES.HEALTH}
        phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.HEALTH]}
        hideContinueButton
      >
        {content}
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      totalSegments={STRENGTH_PHASES.TOTAL}
      currentSegment={STRENGTH_PHASES.HEALTH}
      phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.HEALTH]}
      hideContinueButton
    >
      {content}
    </OnboardingLayout>
  );
}
