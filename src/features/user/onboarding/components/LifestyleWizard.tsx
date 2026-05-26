'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { initPushNotifications } from '@/lib/native/push';
import { saveNotificationPrefs } from '@/features/notifications/services/notification-prefs.service';
import StickyActionButton from '@/components/ui/StickyActionButton';
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
  // Slide the global BottomNavbar off-screen for the duration of this wizard
  // so the fixed tab bar never obscures the CTA buttons.
  useSuppressBottomNav();

  const { profile } = useUserStore();
  const { data: onboardingData } = useOnboardingStore();
  const [currentStep, setCurrentStep] = useState<WizardStep>('persona');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Gender-aware copy — sessionStorage is populated earlier in the
  // onboarding flow (see PersonalStatsStep), with 'male' as the safe
  // fallback. Mirrors the pattern used in ScheduleStep.tsx.
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  const t = (male: string, female: string) => (gender === 'female' ? female : male);

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

  // Final submit — persists persona + schedule + completion status only.
  // Push-notification preferences are handled by handleNotificationsNext
  // (which writes the canonical `settings.pushEnabled` +
  // `settings.notificationPrefs` schema BEFORE this runs). The legacy
  // `lifestyle.pushEnabled` key was removed: it was never read by the
  // server (`sendPushFromQueue` only reads `settings.*`).
  const handleFinalSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('No user');

      // Read persona + schedule from onboarding store (saved by PersonaStep / ScheduleStep)
      const storePersonaId = (onboardingData as any)?.selectedPersonaId || '';
      const storeScheduleDays = (onboardingData as any)?.scheduleDays || [];
      const storeLifestyleTags = (onboardingData as any)?.lifestyleTags || [];

      await setDoc(doc(db, 'users', uid), {
        personaId: storePersonaId || null,
        lifestyle: {
          selectedPersonaId: storePersonaId || null,
          lifestyleTags: storeLifestyleTags,
          trainingHistory: (onboardingData as any)?.historyFrequency || 'none',
          scheduleDays: storeScheduleDays,
        },
        onboardingStatus: 'COMPLETED',
        onboardingStep: 'COMPLETED',
        updatedAt: serverTimestamp(),
      }, { merge: true });

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
  }, [onComplete, onboardingData]);

  // Step-specific handlers
  const handlePersonaNext = () => {
    // PersonaStep saves to onboarding store internally
    goToNextStep();
  };

  const handleScheduleNext = () => {
    // ScheduleStep saves to onboarding store internally
    goToNextStep();
  };

  // Notifications-step handler.
  //
  // Pipeline (per implementation plan):
  //   1. If the user accepted, request the native OS permission and
  //      register the FCM token via `initPushNotifications`. The helper
  //      is a no-op on the pure-web Vercel build (gated by
  //      `isNativePlatform()`), so this is safe everywhere.
  //   2. Persist the canonical preference schema
  //      (`settings.pushEnabled` + `settings.notificationPrefs`) via
  //      `saveNotificationPrefs`. This is the ONLY path the server-side
  //      `sendPushFromQueue` reads — the legacy `lifestyle.pushEnabled`
  //      key was removed in this same edit.
  //   3. Run the existing persona/schedule/status final submit.
  //
  // The `system` channel is force-true regardless of the user's choice;
  // it carries operational/security messages that the Cloud Function
  // always delivers.
  const handleNotificationsNext = async (enabled: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      console.warn('[LifestyleWizard] No authenticated user — skipping push setup');
      await handleFinalSubmit();
      return;
    }

    try {
      if (enabled) {
        // Native FCM token registration (idempotent; no-op on web).
        await initPushNotifications(uid);
      }

      await saveNotificationPrefs(uid, {
        pushEnabled: enabled,
        channels: {
          encouragement: enabled,
          health_milestone: enabled,
          training_reminder: enabled,
          system: true,
        },
      });
    } catch (err) {
      // Never block onboarding completion on a push-setup failure —
      // the user can adjust prefs later from Settings.
      console.warn('[LifestyleWizard] Push setup failed (non-fatal):', err);
    }

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
              className="flex flex-col min-h-full"
            >
              {/* Scrollable content — pb-36 reserves space above the
                  sticky StickyActionButton + skip link so neither is
                  clipped at the bottom of the viewport. */}
              <div className="flex-1 p-6 pb-36">
                <h2 className="text-2xl font-black text-slate-900 mb-6">{STEP_TITLES.notifications}</h2>

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
              </div>

              {/* Primary CTA — premium token alignment:
                  text-black font-semibold, linear-gradient #00BAF7 → #0CF2E3,
                  rounded-full, shadow-md shadow-cyan-400/25.
                  All of these are baked into StickyActionButton variant="premium". */}
              <StickyActionButton
                variant="premium"
                label="אשמח לקבל תזכורות 🔔"
                successLabel="מעולה!"
                disabled={isSubmitting}
                onPress={() => handleNotificationsNext(true)}
              />

              {/* Soft minimal skip link — gender-aware imperative.
                  Lives below StickyActionButton (which is sticky bottom-0)
                  and relies on the parent scroll container being tall enough
                  to show both. pb-36 on the content div above ensures the
                  card is never obscured by this footer area. */}
              <div className="flex justify-center px-6 pb-8 pt-1">
                <button
                  onClick={() => handleNotificationsNext(false)}
                  disabled={isSubmitting}
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                >
                  {t('דלג בשלב זה', 'דלגי בשלב זה')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
