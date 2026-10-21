/**
 * week-invariants.ts — weekly-schedule, recommendation-policy and walk-plan invariants
 * (enable_home_v2). Pure: no Firestore, no clock. Independent oracles over:
 *   W*  engine v2 buildWeek on the 33 schedule-combos fixtures (+ a Shabbat-default variant)
 *   P*  resolveRecommendation / recommendedSplitOfProfile over level × goals × days
 *   K*  recommendWalkPlan over goal × comfort × steps × audience × days
 * Hard checks (`fail`) go through the ratchet (week-invariants.baseline.json); soft ones
 * (`warn`) are only reported.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildWeek } from '@/features/schedule/engine-v2/buildWeek';
import { profileOf } from '@/features/schedule/engine-v2/programProfiles';
import { isKeySlot, RUN_SLOT_MINUTES } from '@/features/schedule/engine-v2/config';
import type { PlacedSession, ScheduleEngineInput, WeekPlan } from '@/features/schedule/engine-v2/types';
import { toEngineInput, type Fixture } from '@/features/schedule/engine-v2/__tests__/fixtureHarness';
import { resolveRecommendation } from '@/features/schedule/recommendation-policy/resolve';
import { buildPolicySignals } from '@/features/schedule/recommendation-policy/fromProfile';
import { recommendedSplitOfProfile } from '@/features/schedule/recommendation-policy/splitOfProfile';
import { recommendWalkPlan, weeklyMinutesRamp } from '@/features/schedule/walking/walkPlan';
import { WALK_PLAN_CONFIG } from '@/features/schedule/walking/walkPlan.config';
import type { WalkAudience, WalkComfort, WalkGoal } from '@/features/schedule/walking/walkPlan.types';
import { oracleSessions, oracleSplit, type OracleGoal } from './v2-oracle';

export const WEEK_LABELS_HE: Record<string, string> = {
  W1: 'שבת חופש (אלא אם סומנה)',
  W1b: 'וריאנט ברירת מחדל בלי שבת — תקין',
  W2: 'ריצה ארוכה ביום המועדף',
  W3: 'אין רגליים כבדות יום לפני ריצת איכות/ארוכה',
  W4: 'מספר אימוני כוח = המבוקש (או מוסבר)',
  W5: 'הליכות בשבוע: אורך/תקרות/WHO',
  P1: 'תקרת בריאות ≤3',
  P2: '6 ימים → PPL',
  P3: 'מתחיל 5+ ימים → 3 כוח + תנועה',
  P4: 'כוח ≤ ימים פנויים ו-≤6',
  P5: 'פיצול המדיניות = טבלת הבעלים',
  P6: 'פיצול מהפרופיל = פיצול המדיניות',
  K1: 'הליכה: סה״כ שבועי ≤ יעד ≤ 300',
  K2: 'הליכה: 20–45′, ארוכה אחת ≤60′',
  K3: 'הליכה: עלייה ≤10% בשבוע',
  K4: 'הליכה: רק בימים פנויים, בלי שבת',
  K5: 'הליכה: 3–5 בשבוע (או כל הימים)',
  K6: 'הליכה: סכום ההליכות = דקות התוכנית',
};

export interface WeekRow { id: string; check: string; grade: 'pass' | 'warn' | 'fail'; detail: string }

const FIXTURE_PATH = 'src/features/schedule/engine-v2/__tests__/fixtures/schedule-combos.fixtures.json';
/** Makeup / return scenarios (planMakeup / planReturn) and the race week (out of scope) — as fixtures.test.ts. */
const NOT_LAYOUT = new Set(['S13', 'S14', 'S15', 'S29', 'S30']);

const isMainSession = (s: PlacedSession) =>
  !s.optional && (s.kind === 'run' || (s.kind === 'strength' && !!s.slug && (profileOf(s.slug).slotKind === 'main' || !!s.variantOf)));

