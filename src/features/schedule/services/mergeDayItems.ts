import { isSkillId, isProgramId } from '@/features/schedule/types/smartSchedule.types';

/**
 * gap-map finding #9 — `lifestyle.recurringTemplate[day]` is a `string[]`
 * that can hold both a strength id (closed set — `ALL_SKILL_IDS`/`ALL_PROGRAM_IDS`,
 * 9 values total) and a running id (a free-form template id, no closed set —
 * detected by exclusion: anything that isn't a known strength id). A day has
 * no single owner; the array can hold ids from both domains at once.
 *
 * Every write site until now replaced the whole array for a day it touched
 * (`onboarding-sync.service.ts`'s strength UTS bridge and running bridge both
 * do `{...existing, [day]: newIds}` — a map-level merge that still overwrites
 * at the array level). A user who trains strength on day X and then completes
 * running onboarding picking day X too silently loses their strength entry
 * for that day, and vice versa.
 *
 * `mergeDayItems` is the one place that knows how to update a day's array
 * without clobbering the other domain's ids: strip out only the ids the
 * caller owns, then append the caller's new ids for that day, leaving every
 * other id (owned by the other domain, or anything unrecognized) exactly
 * where it was.
 */
export type ScheduleItemOwner = 'strength' | 'running';

/**
 * ⚠️ Running ownership is defined negatively — "anything that isn't strength"
 * — which is only correct as long as exactly two writers touch
 * `recurringTemplate`. (Community sessions are not a third writer: they live
 * in `userSchedule` day records, `source: 'community'`, and never touch
 * `recurringTemplate` at all.) If a third weekly-template domain is ever
 * added — yoga, cycling, anything that writes into this same table the way
 * running does today — it would be silently classified as running-owned by
 * this predicate, and a running write would delete it without warning: the
 * exact bug this function exists to close. Whoever adds a third writer must
 * replace the negative running check with a positive per-domain identity
 * check, the same way strength already has one.
 */

/** HANDSTAND is intentionally a valid strength template entry (a "free slot",
 *  ScheduleStep.tsx:558-562's own comment) — `isSkillId` already includes it,
 *  so it's treated as strength-owned here too. Not a special case. */
function isStrengthOwnedId(id: string): boolean {
  return isSkillId(id) || isProgramId(id);
}

export function mergeDayItems(
  existingIds: string[],
  nextIds: string[],
  owner: ScheduleItemOwner,
): string[] {
  const isOwnedByCaller = owner === 'strength'
    ? isStrengthOwnedId
    : (id: string) => !isStrengthOwnedId(id);

  const kept = existingIds.filter((id) => !isOwnedByCaller(id));
  return [...kept, ...nextIds];
}
