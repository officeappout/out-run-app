'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { OnboardingStepId } from '../types';
import OnboardingLayout from './OnboardingLayout';
import PersonaStep from './steps/PersonaStep';
import PersonalStatsStep from './steps/PersonalStatsStep';
import UnifiedLocationStep from './steps/UnifiedLocationStep';
import EquipmentStep from './steps/EquipmentStep';
import ScheduleStep from './steps/ScheduleStep';
import HealthDeclarationStep from './HealthDeclarationStep';
import AccountSecureStep from './steps/AccountSecureStep';
import ProcessingStep from './steps/ProcessingStep';
import SummaryStep from './steps/SummaryStep';
import { syncOnboardingToFirestore } from '../services/onboarding-sync.service';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { getUserFromFirestore } from '@/lib/firestore.service';

/**
 * Phase 2 Onboarding Wizard - Lifestyle Adaptation
 *
 * Flow:
 * 1. Persona Selection
 * 2. Personal Stats
 * 3. Equipment
 * 4. Schedule
 * 5. Location (Grand Finale)
 * 6. Health Declaration
 * 7. Account Secure (auto-skipped if already authenticated)
 * 8. Processing (animated "WOW" screen — 4.5 s)
 * 9. Summary
 */
export default function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentStep, setStep, addCoins, updateData, data, coins, majorRoadmapStep } = useOnboardingStore();

  // Get resume step from URL query params
  const resumeStep = searchParams?.get('resume') as OnboardingStepId | null;

  // Get current language
  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const locale = getOnboardingLocale(savedLanguage);

  // ── Step definitions ──────────────────────────────────────────────
  const wizardSteps: OnboardingStepId[] = [
    'PERSONA',
    'PERSONAL_STATS',
    'EQUIPMENT',
    'SCHEDULE',
    'LOCATION',
    'HEALTH_DECLARATION',
    'ACCOUNT_SECURE',
    'PROCESSING',        // Animated processing screen
    'COMPLETED',         // Firestore sync marker (never rendered)
    'SUMMARY',
  ];

  const currentStepIndex = wizardSteps.indexOf(currentStep);

  // Visible steps for the progress bar (exclude non-visible transitions)
  const visibleSteps = wizardSteps.filter(
    (s) => s !== 'COMPLETED' && s !== 'SUMMARY' && s !== 'PROCESSING'
  ) as OnboardingStepId[];
  const visibleStepIndex = visibleSteps.indexOf(currentStep as typeof visibleSteps[number]);

  const phaseProgress = useMemo(() => {
    if (visibleStepIndex < 0) return 0;
    return Math.min((visibleStepIndex / visibleSteps.length) * 100 + 10, 95);
  }, [visibleStepIndex, visibleSteps.length]);

  // ── Helpers ────────────────────────────────────────────────────────
  const isAlreadyAuthenticated = (): boolean => {
    const user = auth.currentUser;
    return !!user && !user.isAnonymous;
  };

  /** Sync COMPLETED to Firestore (fire-and-forget). */
  const syncCompleted = () => {
    syncOnboardingToFirestore('COMPLETED', data).catch(() => {});
  };

  // ── Effects ────────────────────────────────────────────────────────

  // Sync to Firestore on mount so the user appears in the admin panel
  useEffect(() => {
    Analytics.logOnboardingStart('onboarding_wizard_phase2').catch(() => {});
    syncOnboardingToFirestore(currentStep, data).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume / roadmap initialisation
  useEffect(() => {
    if (resumeStep && wizardSteps.includes(resumeStep)) {
      setStep(resumeStep);
      return;
    }
    if (majorRoadmapStep === 2) {
      setStep('HEALTH_DECLARATION');
    } else if (majorRoadmapStep === 1 && !wizardSteps.includes(currentStep)) {
      setStep('PERSONA');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorRoadmapStep, resumeStep]);

  // Auto-skip ACCOUNT_SECURE for already-authenticated (non-anonymous) users
  useEffect(() => {
    if (currentStep === 'ACCOUNT_SECURE' && isAlreadyAuthenticated()) {
      updateData({
        accountSecured: true,
        accountStatus: 'secured',
        accountMethod: 'google',
        securedEmail: auth.currentUser?.email || undefined,
        termsVersion: '1.0',
        termsAcceptedAt: new Date(),
      } as any);
      // Jump straight to PROCESSING so they still see the WOW screen
      syncCompleted();
      setStep('PROCESSING');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // COMPLETED is only a Firestore-sync marker — immediately move to SUMMARY
  useEffect(() => {
    if (currentStep === 'COMPLETED') {
      syncCompleted();
      setStep('SUMMARY');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // ── Navigation ─────────────────────────────────────────────────────
  const handleNext = (nextStepId?: OnboardingStepId, coinReward?: number) => {
    if (IS_COIN_SYSTEM_ENABLED) {
      addCoins(coinReward || 10);
    }
    if (nextStepId) {
      setStep(nextStepId);
      return;
    }
    if (currentStepIndex >= 0 && currentStepIndex < wizardSteps.length - 1) {
      setStep(wizardSteps[currentStepIndex + 1]);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setStep(wizardSteps[currentStepIndex - 1]);
    } else {
      router.push('/onboarding-new/roadmap');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const renderStepContent = () => {
    switch (currentStep) {
      case 'PERSONA':
        return <PersonaStep onNext={() => handleNext('PERSONAL_STATS', 10)} />;

      case 'PERSONAL_STATS':
        return <PersonalStatsStep onNext={() => handleNext('EQUIPMENT', 10)} />;

      case 'EQUIPMENT':
        return <EquipmentStep onNext={() => handleNext('SCHEDULE', 10)} />;

      case 'SCHEDULE':
        return <ScheduleStep onNext={() => handleNext('LOCATION', 10)} />;

      case 'LOCATION':
        return <UnifiedLocationStep onNext={() => handleNext('HEALTH_DECLARATION', 10)} />;

      case 'HEALTH_DECLARATION':
        return (
          <HealthDeclarationStep
            title="הצהרת בריאות"
            description="חשוב לנו לשמור על הבריאות שלך. אנא אשר/י את ההצהרה הבאה כדי להמשיך."
            onContinue={(accepted: boolean) => {
              if (accepted) {
                updateData({ healthDeclarationAccepted: true } as any);
                handleNext('ACCOUNT_SECURE', 10);
              }
            }}
          />
        );

      case 'ACCOUNT_SECURE':
        // Auto-skip handled in useEffect; renders only for anonymous users
        return (
          <AccountSecureStep
            onNext={(secured: boolean, method?: string, email?: string) => {
              if (secured) {
                updateData({
                  accountSecured: true,
                  accountStatus: 'secured',
                  accountMethod: method,
                  securedEmail: email,
                  termsVersion: '1.0',
                  termsAcceptedAt: new Date(),
                } as any);
              } else {
                updateData({
                  accountSecured: false,
                  accountStatus: 'unsecured',
                  accountMethod: 'unsecured',
                } as any);
              }
              // Save to Firestore and go to processing screen
              syncCompleted();
              setStep('PROCESSING');
            }}
            onSkip={() => {
              updateData({
                accountSecured: false,
                accountStatus: 'unsecured',
                accountMethod: 'unsecured',
              } as any);
              syncCompleted();
              setStep('PROCESSING');
            }}
          />
        );

      case 'PROCESSING':
        // Full-screen animated processing — auto-advances after 4.5 s
        return (
          <ProcessingStep
            onNext={() => {
              setStep('SUMMARY');
            }}
          />
        );

      case 'COMPLETED':
        // Handled by useEffect — never renders
        return null;

      case 'SUMMARY':
        return (
          <SummaryStep
            onNext={async () => {
              useOnboardingStore.getState().setMajorRoadmapStep(2);

              // Ensure Firestore has the COMPLETED status
              await syncOnboardingToFirestore('COMPLETED', data).catch(() => {});

              // Populate the user store with the fresh Firestore profile
              // so that /home's guard sees a valid profile and doesn't redirect back
              try {
                const uid = auth.currentUser?.uid;
                if (uid) {
                  const freshProfile = await getUserFromFirestore(uid);
                  if (freshProfile) {
                    useUserStore.getState().initializeProfile(freshProfile);
                  }
                }
              } catch (e) {
                console.warn('[OnboardingWizard] Failed to hydrate user store, /home will self-recover:', e);
              }

              router.push('/home');
            }}
          />
        );

      default:
        return <PersonaStep onNext={() => handleNext('PERSONAL_STATS', 10)} />;
    }
  };

  // Processing step is full-screen — render without the OnboardingLayout chrome
  if (currentStep === 'PROCESSING') {
    return renderStepContent();
  }

  // Step title for header
  const getStepTitle = () => {
    switch (currentStep) {
      case 'PERSONA':
        return savedLanguage === 'he' ? 'ספר/י לנו על עצמך' : 'Tell us about yourself';
      case 'PERSONAL_STATS':
        return savedLanguage === 'he' ? 'נתונים אישיים' : 'Personal Stats';
      case 'EQUIPMENT':
        return locale.equipment.title;
      case 'SCHEDULE':
        return savedLanguage === 'he' ? 'לוח זמנים' : 'Schedule';
      case 'LOCATION':
        return savedLanguage === 'he' ? 'המיקום שלך' : 'Your Location';
      case 'HEALTH_DECLARATION':
        return savedLanguage === 'he' ? 'הצהרת בריאות' : 'Health Declaration';
      case 'ACCOUNT_SECURE':
        return savedLanguage === 'he' ? 'גיבוי ואבטחה' : 'Backup & Security';
      case 'SUMMARY':
        return savedLanguage === 'he' ? 'סיכום' : 'Summary';
      default:
        return '';
    }
  };

  return (
    <OnboardingLayout
      headerType="progress"
      onboardingPhase={2}
      phaseProgress={phaseProgress}
      currentStep={visibleStepIndex >= 0 ? visibleStepIndex + 1 : 1}
      totalSteps={visibleSteps.length}
      onBack={handleBack}
      showBack={currentStepIndex > 0}
    >
      {renderStepContent()}
    </OnboardingLayout>
  );
}
