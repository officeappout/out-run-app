'use client';

/**
 * Strength questionnaire v3, screens 1 and 2 (boards Bodyweight + Main, owner-approved 26.10.2026).
 * Screen 1: welcome to OUT + what is calisthenics. Screen 2: the short assessment intro, whose CTA
 * saves the full-body program choice (the legacy screen's writer) and opens the visual assessment.
 * Owner 28.10 (Y3): when name / gender / birth date are still missing (a home program card defers
 * them), the short details screen comes first, as story-bar phase 1, before the explainers.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logOnboardingFunnelStep } from '@/features/analytics/onboarding-funnel';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import OnboardingLayout from '../OnboardingLayout';
import IdentityProfileScreen from '../IdentityProfileScreen';
import { strengthStoryBar } from '../../constants/onboarding-phases';
import { resetStaleStrengthEntryState } from '../../utils/strength-entry-reset';
import { persistFullBodyProgramSelection } from '../../utils/program-path-persist';
import { GOAL_NOTE_STORAGE_KEY } from '../../utils/goal-note';
import { needsIdentityBeforeSave } from '../../utils/deferred-identity';
import { backfillOnboardingIdentitySession } from '../../utils/onboarding-entry';
import { INTRO_STEP_STORAGE_KEY, NEXT_ROUTE, parseIntroStep, type IntroStep } from './quiz-v3-entry';
import WelcomeCalisthenicsScreen from './WelcomeCalisthenicsScreen';
import { useEntryScrollReset } from './entry-scroll';
import AssessmentIntroScreen from './AssessmentIntroScreen';

const BAR = strengthStoryBar('assessment', true);

/** The assessment phase has just started on both intro screens (the board's 8%). */
const SEGMENT_FILL = 8;

function readStep(): IntroStep {
  try {
    return parseIntroStep(sessionStorage.getItem(INTRO_STEP_STORAGE_KEY));
  } catch {
    return 'welcome';
  }
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Name, gender and birth date known (profile or this session's identity form)? */
function identityMissing(): boolean {
  return needsIdentityBeforeSave({
    v2: true,
    profileCore: useUserStore.getState().profile?.core,
    session: {
      name: readSession('onboarding_personal_name'),
      gender: readSession('onboarding_personal_gender'),
      dob: readSession('onboarding_personal_dob'),
    },
  });
}

function writeStep(step: IntroStep): void {
  try {
    if (step === 'welcome') sessionStorage.removeItem(INTRO_STEP_STORAGE_KEY);
    else sessionStorage.setItem(INTRO_STEP_STORAGE_KEY, step);
  } catch {
    /* private mode: the step just isn't remembered */
  }
}

export interface StrengthQuizV3IntroProps {
  /** TODO(strength-quiz-v3): the short explainer video does not exist yet; the link opens nothing. */
  onExplainerVideo?: () => void;
}

export default function StrengthQuizV3Intro({ onExplainerVideo }: StrengthQuizV3IntroProps) {
  const router = useRouter();
  const t = useT(onboarding);
  const [step, setStep] = useState<IntroStep | null>(null);
  const [askIdentity, setAskIdentity] = useState(false);
  // The persisted profile must be read before deciding the details screen is needed.
  const hydrated = useUserStore((st) => st._hasHydrated);

  useEffect(() => {
    resetStaleStrengthEntryState('[StrengthQuizV3]');
  }, []);
  useEntryScrollReset(step);

  useEffect(() => {
    if (!hydrated || step !== null) return;
    const s = readStep();
    setAskIdentity(s === 'welcome' && identityMissing());
    setStep(s);
  }, [hydrated, step]);

  const go = useCallback((next: IntroStep) => {
    writeStep(next);
    setStep(next);
  }, []);

  const handleBack = useCallback(() => {
    if (step === 'assessment') {
      go('welcome');
      return;
    }
    const hasHistory = typeof window !== 'undefined' && window.history.length > 1;
    if (hasHistory) router.back();
    else router.push('/onboarding-new/profile');
  }, [step, go, router]);

  const handleStart = useCallback(() => {
    // The goal screen is skipped: everyone gets full body, written exactly as the legacy screen does.
    persistFullBodyProgramSelection();
    try {
      sessionStorage.removeItem(GOAL_NOTE_STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
    // Same funnel step the goal screen logs, so the funnel keeps its shape.
    logOnboardingFunnelStep('PERSONA');
    router.push(NEXT_ROUTE);
  }, [router]);

  if (step === null) return null;

  if (askIdentity) {
    return (
      <IdentityProfileScreen
        context="program"
        hostPadsTop
        onWorkoutBack={handleBack}
        onWorkoutIdentitySaved={() => {
          backfillOnboardingIdentitySession(useUserStore.getState().profile);
          setAskIdentity(false);
        }}
      />
    );
  }

  const welcome = step === 'welcome';
  return (
    <OnboardingLayout
      totalSegments={BAR.total}
      currentSegment={BAR.current}
      segmentFillPercent={SEGMENT_FILL}
      phaseLabel={t(BAR.labelKey)}
      onBack={handleBack}
      onContinue={welcome ? () => go('assessment') : handleStart}
      continueLabel={welcome ? t('quizV3.welcome.cta') : t('quizV3.main.cta')}
    >
      {welcome ? (
        <WelcomeCalisthenicsScreen />
      ) : (
        <AssessmentIntroScreen onExplainerVideo={onExplainerVideo} />
      )}
    </OnboardingLayout>
  );
}