export function weekChecks(id: string, input: ScheduleEngineInput, plan: WeekPlan): WeekRow[] {
  const rows: WeekRow[] = [];
  const row = (check: string, grade: WeekRow['grade'], detail = '') => rows.push({ id, check, grade, detail });
  const day = (d: number) => plan.days[d].sessions;
  const av = input.availability;

  // W1 — Saturday off unless the user marked it
  const sat = day(6).filter(isMainSession);
  row('W1', !av.days.includes(6) && sat.length ? 'fail' : 'pass', sat.length ? `Saturday: ${sat.map((s) => s.slot ?? s.slug).join('+')}` : '');

  // W2 — long run on the preferred day when that day is open
  const longDay = plan.days.find((d) => d.sessions.some((s) => s.kind === 'run' && s.slot === 'long_run' && !s.optional))?.dow ?? null;
  const pref = av.preferredLongRunDay;
  const exceptionOn = (d: number) => (av.exceptions ?? []).some((x) => d >= x.fromDow && d <= x.toDow);
  if (input.running?.sessions.some((s) => s.slot === 'long_run')) {
    if (pref != null && av.days.includes(pref) && !exceptionOn(pref)) row('W2', longDay === pref ? 'pass' : 'fail', `preferred ${pref}, long run ${longDay}`);
    else if (pref == null) {
      const lastOpen = [...av.days].filter((d) => !exceptionOn(d)).sort((a, b) => b - a)[0];
      row('W2', longDay === lastOpen ? 'pass' : 'warn', `no preference: long run ${longDay}, last open day ${lastOpen}`);
    }
  }

  // W3 — no heavy legs the day before a quality / long run (Sat → Sun wraps)
  for (let d = 0; d < 7; d++) {
    const next = (d + 1) % 7;
    if (!day(next).some((s) => s.kind === 'run' && isKeySlot(s.slot) && !s.optional)) continue;
    for (const s of day(d)) {
      if (s.kind !== 'strength' || !s.slug || s.optional) continue;
      const legs = profileOf(s.slug).load.legs;
      if (legs >= 0.7) row('W3', 'fail', `${s.slug} on ${d} before ${day(next).find((x) => x.kind === 'run')?.slot} on ${next}`);
      else if (legs >= 0.5) row('W3', 'warn', `${s.slug} (legs ${legs}) on ${d} before a key run on ${next}`);
    }
  }
  if (!rows.some((r) => r.check === 'W3')) row('W3', 'pass');

  // W4 — strength sessions placed = requested main sessions, unless the week says why.
  // Sessions of a program the user did not ask for (the skill-days filler, e.g.
  // calisthenics_upper for 3 skills in 3 days) are reported, not counted.
  const asked = new Set(input.strength.map((p) => p.slug));
  const requested = input.strength.filter((p) => profileOf(p.slug).slotKind === 'main').reduce((n, p) => n + p.sessionsPerWeek, 0);
  const strengthMain = plan.days.flatMap((d) => d.sessions).filter((s) => s.kind === 'strength' && isMainSession(s));
  const placed = strengthMain.filter((s) => asked.has(s.slug!) || (s.variantOf && asked.has(s.variantOf))).length;
  const extra = strengthMain.filter((s) => !(asked.has(s.slug!) || (s.variantOf && asked.has(s.variantOf)))).map((s) => s.slug);
  const codes = new Set(plan.warnings.map((w) => w.code as string));
  const explained = ['STRENGTH_REDUCED', 'STRENGTH_REDUCED_LONG_RUN_PROTECTED', 'STRENGTH_MERGED', 'TRAVEL_WEEK', 'STRENGTH_FLOOR_UNMET_AVAILABILITY'].some((c) => codes.has(c))
    || plan.dropped.some((s) => s.kind === 'strength');
  if (placed > requested) row('W4', 'fail', `placed ${placed} > requested ${requested}`);
  else if (placed < requested) row('W4', explained ? 'warn' : 'fail', `placed ${placed} < requested ${requested}${explained ? ` (${Array.from(codes).join(',')})` : ' — no reason given'}`);
  else row('W4', extra.length ? 'warn' : 'pass', extra.length ? `${placed} + added [${extra.join(',')}]` : `${placed}`);

  // W5 — walks: length caps, at most one long walk, never on an unmarked Saturday, WHO target
  const walks = plan.days.flatMap((d) => d.sessions.filter((s) => s.kind === 'walk').map((s) => ({ d: d.dow, m: s.minutes ?? 0 })));
  const target = input.walking?.weeklyAerobicTargetMin;
  if (walks.length || target) {
    const bad: string[] = [];
    if (walks.some((w) => w.m > WALK_PLAN_CONFIG.longWalkMax)) bad.push(`walk > ${WALK_PLAN_CONFIG.longWalkMax}′`);
    if (walks.filter((w) => w.m > WALK_PLAN_CONFIG.session.max).length > 1) bad.push('more than one long walk');
    if (walks.some((w) => w.d === 6 && !av.days.includes(6))) bad.push('walk on an unmarked Saturday');
    const runMin = plan.days.flatMap((d) => d.sessions).filter((s) => s.kind === 'run' && !s.optional).reduce((n, s) => n + (s.minutes ?? RUN_SLOT_MINUTES[s.slot!]) * 2, 0);
    const aerobic = runMin + walks.reduce((n, w) => n + w.m, 0);
    const freeLeft = plan.days.filter((d) => d.available && d.sessions.length === 0).length;
    const short = target && aerobic < target && freeLeft > 0;
    row('W5', bad.length ? 'fail' : short ? 'warn' : 'pass', `${bad.join('; ')}${short ? ` aerobic ${aerobic}′ < ${target}′ with ${freeLeft} free days` : ''} walks [${walks.map((w) => `${w.d}:${w.m}`).join(' ')}]`);
  }
  return rows;
}

