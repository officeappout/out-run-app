/**
 * north-star.server — WAE / workouts per active user / DAU / MAU / stickiness, by calling the
 * SAME computeGrowthMetrics the /admin/journey page uses (src/app/api/admin/growth-metrics/
 * route.ts). Not a copy: the number here is the page's number at the same moment. Platform
 * scope only (super / root).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import {
  computeGrowthMetrics,
  DEFAULT_GROWTH_METRICS_FILTERS,
  type GrowthMetricsFilters,
} from '@/app/api/admin/growth-metrics/route';

export interface NorthStar {
  weeklyActiveExercisers: number;
  workoutsPerActiveUser: number;
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
  stickinessPct: number;
  /** the last 30 days' daily active users, compressed to weekly averages (oldest first) */
  weeklyAvgDailyActive: number[];
}

export type NorthStarFilters = Partial<Pick<GrowthMetricsFilters, 'cityAuthorityId' | 'source' | 'campaign' | 'sex' | 'program' | 'ageFrom' | 'ageTo'>> & {
  level?: 'beginner' | 'intermediate' | 'advanced' | null;
};

export async function computeNorthStar(db: Firestore, filters: NorthStarFilters = {}): Promise<NorthStar> {
  const res = await computeGrowthMetrics(db, { kind: 'platform' }, { ...DEFAULT_GROWTH_METRICS_FILTERS, ...filters });
  if (res.status !== 200) throw new Error(`growth metrics returned ${res.status}`);
  const ns = res.body.northStar;
  const trend = (res.body.activeUsersTrend ?? []) as Array<{ activeUsers: number }>;
  const weeks: number[] = [];
  for (let i = 0; i < trend.length; i += 7) {
    const slice = trend.slice(i, i + 7);
    weeks.push(Math.round((slice.reduce((a, r) => a + r.activeUsers, 0) / Math.max(1, slice.length)) * 10) / 10);
  }
  return {
    weeklyActiveExercisers: ns.weeklyActiveExercisers,
    workoutsPerActiveUser: ns.workoutsPerActiveUser,
    dailyActiveUsers: ns.dailyActiveUsers,
    monthlyActiveUsers: ns.monthlyActiveUsers,
    stickinessPct: ns.stickinessPct,
    weeklyAvgDailyActive: weeks,
  };
}
