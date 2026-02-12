"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DynamicOnboardingEngine, DynamicQuestionNode } from '@/features/user/onboarding/engine/DynamicOnboardingEngine';
import { useUserStore } from '@/features/user';
import { mapAnswersToProfile } from '@/features/user/identity/services/profile.service';
import DynamicQuestionRenderer from '@/features/user/onboarding/components/DynamicQuestionRenderer';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import TextInput from '@/features/user/onboarding/components/TextInput';
import DatePicker from '@/features/user/onboarding/components/DatePicker';
import HealthDeclarationStep from '@/features/user/onboarding/components/HealthDeclarationStep';
import SaveProgressStep from '@/features/user/onboarding/components/SaveProgressStep';
import { syncOnboardingToFirestore } from '@/features/user/onboarding/services/onboarding-sync.service';

/**
 * Dynamic Onboarding Page
 * Part 1: Dynamic assessment questions from Firestore
 * Part 2: Static personal details, health, permissions
 */
export default function DynamicOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasCompletedOnboarding, initializeProfile } = useUserStore();

  // Claim params (from Guest Mode)
  const claimCoins = searchParams.get('coins');
  const claimCalories = searchParams.get('calories');

  // Engine state
  const [engine] = useState(() => new DynamicOnboardingEngine());
  const [currentQuestion, setCurrentQuestion] = useState<DynamicQuestionNode | null>(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Get startQuestionId from query params (for multi-entry point support)
  const startQuestionId = searchParams.get('startQuestionId');

  // Part 2 state
  const [part2Data, setPart2Data] = useState({
    personal_name: '',
    weight: '',
    height: '',
    birthdate: null as Date | null,
    city: '',
  });
  const [part2Step, setPart2Step] = useState<'name' | 'weight' | 'height' | 'birthdate' | 'city' | 'health' | 'save'>('name');
  const [isPart1Complete, setIsPart1Complete] = useState(false);
  const [assignedLevel, setAssignedLevel] = useState<number | undefined>();
  const [assignedLevelId, setAssignedLevelId] = useState<string | undefined>();
  const [assignedProgramId, setAssignedProgramId] = useState<string | undefined>();
  const [assignedResults, setAssignedResults] = useState<Array<{
    programId: string;
    levelId: string;
    masterProgramSubLevels?: Record<string, number>;
  }> | undefined>();
  const [masterProgramSubLevels, setMasterProgramSubLevels] = useState<Record<string, number> | undefined>();

  // UI state
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = isPart1Complete ? 7 : 100; // Dynamic steps for Part 1

  // Save claim params
  useEffect(() => {
    if (claimCoins) sessionStorage.setItem('onboarding_claim_coins', claimCoins);
    if (claimCalories) sessionStorage.setItem('onboarding_claim_calories', claimCalories);
  }, [claimCoins, claimCalories]);

  // Initialize engine - load first question or specific question by ID
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        await engine.initialize('assessment', startQuestionId || undefined);
        const question = engine.getCurrentQuestion();
        setCurrentQuestion(question);
        setError(null);
      } catch (err: any) {
        console.error('Error initializing engine:', err);
        setError(err.message || 'שגיאה בטעינת השאלון');
      } finally {
        setLoading(false);
      }
    };

    if (!hasCompletedOnboarding()) {
      init();
    } else {
      router.replace('/home');
    }
  }, [startQuestionId]);

  // Handle answer selection in Part 1
  const handleAnswer = async (answerId: string) => {
    if (!currentQuestion) return;

    setSelectedAnswerId(answerId);
    setIsAnimating(true);

    // Wait a bit for animation
    setTimeout(async () => {
      try {
        const result = await engine.answer(answerId);
        
        if (result.isPart1Complete) {
          // Part 1 complete - move to Part 2
          setIsPart1Complete(true);
          setAssignedLevel(result.assignedLevel);
          setAssignedLevelId(result.assignedLevelId);
          setAssignedProgramId(result.assignedProgramId);
          setAssignedResults(result.assignedResults); // NEW: Store multiple results
          setMasterProgramSubLevels(result.masterProgramSubLevels);
          setCurrentStep(1);
          setPart2Step('name');
          setCurrentQuestion(null);
        } else if (result.nextQuestion) {
          // Continue Part 1
          setCurrentQuestion(result.nextQuestion);
          setSelectedAnswerId(undefined);
          setCurrentStep(prev => prev + 1);
        } else {
          // No next question (shouldn't happen)
          setIsPart1Complete(true);
          setPart2Step('name');
          setCurrentQuestion(null);
        }
      } catch (err: any) {
        console.error('Error processing answer:', err);
        setError(err.message || 'שגיאה בעיבוד התשובה');
      } finally {
        setIsAnimating(false);
      }
    }, 300);
  };

  // Handle Part 2 navigation
  const handlePart2Next = () => {
    switch (part2Step) {
      case 'name':
        setPart2Step('weight');
        setCurrentStep(2);
        break;
      case 'weight':
        setPart2Step('height');
        setCurrentStep(3);
        break;
      case 'height':
        setPart2Step('birthdate');
        setCurrentStep(4);
        break;
      case 'birthdate':
        setPart2Step('city');
        setCurrentStep(5);
        break;
      case 'city':
        setPart2Step('health');
        setCurrentStep(6);
        break;
      case 'health':
        setPart2Step('save');
        setCurrentStep(7);
        break;
    }
  };

  const handlePart2Back = () => {
    switch (part2Step) {
      case 'weight':
        setPart2Step('name');
        setCurrentStep(1);
        break;
      case 'height':
        setPart2Step('weight');
        setCurrentStep(2);
        break;
      case 'birthdate':
        setPart2Step('height');
        setCurrentStep(3);
        break;
      case 'city':
        setPart2Step('birthdate');
        setCurrentStep(4);
        break;
      case 'health':
        setPart2Step('city');
        setCurrentStep(5);
        break;
      case 'save':
        setPart2Step('health');
        setCurrentStep(6);
        break;
    }
  };

  // Handle final completion
  const handleComplete = useCallback(async () => {
    try {
      // Collect all answers
      const dynamicAnswers = engine.getAllAnswers();
      
      // Combine with Part 2 data
      const allAnswers = {
        ...dynamicAnswers,
        personal_name: part2Data.personal_name,
        weight: part2Data.weight,
        height: part2Data.height,
        personal_birthdate: part2Data.birthdate,
        location: part2Data.city,
      };

      // Validate required fields
      if (!allAnswers.personal_name) {
        alert('יש למלא את השם כדי להמשיך');
        return;
      }

      // Create profile with assigned level and program (support multiple results)
      const profile = mapAnswersToProfile(
        allAnswers as any,
        assignedLevel,
        assignedProgramId,
        masterProgramSubLevels,
        assignedResults // NEW: Pass multiple results
      );

      // Inject claim rewards if available
      const storedCoins = sessionStorage.getItem('onboarding_claim_coins');
      const storedCalories = sessionStorage.getItem('onboarding_claim_calories');
      if (storedCoins && !isNaN(Number(storedCoins))) {
        profile.progression = {
          ...profile.progression,
          coins: (profile.progression?.coins || 0) + Number(storedCoins),
          totalCaloriesBurned: (profile.progression?.totalCaloriesBurned || 0) + Number(storedCalories || 0),
        };
        sessionStorage.removeItem('onboarding_claim_coins');
        sessionStorage.removeItem('onboarding_claim_calories');
      }

      // Save profile locally
      await initializeProfile(profile);
      
      console.log('✅ Profile initialized with Level:', assignedLevel, 'LevelId:', assignedLevelId, 'Program:', assignedProgramId, 'SubLevels:', masterProgramSubLevels);

      // ✅ PERSISTENCE FIX: Sync assignedResults to Firestore immediately
      // This ensures quiz results are saved and not lost on refresh
      try {
        const syncPayload: any = {
          ...allAnswers,
          assignedResults: assignedResults || (engine.getProgress() as any).assignedResults,
          assignedProgramId,
          assignedLevelId,
        };

        // Persist to sessionStorage as backup for cross-page access
        if (assignedResults && assignedResults.length > 0) {
          sessionStorage.setItem('onboarding_assigned_results', JSON.stringify(assignedResults));
        }
        if (assignedProgramId) {
          sessionStorage.setItem('onboarding_assigned_program_id', assignedProgramId);
        }
        if (assignedLevelId) {
          sessionStorage.setItem('onboarding_assigned_level_id', assignedLevelId);
        }
        
        await syncOnboardingToFirestore('COMPLETED', syncPayload);
        console.log('✅ assignedResults synced to Firestore');
      } catch (syncErr) {
        console.warn('[Onboarding] Firestore sync failed (non-blocking):', syncErr);
      }

      // Navigate to home
      setTimeout(() => {
        router.push('/home');
      }, 500);
    } catch (err: any) {
      console.error('Error completing onboarding:', err);
      alert('שגיאה בשמירת הפרופיל. אנא נסה שוב.');
    }
  }, [part2Data, assignedLevel, assignedProgramId, engine, initializeProfile, router]);

  // Loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">טוען שאלון...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-xl font-bold">שגיאה</div>
          <div className="text-gray-600">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  // Part 1: Dynamic questions
  if (!isPart1Complete && currentQuestion) {
    return (
      <OnboardingLayout
        currentStep={currentStep}
        totalSteps={totalSteps}
        onContinue={() => {}}
        onBack={() => {}}
        canContinue={!!selectedAnswerId}
        showBack={false}
        hideContinueButton={true}
      >
        <div
          className={`transition-all duration-300 w-full ${
            isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
        >
          <DynamicQuestionRenderer
            question={currentQuestion}
            selectedAnswerId={selectedAnswerId}
            onAnswer={handleAnswer}
          />
        </div>
      </OnboardingLayout>
    );
  }

  // Part 2: Static forms
  return (
    <OnboardingLayout
      currentStep={currentStep}
      totalSteps={7}
      onContinue={handlePart2Next}
      onBack={handlePart2Back}
      canContinue={
        (part2Step === 'name' && !!part2Data.personal_name) ||
        (part2Step === 'weight' && !!part2Data.weight) ||
        (part2Step === 'height' && !!part2Data.height) ||
        (part2Step === 'birthdate' && !!part2Data.birthdate) ||
        (part2Step === 'city' && !!part2Data.city) ||
        part2Step === 'health' ||
        part2Step === 'save'
      }
      showBack={part2Step !== 'name'}
      hideContinueButton={part2Step === 'save'}
    >
      <div className="w-full space-y-6" dir="rtl">
        {part2Step === 'name' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 text-center">מה שמך?</h2>
            <TextInput
              value={part2Data.personal_name}
              onChange={(value) => setPart2Data({ ...part2Data, personal_name: value })}
              placeholderKey="personal_name"
              type="text"
            />
          </>
        )}

        {part2Step === 'weight' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 text-center">מה משקלך? (ק"ג)</h2>
            <TextInput
              value={part2Data.weight}
              onChange={(value) => setPart2Data({ ...part2Data, weight: value })}
              placeholderKey="weight"
              type="number"
            />
          </>
        )}

        {part2Step === 'height' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 text-center">מה גובהך? (ס"מ)</h2>
            <TextInput
              value={part2Data.height}
              onChange={(value) => setPart2Data({ ...part2Data, height: value })}
              placeholderKey="height"
              type="number"
            />
          </>
        )}

        {part2Step === 'birthdate' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 text-center">מתי נולדת?</h2>
            <DatePicker
              value={part2Data.birthdate}
              onChange={(date) => setPart2Data({ ...part2Data, birthdate: date })}
            />
          </>
        )}

        {part2Step === 'city' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 text-center">איפה אתה גר?</h2>
            <TextInput
              value={part2Data.city}
              onChange={(value) => setPart2Data({ ...part2Data, city: value })}
              placeholderKey="city"
              type="text"
            />
          </>
        )}

        {part2Step === 'health' && (
          <HealthDeclarationStep
            onComplete={() => handlePart2Next()}
          />
        )}

        {part2Step === 'save' && (
          <SaveProgressStep
            onComplete={handleComplete}
          />
        )}
      </div>
    </OnboardingLayout>
  );
}
