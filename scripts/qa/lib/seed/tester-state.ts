/**
 * A tester account's seeded state as a list of document writes (pure — no Firebase).
 *
 * Built from the demo world's own builders (scripts/demo/lib): weekFor (engine v2 / walking
 * plan), buildHistory (workouts, userSchedule, dailyActivity), userDoc (users/{uid}). On top of
 * the persona doc it adds what the app gates on for an onboarded user — exactly the fields the
 * onboarding writes on COMPLETED: onboardingStatus / onboardingComplete, the health declaration,
 * progression tracks / domains / activePrograms, the running program, lifestyle.dashboardMode.
 *
 * Fences: demo_qa_* uid only; every doc is checked by the demo-world allowlist (assertDemoDocs)
 * AND must belong to this tester (path id = uid or starts with `${uid}_`). No feed posts, no park
 * check-ins, no groups (shareRate 0, parkUser false, no groupIds) — a tester never shows up in
 * anyone else's feed.
 */
import { DAY_LETTERS } from '@/features/schedule/types/smartSchedule.types';
import { mergeDayItems } from '@/features/schedule/services/mergeDayItems';
import { walkingGoalToStore } from '@/features/schedule/walking/walkingGoal';
import { trackToDashboardMode } from '@/features/user/onboarding/services/track-mapper.service';
import type { PrimaryTrack } from '@/features/user/core/types/user.types';
import { DEMO_UID_PREFIX, isTesterUid } from '../../../demo/lib/config';
import { assertDemoDocs } from '../../../demo/lib/guard';
import { buildHistory, type DocWrite, type PersonaContext } from '../../../demo/lib/history';
import { PERSONAS, type Persona } from '../../../demo/lib/personas';
import { weekFor, type DemoWeek } from '../../../demo/lib/schedule';
import { homeOf, userDoc } from '../../../demo/lib/world';
import { buildExploreMapProfileWrite } from '@/features/user/onboarding/services/gateway-explore-map.service';
import { SEED_SPECS, type OnboardedPrecondition, type Precondition, type SeedSpec } from './preconditions';
import { runningProfileFor, type RunAssets, type RunPlanInput } from './run-plan';

export interface TesterIdentity {
  name: string;
  age: number;
  gender: 'male' | 'female';
}

/** The demo city every tester lives in. */
export const TESTER_TENANT = { tenantId: 'demo-tlv', subId: 'demo-tlv-n1' } as const;
/** Bump when the seeded shape changes (users/{uid}.core.demo.qaSeed). */
export const TESTER_SEED_VERSION = 1;

/** Rotates the week so a session of `kind` falls on `todayDow` (keeps the week's spacing). */
export function rotateWeekToToday(week: DemoWeek, todayDow: number, kind: SeedSpec['todayKind']): DemoWeek {
  const from = week.days.findIndex((ss) => ss.some((s) => s.kind === kind));
  if (from < 0) return week;
  const shift = (todayDow - from + 7) % 7;
  if (shift === 0) return week;
  const days = Array.from({ length: 7 }, (_, d) => week.days[(d - shift + 7) % 7]);
  const running = week.running ? { ...week.running, days: week.running.days.map((d) => (d + shift) % 7).sort((a, b) => a - b) } : null;
  return { ...week, days, running };
}

function testerPersona(uid: string, spec: SeedSpec, who: TesterIdentity): Persona {
  const walker = PERSONAS.find((p) => p.scenario === 'WR' && p.walk);
  return {
    key: uid.slice(DEMO_UID_PREFIX.length),
    name: who.name,
    gender: who.gender,
    age: who.age,
    tenantId: TESTER_TENANT.tenantId,
    subId: TESTER_TENANT.subId,
    scenario: spec.scenario,
    journey: spec.journey,
    personaKind: 'office_worker',
    adherence: 0.8,
    shareRate: 0,
    stepGoal: 8000,
    bio: 'חשבון בודק אוטומטי (QA)',
    ...(spec.scenario === 'WR' && walker?.walk ? { walk: { ...walker.walk, days: [0, 1, 2, 3, 4, 5] } } : {}),
    parkUser: false,
  };
}

