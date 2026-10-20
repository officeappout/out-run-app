/**
 * Combined workouts (route + strength stations) never collapse to push only
 * (enable_home_v2, owner bug 20.10.2026). Pure — the caller passes the flag.
 *
 * Root causes fixed here (flag ON only; flag OFF = today's behaviour, byte for byte):
 *
 * 1. The single-station combined card ("מסלול + עצירה" — the home carousel's hybrid slot
 *    and the free-run drawer, composeHybridPlan) runs in 'per_station' mode with no
 *    route planner, so its one station takes focusOrder[0]. focusOrder starts with the
 *    week's "neglected" domains in push-first order — and the weekly domain counts are
 *    written only by the standalone strength player, so a user who trains mostly in
 *    combined workouts has push "neglected" forever → an equipped park station is
 *    strict ['push'] every time. ON: one station = 'multi' (a full-body station, the
 *    same mode route-stops already uses).
 *
 * 2. Route + stops ("מסלול + עצירות") took its target domains from activePrograms[0]
 *    only — a first program of 'push' (or upper_body with only push assessed) made
 *    every station push. ON: the union of every active program's child domains
 *    (each still assessed-only — absent = absent).
 */

export type StationDomainMode = 'per_station' | 'multi';

/** The compose mode for a single-station combined plan. */
export function singleStationDomainMode(v2: boolean, current?: StationDomainMode): StationDomainMode | undefined {
  return v2 ? 'multi' : current;
}

/**
 * Route-stop target domains. OFF → the first active program's domains (today).
 * ON → every active program's domains, deduped, in first-seen order.
 */
export function routeTargetDomainsOf(
  activePrograms: ReadonlyArray<{ templateId?: string | null } | null | undefined> | null | undefined,
  childDomainsOf: (programId: string | undefined) => string[],
  v2: boolean,
): string[] {
  const list = activePrograms ?? [];
  if (!v2) return childDomainsOf(list[0]?.templateId ?? undefined);
  const out: string[] = [];
  for (const p of list) {
    const id = p?.templateId ?? undefined;
    if (!id) continue;
    for (const d of childDomainsOf(id)) if (!out.includes(d)) out.push(d);
  }
  return out;
}
