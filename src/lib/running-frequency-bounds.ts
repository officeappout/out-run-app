/**
 * Single source of truth for how many running workouts/week a user can
 * choose, and the one function that enforces it.
 *
 * Found 01.09.2026 (David, code review of the running-schedule day-change
 * writer): `RunningScheduleStep.tsx`'s frequency picker showed 1–4, but
 * `generateProgramTemplate` (`plan-generator.service.ts`) only ever builds
 * `buildWeekSlots`'s 4 fixed slots and fills `min(frequency, 4)` of them —
 * every caller along the way independently clamped frequency=1 up to 2
 * before generation (`running-onboarding-bridge.service.ts` twice, then a
 * third clamp copied verbatim into the new day-change writer). The clamp
 * itself was never the bug: a user who picked "1×/week" got a plan BUILT
 * for 2 runs/week while only ever having 1 weekday to hang a run on.
 * `resolveRunningEntry` (`AgendaDayCard.tsx`) can only ever resolve
 * `daySlot=1` when `scheduleDays.length===1` — the plan's second weekly
 * run has no calendar day it can ever match, so it silently never renders,
 * every week, for the life of the program. A user living with this today
 * would just see one real run a week and never know a second was
 * generated and orphaned.
 *
 * MIN_RUNNING_FREQUENCY = 2, not 1, because this is a training-design
 * decision, not a numeric floor (David, 01.09.2026): a single run/week
 * isn't a low-frequency variant of the same progressive plan — it's a
 * different training model. A 12-week progressive plan assumes rotating
 * roles (easy / quality / long) across the week; with one run there is
 * nothing to rotate, so it degrades to plain maintenance, not progression.
 * Fixing this by generating a real single-run maintenance plan is a
 * training-design question that deserves its own round, not a clamp
 * side-effect — tracked as its own backlog item ("תמיכה אמיתית בריצה אחת
 * בשבוע", `idempotent-booping-sunrise.md`), not implemented here. Until
 * then, a UI that offers "1" and then silently overrides it to "2" is
 * worse than a UI that never offers "1" — so the picker itself is bounded
 * to this range, not just the generator input.
 *
 * Every place in the running pipeline that reads or clamps a user-chosen
 * weekly frequency — the schedule-day picker's own button range, the
 * signup bridge's two clamp sites, and the day-change writer — must import
 * from here, not re-declare the numbers. A second, disconnected definition
 * of the same bound is exactly the class of bug this file exists to close
 * (the original clamp was itself already a second, silently-wrong copy of
 * a bound that should have lived in one place from the start).
 */
export const MIN_RUNNING_FREQUENCY = 2;
export const MAX_RUNNING_FREQUENCY = 4;

export type RunningFrequency = 2 | 3 | 4;

/** Clamps a raw (possibly out-of-range, possibly user-typed-adjacent) frequency into `RunningFrequency`. */
export function clampRunningFrequency(raw: number): RunningFrequency {
  return Math.min(Math.max(raw, MIN_RUNNING_FREQUENCY), MAX_RUNNING_FREQUENCY) as RunningFrequency;
}
