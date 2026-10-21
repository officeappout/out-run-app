/**
 * v2-scenarios.ts — the enable_home_v2 strength matrix (flag ON path). Pure data.
 *
 * Groups (each cell = one generated day, every trio option graded):
 *   focus       day focus per split & day index — 3 bands × 2–6 strength days × every day
 *   equip       home no bar / door bar / park / gym × upper, lower, push, pull, legs, full
 *   ppl6        6 days → push / pull / legs ×2 (advanced; intermediate + muscle) vs contrasts
 *   health_cap  routine / health users stay full body ×3 (advanced is not capped)
 *   beginner5   beginners with 5–6 strength days → still full body (3 + movement days)
 *   pool        the focus only narrows the active program's pool (upper_body on a lower day …)
 *   topup       #541 complementary sets (partial-completion) per domain
 *   hybrid      single-station combined card ('multi' station, #545)
 *   route_stops route + stops target domains = every active program (#545)
 */
import type { OracleGoal } from './v2-oracle';

export type V2Group = 'focus' | 'equip' | 'ppl6' | 'health_cap' | 'beginner5' | 'pool' | 'topup' | 'hybrid' | 'route_stops';
export type V2Loc = 'home-nogear' | 'home-doorbar' | 'park-typical' | 'gym';

export const V2_GROUP_HE: Record<V2Group, string> = {
  focus: 'פוקוס יום לפי פיצול',
  equip: 'ציוד × פוקוס',
  ppl6: 'PPL ב-6 ימים',
  health_cap: 'תקרת בריאות (3)',
  beginner5: 'מתחיל 5+ ימים',
  pool: 'פוקוס רק מצמצם',
  topup: 'השלמת סטים',
  hybrid: 'תחנה אחת (משולב)',
  route_stops: 'מסלול + עצירות',
};

export interface V2Scenario {
  id: string;
  group: V2Group;
  level: number;
  loc: V2Loc;
  minutes: number;
  /** Strength days, Sunday = 0. */
  days: number[];
  /** Which strength day (0-based position in `days`) is generated. */
  dayIndex: number;
  goals: OracleGoal[];
  /** Active programs (the pool). */
  programs: string[];
  /** topup: the domain completed; hybrid: station minutes. */
  domain?: string;
}

const DAYS: Record<number, number[]> = {
  2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5],
};
const PERF: OracleGoal[] = ['performance'];

const sid = (s: Omit<V2Scenario, 'id'>) =>
  `v2/${s.group}/L${s.level}/${s.loc}/${s.minutes}m/${s.days.length}d#${s.dayIndex}/${s.goals.join('+') || 'none'}/${s.programs.join('+')}${s.domain ? `/${s.domain}` : ''}`;
const mk = (s: Omit<V2Scenario, 'id'>): V2Scenario => ({ ...s, id: sid(s) });
const allDays = (n: number) => Array.from({ length: n }, (_, i) => i);

