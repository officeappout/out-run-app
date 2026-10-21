/**
 * The whole demo world as a list of document writes (pure — no Firebase). seed.ts writes
 * exactly this list; the unit tests check it (every path / id stays inside the demo world).
 *
 *   tenants   authorities/{demo city | neighborhood | unit}, tenants/{unit} + units/{company}
 *   people    users/{demo_*}, streaks, military_declarations (units)
 *   history   workouts, userSchedule, dailyActivity(+Public), feed_posts, sessions (history.ts)
 *   social    community_groups (+members), chats (+messages), connections, user_memberships
 *   registry  demo_registry/personas + demo_registry/tenants (viewers are never overwritten)
 */
import { DAY_LETTERS } from '@/features/schedule/types/smartSchedule.types';
import { walkingGoalToStore } from '@/features/schedule/walking/walkingGoal';
import {
  DEMO_CITIES,
  DEMO_SEED_VERSION,
  DEMO_UNITS,
  HISTORY_DAYS,
  REGISTRY_COLLECTION,
  REGISTRY_DOCS,
  SCHEDULE_AHEAD_DAYS,
  demoAuthorityIds,
  tenantById,
  type DemoCity,
  type DemoUnit,
} from './config';
import { offset } from './geo';
import { actorOf, buildHistory, sessionTitle, type DemoPark, type DocWrite, type PersonaContext } from './history';
import { PERSONAS, personaUid, type Persona } from './personas';
import { roll } from './rng';
import { weekFor, startTimeOf } from './schedule';
import { DEMO_DMS, DEMO_GROUPS, buildSocial, dmChatId, groupChatId, groupIdsOf } from './social';

export interface WorldOptions {
  now: Date;
  /** Real parks per demo city id (read-only lookup by the seed; empty = no check-ins). */
  parksByCity: Record<string, DemoPark[]>;
  historyDays?: number;
  aheadDays?: number;
}

export interface DemoWorld {
  docs: DocWrite[];
  uids: string[];
  workoutIds: string[];
  /** Per uid: the steps of each day (league steps are applied by the seed). */
  steps: Record<string, Array<{ date: string; steps: number; distanceMeters: number }>>;
}

function tenantDocs(now: Date): DocWrite[] {
  const docs: DocWrite[] = [];
  const base = { isDemo: true, status: 'active', isActiveClient: false, pipelineStatus: 'demo', managerIds: [], contacts: [], activityLog: [], tasks: [], createdAt: now, updatedAt: now };
  for (const c of DEMO_CITIES) {
    docs.push({ path: `authorities/${c.id}`, data: { ...base, name: c.name, type: 'city', gatingMode: 'soft_launch', location: c.center, userCount: PERSONAS.filter((p) => p.tenantId === c.id).length } });
    for (const n of c.neighborhoods) {
      docs.push({ path: `authorities/${n.id}`, data: { ...base, name: n.name, type: 'neighborhood', parentAuthorityId: c.id, location: offset(c.center, n.offset[0], n.offset[1]), userCount: 0 } });
    }
  }
  for (const u of DEMO_UNITS) {
    docs.push({ path: `authorities/${u.id}`, data: { ...base, name: u.name, type: 'military_unit', tenantType: 'military', tenantId: u.id, location: u.center, userCount: PERSONAS.filter((p) => p.tenantId === u.id).length } });
    docs.push({ path: `tenants/${u.id}`, data: { name: u.name, type: 'military', tenantType: 'military', isDemo: true, isReserve: u.reserve, createdAt: now, updatedAt: now } });
    for (const c of u.companies) {
      docs.push({ path: `tenants/${u.id}/units/${c.id}`, data: { name: c.name, memberCount: PERSONAS.filter((p) => p.subId === c.id).length, unitPath: [c.name], isDemo: true, createdAt: now } });
    }
  }
  return docs;
}

/**
 * The live engine's view of a persona (demo_registry/personas.personas[i].life, parsed by
 * functions/src/demo-life/persona.ts): the session actor + knobs + the engine-built week,
 * flat (Firestore has no nested arrays).
 */
