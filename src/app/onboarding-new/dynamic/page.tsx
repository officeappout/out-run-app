"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { DynamicOnboardingEngine, DynamicQuestionNode } from '@/features/user/onboarding/engine/DynamicOnboardingEngine';
import { useUserStore } from '@/features/user';
import { mapAnswersToProfile } from '@/features/user/identity/services/profile.service';
import { getOnboardingLocale } from '@/lib/i18n/onboarding-locales';
import DynamicQuestionRenderer from '@/features/user/onboarding/components/DynamicQuestionRenderer';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import ResultLoading from '@/features/user/onboarding/components/ResultLoading';
import ProgramResult from '@/features/user/onboarding/components/ProgramResult';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { auth } from '@/lib/firebase';
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

  // Part 2 is now skipped - state removed
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

  // Reveal screen state
  const [showResultLoading, setShowResultLoading] = useState(false);
  const [showProgramResult, setShowProgramResult] = useState(false);
  const [finalLevelNumber, setFinalLevelNumber] = useState<number>(1);

  // UI state
  const [isAnimating, setIsAnimating] = useState(false);
  // Track question index for progress calculation
  const [questionIndex, setQuestionIndex] = useState(0);
  const estimatedTotalQuestions = 8; // Estimated questions in fitness assessment
  
  // Get language and direction - memoized at component level
  const savedLanguage = typeof window !== 'undefined' 
    ? (sessionStorage.getItem('onboarding_language') || 'he') as 'he' | 'en' | 'ru'
    : 'he';
  const direction = savedLanguage === 'he' ? 'rtl' : 'ltr';

  // Save claim params
  useEffect(() => {
    if (claimCoins) sessionStorage.setItem('onboarding_claim_coins', claimCoins);
    if (claimCalories) sessionStorage.setItem('onboarding_claim_calories', claimCalories);
  }, [claimCoins, claimCalories]);

  // Initialize engine - load first question with language and gender from sessionStorage
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        
        // Log onboarding start event
        Analytics.logOnboardingStart('dynamic_questionnaire').catch((error) => {
          console.error('[DynamicOnboarding] Error logging onboarding start:', error);
        });
        
        // Get language from sessionStorage (set in intro page) or default to 'he'
        const currentLang = (sessionStorage.getItem('onboarding_language') || 'he') as 'he' | 'en' | 'ru';
        // Get gender from sessionStorage (set in roadmap page) or default to 'neutral'
        const savedGender = sessionStorage.getItem('onboarding_personal_gender');
        const gender: 'male' | 'female' | 'neutral' = 
          savedGender === 'male' ? 'male' : 
          savedGender === 'female' ? 'female' : 
          'neutral';
        
        await engine.initialize('assessment', undefined, currentLang, gender);
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
  }, []);

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
          // Part 1 complete - skip Part 2 and go directly to reveal screens
          setIsPart1Complete(true);
          setAssignedLevel(result.assignedLevel);
          setAssignedLevelId(result.assignedLevelId);
          setAssignedProgramId(result.assignedProgramId);
          setAssignedResults(result.assignedResults);
          setMasterProgramSubLevels(result.masterProgramSubLevels);
          setCurrentQuestion(null);

          // Persist assignedResults to sessionStorage for cross-page access
          // (OnboardingWizard Phase 2 will read these when syncing to Firestore)
          if (result.assignedResults && result.assignedResults.length > 0) {
            sessionStorage.setItem('onboarding_assigned_results', JSON.stringify(result.assignedResults));
          }
          if (result.assignedProgramId) {
            sessionStorage.setItem('onboarding_assigned_program_id', result.assignedProgramId);
          }
          if (result.assignedLevelId) {
            sessionStorage.setItem('onboarding_assigned_level_id', result.assignedLevelId);
          }

          // Trigger completion flow immediately (skips Part 2)
          // IMPORTANT: Pass result directly to avoid stale closure — setState
          // is async, so the closure would still hold undefined values.
          await handleComplete({
            assignedLevel: result.assignedLevel,
            assignedLevelId: result.assignedLevelId,
            assignedProgramId: result.assignedProgramId,
            assignedResults: result.assignedResults,
            masterProgramSubLevels: result.masterProgramSubLevels,
          });
        } else if (result.nextQuestion) {
          // Continue Part 1
          setCurrentQuestion(result.nextQuestion);
          setSelectedAnswerId(undefined);
          setQuestionIndex(prev => prev + 1);
        } else {
          // No next question (shouldn't happen) - trigger completion
          setIsPart1Complete(true);
          setAssignedLevel(result.assignedLevel);
          setAssignedLevelId(result.assignedLevelId);
          setAssignedProgramId(result.assignedProgramId);
          setCurrentQuestion(null);
          await handleComplete();
        }
      } catch (err: any) {
        console.error('Error processing answer:', err);
        setError(err.message || 'שגיאה בעיבוד התשובה');
      } finally {
        setIsAnimating(false);
      }
    }, 300);
  };

  // Part 2 navigation removed - Part 2 is now skipped

  // Handle final completion - show reveal screens
  // Accepts an optional resultOverride to avoid stale closure values.
  // When called immediately after setState, React hasn't re-rendered yet,
  // so assignedLevel/assignedProgramId etc. in the closure are still undefined.
  // Passing them directly from the engine result guarantees fresh values.
  const handleComplete = useCallback(async (resultOverride?: {
    assignedLevel?: number;
    assignedLevelId?: string;
    assignedProgramId?: string;
    assignedResults?: Array<{ programId: string; levelId: string; masterProgramSubLevels?: Record<string, number> }>;
    masterProgramSubLevels?: Record<string, number>;
  }) => {
    // Use override values (fresh from engine) when available, fall back to state
    const effectiveLevel = resultOverride?.assignedLevel ?? assignedLevel;
    const effectiveLevelId = resultOverride?.assignedLevelId ?? assignedLevelId;
    const effectiveProgramId = resultOverride?.assignedProgramId ?? assignedProgramId;
    const effectiveResults = resultOverride?.assignedResults ?? assignedResults;
    const effectiveSubLevels = resultOverride?.masterProgramSubLevels ?? masterProgramSubLevels;

    try {
      // Collect all answers
      const dynamicAnswers = engine.getAllAnswers();
      
      // Get name and gender from sessionStorage (set in roadmap page)
      const savedName = typeof window !== 'undefined' 
        ? sessionStorage.getItem('onboarding_personal_name') || ''
        : '';
      const savedGender = typeof window !== 'undefined'
        ? sessionStorage.getItem('onboarding_personal_gender') || ''
        : '';
      
      // Validate required fields
      if (!savedName) {
        alert('יש למלא את השם כדי להמשיך');
        return;
      }

      // Get selected goals from sessionStorage
      const savedGoals = typeof window !== 'undefined'
        ? (() => {
            try {
              const goalsStr = sessionStorage.getItem('onboarding_selected_goals');
              return goalsStr ? JSON.parse(goalsStr) : [];
            } catch {
              return [];
            }
          })()
        : [];

      // Get selected persona from sessionStorage
      const savedPersonaId = typeof window !== 'undefined'
        ? sessionStorage.getItem('onboarding_selected_persona_id')
        : null;
      
      const savedPersonaTags = typeof window !== 'undefined'
        ? (() => {
            try {
              const tagsStr = sessionStorage.getItem('onboarding_selected_persona_tags');
              return tagsStr ? JSON.parse(tagsStr) : [];
            } catch {
              return [];
            }
          })()
        : [];

      // Combine answers - use sessionStorage data instead of part2Data
      const allAnswers = {
        ...dynamicAnswers,
        personal_name: savedName,
        personal_gender: savedGender || 'neutral',
        selected_goals: savedGoals, // Add goals to answers
        selected_persona_id: savedPersonaId, // Add persona ID
        selected_persona_tags: savedPersonaTags, // Add persona lifestyle tags
        // Optional fields can be empty if not collected
        weight: '',
        height: '',
        personal_birthdate: null,
        location: '',
      };

      // Get level number - use effectiveLevel if available, otherwise fetch from levelId
      let levelNumber = effectiveLevel || 1;
      if (!levelNumber && effectiveLevelId) {
        const { getLevel } = await import('@/features/content/programs/core/level.service');
        const levelDoc = await getLevel(effectiveLevelId);
        if (levelDoc) {
          levelNumber = levelDoc.order || 1;
        }
      }
      setFinalLevelNumber(levelNumber);

      // Also persist to state so ProgramResult can read them
      if (resultOverride) {
        if (resultOverride.assignedLevelId) setAssignedLevelId(resultOverride.assignedLevelId);
        if (resultOverride.assignedProgramId) setAssignedProgramId(resultOverride.assignedProgramId);
      }

      // Create profile with assigned level and program
      const profile = mapAnswersToProfile(
        allAnswers as any,
        effectiveLevel,
        effectiveProgramId,
        effectiveSubLevels
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
      
      console.log('✅ Profile initialized with Level:', effectiveLevel, 'LevelId:', effectiveLevelId, 'Program:', effectiveProgramId, 'SubLevels:', effectiveSubLevels);

      // ✅ PERSISTENCE FIX: Sync assignedResults to Firestore immediately
      // This ensures quiz results are saved even if user drops off before Phase 2
      try {
        // Build the data payload with assignedResults for Firestore persistence
        const syncPayload: any = {
          ...allAnswers,
          assignedResults: effectiveResults || (engine.getProgress() as any).assignedResults,
          assignedProgramId: effectiveProgramId,
          assignedLevelId: effectiveLevelId,
          selectedGoal: savedGoals?.[0],
          selectedGoalIds: savedGoals,
          selectedPersonaId: savedPersonaId || undefined,
          selectedPersonaIds: savedPersonaId ? [savedPersonaId] : [],
          lifestyleTags: savedPersonaTags,
        };
        
        await syncOnboardingToFirestore('COMPLETED', syncPayload);
        console.log('✅ assignedResults synced to Firestore');
      } catch (syncErr) {
        console.warn('[Onboarding] Firestore sync failed (non-blocking):', syncErr);
      }

      // Note: Master-level aggregation is now handled automatically in onboarding-sync.service.ts
      // when step === 'COMPLETED'. No need for duplicate recalculation here.

      // Show result loading animation
      setShowResultLoading(true);
    } catch (err: any) {
      console.error('Error completing onboarding:', err);
      alert('שגיאה בשמירת הפרופיל. אנא נסה שוב.');
    }
  }, [assignedLevel, assignedLevelId, assignedProgramId, assignedResults, masterProgramSubLevels, engine, initializeProfile]);

  // Handle result loading complete - show program result
  const handleResultLoadingComplete = useCallback(() => {
    setShowResultLoading(false);
    setShowProgramResult(true);
  }, []);

  // Handle program result continue - navigate to Roadmap with Step 2 active
  const handleProgramResultContinue = useCallback(() => {
    router.push('/onboarding-new/roadmap');
  }, [router]);

  // Show reveal screens if active
  if (showResultLoading) {
    const savedName = typeof window !== 'undefined' 
      ? sessionStorage.getItem('onboarding_personal_name') || ''
      : '';
    return (
      <ResultLoading
        targetLevel={finalLevelNumber}
        onComplete={handleResultLoadingComplete}
        language={savedLanguage}
      />
    );
  }

  if (showProgramResult) {
    const savedName = typeof window !== 'undefined' 
      ? sessionStorage.getItem('onboarding_personal_name') || ''
      : '';
    return (
      <ProgramResult
        levelNumber={finalLevelNumber}
        levelId={assignedLevelId}
        programId={assignedProgramId}
        userName={savedName || (savedLanguage === 'he' ? 'חבר/ה' : savedLanguage === 'ru' ? 'друг' : 'friend')}
        language={savedLanguage}
        onContinue={handleProgramResultContinue}
      />
    );
  }

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

  // Get saved name for personalization
  const savedName = typeof window !== 'undefined' 
    ? sessionStorage.getItem('onboarding_personal_name') || ''
    : '';
  
  // Get locale for welcome message
  const locale = getOnboardingLocale(savedLanguage);
  
  // Personalized welcome message (only show on first question of questionnaire)
  // Safe implementation to prevent crash: use fallback if locale is missing
  const isFirstQuestion = questionIndex === 0; // First question of fitness assessment
  const userName = savedName || (savedLanguage === 'he' ? 'חבר/ה' : savedLanguage === 'ru' ? 'друг' : 'friend');
  const welcomeTemplate = locale?.common?.welcomeMessage || "מעולה {name}, בואו נתחיל לדייק את רמת הכושר שלך";
  const welcomeMessage = isFirstQuestion && welcomeTemplate 
    ? (welcomeTemplate.includes('{name}') ? welcomeTemplate.replace('{name}', userName) : welcomeTemplate)
    : null;

  // Part 1: Dynamic questions
  // Phase 1 progress: 30% (personal details done) + up to 70% (questions)
  // Formula: min(30 + (questionIndex / estimatedTotalQuestions) * 70, 100)
  const phase1Progress = Math.min(30 + (questionIndex / estimatedTotalQuestions) * 70, 100);
  
  if (!isPart1Complete && currentQuestion) {
    return (
      <OnboardingLayout
        headerType="progress"
        onboardingPhase={1}
        phaseProgress={phase1Progress}
        progressIcon={currentQuestion.progressIcon}
        progressIconSvg={currentQuestion.progressIconSvg}
        onContinue={() => {}}
        onBack={() => {}}
        canContinue={!!selectedAnswerId}
        showBack={false}
        hideContinueButton={true}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            initial={{ x: direction === 'rtl' ? 20 : -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction === 'rtl' ? -20 : 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`w-full font-simpler ${
              isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            } transition-all duration-300`}
          >
            {/* Personalized Welcome Header - Only on first question */}
            {welcomeMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className={`mb-6 text-center ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
              >
                <h2 className="text-xl font-black text-slate-900 leading-tight font-simpler">
                  {welcomeMessage}
                </h2>
              </motion.div>
            )}
            
            <DynamicQuestionRenderer
              question={currentQuestion}
              selectedAnswerId={selectedAnswerId}
              onAnswer={handleAnswer}
            />
          </motion.div>
        </AnimatePresence>
      </OnboardingLayout>
    );
  }

  // Part 2 is now skipped - if we reach here, something went wrong
  // This should not happen, but provide a fallback
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-gray-500">טוען תוצאות...</div>
    </div>
  );
}
