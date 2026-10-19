'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Bell, Check, Share, Smartphone } from 'lucide-react';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
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
import RunningScheduleStep from './steps/RunningScheduleStep';
import { hasRunningTrack } from '@/lib/track-ownership';
import { useOnboardingV2 } from '../hooks/useOnboardingV2';
import { useWizardIdentity } from '../hooks/useWizardIdentity';
import { buildLifestyleWizardFinalWrite } from '../utils/lifestyle-wizard-final-write';
import { writeLifestyleWizardCompletion } from '../services/lifestyle-wizard-submit.service';
import { resolvePersonaGoalMode } from '../utils/persona-goals';

interface LifestyleWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type WizardStep = 'persona' | 'schedule' | 'notifications';

const NOTIFICATIONS_TITLE = 'תזכורות';

export default function LifestyleWizard({ onComplete, onSkip }: LifestyleWizardProps) {
  // Slide the global BottomNavbar off-screen for the duration of this wizard
  // so the fixed tab bar never obscures the CTA buttons.
  useSuppressBottomNav();
  const v2 = useOnboardingV2();

  const { profile } = useUserStore();
  const { data: onboardingData } = useOnboardingStore();

  // Which schedule step to render — from track-ownership.ts's hasRunningTrack
  // (running.isUnlocked), NOT primaryTrack/dashboardMode (already documented
  // elsewhere as unreliable under JIT editing, §0a). A dual-track user
  // (both strength assessed and running unlocked) gets the running step —
  // deliberate, matches the same reasoning already in track-ownership.ts's
  // own JSDoc for the commit-4 gate: a user with running access left on
  // system-default days indefinitely isn't adapted, regardless of which
  // track they'd call "primary."
  const isRunningTrack = hasRunningTrack(profile);

  const [currentStep, setCurrentStep] = useState<WizardStep>('persona');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Gender-aware copy — from the profile (this wizard opens from /home in
  // later sessions, where sessionStorage is empty); the signup's
  // sessionStorage answer is only the fallback.
  const { gender } = useWizardIdentity();

  // True only once the strength schedule screen (ScheduleStep) was finished
  // in THIS wizard session — the only case the final submit may write
  // lifestyle.scheduleDays / trainingHistory / settings.calendarSync.
  const strengthScheduleEditedRef = useRef(false);
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
      // Only what the user answered in this session (utils/lifestyle-wizard-final-write.ts):
      // scheduleDays / trainingHistory / calendarSync only after the strength
      // schedule screen; the running screen already saved its own days.
      const store = onboardingData as Record<string, any>;
      const lifestyleWrite = buildLifestyleWizardFinalWrite({
        strengthScheduleEdited: strengthScheduleEditedRef.current,
        editedScheduleDays: store?.scheduleDays,
        historyFrequency: store?.historyFrequency,
        calendarSyncEnabled: store?.calendarSyncEnabled,
        sessionLifestyleTags: store?.lifestyleTags,
        goalsSkipped: !resolvePersonaGoalMode(profile).askGoals,
        existingLifestyleTags: profile?.lifestyle?.lifestyleTags,
        existingRunningScheduleDays: (profile?.running as { scheduleDays?: string[] } | undefined)?.scheduleDays,
      });

      // Personas + lifestyle + completion markers, one merge write
      // (services/lifestyle-wizard-submit.service.ts).
      await writeLifestyleWizardCompletion(db, uid, storePersonaIds, lifestyleWrite);

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
  }, [onComplete, onboardingData, profile]);

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
    // ScheduleStep saves to the onboarding store internally; mark it so the
    // final submit may write those days. The running step saved its own.
    if (!isRunningTrack) strengthScheduleEditedRef.current = true;
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

  // ── v2 (enable_home_v2) ────────────────────────────────────────
  // Same steps, handlers and writes. This wizard is a fixed overlay on /home
  // (outside OnboardingLayout's <main>), so it pads the top and bottom
  // safe-area insets itself — once, on the root. The step CTAs inside
  // (StickyActionButton variant="v2") add only their own 12px.
  if (v2) {
    const v2StepBadge = (n: number) => (
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-[13px] font-black text-v2-deep">
        {n}
      </span>
    );
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-v2-surface text-v2-ink"
        dir="rtl"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 px-3 pb-2 pt-2">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goToPreviousStep}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] touch-manipulation"
              aria-label="Back"
            >
              <ChevronRight size={20} className="text-v2-ink" />
            </button>
          ) : (
            <div className="w-10 flex-shrink-0" aria-hidden />
          )}

          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-v2-hairline">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
                transition={{ duration: 0.3 }}
                className="h-full rounded-full bg-v2-accent"
              />
            </div>
            <p className="mt-1.5 whitespace-nowrap text-center text-[12px] font-bold text-v2-muted">
              {stepIndex + 1} מתוך {totalSteps}
            </p>
          </div>

          <button
            type="button"
            onClick={onSkip}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] touch-manipulation"
            aria-label="Close"
          >
            <X size={20} className="text-v2-ink" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AnimatePresence mode="wait">
            {currentStep === 'persona' && (
              <motion.div
                key="persona"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="px-4 pb-4 pt-3"
              >
                <PersonaStep onNext={handlePersonaNext} />
              </motion.div>
            )}

            {currentStep === 'schedule' && (
              <motion.div
                key="schedule"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                {isRunningTrack
                  ? <RunningScheduleStep onNext={handleScheduleNext} isJIT />
                  : <ScheduleStep onNext={handleScheduleNext} />}
              </motion.div>
            )}

            {currentStep === 'notifications' && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex min-h-full flex-col"
              >
                <div className="flex-1 px-4 pb-6 pt-3">
                  <h2 className="mb-5 text-[26px] font-black leading-[1.15] !tracking-[-0.02em]">
                    {NOTIFICATIONS_TITLE}
                  </h2>

                  <div className="rounded-v2-card bg-white p-5 shadow-v2-card">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
                        <Bell size={22} strokeWidth={2.25} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-black text-v2-ink">תזכורות חכמות</h3>
                        <p className="text-[14px] font-medium text-v2-ink-2">נשלח לך בדיוק בזמן הנכון</p>
                      </div>
                    </div>
                    <ul className="space-y-2.5 text-[14.5px] font-semibold text-v2-ink">
                      <li className="flex items-start gap-2.5">
                        <Check size={18} strokeWidth={2.75} className="mt-0.5 flex-shrink-0 text-v2-up" aria-hidden />
                        <span>תזכורות לפי הימים שבחרת</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check size={18} strokeWidth={2.75} className="mt-0.5 flex-shrink-0 text-v2-up" aria-hidden />
                        <span>עדכוני התקדמות ויעדים</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <StickyActionButton
                  variant="v2"
                  label="אשמח לקבל תזכורות"
                  successLabel="מעולה!"
                  disabled={isSubmitting}
                  onPress={() => handleNotificationsNext(true)}
                />

                <div className="flex justify-center px-4 pb-3">
                  <button
                    type="button"
                    onClick={() => handleNotificationsNext(false)}
                    disabled={isSubmitting}
                    className="flex h-10 items-center whitespace-nowrap px-4 text-[14.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-50"
                  >
                    {t('דלג בשלב זה', 'דלגי בשלב זה')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* iOS "Add to Home Screen" instructions — v2 bottom sheet. A fixed
            overlay over the whole viewport, so it pads the bottom inset itself. */}
        <AnimatePresence>
          {showIOSModal && (
            <motion.div
              key="ios-modal-overlay"
              className="fixed inset-0 z-[120] flex items-end justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                className="absolute inset-0 backdrop-blur-[2px]"
                style={{ backgroundColor: 'rgba(9,30,50,0.42)' }}
                onClick={() => setShowIOSModal(false)}
              />

              <motion.div
                key="ios-modal-sheet"
                className="relative w-full max-w-md rounded-t-[28px] bg-white px-5 pt-2.5 shadow-v2-sheet"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              >
                <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-v2-pill-border" aria-hidden />

                <div className="mb-5 flex items-start gap-3">
                  <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
                    <Smartphone size={22} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="text-[22px] font-black leading-tight !tracking-[-0.02em] text-v2-ink">
                      לקבלת התראות באייפון
                    </h3>
                    <p className="mt-1 text-[14px] font-medium leading-relaxed text-v2-ink-2">
                      Apple מאפשרת התראות רק לאפליקציות שמותקנות על מסך הבית.
                      זה לוקח פחות מדקה
                    </p>
                  </div>
                </div>

                <div className="mb-5 space-y-2.5">
                  <div className="flex items-start gap-3 rounded-[18px] bg-white px-4 py-3 shadow-v2-ring">
                    {v2StepBadge(1)}
                    <span className="pt-0.5 text-[14.5px] font-medium leading-snug text-v2-ink">
                      {t('פתח', 'פתחי')} את ספארי {t('ולחץ', 'ולחצי')} על סמל השיתוף{' '}
                      <Share size={16} strokeWidth={2.25} className="inline-block align-[-3px] text-v2-deep" aria-label="שיתוף" />{' '}
                      בסרגל התחתון
                    </span>
                  </div>

                  <div className="flex items-start gap-3 rounded-[18px] bg-white px-4 py-3 shadow-v2-ring">
                    {v2StepBadge(2)}
                    <span className="pt-0.5 text-[14.5px] font-medium leading-snug text-v2-ink">
                      {t('גלול מטה ובחר', 'גללי מטה ובחרי')}{' '}
                      <span className="font-extrabold">&quot;הוסף למסך הבית&quot;</span>
                    </span>
                  </div>

                  <div className="flex items-start gap-3 rounded-[18px] bg-white px-4 py-3 shadow-v2-ring">
                    {v2StepBadge(3)}
                    <span className="pt-0.5 text-[14.5px] font-medium leading-snug text-v2-ink">
                      {t('פתח', 'פתחי')} את{' '}
                      <span className="font-extrabold">Out</span>{' '}
                      מהסמל החדש על מסך הבית {t('ואשר', 'ואשרי')} את ההתראות
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowIOSModal(false)}
                  className="flex h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
                >
                  <span className="truncate">הבנתי, אוסיף למסך הבית</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setShowIOSModal(false);
                    // Skip push, continue onboarding
                    await handleNotificationsNext(false);
                  }}
                  className="mx-auto mt-1 flex h-11 items-center justify-center whitespace-nowrap px-4 text-[14.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
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
              {isRunningTrack
                ? <RunningScheduleStep onNext={handleScheduleNext} isJIT />
                : <ScheduleStep onNext={handleScheduleNext} />}
            </motion.div>
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
                <h2 className="text-2xl font-black text-slate-900 mb-6">{NOTIFICATIONS_TITLE}</h2>

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
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-on-brand"
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
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-on-brand"
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
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-on-brand"
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
