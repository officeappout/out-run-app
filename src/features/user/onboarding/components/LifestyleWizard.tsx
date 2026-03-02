'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import PersonaStep from './steps/PersonaStep';
import ScheduleStep from './steps/ScheduleStep';

interface LifestyleWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type WizardStep = 'persona' | 'schedule' | 'notifications';

const STEP_TITLES: Record<WizardStep, string> = {
  persona: 'מי אתה?',
  schedule: 'הלו״ז שלך',
  notifications: 'תזכורות',
};

export default function LifestyleWizard({ onComplete, onSkip }: LifestyleWizardProps) {
  const { profile } = useUserStore();
  const { data: onboardingData } = useOnboardingStore();
  const [currentStep, setCurrentStep] = useState<WizardStep>('persona');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);

  const stepIndex = ['persona', 'schedule', 'notifications'].indexOf(currentStep);
  const totalSteps = 3;

  // Navigate steps
  const goToNextStep = useCallback(() => {
    if (currentStep === 'persona') setCurrentStep('schedule');
    else if (currentStep === 'schedule') setCurrentStep('notifications');
  }, [currentStep]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep === 'notifications') setCurrentStep('schedule');
    else if (currentStep === 'schedule') setCurrentStep('persona');
  }, [currentStep]);

  // Final submit
  const handleFinalSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('No user');

      // Read persona + schedule from onboarding store (saved by PersonaStep / ScheduleStep)
      const storePersonaId = (onboardingData as any)?.selectedPersonaId || '';
      const storeScheduleDays = (onboardingData as any)?.scheduleDays || [];
      const storeLifestyleTags = (onboardingData as any)?.lifestyleTags || [];

      // Update Firestore with all lifestyle data
      await setDoc(doc(db, 'users', uid), {
        personaId: storePersonaId || null,
        lifestyle: {
          selectedPersonaId: storePersonaId || null,
          lifestyleTags: storeLifestyleTags,
          trainingHistory: (onboardingData as any)?.historyFrequency || 'none',
          scheduleDays: storeScheduleDays,
          pushEnabled,
        },
        onboardingStatus: 'COMPLETED',
        onboardingStep: 'COMPLETED',
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Clear skip flag if it was set
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('skipped_bridge');
      }

      onComplete();
    } catch (error) {
      console.error('[LifestyleWizard] Submit error:', error);
      alert('שגיאה בשמירה');
    } finally {
      setIsSubmitting(false);
    }
  }, [pushEnabled, onComplete, onboardingData]);

  // Step-specific handlers
  const handlePersonaNext = () => {
    // PersonaStep saves to onboarding store internally
    goToNextStep();
  };

  const handleScheduleNext = () => {
    // ScheduleStep saves to onboarding store internally
    goToNextStep();
  };

  const handleNotificationsNext = async (enabled: boolean) => {
    setPushEnabled(enabled);
    await handleFinalSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <button
          onClick={onSkip}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          aria-label="Close"
        >
          <X size={24} className="text-slate-600" />
        </button>

        <div className="flex-1 mx-4">
          {/* Progress bar */}
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
              transition={{ duration: 0.3 }}
              className="h-full bg-gradient-to-r from-[#5BC2F2] to-[#3BA4D8]"
            />
          </div>
          <p className="text-xs text-slate-500 text-center mt-1">
            {stepIndex + 1} מתוך {totalSteps}
          </p>
        </div>

        {stepIndex > 0 && (
          <button
            onClick={goToPreviousStep}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Back"
          >
            <ChevronRight size={24} className="text-slate-600" />
          </button>
        )}
        {stepIndex === 0 && <div className="w-10" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {currentStep === 'persona' && (
            <motion.div
              key="persona"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              <h2 className="text-2xl font-black text-slate-900 mb-2">{STEP_TITLES.persona}</h2>
              <p className="text-slate-600 mb-6">בחר את התפקיד שמתאר אותך הכי טוב</p>
              <PersonaStep onNext={handlePersonaNext} />            </motion.div>
          )}

          {currentStep === 'schedule' && (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full"
            >
              <ScheduleStep onNext={handleScheduleNext} />            </motion.div>
          )}

          {currentStep === 'notifications' && (
            <motion.div
              key="notifications"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              <h2 className="text-2xl font-black text-slate-900 mb-2">{STEP_TITLES.notifications}</h2>
              <p className="text-slate-600 mb-6">נזכיר לך לאמן בזמן שהכי מתאים לך</p>

              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-6 mb-6 border border-cyan-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-[#5BC2F2] flex items-center justify-center text-2xl">
                    🔔
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900">תזכורות חכמות</h3>
                    <p className="text-sm text-slate-600">נשלח לך בדיוק בזמן הנכון</p>
                  </div>
                </div>
                <ul className="text-sm text-slate-700 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>תזכורות לפי הימים שבחרת</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>עדכוני התקדמות ויעדים</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleNotificationsNext(true)}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-r from-[#5BC2F2] to-[#3BA4D8] text-white font-bold text-lg rounded-2xl shadow-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'שומר...' : 'אני רוצה תזכורות'}
                </button>

                <button
                  onClick={() => handleNotificationsNext(false)}
                  disabled={isSubmitting}
                  className="w-full py-3 text-slate-600 font-semibold hover:text-slate-900 transition-colors"
                >
                  דלג בשלב זה
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
