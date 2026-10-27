/**
 * "אישור השבוע" (ל4): saves through the same path the existing week step uses. The week goes to the
 * onboarding store as buildStrengthScheduleWrite (StrengthSignupScheduleFlow's save), then the
 * LifestyleWizard's final write (buildLifestyleWizardFinalWrite + writeLifestyleWizardCompletion):
 * personas, lifestyle.scheduleDays (merged with the running days) and the completion markers.
 */
import { db } from '@/lib/firebase';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { buildLifestyleWizardFinalWrite } from '@/features/user/onboarding/utils/lifestyle-wizard-final-write';
import { writeLifestyleWizardCompletion } from '@/features/user/onboarding/services/lifestyle-wizard-submit.service';
import { resolvePersonaGoalMode } from '@/features/user/onboarding/utils/persona-goals';
import { buildStrengthScheduleWrite, type StrengthWeekRecommendation } from '@/features/schedule/utils/strengthWeekRecommendation';

type ProfileSlice = Parameters<typeof resolvePersonaGoalMode>[0] & {
  lifestyle?: { lifestyleTags?: string[] } | null;
  running?: { scheduleDays?: string[] } | null;
};

/** The persona ids PersonaStep left in the store (LifestyleWizard's own read). */
export function storePersonaIds(store: { selectedPersonaIds?: unknown; selectedPersonaId?: unknown }): string[] {
  if (Array.isArray(store.selectedPersonaIds) && store.selectedPersonaIds.length) return store.selectedPersonaIds as string[];
  return typeof store.selectedPersonaId === 'string' && store.selectedPersonaId ? [store.selectedPersonaId] : [];
}

export async function saveTutorialWeek(uid: string, week: StrengthWeekRecommendation, profile: ProfileSlice | null | undefined): Promise<void> {
  const { updateData } = useOnboardingStore.getState();
  updateData(buildStrengthScheduleWrite({ week }));
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
}
