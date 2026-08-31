/**
 * C1 — was `running.scheduleDays` set by the system (a smart default the
 * user never touched) or by the user (a real choice)? No field for this
 * exists today; `RunningScheduleStep.tsx` writes `scheduleDays` the same way
 * regardless of whether the value came from `getSmartDefaultDays()` or from
 * `handleDayToggle`. `running.scheduleDaysSource` is the new field this
 * introduces — written going forward by the callers that set `scheduleDays`
 * (Block 2's signup pass-through, Block 3's day-change writer).
 *
 * `getRunningScheduleSource` stays a raw, honest reader: `null` for a
 * missing field, no invented guess about what a specific pre-field user
 * actually did. Every EXISTING runner has a missing field, by construction
 * — the field doesn't exist yet, so nobody could have written it.
 *
 * `resolveRunningScheduleSource` is where David's product decision
 * (31.08.2026) lives: for rule-1 dispatch (`running-schedule-change.rules.ts`,
 * Block 1b) and anything gating whether a day-change gets a warning, treat
 * a missing field as `'system-default'`, never `'user-chosen'`. Reasoning:
 * an existing runner picked their days inside a signup flow this project's
 * own audit calls broken (the days question sat where it never should have
 * — see `running-onboarding-schedule-placement.md`). Letting them re-pick
 * with no warning is the generous reading, and it's exactly what rule 1
 * (system-default → user's first real choice = smooth, no warning) already
 * says to do. Any caller that needs to distinguish "explicitly recorded as
 * system-default" from "we simply don't know" must call
 * `getRunningScheduleSource` directly instead — `resolveRunningScheduleSource`
 * collapses that distinction on purpose.
 */
export type RunningScheduleSource = 'system-default' | 'user-chosen';

const KNOWN_SOURCES: readonly RunningScheduleSource[] = ['system-default', 'user-chosen'];

/**
 * Raw reader — `null` means "we don't know," not "system-default."
 * Most callers want `resolveRunningScheduleSource` below instead: the two
 * names are close enough to grab the wrong one by accident, and picking
 * this one where dispatch logic is needed silently reopens the exact
 * question David's decision (see the module doc above) already closed.
 * Reach for this one only when the raw/unknown distinction itself matters
 * (e.g. an admin view auditing which users have real source data).
 */
export function getRunningScheduleSource(
  profile: { running?: { scheduleDaysSource?: unknown } } | null | undefined,
): RunningScheduleSource | null {
  const value = profile?.running?.scheduleDaysSource;
  return (KNOWN_SOURCES as readonly unknown[]).includes(value)
    ? (value as RunningScheduleSource)
    : null;
}

export function resolveRunningScheduleSource(
  profile: { running?: { scheduleDaysSource?: unknown } } | null | undefined,
): RunningScheduleSource {
  return getRunningScheduleSource(profile) ?? 'system-default';
}

export function isRunningScheduleUserConfirmed(
  profile: { running?: { scheduleDaysSource?: unknown } } | null | undefined,
): boolean {
  return getRunningScheduleSource(profile) === 'user-chosen';
}
