/**
 * "השבוע ב<עיר>" — what a city's sports/community manager needs first:
 * is it used (active residents, workouts, vs last week), which parks are
 * busy and which are quiet, and what's broken and for how long. Pure,
 * unit-tested; the route reads the data (audit 15.10.2026).
 */

const DAY = 24 * 60 * 60 * 1000;

export interface CityWorkout { uid: string; at: Date }
export interface CityParkVisit { parkId: string; at: Date }
export interface CityPark { id: string; name: string }
export interface CityReport { id: string; reportedAt: Date; open: boolean }

export interface CityWeekResponse {
  authorityId: string;
  authorityName: string;
  activeThisWeek: number;
  activeLastWeek: number;
  workoutsThisWeek: number;
  workoutsLastWeek: number;
  parks: {
    total: number;
    busiest: { id: string; name: string; visits30d: number }[];
    quietCount: number;
    quiet: { id: string; name: string }[];
  };
  reports: { open: number; olderThanWeek: number; oldestDays: number | null };
}

export function computeCityWeek(
  input: {
    authorityId: string;
    authorityName: string;
    workouts: CityWorkout[];
    visits: CityParkVisit[];
    parks: CityPark[];
    reports: CityReport[];
  },
  now = new Date(),
): CityWeekResponse {
  const t = now.getTime();
  const ago = (d: Date) => (t - d.getTime()) / DAY;

  const thisWeek = input.workouts.filter((w) => ago(w.at) < 7);
  const lastWeek = input.workouts.filter((w) => ago(w.at) >= 7 && ago(w.at) < 14);

  const visits30 = new Map<string, number>();
  for (const v of input.visits) {
    if (ago(v.at) < 30) visits30.set(v.parkId, (visits30.get(v.parkId) ?? 0) + 1);
  }
  const withVisits = input.parks.map((p) => ({ id: p.id, name: p.name, visits30d: visits30.get(p.id) ?? 0 }));
  const busiest = withVisits.filter((p) => p.visits30d > 0).sort((a, b) => b.visits30d - a.visits30d).slice(0, 5);
  const quiet = withVisits.filter((p) => p.visits30d === 0);

  const open = input.reports.filter((r) => r.open);
  const oldest = open.reduce<number | null>((m, r) => {
    const d = Math.floor(ago(r.reportedAt));
    return m === null || d > m ? d : m;
  }, null);

  return {
    authorityId: input.authorityId,
    authorityName: input.authorityName,
    activeThisWeek: new Set(thisWeek.map((w) => w.uid)).size,
    activeLastWeek: new Set(lastWeek.map((w) => w.uid)).size,
    workoutsThisWeek: thisWeek.length,
    workoutsLastWeek: lastWeek.length,
    parks: {
      total: input.parks.length,
      busiest,
      quietCount: quiet.length,
      quiet: quiet.slice(0, 5).map(({ id, name }) => ({ id, name })),
    },
    reports: {
      open: open.length,
      olderThanWeek: open.filter((r) => ago(r.reportedAt) >= 7).length,
      oldestDays: oldest,
    },
  };
}

// ── per-park activity for the city's park list ──────────────────────────────

export interface ParkActivity {
  visits30d: number;
  /** ISO date of the most recent visit (any age), null if never */
  lastVisit: string | null;
  openReports: number;
}

export function computeParkActivity(
  visits: CityParkVisit[],
  openReports: { parkId: string }[],
  now = new Date(),
): Record<string, ParkActivity> {
  const out: Record<string, ParkActivity> = {};
  const get = (id: string) => (out[id] ??= { visits30d: 0, lastVisit: null, openReports: 0 });
  for (const v of visits) {
    const p = get(v.parkId);
    if (now.getTime() - v.at.getTime() < 30 * DAY) p.visits30d += 1;
    if (!p.lastVisit || v.at.toISOString() > p.lastVisit) p.lastVisit = v.at.toISOString();
  }
  for (const r of openReports) if (r.parkId) get(r.parkId).openReports += 1;
  return out;
}
