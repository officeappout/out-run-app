/**
 * "אישור השבוע" (ל4): saves through the same path the existing week step uses. The week goes to the
 * onboarding store as buildStrengthScheduleWrite (StrengthSignupScheduleFlow's save), then the
 * LifestyleWizard's final write (buildLifestyleWizardFinalWrite + writeLifestyleWizardCompletion):
 * personas, lifestyle.scheduleDays (merged with the running days) and the completion markers.
 *
 * Part C: then one dotted update with what the screen showed (model/tutorialSave.ts: the template,
 * per-day times, session length, runner choices), and the gradual steps goal (non-fatal).
 */
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { startStepGoalRamp } from '@/features/activity/services/step-goal.service';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { buildLifestyleWizardFinalWrite } from '@/features/user/onboarding/utils/lifestyle-wizard-final-write';
import { writeLifestyleWizardCompletion } from '@/features/user/onboarding/services/lifestyle-wizard-submit.service';
import { resolvePersonaGoalMode } from '@/features/user/onboarding/utils/persona-goals';
import { buildStrengthScheduleWrite } from '@/features/schedule/utils/strengthWeekRecommendation';
import type { TutorialWeek } from './model/tutorialWeek';
import { tutorialSaveFields, type TemplateLike, type TutorialSaveInput } from './model/tutorialSave';

type ProfileSlice = Parameters<typeof resolvePersonaGoalMode>[0] & {
  lifestyle?: { lifestyleTags?: string[] } | null;
  running?: { scheduleDays?: string[] } | null;
};

/** The persona ids PersonaStep left in the store (LifestyleWizard's own read). */
export function storePersonaIds(store: { selectedPersonaIds?: unknown; selectedPersonaId?: unknown }): string[] {
  if (Array.isArray(store.selectedPersonaIds) && store.selectedPersonaIds.length) return store.selectedPersonaIds as string[];
  return typeof store.selectedPersonaId === 'string' && store.selectedPersonaId ? [store.selectedPersonaId] : [];
}

export interface TutorialSaveExtras {
  sessionMinutes: number;
  running: TutorialSaveInput['running'];
  /** The gradual steps goal to start (null = keep the user's goal). */
  steps: { goal: number; cap: number } | null;
}

export async function saveTutorialWeek(
  uid: string,
  tutorialWeek: TutorialWeek,
  profile: ProfileSlice | null | undefined,
  extras: TutorialSaveExtras,
): Promise<void> {
  const { updateData } = useOnboardingStore.getState();
  const strengthWrite = buildStrengthScheduleWrite({ week: tutorialWeek.strengthWeek });
  updateData(strengthWrite);
  const store = useOnboardingStore.getState().data as Record<string, unknown>;
  const lifestyleWrite = buildLifestyleWizardFinalWrite({
    strengthScheduleEdited: true,
    editedScheduleDays: store.scheduleDays as string[] | undefined,
    historyFrequency: store.historyFrequency as string | undefined,
    calendarSyncEnabled: store.calendarSyncEnabled as boolean | undefined,
    calendarSyncAnswered: false,
    sessionLifestyleTags: store.lifestyleTags as string[] | undefined,
    goalsSkipped: !resolvePersonaGoalMode(profile).askGoals,
    existingLifestyleTags: profile?.lifestyle?.lifestyleTags,
    existingRunningScheduleDays: profile?.running?.scheduleDays,
  });
  await writeLifestyleWizardCompletion(db, uid, storePersonaIds(store), lifestyleWrite);

  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const existingTemplate = (snap.data() as { lifestyle?: { recurringTemplate?: TemplateLike } } | undefined)?.lifestyle?.recurringTemplate;
  await updateDoc(ref, tutorialSaveFields({
    week: tutorialWeek,
    existingTemplate,
    trainingTime: strengthWrite.trainingTime,
    sessionMinutes: extras.sessionMinutes,
    running: extras.running,
  }));

  if (extras.steps) {
    try {
      await startStepGoalRamp(uid, extras.steps.goal, extras.steps.cap);
    } catch (err) {
      // Non-fatal: the user keeps the adaptive goal; the week is saved.
      console.warn('[ScheduleTutorial] steps goal ramp not started', err);
    }
  }
}
