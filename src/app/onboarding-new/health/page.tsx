'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import HealthDeclarationStep from '@/features/user/onboarding/components/HealthDeclarationStep';
import { syncOnboardingToFirestore } from '@/features/user/onboarding/services/onboarding-sync.service';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import OnboardingStoryBar from '@/features/user/onboarding/components/OnboardingStoryBar';
import { STRENGTH_PHASES, RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';

export default function HealthDeclarationPage() {
  const router = useRouter();
  const { refreshProfile } = useUserStore();
  const { data: onboardingData } = useOnboardingStore();
  const [mounted, setMounted] = useState(false);

  const isRunningTrack = typeof window !== 'undefined' &&
    sessionStorage.getItem('gateway_track') === 'RUNNING';

  useEffect(() => {
    setMounted(true);
  }, []);

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

      router.replace('/home');
    } catch (error) {
      console.error('[Health] Error completing onboarding:', error);
    }
  };

  if (!mounted) {
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col">
      <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <OnboardingStoryBar
          totalPhases={STRENGTH_PHASES.TOTAL}
          currentPhase={STRENGTH_PHASES.HEALTH}
          phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.HEALTH]}
          onPhaseComplete={firePhaseConfetti}
        />
      </div>
      {content}
    </div>
  );
}
