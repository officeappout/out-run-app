/**
 * Which route options the planner shows ("2 דרכים לשם") for a preference.
 * Pure.
 *
 *   none picked → [recommended, shortest]: recommended = the via-park route
 *                 when there is one, else an alternative with more measured
 *                 strengths than the shortest; without either, shortest + the
 *                 first alternative (no "מומלץ" — nothing earned it).
 *   park        → up to 2 via-park routes ("עם עצירה"), shortest fills in.
 *   shortest    → shortest first, then the next best.
 *   lit / shade → every option ranked by the measured signal; the chip is only
 *                 enabled when at least one option has that signal.
 */
import type { Route } from '../types/route.types';
import { isRouteLitVerified } from '../services/route-quality-badges.service';
import { shadeTagPct } from '@/lib/route-shade-view';
import { deriveRouteTags } from './route-tags';
import type { PlannerCandidates, PlannerMode, PlannerOption, PlannerPreference } from './types';

export const PLANNER_MAX_OPTIONS = 2;

/** Shortest by distance, then by duration. */
export function shortestOf(routes: Route[]): Route | null {
  let best: Route | null = null;
  for (const r of routes) {
    if (!(r?.distance > 0)) continue;
    if (!best || r.distance < best.distance || (r.distance === best.distance && r.duration < best.duration)) best = r;
  }
  return best;
}

function allRoutes(c: PlannerCandidates): Route[] {
  return [...c.commute, ...c.viaParks.map((v) => v.route)];
}

/** Which chips can be tapped. "shade" / "lit" only when some option has the measured signal. */
export function availablePreferences(c: PlannerCandidates): Record<PlannerPreference, boolean> {
  const all = allRoutes(c);
  return {
    park: c.viaParks.length > 0,
    shortest: c.commute.length > 0,
    lit: all.some((r) => isRouteLitVerified(r)),
    shade: all.some((r) => shadeTagPct(r.shadeInfo) != null),
  };
}

export const PLANNER_PREFS: PlannerPreference[] = ['park', 'lit', 'shortest', 'shade'];

/**
 * The chips the planner SHOWS: only ones that can act on this destination +
 * mode right now. No disabled "בקרוב" placeholders (owner, 23.10.2026) — e.g.
 * "מוצל" appears only when some option carries measured shade, the park chip
 * only on foot and only when a via-park route exists.
 */
export function visiblePlannerPrefs(mode: PlannerMode, available: Record<PlannerPreference, boolean>): PlannerPreference[] {
  return PLANNER_PREFS.filter((p) => (p === 'park' ? mode !== 'cycling' && available.park : available[p]));
}

export function selectPlannerOptions(
  c: PlannerCandidates,
  pref: PlannerPreference | null,
  max: number = PLANNER_MAX_OPTIONS,
): PlannerOption[] {
  const shortest = shortestOf(c.commute);
  const shortestOpt: PlannerOption | null = shortest
    ? { id: shortest.id, kind: 'shortest', route: shortest, badge: 'shortest' }
    : null;
  const viaOpts: PlannerOption[] = c.viaParks.map((v) => ({ id: v.route.id, kind: 'via_park', route: v.route, badge: 'stop', stop: v.stop }));
  const altOpts: PlannerOption[] = c.commute
    .filter((r) => r !== shortest)
    .map((r) => ({ id: r.id, kind: 'alternative', route: r, badge: null }));

  const avail = availablePreferences(c);
  const effective = pref && avail[pref] ? pref : null;
  let list: PlannerOption[];

  switch (effective) {
    case 'park':
      list = [...viaOpts, ...(shortestOpt ? [shortestOpt] : [])];
      break;
    case 'shortest':
      list = [...(shortestOpt ? [shortestOpt] : []), ...viaOpts, ...altOpts];
      break;
    case 'lit':
    case 'shade': {
      const pool = [...(shortestOpt ? [shortestOpt] : []), ...viaOpts, ...altOpts];
      const score = (o: PlannerOption) =>
        effective === 'lit' ? (isRouteLitVerified(o.route) ? 1 : 0) : (shadeTagPct(o.route.shadeInfo) ?? -1);
      list = pool.map((o, i) => ({ o, i })).sort((a, b) => score(b.o) - score(a.o) || a.i - b.i).map((x) => x.o);
      break;
    }
    default: {
      const shortestTags = shortest ? deriveRouteTags(shortest).length : 0;
      const betterAlt = altOpts.find((o) => deriveRouteTags(o.route).length > shortestTags);
      const rec = viaOpts[0] ?? betterAlt ?? null;
      if (rec) list = [{ ...rec, badge: 'recommended' }, ...(shortestOpt ? [shortestOpt] : [])];
      else list = [...(shortestOpt ? [shortestOpt] : []), ...altOpts];
    }
  }

  const seen = new Set<string>();
  const out: PlannerOption[] = [];
  for (const o of list) {
    if (out.length >= max) break;
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push(o);
  }
  return out;
}