export function v2FullMatrix(): V2Scenario[] {
  const out: V2Scenario[] = [];
  const day = (group: V2Group, level: number, n: number, i: number, o: Partial<V2Scenario> = {}) =>
    out.push(mk({ group, level, loc: 'home-doorbar', minutes: 30, days: DAYS[n], dayIndex: i, goals: PERF, programs: ['full_body'], ...o }));

  for (const level of [3, 8, 16]) for (const n of [2, 3, 4, 5, 6]) for (const i of allDays(n)) day('focus', level, n, i);

  for (const loc of ['home-nogear', 'home-doorbar', 'park-typical', 'gym'] as V2Loc[]) {
    for (const minutes of [20, 45]) {
      for (const i of [0, 1]) day('equip', 8, 4, i, { loc, minutes }); // upper, lower
      for (const i of [0, 1, 2]) day('equip', 16, 6, i, { loc, minutes }); // push, pull, legs
      day('equip', 3, 3, 0, { loc, minutes }); // full
    }
  }

  for (const i of allDays(6)) {
    day('ppl6', 14, 6, i);
    day('ppl6', 20, 6, i, { loc: 'home-nogear' });
    day('ppl6', 10, 6, i, { goals: ['muscle'] });
    day('ppl6', 10, 6, i, { goals: [] }); // contrast: no muscle / performance → upper / lower
  }

  for (const level of [3, 8]) for (const n of [4, 5, 6]) for (const i of [0, 1]) day('health_cap', level, n, i, { goals: ['health'] });
  for (const i of [0, 1]) day('health_cap', 16, 4, i, { goals: ['health'] }); // advanced: not capped

  for (const level of [2, 5]) for (const n of [5, 6]) for (const i of allDays(n)) day('beginner5', level, n, i, { goals: ['health', 'fat_loss'] });

  day('pool', 8, 4, 1, { programs: ['upper_body'] }); // lower day, upper-only pool → no focus
  day('pool', 8, 4, 0, { programs: ['upper_body'] }); // upper day = the pool → focus, nothing to narrow
  day('pool', 8, 4, 0, { programs: ['legs'] }); // upper day, legs-only pool → no focus
  day('pool', 16, 6, 1, { programs: ['upper_body'], loc: 'home-nogear' }); // pull day, no bar

  for (const domain of ['push', 'pull', 'legs', 'core']) for (const level of [3, 10]) for (const loc of ['home-nogear', 'home-doorbar'] as V2Loc[]) {
    out.push(mk({ group: 'topup', level, loc, minutes: 0, days: DAYS[3], dayIndex: 0, goals: PERF, programs: ['full_body'], domain }));
  }
  for (const level of [3, 8, 15]) for (const minutes of [8, 12, 15]) {
    out.push(mk({ group: 'hybrid', level, loc: 'park-typical', minutes, days: DAYS[3], dayIndex: 0, goals: PERF, programs: ['full_body'] }));
  }
  for (const level of [6, 12]) for (const programs of [['push', 'pull'], ['push', 'legs'], ['upper_body'], ['full_body']]) {
    out.push(mk({ group: 'route_stops', level, loc: 'park-typical', minutes: 30, days: DAYS[3], dayIndex: 0, goals: PERF, programs }));
  }
  return out;
}

/** The CI subset — one cell per risk, cheap (vitest ratchet). */
export function v2CiMatrix(): V2Scenario[] {
  const want = new Set([
    'v2/focus/L8/home-doorbar/30m/4d#0/performance/full_body',
    'v2/focus/L8/home-doorbar/30m/4d#1/performance/full_body',
    'v2/focus/L16/home-doorbar/30m/5d#4/performance/full_body',
    'v2/focus/L3/home-doorbar/30m/4d#2/performance/full_body',
    'v2/equip/L8/home-nogear/20m/4d#0/performance/full_body',
    'v2/equip/L8/park-typical/45m/4d#0/performance/full_body',
    'v2/equip/L8/gym/45m/4d#0/performance/full_body',
    'v2/equip/L16/home-nogear/20m/6d#1/performance/full_body',
    'v2/equip/L16/home-doorbar/45m/6d#1/performance/full_body',
    'v2/equip/L16/park-typical/20m/6d#2/performance/full_body',
    'v2/ppl6/L10/home-doorbar/30m/6d#3/muscle/full_body',
    'v2/ppl6/L10/home-doorbar/30m/6d#3/none/full_body',
    'v2/health_cap/L8/home-doorbar/30m/5d#1/health/full_body',
    'v2/health_cap/L16/home-doorbar/30m/4d#1/health/full_body',
    'v2/beginner5/L5/home-doorbar/30m/6d#5/health+fat_loss/full_body',
    'v2/pool/L8/home-doorbar/30m/4d#1/performance/upper_body',
    'v2/pool/L16/home-nogear/30m/6d#1/performance/upper_body',
  ]);
  return v2FullMatrix().filter((s) => want.has(s.id));
}
