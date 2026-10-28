import type { CommunityGroupType } from '@/types/community.types';
import { useShowHeOnlySteps } from '@/features/user/onboarding/hooks/useShowHeOnlySteps';

/**
 * Community / arena name for the same rule as onboarding's Hebrew-only steps
 * (flag hide_he_only_onboarding_steps ON + non-Hebrew locale => hide). One rule, one place:
 * onboarding/utils/he-only-steps.ts. Flag off or Hebrew => true (today's behaviour).
 */
export const useShowHeOnlySurfaces = useShowHeOnlySteps;

/** Group types that exist only in Hebrew (army units). */
export const HE_ONLY_GROUP_TYPES: readonly CommunityGroupType[] = ['military'];

/** Drops the Hebrew-only group types from an offered list (never from stored data). */
export function withoutHeOnlyGroupTypes<T>(items: readonly T[], show: boolean, typeOf: (item: T) => CommunityGroupType): T[] {
  return show ? [...items] : items.filter((it) => !HE_ONLY_GROUP_TYPES.includes(typeOf(it)));
}
