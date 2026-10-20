/**
 * Device-scoped switch for the enable_home_v2 day focus (day-focus.generator.ts).
 *
 * The home page sets it from its resolved flags (super-admin preview included — the live
 * flag cache readLiveFlag reads has no super-admin override), so every generation the
 * home surfaces trigger (StatsOverview, the daily carousel's suggestion generators) sees
 * the same answer without threading a flag through each one. Default false: a device
 * that never opened home v2 — and every test — generates exactly as before.
 * An explicit HomeWorkoutOptions.splitDayFocus always wins over this.
 */
let active = false;

export function setSplitDayFocusActive(on: boolean): void {
  active = !!on;
}

export function isSplitDayFocusActive(): boolean {
  return active;
}
