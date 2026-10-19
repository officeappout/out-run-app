/**
 * Session units — what the search places — and the reduction ladder (the §4.3 conflict
 * resolution order, adjusted by priority). Pure.
 */
import {
  DROP,
  PRIORITY_TUNING,
  SHORT_DISTANCE_KM,
  SKILL_DAYS_MIN,
  STRENGTH_FLOOR_DAYS,
  TARGET_DISTANCE_KM,
} from './config';
import { canonicalSlug, H6_PATTERNS, maxLoad, profileOfProgram, SHARED_PATTERN_LOAD } from './programProfiles';
import type {
  Intensity,
  LoadVector,
  RunSlot,
  RunWorkoutType,
  ScheduleEngineInput,
  SchedulePriority,
} from './types';

export interface Unit {
  id: string;
  kind: 'run' | 'strength';
  slot?: RunSlot;
  workout?: RunWorkoutType;
  minutes?: number;
  /** Strength: 1 slug, or 2 for a combined session. */
  slugs: string[];
  load: LoadVector;
  intensity: Intensity;
  minRecH: number;
  idealRecH: number;
  /** Strength program priority (1 = top); runs 0. */
  priority: number;
  isSkill: boolean;
  /** Tie-break rank (lower = more important), stable across steps. */
  rank: number;
  /** Same identity = interchangeable (symmetry pruning in the search). */
  identity: string;
  fixedDow?: number;
  fixedTime?: string;
  /** Full body → its no-legs variant. */
  variant?: string;
  /** Set on the swapped unit: the slug it replaces. */
  variantOf?: string;
  overflow?: boolean;
  combined?: boolean;
  /** strength_first: this easy run was Q2. */
  downgraded?: boolean;
}

const RUN_LOAD: Record<RunSlot, { load: LoadVector; intensity: Intensity }> = {
  quality_primary: { load: { push: 0, pull: 0, legs: 0.7, core: 0, straightArm: 0, cns: 0.5 }, intensity: 'hard' },
  quality_secondary: { load: { push: 0, pull: 0, legs: 0.7, core: 0, straightArm: 0, cns: 0.5 }, intensity: 'hard' },
  long_run: { load: { push: 0, pull: 0, legs: 0.8, core: 0, straightArm: 0, cns: 0.4 }, intensity: 'hard' },
  easy_run: { load: { push: 0, pull: 0, legs: 0.3, core: 0, straightArm: 0, cns: 0.1 }, intensity: 'light' },
  recovery: { load: { push: 0, pull: 0, legs: 0.3, core: 0, straightArm: 0, cns: 0.1 }, intensity: 'light' },
};

/** Slot tie-break order (Q1 < L < Q2 < E < R). */
export const SLOT_RANK: Record<RunSlot, number> = {
  quality_primary: 0,
  long_run: 1,
  quality_secondary: 2,
  easy_run: 3,
  recovery: 4,
};

export function isShortDistance(target: string | undefined): boolean {
  const km = TARGET_DISTANCE_KM[target ?? ''] ?? 10;
  return km <= SHORT_DISTANCE_KM;
}

function runUnit(id: string, slot: RunSlot, extra: Partial<Unit> = {}): Unit {
  return {
    id, kind: 'run', slot, slugs: [], ...RUN_LOAD[slot], minRecH: 0, idealRecH: 0, priority: 0,
    isSkill: false, rank: SLOT_RANK[slot], identity: `run:${slot}`, ...extra,
  };
}

export function makeRunUnit(slot: RunSlot, id = `run:${slot}`): Unit {
  return runUnit(id, slot);
}

export function makeStrengthUnit(slug: string, id = `strength:${slug}`, priority = 1): Unit {
  const prof = profileOfProgram({ slug, sessionsPerWeek: 1, priority });
  return {
    id, kind: 'strength', slugs: [slug], load: prof.load, intensity: prof.intensity,
    minRecH: prof.minRecoveryHours, idealRecH: prof.idealRecoveryHours, priority, isSkill: prof.isSkill,
    rank: 100 + priority, identity: `strength:${canonicalSlug(slug)}`, variant: prof.noLegsVariant,
  };
}

export type LadderGroup = 'overflow' | 'easy' | 'strength_rest' | 'q2' | 'skill_p1_extra' | 'floor' | 'key_second' | 'key_top';

export interface LadderStep {
  action: 'drop' | 'merge' | 'downgrade';
  unitId: string;
  partnerId?: string;
  cost: number;
  group: LadderGroup;
}