export function lifeEntryOf(ctx: PersonaContext): Record<string, unknown> {
  const p = ctx.persona;
  const a = actorOf(ctx);
  const sessions = ctx.week.days.flatMap((ss, dow) =>
    ss.map((s, i) => ({
      dow,
      i,
      kind: s.kind,
      ...(s.slug ? { slug: s.slug } : {}),
      ...(s.slot ? { slot: s.slot } : {}),
      minutes: s.minutes,
      title: sessionTitle(s),
      start: startTimeOf(s.window),
    })),
  );
  return {
    name: a.name,
    gender: a.gender,
    age: a.age,
    tone: p.personaKind,
    adherence: p.adherence,
    shareRate: a.shareRate,
    stepGoal: p.stepGoal,
    parkUser: a.parkUser,
    authorityId: a.authorityId,
    neighborhoodId: a.neighborhoodId,
    tenantId: a.tenantId,
    unitId: a.unitId,
    groupIds: a.groupIds,
    home: a.home,
    park: a.park,
    runLevel: a.runLevel,
    sessions,
  };
}

function homeOf(p: Persona) {
  const t = tenantById(p.tenantId);
  const n = t.kind === 'city' ? (t as DemoCity).neighborhoods.find((x) => x.id === p.subId) : null;
  const c = n ? offset(t.center, n.offset[0], n.offset[1]) : t.center;
  // Each persona lives a few hundred metres apart.
  return offset(c, (roll(`${p.key}|lat`) - 0.5) * 0.01, (roll(`${p.key}|lng`) - 0.5) * 0.01);
}

function userDoc(p: Persona, ctx: PersonaContext, h: ReturnType<typeof buildHistory>, now: Date): Record<string, unknown> {
  const uid = personaUid(p);
  const t = tenantById(p.tenantId);
  const isUnit = t.kind === 'unit';
  const week = ctx.week;
  const strengthLetters: Record<string, string[]> = {};
  const trainingDays = new Set<number>();
  week.days.forEach((ss, dow) => {
    const slugs = ss.filter((s) => s.kind === 'strength' && s.slug).map((s) => s.slug!);
    if (slugs.length) strengthLetters[DAY_LETTERS[dow]] = Array.from(new Set(slugs));
    if (ss.length) trainingDays.add(dow);
  });
  const firstWindow = week.days.flat()[0]?.window ?? 'evening';
  const birthDate = new Date(now.getFullYear() - p.age, Math.floor(roll(`${p.key}|bm`) * 12), 1 + Math.floor(roll(`${p.key}|bd`) * 27));
  const joinDate = new Date(now.getTime() - (HISTORY_DAYS + 5 + Math.floor(roll(`${p.key}|join`) * 60)) * 86_400_000);
  const primaryTrack = p.journey === 'WR' && !week.strengthSlugs.length ? 'health' : week.running && week.strengthSlugs.length ? 'hybrid' : week.running ? 'run' : week.strengthSlugs.length ? 'strength' : 'health';
  const level = Math.max(1, Math.min(20, Math.floor(h.totals.xp / 400) + 1));

  return {
    isMockData: true,
    core: {
      name: p.name,
      displayName: p.name,
      gender: p.gender,
      birthDate,
      authorityId: ctx.authorityId,
      ...(ctx.neighborhoodId ? { neighborhoodId: ctx.neighborhoodId } : {}),
      tenantId: ctx.tenantId,
      tenantType: isUnit ? 'military' : 'municipal',
      ...(ctx.unitId ? { unitId: ctx.unitId, unitPath: `${ctx.tenantId}/${ctx.unitId}` } : {}),
      isMockData: true,
      discoverable: false,
      isApproved: false,
      isSuperAdmin: false,
      onboardingStatus: 'COMPLETED',
      accessLevel: 'free',
      joinDate,
      bio: p.bio,
      demo: { tenantId: p.tenantId, personaId: p.key, scenario: p.scenario, journey: p.journey, source: week.source, v: DEMO_SEED_VERSION },
    },
    personas: [{ id: p.personaKind, answers: {}, updatedAt: joinDate }],
    lifestyle: {
      trainingTime: startTimeOf(firstWindow),
      scheduleDays: DAY_LETTERS.filter((_, d) => trainingDays.has(d)),
      ...(Object.keys(strengthLetters).length ? { recurringTemplate: strengthLetters } : {}),
      primaryTrack,
      ...(p.walk && week.walkTargetWeeklyMinutes ? { walkingGoal: walkingGoalToStore(p.walk.goal, { targetWeeklyMinutes: week.walkTargetWeeklyMinutes }) } : {}),
      stepGoal: p.stepGoal,
    },
    ...(week.running
      ? {
          running: {
            isUnlocked: true,
            scheduleDays: week.running.days.map((d) => DAY_LETTERS[d]),
            scheduleDaysSource: 'user-chosen',
            onboardingData: { targetDistance: week.running.targetDistance, weeklyFrequency: week.running.days.length },
          },
        }
      : {}),
    progression: {
      globalLevel: level,
      globalXP: h.totals.xp,
      coins: h.totals.coins,
      totalCaloriesBurned: h.totals.calories,
      currentStreak: h.streak.current,
      longestStreak: h.streak.longest,
      hasUnlockedAdvancedStats: false,
      avatarId: 'default',
      unlockedBadges: [],
      domains: {},
      activePrograms: week.strengthSlugs.map((slug) => ({ templateId: slug, startedAt: joinDate })),
      unlockedBonusExercises: [],
    },
    social: { groupIds: groupIdsOf(p.key) },
    createdAt: joinDate,
    updatedAt: now,
    lastActive: new Date(now.getTime() - Math.floor(roll(`${p.key}|seen`) * 2) * 86_400_000),
  };
}

