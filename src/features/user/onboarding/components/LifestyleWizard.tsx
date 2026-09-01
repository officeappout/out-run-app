'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import {
  initPushNotifications,
  requestWebPush,
  isNativePlatform,
  isIOSDevice,
  isStandalonePWA,
} from '@/lib/native/push';
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
  const [showIOSModal, setShowIOSModal] = useState(false);

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
      const storePersonaIds: string[] = (onboardingData as any)?.selectedPersonaIds?.length
        ? (onboardingData as any).selectedPersonaIds
        : (onboardingData as any)?.selectedPersonaId
          ? [(onboardingData as any).selectedPersonaId]
          : [];
      const storeScheduleDays = (onboardingData as any)?.scheduleDays || [];
      const storeLifestyleTags = (onboardingData as any)?.lifestyleTags || [];
      const calendarSyncEnabled = (onboardingData as any)?.calendarSyncEnabled ?? true;

      // Final/authoritative personas write — overwrites the early write from
      // handlePersonaNext below in case the user went back and changed their
      // selection. answers:{} — the Phase 3/4 drawer doesn't exist yet.
      await setDoc(doc(db, 'users', uid), {
        personas: storePersonaIds.map((id) => ({ id, answers: {}, updatedAt: Timestamp.now() })),
        lifestyle: {
          lifestyleTags: storeLifestyleTags,
          trainingHistory: (onboardingData as any)?.historyFrequency || 'none',
          scheduleDays: storeScheduleDays,
        },
        settings: {
          calendarSync: calendarSyncEnabled,
        },
        onboardingStatus: 'COMPLETED',
        onboardingStep: 'COMPLETED',
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('skipped_bridge');
      }

      // Health-connect permission is no longer auto-requested here — it's
      // offered as its own optional onboarding step (HealthConnectOptInStep,
      // right after HealthDeclarationStep) and from the profile/steps-ring
      // entry points instead, so the OS dialog only ever appears after an
      // explicit user gesture.
      onComplete();
    } catch (error) {
      console.error('[LifestyleWizard] Submit error:', error);
      alert('שגיאה בשמירה');
    } finally {
      setIsSubmitting(false);
    }
  }, [onComplete, onboardingData]);

  // Write-once guard for the early `personas` write: goToPreviousStep lets a
  // user go back to persona and forward again within the same open wizard
  // session, which would re-fire handlePersonaNext. profile from
  // useUserStore isn't refreshed mid-session (refreshProfile() only runs on
  // wizard completion), so it can't detect a write that just happened in
  // THIS session -- hence the local ref, checked alongside the
  // already-loaded profile value (which catches the case where personas was
  // set in a prior session before this one opened).
  const personaAnsweredWrittenRef = useRef(false);

  // Step-specific handlers
  const handlePersonaNext = () => {
    // PersonaStep saves to onboarding store internally.
    //
    // ============================================================
    // REPLACES `lifestyle.personaAnsweredAt` -- DO NOT REINTRODUCE IT.
    // ============================================================
    // A concurrent session added `lifestyle.personaAnsweredAt` as a marker
    // field earlier today (01.09.2026) for the exact same purpose this early
    // write now serves: let a user who answers persona and closes before
    // schedule/notifications still count as answered (David: "המערכת
    // מתאימה עצמה למשתמש, לא ההפך"). The 01.09.2026 clean persona-model
    // redefinition deleted `personaAnsweredAt` outright (no alias, no
    // compat field -- see docs/research/military-persona-unified-architecture.md)
    // and this early `personas` write below is its direct replacement:
    // writing the real `personas` array early makes hasAnsweredPersona()
    // true immediately, with no separate marker field to keep in sync, and
    // no serverTimestamp()-resolves-to-null-locally flicker risk either --
    // Timestamp.now() is a real value the instant it's written, same
    // reasoning that ruled out serverTimestamp() for the old field.
    // handleFinalSubmit re-writes `personas` with the latest selection, so
    // going back and changing persona after this fires is still correct.
    //
    // IF YOU ARE THE OTHER SESSION REBASING/MERGING ONTO THIS: do not bring
    // back `personaAnsweredAt` -- `hasAnsweredPersona()` (and any other
    // check) should read `personas?.length` instead. Ask David/this branch
    // before re-adding it; it was a real same-day collision on `main`.
    const alreadyAnswered = !!(profile as any)?.personas?.length;
    if (!personaAnsweredWrittenRef.current && !alreadyAnswered) {
      personaAnsweredWrittenRef.current = true;
      const uid = auth.currentUser?.uid;
      const earlyPersonaIds: string[] = (onboardingData as any)?.selectedPersonaIds?.length
        ? (onboardingData as any).selectedPersonaIds
        : (onboardingData as any)?.selectedPersonaId
          ? [(onboardingData as any).selectedPersonaId]
          : [];
      if (uid && earlyPersonaIds.length > 0) {
        setDoc(
          doc(db, 'users', uid),
          { personas: earlyPersonaIds.map((id) => ({ id, answers: {}, updatedAt: Timestamp.now() })) },
          { merge: true },
        ).catch((error) => {
          console.error('[LifestyleWizard] early personas write failed:', error);
        });
      }
    }
    goToNextStep();
  };

  const handleScheduleNext = () => {
    // ScheduleStep saves to onboarding store internally
    goToNextStep();
  };

  // Notifications-step handler.
  //
  // Platform dispatch matrix:
  //   • Capacitor native (iOS/Android app) → `initPushNotifications` via FCM plugin
  //   • iOS Safari, NOT installed as PWA   → show "Add to Home Screen" instructions
  //                                          (Apple Web Push requires standalone mode)
  //   • Web browser (Android Chrome, desktop, iOS standalone PWA)
  //       → `Notification.requestPermission()` called first (MUST be the first
  //          await to satisfy browser user-activation requirements), then
  //          `requestWebPush` obtains the FCM web token via firebase/messaging.
  //
  // The `system` channel is force-true regardless of the user's choice;
  // it carries operational/security messages the Cloud Function always delivers.
  const handleNotificationsNext = async (enabled: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      console.warn('[LifestyleWizard] No authenticated user — skipping push setup');
      await handleFinalSubmit();
      return;
    }

    try {
      if (enabled) {
        if (isNativePlatform()) {
          // ── Native Capacitor path (iOS app, Android app) ──────────────
          await initPushNotifications(uid);
        } else if (isIOSDevice() && !isStandalonePWA()) {
          // ── iOS Safari outside PWA — Apple blocks Web Push ────────────
          // Show instructions instead of attempting a doomed permission
          // request. The modal gives the user steps to add the app to the
          // home screen so the next attempt will succeed.
          setShowIOSModal(true);
          return; // Pause here; the modal's CTA resumes the flow.
        } else {
          // ── Web browser (Android Chrome, desktop, iOS PWA) ────────────
          // IMPORTANT: Notification.requestPermission() MUST be the first
          // await in this block so it sits directly on the user-gesture
          // call stack. Browsers reject permission prompts that follow
          // any prior await that isn't also a user-gesture bridge.
          const permission: NotificationPermission =
            'Notification' in window
              ? await Notification.requestPermission()
              : 'denied';

          await requestWebPush(uid, permission);
        }
      }

      await saveNotificationPrefs(uid, {
        pushEnabled: enabled,
        channels: {
          encouragement:    enabled,
          health_milestone: enabled,
          training_reminder: enabled,
          system: true, // always on — operational/security messages
        },
      });
    } catch (err) {
      // Never block onboarding completion on a push failure —
      // the user can re-enable from Settings at any time.
      console.warn('[LifestyleWizard] Push setup failed (non-fatal):', err);
    }

    await handleFinalSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" dir="rtl">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pb-4 border-b"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)' }}
      >
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
      <div className="flex-1 overflow-y-auto overscroll-contain">
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

      {/* ── iOS "Add to Home Screen" instructions modal ────────────────────
          Shown when the user taps "enable notifications" on iOS Safari while
          the app is NOT installed as a standalone PWA. Apple Web Push only
          works once the user has added the app to their home screen. */}
      <AnimatePresence>
        {showIOSModal && (
          <motion.div
            key="ios-modal-overlay"
            className="fixed inset-0 z-[120] flex items-end justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Scrim */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setShowIOSModal(false)}
            />

            {/* Sheet */}
            <motion.div
              key="ios-modal-sheet"
              className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              exit={{ y: 80,   opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            >
              {/* Header */}
              <div className="text-center mb-5">
                <div className="text-5xl mb-3">📱</div>
                <h3 className="text-xl font-black text-slate-900 mb-2">
                  לקבלת התראות באייפון
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Apple מאפשרת התראות רק לאפליקציות שמותקנות על מסך הבית.
                  זה לוקח פחות מדקה ✨
                </p>
              </div>

              {/* Step-by-step instructions */}
              <div className="space-y-3.5 mb-6">
                <div className="flex items-start gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                  <span
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#00BAF7,#0CF2E3)' }}
                  >
                    1
                  </span>
                  <span className="text-sm text-slate-700 leading-snug">
                    פתח את ספארי ולחץ על סמל השיתוף{' '}
                    <span className="font-semibold">⬜↑</span>{' '}
                    בסרגל התחתון
                  </span>
                </div>

                <div className="flex items-start gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                  <span
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#00BAF7,#0CF2E3)' }}
                  >
                    2
                  </span>
                  <span className="text-sm text-slate-700 leading-snug">
                    גלול מטה ובחר{' '}
                    <span className="font-semibold">"הוסף למסך הבית"</span>
                  </span>
                </div>

                <div className="flex items-start gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                  <span
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#00BAF7,#0CF2E3)' }}
                  >
                    3
                  </span>
                  <span className="text-sm text-slate-700 leading-snug">
                    פתח את{' '}
                    <span className="font-semibold">Out</span>{' '}
                    מהסמל החדש על מסך הבית ואשר את ההתראות
                  </span>
                </div>
              </div>

              {/* CTAs */}
              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full py-3.5 rounded-full font-semibold text-sm text-black transition-opacity active:opacity-80"
                style={{
                  background: 'linear-gradient(98deg,#0CF2E3 0%,#00BAF7 98%)',
                  boxShadow: '0 6px 20px rgba(0,186,247,0.35)',
                }}
              >
                הבנתי, אוסיף למסך הבית
              </button>

              <button
                onClick={async () => {
                  setShowIOSModal(false);
                  // Skip push, continue onboarding
                  await handleNotificationsNext(false);
                }}
                className="w-full mt-2.5 py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                {t('דלג בשלב זה', 'דלגי בשלב זה')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
