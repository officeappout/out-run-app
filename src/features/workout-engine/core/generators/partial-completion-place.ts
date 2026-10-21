/**
 * partial-completion-place — where the "אימון משלים" (#541 partial completion) is built.
 *
 * Bug (generator QA matrix #591, V6 14/16 cells): buildPartialCompletionWorkout called
 * generateHomeWorkoutTrio with no location → the service default 'park' → a home user
 * without gear got bench / dips / bar exercises. Under enable_home_v2 it now resolves the
 * place exactly like the main home workout (StatsOverview): the session's chosen location
 * → the lifestyle preference → the onboarding location → home, then
 * resolveWorkoutContext (an equipped park nearby with its real gear; otherwise home,
 * whose equipment the service reads from the profile).
 */
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { resolveWorkoutContext } from '../../services/workout-context-resolver';

/** Same chain as the home trio: sessionStorage → lifestyle.locationPreference → firstWorkoutLocation → home. */
export function requestedLocationOf(profile: UserFullProfile, stored: string | null): ExecutionLocation {
  const lifestyle = (profile.lifestyle as { locationPreference?: string } | undefined)?.locationPreference;
  const first = (profile as { firstWorkoutLocation?: string }).firstWorkoutLocation;
  return (stored || lifestyle || first || 'home') as ExecutionLocation;
}

function storedLocation(): string | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem('currentWorkoutLocation') : null;
  } catch {
    return null;
  }
}

export async function resolvePartialCompletionPlace(
  profile: UserFullProfile,
): Promise<{ location: ExecutionLocation; parkEquipmentIds?: string[] }> {
  const requested = requestedLocationOf(profile, storedLocation());
  const coords = useGPSStore.getState().coords;
  const ctx = await resolveWorkoutContext(profile, requested, { gpsCoords: coords ?? undefined });
  return { location: ctx.location, ...(ctx.availableGear.length ? { parkEquipmentIds: ctx.availableGear } : {}) };
}
