'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { OnboardingStepId } from '../types';
import OnboardingLayout from './OnboardingLayout';
import PersonaStep from './steps/PersonaStep';
import PersonalStatsStep from './steps/PersonalStatsStep';
import UnifiedLocationStep from './steps/UnifiedLocationStep';
import EquipmentStep from './steps/EquipmentStep';
import ScheduleStep from './steps/ScheduleStep';
import CalculatingProfileScreen from '@/components/CalculatingProfileScreen';
import SummaryStep from './steps/SummaryStep';
import { syncOnboardingToFirestore } from '../services/onboarding-sync.service';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

/**
 * Phase 2 Onboarding Wizard - Lifestyle Adaptation
 * 
 * Updated sequence (Location as Grand Finale):
 * 1. Persona Selection (Mad-libs style)
 * 2. Personal Stats (Weight + Training History)
 * 3. Equipment (None/Home/Gym)
 * 4. Schedule (Days + Time)
 * 5. Location (GPS/Map) - Grand Finale: Find your nearby parks!
 * 6. Summary
 */
export default function OnboardingWizard() {
  const router = useRouter();
  const { currentStep, setStep, addCoins, updateData, data, coins, majorRoadmapStep } = useOnboardingStore();
  const [isCalculating, setIsCalculating] = useState(false);

  // Get current language - ensure locale is always available
  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const locale = getOnboardingLocale(savedLanguage);

  // Phase 2 wizard steps - Unified Location as grand finale
  const wizardSteps: OnboardingStepId[] = [
    'PERSONA',
    'PERSONAL_STATS',
    'EQUIPMENT',
    'SCHEDULE',
    'LOCATION',         // Unified Location Step: GPS + City Search + Parks
    'COMPLETED',
    'SUMMARY',
  ];

  // Calculate current step index
  const currentStepIndex = wizardSteps.indexOf(currentStep);
  
  // Calculate progress for Phase 2 (5 visible steps, excluding COMPLETED)
  const visibleSteps = wizardSteps.filter(step => step !== 'COMPLETED' && step !== 'SUMMARY') as OnboardingStepId[];
  const visibleStepIndex = visibleSteps.indexOf(currentStep as typeof visibleSteps[number]);
  
  // Phase 2 progress: 0-100% within the second segment
  const phaseProgress = useMemo(() => {
    if (visibleStepIndex < 0) return 0;
    // 5 steps: 0%, 20%, 40%, 60%, 80%, then COMPLETED brings it to 100%
    return Math.min((visibleStepIndex / visibleSteps.length) * 100 + 10, 95);
  }, [visibleStepIndex, visibleSteps.length]);

  // Save user data and show calculating screen
  const handleFinish = async () => {
    // Show calculating screen immediately (before database save) for instant feedback
    setIsCalculating(true);
    
    try {
      // Save final data to Firebase in the background
      await syncOnboardingToFirestore('COMPLETED', data);
    } catch (error) {
      console.error('[OnboardingWizard] Error saving user data:', error);
      // Continue anyway - calculating screen is already shown
    }
  };

  // Sync to Firestore on initial load (first step) to ensure user appears in admin panel
  useEffect(() => {
    // Log onboarding start event
    Analytics.logOnboardingStart('onboarding_wizard_phase2').catch((error) => {
      console.error('[OnboardingWizard] Error logging onboarding start:', error);
    });
    
    // Sync current step on mount to ensure user appears in admin panel immediately
    syncOnboardingToFirestore(currentStep, data).catch((error) => {
      console.error('[OnboardingWizard] Error syncing on mount:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Initialize to PERSONA step if coming from roadmap
  useEffect(() => {
    // If we're at majorRoadmapStep 1 (Phase 2) and currentStep is not a Phase 2 step
    if (majorRoadmapStep === 1 && !wizardSteps.includes(currentStep)) {
      setStep('PERSONA');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorRoadmapStep]);

  // Trigger calculating screen when COMPLETED step is reached
  useEffect(() => {
    if (currentStep === 'COMPLETED' && !isCalculating) {
      handleFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isCalculating]);

  const handleNext = (nextStepId?: OnboardingStepId, coinReward?: number) => {
    // COIN_SYSTEM_PAUSED: Re-enable in April
    // Add coins when moving to next step (only if coin system is enabled)
    if (IS_COIN_SYSTEM_ENABLED) {
      const coinsToAdd = coinReward || 10;
      addCoins(coinsToAdd);
    }
    
    // Determine next step
    if (nextStepId) {
      setStep(nextStepId);
      return;
    }
    
    // Fallback: Determine next step based on current step index
    if (currentStepIndex >= 0 && currentStepIndex < wizardSteps.length - 1) {
      setStep(wizardSteps[currentStepIndex + 1]);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setStep(wizardSteps[currentStepIndex - 1]);
    } else {
      // Go back to roadmap if on first step
      router.push('/onboarding-new/roadmap');
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'PERSONA':
        return (
          <PersonaStep onNext={() => handleNext('PERSONAL_STATS', 10)} />
        );

      case 'PERSONAL_STATS':
        return (
          <PersonalStatsStep onNext={() => handleNext('EQUIPMENT', 10)} />
        );

      case 'EQUIPMENT':
        return (
          <EquipmentStep onNext={() => handleNext('SCHEDULE', 10)} />
        );

      case 'SCHEDULE':
        return (
          <ScheduleStep onNext={() => handleNext('LOCATION', 10)} />
        );

      case 'LOCATION':
        // Unified Location step - GPS, City Search, and Park Discovery (Grand Finale)
        return (
          <UnifiedLocationStep onNext={() => handleFinish()} />
        );

      case 'COMPLETED':
        // This case is handled by useEffect - calculating screen will show
        return null;

      case 'SUMMARY':
        // New Grand Finale SummaryStep
        return (
          <SummaryStep
            onNext={() => {
              // Update majorRoadmapStep to 2 (Phase 3 - Summary)
              useOnboardingStore.getState().setMajorRoadmapStep(2);
              
              // Final sync before redirect
              syncOnboardingToFirestore('COMPLETED', data).catch((error) => {
                console.error('[OnboardingWizard] Error syncing final data:', error);
              });
              
              // Final redirect to home when user clicks "Let's Start"
              router.push('/home');
            }}
          />
        );

      default:
        // If step is not recognized, default to PERSONA
        return <PersonaStep onNext={() => handleNext('PERSONAL_STATS', 10)} />;
    }
  };

  // Show calculating screen if active (COMPLETED step)
  if (isCalculating && currentStep === 'COMPLETED') {
    // Get user data from sessionStorage or store
    const userName = typeof window !== 'undefined'
      ? sessionStorage.getItem('onboarding_personal_name') || (data as any).name || 'OUTer'
      : 'OUTer';
    
    // Get workout type from data or default
    const workoutType = (data as any).preferredWorkout || (data as any).workoutType || 'כושר';

    return (
      <CalculatingProfileScreen
        userName={userName}
        workoutType={workoutType}
        onComplete={() => {
          // Navigate to SUMMARY step (not home yet)
          setIsCalculating(false);
          setStep('SUMMARY');
        }}
      />
    );
  }

  // Get step title based on current step
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
      case 'SUMMARY':
        return savedLanguage === 'he' ? 'סיכום' : 'Summary';
      default:
        return '';
    }
  };

  return (
    <OnboardingLayout
      headerType="progress"
      onboardingPhase={2} // Phase 2 - Lifestyle Adaptation
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