export function fixtureWeekRows(): WeekRow[] {
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), FIXTURE_PATH), 'utf8')) as { scenarios: Fixture[] };
  const rows: WeekRow[] = [];
  for (const f of data.scenarios) {
    if (NOT_LAYOUT.has(f.id)) continue;
    const input = toEngineInput(f);
    rows.push(...weekChecks(f.id, input, buildWeek(input)));
    // W1b — the same week on the default pool (Saturday unmarked)
    if (input.availability.days.includes(6) && input.availability.preferredLongRunDay !== 6) {
      const noSat: ScheduleEngineInput = { ...input, availability: { ...input.availability, days: input.availability.days.filter((d) => d !== 6) } };
      const plan = buildWeek(noSat);
      const sat = plan.days[6].sessions.filter(isMainSession);
      rows.push({ id: `${f.id}~noSat`, check: 'W1b', grade: sat.length || plan.hardViolations.length ? 'fail' : 'pass', detail: `${sat.length} on Saturday, hard [${plan.hardViolations.join(',')}]` });
    }
  }
  return rows;
}

// ── Policy matrix ────────────────────────────────────────────────────────────
const RAW: Record<OracleGoal, string> = { health: 'routine', muscle: 'mass_building', performance: 'performance', skills: 'skills', fat_loss: 'fat_loss' };
const ORACLE_TO_POLICY: Record<string, string[]> = {
  full: ['full_body_basic', 'full_body_high', 'full_body_max', 'full_body_ab'], upper_lower: ['upper_lower'], ppl: ['push_pull_legs'],
};

export function policyRows(): WeekRow[] {
  const rows: WeekRow[] = [];
  const goalSets: OracleGoal[][] = [[], ['health'], ['muscle'], ['performance'], ['health', 'fat_loss'], ['health', 'muscle'], ['fat_loss']];
  for (const level of [1, 3, 5, 6, 8, 13, 14, 18, 25]) for (const goals of goalSets) for (let days = 1; days <= 6; days++) {
    const id = `policy/L${level}/${goals.join('+') || 'none'}/${days}d`;
    const sig = buildPolicySignals({ tracks: 'strength', strengthLevel: level, goalIds: goals.map((g) => RAW[g]), personaIds: [], hardSkillCount: 0, availableDays: days });
    const rec = resolveRecommendation(sig);
    const n = rec.strength?.frequency ?? 0;
    const split = rec.strength?.split ?? null;
    const band = level <= 5 ? 'beginner' : level <= 13 ? 'intermediate' : 'advanced';
    const healthOnly = goals.includes('health') && !goals.includes('muscle') && !goals.includes('performance');
    const row = (check: string, ok: boolean, detail: string) => rows.push({ id, check, grade: ok ? 'pass' : 'fail', detail });
    if (healthOnly && band !== 'advanced') row('P1', n <= 3, `${n} sessions`);
    if (days === 6 && (band === 'advanced' || (band === 'intermediate' && (goals.includes('muscle') || goals.includes('performance'))))) row('P2', split === 'push_pull_legs' && n === 6, `${split} ×${n}`);
    if (band === 'beginner' && days >= 5) {
      const mv = rec.addOns.find((a) => a.kind === 'movement');
      row('P3', n === 3 && mv?.perWeek === days - 3, `${n} strength + movement ×${mv?.perWeek ?? 0}`);
    }
    row('P4', n >= 1 && n <= Math.min(days, 6), `${n} of ${days} days`);
    const exp = oracleSplit(level, days, goals);
    row('P5', !!split && ORACLE_TO_POLICY[exp].includes(split) && n === oracleSessions(level, days, goals), `oracle ${exp}×${oracleSessions(level, days, goals)} vs policy ${split}×${n}`);
    const profile = {
      core: { mainGoal: 'healthy_lifestyle' }, selectedGoals: goals.map((g) => RAW[g]), personas: [], running: {},
      progression: { domains: { push: { currentLevel: level }, pull: { currentLevel: level }, legs: { currentLevel: level } } },
    };
    row('P6', recommendedSplitOfProfile(profile, days) === split, `profile ${recommendedSplitOfProfile(profile, days)} vs signals ${split}`);
  }
  return rows;
}

