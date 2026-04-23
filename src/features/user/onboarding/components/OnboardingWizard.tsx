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
import AccessCodeStep from './steps/AccessCodeStep';
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

  // ── JIT mode (triggered from workout start) ──────────────────────
  const isJIT = searchParams?.get('jit') === 'true';
  const jitStep = searchParams?.get('step') as OnboardingStepId | null;

  // ── Dynamic step sequence based on onboarding path ──────────────
  const onboardingPath = typeof window !== 'undefined'
    ? sessionStorage.getItem('onboarding_path') || null
    : null;

  const wizardSteps: OnboardingStepId[] = useMemo(() => {
    // JIT mode: only show the specific requested step
    if (isJIT && jitStep) {
      return [jitStep, 'COMPLETED', 'SUMMARY'];
    }

    // MAP_ONLY path: minimal steps for map explorers converting to full users
    if (onboardingPath === 'MAP_ONLY') {
      return [
        'HEALTH_DECLARATION',
        'ACCOUNT_SECURE',
        'PROCESSING',
        'COMPLETED',
        'SUMMARY',
      ];
    }

    // UPGRADE_FROM_MAP: MAP_ONLY user building a program
    // Dynamic Quiz -> Persona -> Equipment -> Dashboard
    // Skips: Personal Stats, Schedule, Location (Schedule is JIT on dashboard)
    if (onboardingPath === 'UPGRADE_FROM_MAP') {
      return [
        'PERSONA',
        'EQUIPMENT',
        'PROCESSING',
        'COMPLETED',
        'SUMMARY',
      ];
    }

    // MILITARY_JOIN / SCHOOL_JOIN: identical to FULL_PROGRAM.
    // The only difference is the ACCESS_CODE step that preceded wizard entry
    // and the tenant fields (tenantId, unitPath) stored in sessionStorage.
    if (onboardingPath === 'MILITARY_JOIN' || onboardingPath === 'SCHOOL_JOIN') {
      return [
        'PERSONA',
        'PERSONAL_STATS',
        'EQUIPMENT',
        'SCHEDULE',
        'LOCATION',
        'HEALTH_DECLARATION',
        'ACCOUNT_SECURE',
        'PROCESSING',
        'COMPLETED',
        'SUMMARY',
      ];
    }

    // FULL_PROGRAM path (default): full onboarding sequence
    return [
      'PERSONA',
      'PERSONAL_STATS',
      'EQUIPMENT',
      'SCHEDULE',
      'LOCATION',
      'HEALTH_DECLARATION',
      'ACCOUNT_SECURE',
      'PROCESSING',
      'COMPLETED',
      'SUMMARY',
    ];
  }, [isJIT, jitStep, onboardingPath]);

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

  // JIT mode: force current step to the requested JIT step on mount
  useEffect(() => {
    if (isJIT && jitStep && currentStep !== jitStep) {
      setStep(jitStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJIT, jitStep]);

  // Resume / roadmap initialisation (skip when JIT — handled above)
  useEffect(() => {
    if (isJIT) return;
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
  }, [majorRoadmapStep, resumeStep, isJIT]);

  // Auto-skip HEALTH_DECLARATION if already accepted (e.g. during running onboarding)
  useEffect(() => {
    if (currentStep !== 'HEALTH_DECLARATION') return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getUserFromFirestore(uid).then((p) => {
      const accepted =
        (p as any)?.healthDeclarationAccepted ||
        (p as any)?.health?.healthDeclarationAccepted;
      if (accepted) {
        updateData({ healthDeclarationAccepted: true } as any);
        setStep('ACCOUNT_SECURE');
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

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

  // ── JIT save handler with Firestore sync + profile hydration ─────
  const handleJITSave = async () => {
    await syncOnboardingToFirestore('COMPLETED', data).catch(() => {});
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const freshProfile = await getUserFromFirestore(uid);
        if (freshProfile) {
          useUserStore.getState().initializeProfile(freshProfile);
        }
      }
    } catch { /* /profile will self-recover */ }
    await new Promise((r) => setTimeout(r, 700));
    const returnTo = typeof window !== 'undefined'
      ? sessionStorage.getItem('jit_return_to') : null;
    if (returnTo) sessionStorage.removeItem('jit_return_to');
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('profile_update_toast', '1');
    }
    if (returnTo === 'workout') router.push('/home?startWorkout=true');
    else if (returnTo === 'profile') router.push('/profile');
    else router.push('/home');
  };

  // Wrap step onNext: in JIT mode → handleJITSave, otherwise normal advance
  const stepOnNext = (coinReward = 10) => {
    if (isJIT) return handleJITSave;
    return () => handleNext(undefined, coinReward);
  };

  // Determine if the current step is the last content step before processing/system steps
  const isLastContentStep = (() => {
    const nextIdx = currentStepIndex + 1;
    if (nextIdx >= wizardSteps.length) return true;
    const remaining = wizardSteps.slice(nextIdx);
    return remaining.every(s =>
      s === 'HEALTH_DECLARATION' || s === 'ACCOUNT_SECURE' || s === 'PROCESSING' || s === 'COMPLETED' || s === 'SUMMARY'
    );
  })();

  // ── Render ─────────────────────────────────────────────────────────
  const renderStepContent = () => {
    switch (currentStep) {
      case 'ACCESS_CODE':
        return <AccessCodeStep onNext={() => handleNext(undefined, 0)} />;

      case 'PERSONA':
        return <PersonaStep onNext={() => handleNext(undefined, 10)} />;

      case 'PERSONAL_STATS':
        return <PersonalStatsStep onNext={stepOnNext(10)} isJIT={isJIT} isLastStep={isLastContentStep} />;

      case 'EQUIPMENT':
        return <EquipmentStep onNext={stepOnNext(10)} isJIT={isJIT} isLastStep={isLastContentStep} />;

      case 'SCHEDULE':
        return <ScheduleStep onNext={stepOnNext(10)} isJIT={isJIT} isLastStep={isLastContentStep} />;

      case 'LOCATION':
        return <UnifiedLocationStep onNext={() => {
          // In FULL_PROGRAM path, LOCATION exits to roadmap for phase 2 transition
          // In JIT/MAP_ONLY, just advance to next step
          if (!isJIT && onboardingPath !== 'MAP_ONLY') {
            handleNext('HEALTH_DECLARATION', 10);
          } else {
            handleNext(undefined, 10);
          }
        }} />;

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
        return (
          <ProcessingStep
            onNext={async () => {
              useOnboardingStore.getState().setMajorRoadmapStep(2);

              await syncOnboardingToFirestore('COMPLETED', data).catch(() => {});

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

              if (typeof window !== 'undefined') {
                sessionStorage.setItem('show_gear_toast', '1');
              }

              const jitReturn = typeof window !== 'undefined'
                ? sessionStorage.getItem('jit_return_to')
                : null;
              if (jitReturn) {
                sessionStorage.removeItem('jit_return_to');
              }
              if (jitReturn === 'workout') {
                router.push('/home?startWorkout=true');
              } else if (jitReturn === 'profile') {
                router.push('/profile');
              } else {
                router.push('/home');
              }
            }}
          />
        );

      case 'COMPLETED':
        // Handled by useEffect — never renders
        return null;

      case 'SUMMARY':
        // Deprecated — kept for type compatibility, auto-redirects
        return null;

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
      case 'ACCESS_CODE':
        return savedLanguage === 'he' ? 'קוד גישה' : 'Access Code';
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
