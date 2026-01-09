"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingEngine } from '@/features/onboarding/engine/OnboardingEngine';
import { ONBOARDING_QUESTIONNAIRE, START_NODE_ID } from '@/features/onboarding/data/mock-questionnaire';
import { OnboardingAnswers } from '@/features/onboarding/types';
import { useUserStore } from '@/features/user/store/useUserStore';
import { mapAnswersToProfile } from '@/features/user/services/onboarding.service';
import QuestionRenderer from '@/features/onboarding/components/QuestionRenderer';
import OnboardingLayout from '@/features/onboarding/components/OnboardingLayout';

export default function OnboardingPage() {
  const router = useRouter();
  const { hasCompletedOnboarding, initializeProfile } = useUserStore();
  
  // אתחול המנוע פעם אחת בלבד
  const [engine] = useState(() => new OnboardingEngine(ONBOARDING_QUESTIONNAIRE, START_NODE_ID));
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // ==========================================
  // פונקציית סיום (נקראת רק בסוף השאלון)
  // ==========================================
  const handleComplete = useCallback(() => {
    try {
      // איסוף כל התשובות מהמנוע
      const allAnswers = engine.getAllAnswers();
      console.log('Completing onboarding with answers:', allAnswers);
      
      // ולידציה סופית לפני שמירה
      if (!allAnswers.personal_name) {
        console.warn('Missing required answer: personal_name');
        alert('שגיאה: שם המשתמש חסר.');
        return;
      }

      // יצירת פרופיל מלא
      const profile = mapAnswersToProfile(allAnswers);
      console.log('Created profile:', profile);
      
      // שמירה ב-Store (וב-LocalStorage דרך persist)
      initializeProfile(profile);
      
      // מעבר לדף הבית לאחר השהייה קצרה לווידוא שמירה
      setTimeout(() => {
        router.push('/home');
      }, 100);

    } catch (error) {
      console.error('Error completing onboarding:', error);
      alert('שגיאה בשמירת הנתונים. אנא נסה שוב.');
    }
  }, [engine, initializeProfile, router]);

  // ==========================================
  // Effects (בדיקת סטטוס וסנכרון)
  // ==========================================
  
  // בדיקה אם המשתמש כבר סיים בעבר
  useEffect(() => {
    if (hasCompletedOnboarding()) {
      router.replace('/home');
    }
  }, [hasCompletedOnboarding, router]);

  // טעינת תשובות קיימות (אם חזר אחורה בדפדפן או רענן)
  useEffect(() => {
    const state = engine.getState();
    if (state.answers && Object.keys(state.answers).length > 0 && Object.keys(answers).length === 0) {
      setAnswers(state.answers);
    }
  }, []); // רץ פעם אחת בטעינה

  // עדכון הצעד הנוכחי בתצוגה (Progress Bar)
  useEffect(() => {
    const currentNode = engine.getCurrentNode();
    
    if (currentNode) {
      const stepIndex = ONBOARDING_QUESTIONNAIRE.findIndex(n => n.id === currentNode.id);
      setCurrentStep(stepIndex >= 0 ? stepIndex + 1 : 0);
    } else {
      // אם אין שאלה נוכחית, כנראה שהשאלון הסתיים
      const state = engine.getState();
      if (state.isComplete) {
        handleComplete();
      }
    }
  }, [answers, engine, handleComplete]);

  // ==========================================
  // טיפול במענה על תשובה
  // ==========================================
  const handleAnswer = (questionId: string, value: any, optionId?: string) => {
    const currentNode = engine.getCurrentNode();
    if (!currentNode) return;

    // עדכון מקומי של התשובות לרינדור מיידי
    const updatedAnswers = {
      ...answers,
      [questionId]: value,
    };
    setAnswers(updatedAnswers);

    // בדיקה אם צריך להתקדם אוטומטית (עבור כרטיסים ובחירה פשוטה)
    const shouldAutoAdvance = 
      currentNode.viewType === 'simple_selection' || 
      currentNode.viewType === 'cards_with_image' ||
      currentNode.viewType === 'time_picker';

    if (shouldAutoAdvance) {
      setIsAnimating(true);
      // שמירה במנוע
      engine.saveAnswer(questionId, value);
      engine.answer(questionId, value, optionId);

      // אנימציית מעבר
      setTimeout(() => {
        setIsAnimating(false);
        const nextNode = engine.getCurrentNode();
        if (!nextNode) {
          handleComplete();
        }
      }, 400);
    } else {
      // עבור שדות טקסט - רק שומרים, המשתמש ילחץ "המשך" ידנית
      engine.saveAnswer(questionId, value);
    }
  };

  // ==========================================
  // פונקציית ההמשך (onNext) - התיקון הקריטי
  // ==========================================
  const handleContinue = () => {
    const currentNode = engine.getCurrentNode();
    if (!currentNode) {
      handleComplete();
      return;
    }

    // 1. טיפול במסכים אוטומטיים או מיוחדים (Loader, Summary, Save Progress)
    // אלו מסכים שאין בהם "תשובה" קלאסית אלא רק מעבר
    if (currentNode.viewType === 'loader' || currentNode.viewType === 'summary_reveal' || currentNode.viewType === 'save_progress') {
       setIsAnimating(true);
       // מסמנים שהשלב עבר בהצלחה
       engine.answer(currentNode.id, true); 
       
       setTimeout(() => {
         setIsAnimating(false);
         const nextNode = engine.getCurrentNode();
         if (!nextNode) handleComplete();
       }, 300);
       return;
    }

    // מסכים שיש בהם כפתור פנימי משלהם שמטפל בלוגיקה (כמו Terms)
    if (currentNode.viewType === 'terms_of_use') {
      // ה-QuestionRenderer כבר קורא ל-handleAnswer שמקדם את זה
      return;
    }

    // מסך מידע
    if (currentNode.viewType === 'info_screen') {
      setIsAnimating(true);
      engine.answer(currentNode.id, true);
      setTimeout(() => {
        setIsAnimating(false);
        const nextNode = engine.getCurrentNode();
        if (!nextNode) handleComplete();
      }, 300);
      return;
    }

    // 2. ולידציה לפני מעבר ידני
    const currentValue = answers[currentNode.id];
    const validation = engine.validateAnswer(currentNode.id, currentValue);

    if (!validation.valid) {
      alert(validation.error || 'יש למלא את השדה כדי להמשיך');
      return;
    }

    // ולידציות ספציפיות נוספות
    if (currentNode.viewType === 'multi_day_selector') {
      if (!currentValue || !Array.isArray(currentValue) || currentValue.length === 0) {
        alert('אנא בחר לפחות יום אחד לאימון');
        return;
      }
    } else if (currentNode.viewType === 'equipment_selector') {
      if (!currentValue || !currentValue.category) {
        alert('אנא בחר קטגוריית ציוד');
        return;
      }
      if (currentValue.category === 'home' && (!currentValue.items || currentValue.items.length === 0)) {
        alert('אנא בחר לפחות פריט ציוד אחד');
        return;
      }
    }

    // 3. ביצוע המעבר
    setIsAnimating(true);
    engine.saveAnswer(currentNode.id, currentValue);
    // הפרמטר הרביעי 'true' אומר למנוע "לדלג" לשלב הבא
    engine.answer(currentNode.id, currentValue, undefined, true);
    
    setTimeout(() => {
      setIsAnimating(false);
      const nextNode = engine.getCurrentNode();
      if (!nextNode) {
        handleComplete();
      }
    }, 400);
  };

  // ==========================================
  // חזרה אחורה
  // ==========================================
  const handleBack = () => {
    setIsAnimating(true);
    const wentBack = engine.goBack();
    if (wentBack) {
      const state = engine.getState();
      setAnswers(state.answers);
    }
    setTimeout(() => setIsAnimating(false), 400);
  };

  // ==========================================
  // Render
  // ==========================================
  const currentNode = engine.getCurrentNode();
  
  if (!currentNode) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">טוען שאלון...</p>
      </div>
    );
  }

  const currentValue = answers[currentNode.id];
  
  // חישוב האם כפתור "המשך" צריך להיות פעיל
  const canContinue = (() => {
    if (
      currentNode.viewType === 'info_screen' ||
      currentNode.viewType === 'loader' ||
      currentNode.viewType === 'summary_reveal' ||
      currentNode.viewType === 'save_progress' ||
      currentNode.viewType === 'terms_of_use'
    ) {
      return true;
    }

    if (currentNode.viewType === 'equipment_selector') {
      if (!currentValue || typeof currentValue !== 'object' || !currentValue.category) return false;
      if (currentValue.category === 'home' && (!currentValue.items || currentValue.items.length === 0)) return false;
      return true;
    }

    if (currentNode.viewType === 'multi_day_selector') {
      return Array.isArray(currentValue) && currentValue.length > 0;
    }

    return currentValue !== undefined && currentValue !== null && currentValue !== '';
  })();

  const totalSteps = ONBOARDING_QUESTIONNAIRE.length;
  const showBack = engine.getState().visitedSteps.length > 1;

  // חריג: מסך תנאי שימוש (תצוגה מלאה ללא Layout רגיל)
  if (currentNode.viewType === 'terms_of_use') {
    return (
      <div className={`
        transition-all duration-400 ease-in-out bg-white min-h-screen
        ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
      `}>
        <QuestionRenderer
          node={currentNode}
          answers={answers}
          onAnswer={handleAnswer}
          onNext={handleContinue} // העברת הפונקציה המתקנת
          currentStep={currentStep}
          totalSteps={totalSteps}
          onComplete={handleComplete}
        />
      </div>
    );
  }

  // תצוגה ראשית רגילה
  return (
      <OnboardingLayout
        currentStep={currentStep}
        totalSteps={totalSteps}
        onContinue={handleContinue}
        onBack={handleBack}
        canContinue={canContinue}
        showBack={showBack}
        // הסתרת כפתור "המשך" במסכים שיש להם כפתורים משלהם או שהם אוטומטיים
        hideContinueButton={
          currentNode.viewType === 'loader' ||
          currentNode.viewType === 'summary_reveal' ||
          currentNode.viewType === 'save_progress'
        }
      >
      <div
        className={`
          transition-all duration-400 ease-in-out w-full
          ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
          ${(currentNode.viewType === 'loader' || currentNode.viewType === 'summary_reveal' || currentNode.viewType === 'save_progress')
            ? 'h-full flex items-center justify-center' 
            : ''
          }
        `}
      >
        <QuestionRenderer
          node={currentNode}
          answers={answers}
          onAnswer={handleAnswer}
          onNext={handleContinue} // <--- התיקון הקריטי: העברת פונקציית ההמשך
          currentStep={currentStep}
          totalSteps={totalSteps}
          onComplete={handleComplete}
        />
      </div>
    </OnboardingLayout>
  );
}