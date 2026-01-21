'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { OnboardingStepId } from '../types';
import OnboardingLayout from './OnboardingLayout';
import LocationStep from './steps/LocationStep';
import EquipmentStep from './steps/EquipmentStep';
import HistoryStep from './steps/HistoryStep';
import ScheduleStep from './steps/ScheduleStep';
import CitySelectionStep from './steps/CitySelectionStep';
import CalculatingProfileScreen from '@/components/CalculatingProfileScreen';
import SummaryReveal from './SummaryReveal';
import { syncOnboardingToFirestore } from '../services/onboarding-sync.service';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';

export default function OnboardingWizard() {
  const router = useRouter();
  const { currentStep, setStep, addCoins, updateData, data, coins } = useOnboardingStore();
  const [isCalculating, setIsCalculating] = useState(false);

  // Get current language - ensure locale is always available
  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const locale = getOnboardingLocale(savedLanguage);

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
    // Sync current step on mount to ensure user appears in admin panel immediately
    syncOnboardingToFirestore(currentStep, data).catch((error) => {
      console.error('[OnboardingWizard] Error syncing on mount:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Trigger calculating screen when COMPLETED step is reached
  useEffect(() => {
    if (currentStep === 'COMPLETED' && !isCalculating) {
      handleFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isCalculating]);

  // Phase 2 wizard steps (after Phase 1 questionnaire completion)
  const wizardSteps: OnboardingStepId[] = [
    'LOCATION',
    'EQUIPMENT',
    'HISTORY',
    'SCHEDULE',
    'SOCIAL_MAP',
    'COMPLETED',
    'SUMMARY',
  ];

  // Calculate progress for Phase 2
  const currentWizardStepIndex = wizardSteps.indexOf(currentStep);
  // Exclude 'COMPLETED' from progress (it's a loading state, not a visible step)
  // Include 'SUMMARY' in progress
  const totalWizardSteps = wizardSteps.filter(step => step !== 'COMPLETED').length;
  
  // Phase 2 starts at 50% (Phase 1 completed) and goes to 100%
  // Pass initialProgress=50 and let OnboardingLayout map currentStep to 50-100% range
  const initialProgress = 50; // Representing completed Phase 1

  const handleNext = (nextStepId?: OnboardingStepId, coinReward?: number) => {
    // Add coins when moving to next step
    const coinsToAdd = coinReward || 10;
    addCoins(coinsToAdd);
    
    // Determine next step
    if (nextStepId) {
      setStep(nextStepId);
      return;
    }
    
    // Fallback: Determine next step based on current step
    const stepOrder: Array<typeof currentStep> = [
      'LOCATION',
      'EQUIPMENT',
      'HISTORY',
      'SCHEDULE',
      'SOCIAL_MAP',
      'COMPLETED',
      'SUMMARY',
    ];
    
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const stepOrder: Array<typeof currentStep> = [
      'LOCATION',
      'EQUIPMENT',
      'HISTORY',
      'SCHEDULE',
      'SOCIAL_MAP',
      'COMPLETED',
      'SUMMARY',
    ];
    
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1]);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'LOCATION':
        return (
          <LocationStep onNext={() => handleNext('EQUIPMENT', 10)} />
        );

      case 'EQUIPMENT':
        return (
          <EquipmentStep onNext={() => handleNext('HISTORY', 10)} />
        );

      case 'HISTORY':
        return (
          <HistoryStep onNext={() => handleNext('SCHEDULE', 10)} />
        );

      case 'SCHEDULE':
        return <ScheduleStep onNext={() => handleNext('SOCIAL_MAP', 0)} />;

      case 'SOCIAL_MAP':
        return <CitySelectionStep onNext={() => handleFinish()} />;

      case 'COMPLETED':
        // This case is handled by useEffect - calculating screen will show
        return null;

      case 'SUMMARY':
        // Convert OnboardingData to OnboardingAnswers format for SummaryReveal
        // Calculate fitness level from history frequency
        let fitnessLevel = 1; // Default
        if (data.historyFrequency === 'none') {
          fitnessLevel = 1; // Beginner
        } else if (data.historyFrequency === '1-2') {
          fitnessLevel = 2; // Intermediate
        } else if (data.historyFrequency === '3+') {
          fitnessLevel = 3; // Advanced
        }
        
        // Use actual selected days if available, otherwise reconstruct from frequency
        const dayMap = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
        let scheduleDays: string[] = [];
        
        if (data.scheduleDays && Array.isArray(data.scheduleDays) && data.scheduleDays.length > 0) {
          // Use the actual selected days from ScheduleStep
          scheduleDays = data.scheduleDays;
        } else if (data.scheduleDayIndices && Array.isArray(data.scheduleDayIndices)) {
          // Convert indices to Hebrew day letters
          scheduleDays = data.scheduleDayIndices.map((index: number) => dayMap[index]).sort();
        } else if (data.trainingDays) {
          // Fallback: reconstruct from frequency (first N days) - legacy behavior
          scheduleDays = Array.from({ length: Math.min(data.trainingDays, 7) }, (_, i) => dayMap[i]);
        }

        const answers = {
          fitness_level: fitnessLevel,
          schedule_days: scheduleDays,
          schedule_frequency: data.trainingDays || 0,
          schedule_time: data.trainingTime || '',
          equipmentList: data.equipmentList || [],
          hasGym: data.hasGym || false,
          historyFrequency: data.historyFrequency || 'none',
          historyTypes: data.historyTypes || [],
        };

        return (
          <SummaryReveal
            titleKey="onboarding.summary.title"
            answers={answers}
            onContinue={() => {
              // Final sync before redirect
              syncOnboardingToFirestore('COMPLETED', data).catch((error) => {
                console.error('[OnboardingWizard] Error syncing final data:', error);
              });
              // Final redirect to roadmap when user clicks "Let's Start"
              router.push('/roadmap');
            }}
          />
        );

      default:
        return null;
    }
  };

  // Show calculating screen if active (COMPLETED step)
  if (isCalculating && currentStep === 'COMPLETED') {
    // Get user data from sessionStorage or store
    const userName = typeof window !== 'undefined'
      ? sessionStorage.getItem('onboarding_personal_name') || data.name || 'OUTer'
      : 'OUTer';
    
    // Get workout type from data or default
    const workoutType = data.preferredWorkout || data.workoutType || 'כושר';

    return (
      <CalculatingProfileScreen
        userName={userName}
        workoutType={workoutType}
        onComplete={() => {
          // Navigate to SUMMARY step (not roadmap yet)
          setIsCalculating(false);
          setStep('SUMMARY');
        }}
      />
    );
  }

  return (
    <OnboardingLayout
      headerType="progress"
      initialProgress={initialProgress} // Starts at 50% (Phase 1 completed)
      currentStep={currentWizardStepIndex >= 0 ? currentWizardStepIndex + 1 : 0}
      totalSteps={totalWizardSteps}
      title={
        currentStep === 'LOCATION'
          ? 'איפה את/ה גר?'
          : currentStep === 'EQUIPMENT'
          ? locale.equipment.title
          : currentStep === 'HISTORY'
          ? locale.history.title
          : currentStep === 'SCHEDULE'
          ? 'לוח זמנים'
          : currentStep === 'SOCIAL_MAP'
          ? 'בחר עיר'
          : currentStep === 'SUMMARY'
          ? 'סיכום'
          : 'השלמת'
      }
      subtitle={
        currentStep === 'LOCATION'
          ? 'אנחנו שואלים כדי לעזור לך להצטרף לקהילה המקומית ולהתאים לך מסלולי אימון קרובים'
          : currentStep === 'HISTORY'
          ? locale.history.subtitle
          : undefined
      }
      onBack={handleBack}
      showBack={currentStep !== 'LOCATION'}
    >
      {renderStepContent()}
    </OnboardingLayout>
  );
}