export interface UnitPlan {
  runUnits: Unit[];
  strengthUnits: Unit[];
  ladder: LadderStep[];
  /** Number of main strength sessions the floor asks for. */
  floor: number;
  hardSkillCount: number;
  skillDaysRequired: number;
  travelWeek: boolean;
}

function sharesPattern(a: LoadVector, b: LoadVector): boolean {
  return H6_PATTERNS.some((p) => a[p] >= SHARED_PATTERN_LOAD && b[p] >= SHARED_PATTERN_LOAD);
}

export function buildUnits(input: ScheduleEngineInput, priority: SchedulePriority): UnitPlan {
  const tuning = PRIORITY_TUNING[priority];
  const travelWeek = (input.availability.exceptions ?? []).some((e) => e.kind === 'travel');

  // ── runs ──
  const runUnits: Unit[] = [];
  const fixed = [...(input.running?.fixed ?? [])];
  const slotSeen: Record<string, number> = {};
  for (const s of input.running?.sessions ?? []) {
    const n = (slotSeen[s.slot] = (slotSeen[s.slot] ?? 0) + 1);
    const fixIdx = fixed.findIndex((f) => f.fills === s.slot);
    const fx = fixIdx >= 0 ? fixed.splice(fixIdx, 1)[0] : undefined;
    runUnits.push(
      runUnit(`run:${s.slot}:${n}`, s.slot, {
        workout: s.workout,
        minutes: s.minutes,
        fixedDow: fx?.dow,
        fixedTime: fx?.time,
        identity: fx ? `run:${s.slot}:fixed` : `run:${s.slot}`,
      }),
    );
  }

  // ── strength ──
  const programs = [...input.strength].sort((a, b) => a.priority - b.priority);
  const main = programs.filter((p) => !p.freeSlot && profileOfProgram(p).slotKind === 'main');
  const strengthUnits: Unit[] = [];
  const bySlug = new Map<string, Unit[]>();
  for (const p of main) {
    const prof = profileOfProgram(p);
    const list: Unit[] = [];
    for (let i = 0; i < Math.max(0, Math.round(p.sessionsPerWeek)); i++) {
      list.push({
        id: `strength:${p.slug}:${i + 1}`,
        kind: 'strength',
        slugs: [p.slug],
        load: prof.load,
        intensity: prof.intensity,
        minRecH: prof.minRecoveryHours,
        idealRecH: prof.idealRecoveryHours,
        priority: p.priority,
        isSkill: prof.isSkill,
        rank: 0,
        identity: `strength:${canonicalSlug(p.slug)}`,
        variant: prof.noLegsVariant,
      });
    }
    bySlug.set(p.slug, list);
    strengthUnits.push(...list);
  }

  // Overflow day for skill users without runs (today's default rotation: skills one per day,
  // then calisthenics_upper), up to the ERR_DAYS_MIN recommendation.
  const hardSkillCount = Math.min(4, main.filter((p) => profileOfProgram(p).isSkill).length);
  const skillDaysRequired = hardSkillCount > 0 ? SKILL_DAYS_MIN[hardSkillCount] ?? 5 : 0;
  const overflow: Unit[] = [];
  if (!input.running && hardSkillCount > 0) {
    const lowest = Math.max(0, ...main.map((p) => p.priority)) + 1;
    for (let i = strengthUnits.length; i < skillDaysRequired; i++) {
      const prof = profileOfProgram({ slug: 'calisthenics_upper', sessionsPerWeek: 1, priority: lowest });
      overflow.push({
        id: `strength:calisthenics_upper:overflow${i}`,
        kind: 'strength',
        slugs: ['calisthenics_upper'],
        load: prof.load,
        intensity: prof.intensity,
        minRecH: prof.minRecoveryHours,
        idealRecH: prof.idealRecoveryHours,
        priority: lowest,
        isSkill: false,
        rank: 0,
        identity: 'strength:calisthenics_upper',
        overflow: true,
      });
    }
  }

  // ── importance: floor (round robin by priority, core only when it is the only program) ──
  const onlyCore = main.length > 0 && main.every((p) => canonicalSlug(p.slug) === 'core');
  const floorEligible = main.filter((p) => onlyCore || canonicalSlug(p.slug) !== 'core');
  const floorCount = Math.min(
    STRENGTH_FLOOR_DAYS,
    floorEligible.reduce((s, p) => s + (bySlug.get(p.slug)?.length ?? 0), 0),
  );
  const floorUnits: Unit[] = [];
  for (let round = 0; floorUnits.length < floorCount; round++) {
    let added = false;
    for (const p of floorEligible) {
      const u = bySlug.get(p.slug)?.[round];
      if (u && floorUnits.length < floorCount) {
        floorUnits.push(u);
        added = true;
      }
    }
    if (!added) break;
  }
  const p1 = main[0];
  const p1Extra =
    p1 && profileOfProgram(p1).isSkill ? (bySlug.get(p1.slug) ?? []).filter((u) => !floorUnits.includes(u)) : [];
  const rest = strengthUnits.filter((u) => !floorUnits.includes(u) && !p1Extra.includes(u));
  rest.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const ordered = [...floorUnits, ...p1Extra, ...rest, ...overflow];
  ordered.forEach((u, i) => (u.rank = 10 + i));
  // Ranks stay sequential: the search keeps identical units in day order, so an earlier
  // copy always holds the better rank (FIX-01: FL, OAPU, then the second FL).

  // ── ladder ──
  const short = isShortDistance(input.running?.targetDistance);
  const runsBy = (slot: RunSlot) => runUnits.filter((u) => u.slot === slot && u.fixedDow === undefined);
  const travel = (cost: number) => (travelWeek ? Math.min(cost, DROP.TRAVEL_OPTIONAL) : cost);
  const restCost = (u: Unit) =>
    travel((DROP.STRENGTH_EXTRA + 4 / Math.max(1, u.priority)) * tuning.strengthExtraDrop * (u.isSkill ? tuning.skillDrop : 1));

  const steps: Record<LadderGroup, LadderStep[]> = {
    overflow: [...overflow].reverse().map((u) => ({ action: 'drop', unitId: u.id, cost: DROP.OVERFLOW, group: 'overflow' })),
    easy: [
      ...runsBy('recovery').map((u): LadderStep => ({ action: 'drop', unitId: u.id, cost: travel(DROP.RECOVERY), group: 'easy' })),
      ...runsBy('easy_run').map((u): LadderStep => ({ action: 'drop', unitId: u.id, cost: travel(DROP.EASY), group: 'easy' })),
    ],
    strength_rest: [],
    q2: [],
    skill_p1_extra: [...p1Extra].reverse().map((u) => ({ action: 'drop', unitId: u.id, cost: DROP.SKILL_P1_EXTRA * tuning.skillDrop, group: 'skill_p1_extra' })),
    floor: [...floorUnits].reverse().map((u) => ({ action: 'drop', unitId: u.id, cost: DROP.STRENGTH_FLOOR, group: 'floor' })),
    key_second: runsBy(short ? 'long_run' : 'quality_primary').map((u) => ({ action: 'drop', unitId: u.id, cost: DROP.KEY_RUN_SECOND, group: 'key_second' })),
    key_top: runsBy(short ? 'quality_primary' : 'long_run').map((u) => ({ action: 'drop', unitId: u.id, cost: DROP.KEY_RUN_TOP, group: 'key_top' })),
  };
  for (const u of runsBy('quality_secondary')) {
    if (tuning.q2CanBecomeEasy && !travelWeek) steps.q2.push({ action: 'downgrade', unitId: u.id, cost: DROP.Q2_TO_EASY, group: 'q2' });
    steps.q2.push({ action: 'drop', unitId: u.id, cost: travel(tuning.qualitySecondaryDrop), group: 'q2' });
  }
  const mergeTargets = [...floorUnits, ...p1Extra, ...rest];
  const restSteps = (units: Unit[]): LadderStep[] => {
    const out: LadderStep[] = [];
    for (const u of [...units].reverse()) {
      const partner = mergeTargets.find(
        (t) => t !== u && t.identity !== u.identity && !sharesPattern(t.load, u.load) && !(t.isSkill && u.isSkill),
      );
      if (partner) out.push({ action: 'merge', unitId: u.id, partnerId: partner.id, cost: DROP.MERGE, group: 'strength_rest' });
      out.push({ action: 'drop', unitId: u.id, cost: restCost(u), group: 'strength_rest' });
    }
    return out;
  };

  let ladder: LadderStep[];
  if (priority === 'strength_first') {
    ladder = [...steps.overflow, ...steps.easy, ...steps.q2, ...restSteps(rest)];
  } else if (priority === 'skill') {
    ladder = [
      ...steps.overflow, ...steps.easy, ...restSteps(rest.filter((u) => !u.isSkill)), ...steps.q2,
      ...restSteps(rest.filter((u) => u.isSkill)),
    ];
  } else {
    ladder = [...steps.overflow, ...steps.easy, ...restSteps(rest), ...steps.q2];
  }
  ladder.push(...steps.skill_p1_extra, ...steps.floor, ...steps.key_second, ...steps.key_top);

  return {
    runUnits,
    strengthUnits: [...strengthUnits, ...overflow],
    ladder,
    floor: floorCount,
    hardSkillCount,
    skillDaysRequired,
    travelWeek,
  };
}