/** 'YYYY-MM-DD' (local calendar day) `offset` days from `now`. */
function isoDay(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const owned = (uid: string, path: string) => {
  const id = path.split('/')[1] ?? '';
  return id === uid || id.startsWith(`${uid}_`);
};

/**
 * Every doc of a seeded precondition. `fresh` → [] (the reset alone is the state).
 * `runAssets` = the running workout templates + pace map (null → no generated activeProgram).
 */
export function buildTesterState(
  uid: string,
  precondition: Precondition,
  who: TesterIdentity,
  now: Date,
  runAssets: RunAssets | null,
): DocWrite[] {
  if (!isTesterUid(uid)) throw new Error(`not a tester uid: ${uid}`);
  if (precondition === 'fresh') return [];
  if (precondition === 'map_only') {
    const docs: DocWrite[] = [{ path: `users/${uid}`, data: mapOnlyUser(uid, now) }];
    assertDemoDocs(docs);
    return docs;
  }
  const spec = SEED_SPECS[precondition];
  const persona = testerPersona(uid, spec, who);
  const week = rotateWeekToToday(weekFor(persona), now.getDay(), spec.todayKind);
  const ctx: PersonaContext = {
    persona,
    uid,
    week,
    authorityId: TESTER_TENANT.tenantId,
    neighborhoodId: TESTER_TENANT.subId,
    tenantId: TESTER_TENANT.tenantId,
    unitId: null,
    home: homeOf(persona),
    parks: [],
    groupIds: [],
  };
  const h = buildHistory(ctx, now, spec.historyDays, 14, { completeToday: spec.completeToday });
  const base = userDoc(persona, ctx, h, now);
  const user = onboardedUser(base, { uid, precondition, spec, week, now, runAssets, stepGoal: persona.stepGoal });

  const docs: DocWrite[] = [
    { path: `users/${uid}`, data: user },
    {
      path: `streaks/${uid}`,
      // lastActivityDate is never null on a real streak doc (the create rule needs a day key) —
      // a null one makes every later client write fail the rule. No live streak → the oldest
      // history day (a gap the app reads as "streak broken", exactly like a real lapsed user).
      data: { userId: uid, displayName: who.name, currentStreak: h.streak.current, longestStreak: h.streak.longest, lastActivityDate: h.streak.lastActivityDate ?? h.steps[0]?.date ?? isoDay(now, -spec.historyDays), authorityId: ctx.authorityId, neighborhoodId: ctx.neighborhoodId, ageGroup: 'demo', isDemo: true, updatedAt: now },
    },
    ...h.docs,
  ];
  const foreign = docs.filter((d) => !owned(uid, d.path));
  if (foreign.length) throw new Error(`tester seed would write outside ${uid}: ${foreign.map((d) => d.path).join(', ')}`);
  assertDemoDocs(docs);
  return docs;
}

/**
 * map_only: EXACTLY the doc the landing's quick signup writes for a new user
 * (runExploreMapFlow → buildExploreMapProfileWrite, + createdAt / updatedAt), so landing-decision
 * routes the tester like a real new user (MAP_ONLY → /explorer), never to /gateway. On top, only
 * the demo-world fences every tester doc carries (assertDemoDocs): core.demo marker,
 * isMockData / discoverable:false, and the demo tenant (else the leaderboard shard is _global).
 * No name, no location, no program — the app asks for them, like for a real new user.
 */
export function mapOnlyUser(uid: string, now: Date): Record<string, unknown> {
  const scaffold = buildExploreMapProfileWrite(uid, undefined);
  if (!scaffold) throw new Error('explore-map scaffold missing');
  return {
    ...scaffold,
    isMockData: true,
    core: {
      ...scaffold.core,
      isMockData: true,
      discoverable: false,
      tenantId: TESTER_TENANT.tenantId,
      demo: { tester: true, precondition: 'map_only', qaSeed: TESTER_SEED_VERSION },
    },
    createdAt: now,
    updatedAt: now,
  };
}

interface OnboardArgs {
  uid: string;
  precondition: OnboardedPrecondition;
  spec: SeedSpec;
  week: DemoWeek;
  now: Date;
  runAssets: RunAssets | null;
  stepGoal: number;
}

/** The persona doc + what the onboarding writes on COMPLETED. */
export function onboardedUser(base: Record<string, unknown>, a: OnboardArgs): Record<string, unknown> {
  const core = base.core as Record<string, unknown>;
  const lifestyle = { ...(base.lifestyle as Record<string, unknown>) };
  const progression = { ...(base.progression as Record<string, unknown>) };
  const startDate = a.now.toISOString();

  // Strength: the program + level per program (onboarding: tracks + domains + activePrograms).
  const slugs = a.week.strengthSlugs;
  progression.activePrograms = slugs.map((id) => ({ id, templateId: id, name: id.replace(/_/g, ' '), startDate, durationWeeks: 52, currentWeek: 1, focusDomains: [id] }));
  progression.tracks = Object.fromEntries(slugs.map((id) => [id, { currentLevel: 5, percent: 20 }]));
  progression.domains = Object.fromEntries(slugs.map((id) => [id, { currentLevel: 5, maxLevel: 0, isUnlocked: true }]));

  let running: Record<string, unknown> | undefined;
  if (a.spec.runPlan && a.week.running) {
    const input: RunPlanInput = {
      targetDistance: a.week.running.targetDistance,
      goalPath: 'improve_time',
      weeklyFrequency: Math.max(2, Math.min(4, a.week.running.days.length)),
      scheduleDays: a.week.running.days.map((d) => DAY_LETTERS[d]),
    };
    const plan = runningProfileFor(input, a.runAssets, a.now);
    running = plan.running;
    const runId = plan.programId;
    const tpl = { ...((lifestyle.recurringTemplate as Record<string, string[]> | undefined) ?? {}) };
    for (const letter of input.scheduleDays) tpl[letter] = mergeDayItems(tpl[letter] ?? [], [runId], 'running');
    lifestyle.recurringTemplate = tpl;
  }
  if (a.spec.walkingGoal && !lifestyle.walkingGoal) {
    lifestyle.walkingGoal = walkingGoalToStore('health', { targetWeeklyMinutes: 150 });
  }
  const track = (lifestyle.primaryTrack as PrimaryTrack | undefined) ?? 'health';
  lifestyle.dashboardMode = trackToDashboardMode(track);

  return {
    ...base,
    id: a.uid,
    onboardingStatus: 'COMPLETED',
    onboardingStep: 'COMPLETED',
    onboardingComplete: true,
    onboardingPath: 'FULL_PROGRAM',
    onboardingProgress: 100,
    healthDeclarationAccepted: true,
    // The Kelly welcome DM is not part of any mission (and Kelly is out of the testers' scope).
    hasWelcomeBotTriggered: true,
    health: { injuries: [], connectedWatch: 'none', healthDeclarationAccepted: true },
    equipment: { home: [], office: [], outdoor: [] },
    goals: { dailySteps: a.stepGoal },
    core: {
      ...core,
      initialFitnessTier: 2,
      trackingMode: 'performance',
      mainGoal: 'healthy_lifestyle',
      weight: 65,
      demo: { ...(core.demo as Record<string, unknown>), tester: true, precondition: a.precondition, qaSeed: TESTER_SEED_VERSION },
    },
    lifestyle,
    progression,
    ...(running ? { running } : {}),
  };
}