export function buildDemoWorld(opts: WorldOptions): DemoWorld {
  const { now } = opts;
  const historyDays = opts.historyDays ?? HISTORY_DAYS;
  const aheadDays = opts.aheadDays ?? SCHEDULE_AHEAD_DAYS;
  const personas = PERSONAS;
  const docs: DocWrite[] = [...tenantDocs(now)];
  const workoutIds: string[] = [];
  const steps: DemoWorld['steps'] = {};
  const lifeByUid: Record<string, Record<string, unknown>> = {};

  for (const p of personas) {
    const uid = personaUid(p);
    const t = tenantById(p.tenantId);
    const isUnit = t.kind === 'unit';
    const ctx: PersonaContext = {
      persona: p,
      uid,
      week: weekFor(p),
      authorityId: p.tenantId,
      neighborhoodId: isUnit ? null : p.subId,
      tenantId: p.tenantId,
      unitId: isUnit ? p.subId : null,
      home: homeOf(p),
      parks: isUnit ? [] : opts.parksByCity[p.tenantId] ?? [],
      groupIds: groupIdsOf(p.key),
    };
    const h = buildHistory(ctx, now, historyDays, aheadDays);
    lifeByUid[uid] = lifeEntryOf(ctx);
    docs.push({ path: `users/${uid}`, data: userDoc(p, ctx, h, now) });
    docs.push({
      path: `streaks/${uid}`,
      data: { userId: uid, displayName: p.name, currentStreak: h.streak.current, longestStreak: h.streak.longest, lastActivityDate: h.streak.lastActivityDate, authorityId: ctx.authorityId, ...(ctx.neighborhoodId ? { neighborhoodId: ctx.neighborhoodId } : {}), ageGroup: 'demo', isDemo: true, updatedAt: now },
    });
    if (p.military && isUnit) {
      const u = t as DemoUnit;
      docs.push({ path: `military_declarations/${uid}`, data: { status: p.military.status, orgId: u.id, unitId: p.subId, unitPathIds: [u.id, p.subId], isDemo: true, updatedAt: now } });
    }
    docs.push(...h.docs);
    workoutIds.push(...h.workoutIds);
    steps[uid] = h.steps;
  }

  docs.push(...buildSocial(now));

  const uids = personas.map(personaUid);
  docs.push({
    path: `${REGISTRY_COLLECTION}/${REGISTRY_DOCS.personas}`,
    data: { uids, personas: personas.map((p) => ({ uid: personaUid(p), key: p.key, scenario: p.scenario, journey: p.journey, tenantId: p.tenantId, life: lifeByUid[personaUid(p)] })), v: DEMO_SEED_VERSION, updatedAt: now },
  });
  docs.push({
    path: `${REGISTRY_COLLECTION}/${REGISTRY_DOCS.tenants}`,
    data: {
      authorityIds: demoAuthorityIds(),
      cityIds: DEMO_CITIES.map((c) => c.id),
      unitTenantIds: DEMO_UNITS.map((u) => u.id),
      groupIds: DEMO_GROUPS.map((g) => g.id),
      chatIds: [...DEMO_GROUPS.map((g) => groupChatId(g.id)), ...DEMO_DMS.map(([a, b]) => dmChatId(a, b))],
      v: DEMO_SEED_VERSION,
      updatedAt: now,
    },
  });
  return { docs, uids, workoutIds, steps };
}
