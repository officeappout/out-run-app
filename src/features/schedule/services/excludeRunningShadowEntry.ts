/**
 * The running bridge seeds `recurringTemplate[day] = [programTemplate.id]` for
 * every running training day so `hydrateFromTemplate()` materializes a
 * `userSchedule` doc for it (`onboarding-sync.service.ts`). That doc surfaces
 * as a `UserScheduleEntry` with `programIds[0]` === the running program's own
 * id — representing the SAME planned run `profile.running.activeProgram`
 * already represents through a completely separate data source. Any consumer
 * that reads schedule entries alongside the running program directly must
 * exclude this shadow entry, or a running day (nothing else scheduled) shows
 * or counts the same activity twice.
 *
 * Solved once already in `SmartWeeklySchedule.tsx`'s `buildPlannedSessions`
 * (Stage H, 18.08.2026). Extracted here 29.08.2026 after the identical gap
 * was found, unfixed, in `resolveScheduledProgram.ts` — a third consumer
 * (`AgendaDayCard.tsx`) needed the same filter. One function, three callers,
 * not a fourth copy.
 */
export function excludeRunningShadowEntry<T extends { programIds?: string[] }>(
  entries: T[],
  runningProgramId: string | undefined,
): T[] {
  if (!runningProgramId) return entries;
  return entries.filter((e) => e.programIds?.[0] !== runningProgramId);
}