/** The unit set after applying the first `k` ladder steps. */
export interface ReducedSet {
  runs: Unit[];
  strength: Unit[];
  dropCost: number;
  dropped: Unit[];
  merged: Array<{ unit: Unit; into: Unit }>;
  downgraded: Unit[];
}

export function applyLadder(plan: UnitPlan, k: number): ReducedSet {
  const dropped = new Set<string>();
  const mergedInto = new Map<string, string>();
  const downgraded = new Set<string>();
  const costOf = new Map<string, number>();
  for (const step of plan.ladder.slice(0, k)) {
    const key = `${step.action}:${step.unitId}`;
    if (step.action === 'drop') {
      dropped.add(step.unitId);
      mergedInto.delete(step.unitId);
    } else if (step.action === 'merge' && step.partnerId) {
      if (dropped.has(step.partnerId) || mergedInto.has(step.partnerId)) continue;
      const hosts = Array.from(mergedInto.values());
      if (hosts.includes(step.unitId) || hosts.includes(step.partnerId)) continue;
      mergedInto.set(step.unitId, step.partnerId);
    } else if (step.action === 'downgrade') {
      downgraded.add(step.unitId);
    }
    costOf.set(key, step.cost);
  }
  // Cost = drops + merges still in force + downgrades still in force.
  let dropCost = 0;
  for (const id of Array.from(dropped)) dropCost += costOf.get(`drop:${id}`) ?? 0;
  for (const id of Array.from(mergedInto.keys())) dropCost += costOf.get(`merge:${id}`) ?? 0;
  for (const id of Array.from(downgraded)) if (!dropped.has(id)) dropCost += costOf.get(`downgrade:${id}`) ?? 0;

  const all = [...plan.runUnits, ...plan.strengthUnits];
  const byId = new Map(all.map((u) => [u.id, u]));
  const runs = plan.runUnits
    .filter((u) => !dropped.has(u.id))
    .map((u) =>
      downgraded.has(u.id)
        ? { ...u, slot: 'easy_run' as RunSlot, ...RUN_LOAD.easy_run, rank: SLOT_RANK.easy_run, identity: 'run:easy_run', downgraded: true }
        : u,
    );
  const merged: Array<{ unit: Unit; into: Unit }> = [];
  const strength: Unit[] = [];
  for (const u of plan.strengthUnits) {
    if (dropped.has(u.id) || mergedInto.has(u.id)) continue;
    const guests = Array.from(mergedInto.entries()).filter(([, host]) => host === u.id).map(([g]) => byId.get(g)!);
    if (guests.length === 0) {
      strength.push(u);
      continue;
    }
    let c: Unit = { ...u, combined: true, variant: undefined };
    for (const g of guests) {
      merged.push({ unit: g, into: u });
      c = {
        ...c,
        id: `${c.id}+${g.id}`,
        slugs: [...c.slugs, ...g.slugs],
        load: maxLoad(c.load, g.load),
        intensity: c.intensity === 'hard' || g.intensity === 'hard' ? 'hard' : c.intensity === 'moderate' || g.intensity === 'moderate' ? 'moderate' : 'light',
        minRecH: Math.max(c.minRecH, g.minRecH),
        idealRecH: Math.max(c.idealRecH, g.idealRecH),
        isSkill: c.isSkill || g.isSkill,
        identity: `${c.identity}+${g.identity}`,
      };
    }
    strength.push(c);
  }
  return {
    runs,
    strength,
    dropCost,
    dropped: Array.from(dropped).map((id) => byId.get(id)!).filter(Boolean),
    merged,
    downgraded: plan.runUnits.filter((u) => downgraded.has(u.id) && !dropped.has(u.id)),
  };
}
