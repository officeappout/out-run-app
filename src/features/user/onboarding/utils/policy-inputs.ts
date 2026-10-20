/**
 * Recommendation policy inputs from the signup (enable_home_v2): the goal ids, persona
 * ids and age the user already gave — store first, then sessionStorage, then profile.
 * Never asks anything; every read is guarded (private mode / SSR → empty).
 */
import { ageFromDob, collectGoalIds } from '@/features/schedule/recommendation-policy';

function readSession(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface PolicyStoreSlice {
  selectedGoalIds?: string[];
  selectedGoal?: string;
  selectedPersonaIds?: string[];
  selectedPersonaId?: string;
}

export interface PolicyProfileSlice {
  personas?: Array<{ id?: string }> | null;
  core?: { mainGoal?: unknown; birthDate?: unknown } | null;
  selectedGoals?: string[] | null;
  onboardingAnswers?: { allGoals?: string[] | null } | null;
}

export interface PolicyInputs {
  goalIds: string[];
  personaIds: string[];
  age: number | null;
}

export function personaIdsOf(store: PolicyStoreSlice | null | undefined, profile: PolicyProfileSlice | null | undefined): string[] {
  if (store?.selectedPersonaIds?.length) return store.selectedPersonaIds;
  if (store?.selectedPersonaId) return [store.selectedPersonaId];
  return (profile?.personas ?? []).map((p) => p.id).filter((id): id is string => !!id);
}

export function readPolicyInputs(
  store: PolicyStoreSlice | null | undefined,
  profile: PolicyProfileSlice | null | undefined,
  now: Date = new Date(),
): PolicyInputs {
  const goalIds = collectGoalIds({
    storeGoalIds: [...(store?.selectedGoalIds ?? []), store?.selectedGoal],
    programPathRaw: readSession('onboarding_program_path'),
    muscleFocusRaw: readSession('onboarding_muscle_focus'),
    mainGoal: profile?.core?.mainGoal,
    profileGoalIds: [...(profile?.selectedGoals ?? []), ...(profile?.onboardingAnswers?.allGoals ?? [])],
  });
  const dob = readSession('onboarding_personal_dob') ?? (typeof profile?.core?.birthDate === 'string' ? profile.core.birthDate : null);
  return { goalIds, personaIds: personaIdsOf(store, profile), age: ageFromDob(dob, now) };
}