// ── Walk plan matrix ─────────────────────────────────────────────────────────
export function walkRows(): WeekRow[] {
  const rows: WeekRow[] = [];
  const C = WALK_PLAN_CONFIG;
  const daySets = [[0, 1, 2, 3, 4, 5], [0, 2, 4], [1, 3], [0, 1, 2, 3, 4, 5, 6], [5, 6], []];
  for (const goal of ['weight_loss', 'health', 'steps', 'belly'] as WalkGoal[]) for (const comfort of ['short', 'medium', 'long'] as WalkComfort[])
    for (const stepGoal of [null, 3000, 6000, 9000, 13000]) for (const audience of ['general', 'senior'] as WalkAudience[]) for (const availableDays of daySets) {
      const id = `walk/${goal}/${comfort}/${stepGoal ?? 'none'}/${audience}/${availableDays.join('') || 'default'}`;
      const plan = recommendWalkPlan({ goal, comfort, stepGoal, availableDays, audience });
      const row = (check: string, grade: WeekRow['grade'], detail: string) => rows.push({ id, check, grade, detail });
      const allowed = availableDays.length ? availableDays : [0, 1, 2, 3, 4, 5];
      const totals = plan.weeks.map((w) => w.totalMinutes);
      const over = plan.weeks.filter((w) => w.totalMinutes > Math.min(plan.targetWeeklyMinutes, C.who.maxWeeklyMinutes) + 5);
      row('K1', over.length ? 'fail' : 'pass', `target ${plan.targetWeeklyMinutes}, weeks [${totals.join(',')}]`);
      const k2: string[] = [];
      for (const w of plan.weeks) {
        const longs = w.walks.filter((x) => x.minutes > C.session.max);
        if (longs.length > 1) k2.push(`wk${w.index}: ${longs.length} long`);
        if (w.walks.some((x) => x.minutes > C.longWalkMax || x.minutes < C.session.min)) k2.push(`wk${w.index}: [${w.walks.map((x) => x.minutes).join(',')}]`);
      }
      row('K2', k2.length ? 'fail' : 'pass', k2.join('; '));
      const k3 = totals.slice(1).map((t, i) => [totals[i], t]).filter(([a, b]) => b > Math.ceil((a * (1 + C.weeklyRampCap)) / 5) * 5 + 5);
      // Few days → the walk floor (20′ × days) can force a week above the ramp; reported as a warning.
      row('K3', k3.length ? (plan.days.length * C.session.min >= Math.min(...k3.map(([, b]) => b)) ? 'warn' : 'fail') : 'pass', k3.map(([a, b]) => `${a}→${b}`).join(' '));
      const offDay = plan.days.filter((d) => !allowed.includes(d));
      row('K4', offDay.length || (plan.days.includes(6) && !allowed.includes(6)) ? 'fail' : 'pass', `days [${plan.days.join(',')}]`);
      const okFreq = plan.days.length >= Math.min(C.frequency.min, allowed.length) && plan.days.length <= C.frequency.max;
      row('K5', okFreq ? 'pass' : 'fail', `${plan.days.length} walks on ${allowed.length} days`);
      const ramp = weeklyMinutesRamp(Math.min(C.startMinutesByLevel[plan.level], plan.targetWeeklyMinutes), plan.targetWeeklyMinutes, C.horizonWeeks, C.weeklyRampCap);
      const drift = plan.weeks.filter((w, i) => Math.abs(w.totalMinutes - ramp[i]) > 10);
      const under = drift.some((w) => w.totalMinutes < ramp[w.index]);
      row('K6', drift.length ? 'warn' : 'pass', drift.length ? `${under ? 'UNDER' : 'OVER'}: walks sum [${totals.join(',')}] vs planned [${ramp.join(',')}] on ${plan.days.length} days` : '');
    }
  return rows;
}

export interface WeekMatrix {
  rows: WeekRow[];
  summary: { perCheck: Record<string, { n: number; fail: number; warn: number }>; failures: WeekRow[] };
}

export function runWeekMatrix(): WeekMatrix {
  const rows = [...fixtureWeekRows(), ...policyRows(), ...walkRows()];
  const perCheck: WeekMatrix['summary']['perCheck'] = {};
  for (const r of rows) {
    const c = (perCheck[r.check] ??= { n: 0, fail: 0, warn: 0 });
    c.n++; if (r.grade === 'fail') c.fail++; if (r.grade === 'warn') c.warn++;
  }
  const ordered = Object.fromEntries(Object.keys(WEEK_LABELS_HE).filter((k) => perCheck[k]).map((k) => [k, perCheck[k]]));
  return { rows, summary: { perCheck: ordered, failures: rows.filter((r) => r.grade === 'fail') } };
}

/** Ratchet keys: `${id}:${check}` for every failing row. */
export const weekFailureKeys = (rows: WeekRow[]) => Array.from(new Set(rows.filter((r) => r.grade === 'fail').map((r) => `${r.id}:${r.check}`))).sort();

