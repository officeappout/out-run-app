/**
 * entry-points.ts — every real way a strength workout gets generated, driven with
 * the SAME option shape each production caller builds, over one scenario type:
 *
 *   trio      generateHomeWorkoutTrio (home carousel / StatsOverview)
 *   builder   generateHomeWorkout, WorkoutBuilderSheet.handleGenerate's option shape
 *             (body-area chips → requiredDomains + strictDomains, blast for D3 ≤ 20 min,
 *             program pill → scheduledProgramIds, park gear via the resolver)
 *   ai        generateHomeWorkout via the AI chat's real mapping
 *             (ai-coach/services/workout-tool.pure.ts buildGenerateOptions)
 *   park      composeParkWorkout (park "התחל אימון": machine Tabata + bodyweight block)
 *
 * (Hybrid route stops need the map/route stack and run only in the full bench —
 * scripts/audit/build-entrypoints-bench.ts.)
 *
 * Every run yields the generated workout(s) + the HardContext to grade them with
 * (hard-invariants.ts). Runs must happen behind the hermetic Firestore stub.
 */
import type { GeneratedWorkout } from '@/features/workout-engine/logic/workout-generator.types';
import { generateHomeWorkoutTrio, generateHomeWorkout } from '@/features/workout-engine/services/home-workout.service';
import { resolveParkEquipmentIds } from '@/features/workout-engine/services/park-equipment-resolver';
import { buildMockProfile } from '@/features/workout-engine/shared/utils/mock-profile.utils';
import { buildGenerateOptions } from '@/features/ai-coach/services/workout-tool.pure';
import { composeParkWorkout, type ParkWorkoutDifficulty } from '@/features/workout-engine/services/compose-park-strength-workout.service';
import { MUSCLE_CHIPS } from '@/lib/muscle-chips.const';
import type { HardContext } from './hard-invariants';

export type Entry = 'trio' | 'builder' | 'ai' | 'park';
export type LocKey = 'home-nogear' | 'home-bar-band' | 'park-typical' | 'office' | 'street';
export type Program = 'auto' | 'full_body' | 'upper_body' | 'legs' | 'core' | 'planche';

export interface Scenario {
  id: string;
  entry: Entry;
  level: number;
  loc: LocKey;
  minutes: number;
  difficulty: 1 | 2 | 3;
  program: Program;
  /** Builder body-area chip ids (MUSCLE_CHIPS) or AI domains — strict focus. */
  chips?: string[];
}

export interface Run {
  scenario: Scenario;
  bolt: number;
  workout: GeneratedWorkout;
  ctx: HardContext;
  meta?: Record<string, unknown>;
}

/** Real gear_definitions ids (what onboarding stores). */
export const HOME_BAR_BAND = ['5Rkhxawxj8EwC4spTXVM', 'I1K30JehaxSx8dlBOZyd']; // door pull-up bar + resistance band
/** A real, typical equipped park (8 tagged items: machines + bar + dips). */
export const PARK_TYPICAL_ID = 'KU4T7H2C40cMhtiXojG0';

const LOC: Record<LocKey, { location: 'home' | 'park' | 'office' | 'street'; homeGear: string[] }> = {
  'home-nogear': { location: 'home', homeGear: [] },
  'home-bar-band': { location: 'home', homeGear: HOME_BAR_BAND },
  'park-typical': { location: 'park', homeGear: [] },
  office: { location: 'office', homeGear: [] },
  street: { location: 'street', homeGear: [] },
};

const PROGRAM_DOMAINS: Record<Program, string[] | undefined> = {
  auto: undefined, full_body: ['push', 'pull', 'legs', 'core'], upper_body: ['push', 'pull'], legs: ['legs'], core: ['core'], planche: ['push'],
};

export function chipDomains(chips: string[] | undefined): string[] | undefined {
  if (!chips?.length) return undefined;
  return Array.from(new Set(chips.flatMap(id => MUSCLE_CHIPS.find(c => c.id === id)?.domains ?? [id])));
}

export function profileFor(s: Scenario) {
  const L = s.level;
  const domainLevels: Record<string, number> = { push: L, pull: L, legs: L, core: L };
  if (s.program === 'planche') domainLevels.planche = Math.max(1, Math.min(10, L - 9));
  const activePrograms = s.program === 'auto' ? [] : [{ id: s.program, name: s.program, level: L }];
  return buildMockProfile({ level: L, persona: '', injuries: [], domainLevels, coldStart: false, gear: LOC[s.loc].homeGear, activePrograms });
}

async function gearFor(s: Scenario, profile: ReturnType<typeof profileFor>): Promise<{ parkIds?: string[]; available: string[] }> {
  const loc = LOC[s.loc];
  if (loc.location === 'park') {
    const ids = await resolveParkEquipmentIds(profile, { selectedParkId: PARK_TYPICAL_ID });
    return { parkIds: ids.length ? ids : undefined, available: ids };
  }
  if (loc.location === 'home') return { available: loc.homeGear };
  return { available: [] }; // office: profile.equipment.office = []
}

export async function runScenario(s: Scenario): Promise<Run[]> {
  const profile = profileFor(s);
  const loc = LOC[s.loc];
  const { parkIds, available } = await gearFor(s, profile);
  const strict = s.entry === 'builder' || s.entry === 'ai' ? chipDomains(s.chips) : undefined;
  const ctx: HardContext = { location: loc.location, availableGear: available, strictDomains: strict, requestedMinutes: s.minutes };
  const scheduled = s.program === 'auto' ? undefined : [s.program];

  if (s.entry === 'trio') {
    const trio = await generateHomeWorkoutTrio({
      userProfile: profile, location: loc.location, testLocation: loc.location, availableTime: s.minutes,
      parkEquipmentIds: parkIds, scheduledProgramIds: scheduled, skipCycleRestart: true,
    } as Parameters<typeof generateHomeWorkoutTrio>[0]);
    // Automatic trio bolts are sized min(request, 30/45/60) by design (home-workout.service
    // BOLT_DURATION_CAPS + resolveEffectiveBoltTime) — H3 judges each bolt by ITS minutes.
    const TRIO_BOLT_CAP = [30, 45, 60];
    return trio.options.filter(o => o.result?.workout).map((o, i) => ({
      scenario: s, bolt: o.result.workout.difficulty ?? i + 1, workout: o.result.workout,
      ctx: { ...ctx, countMinutes: Math.min(s.minutes, TRIO_BOLT_CAP[i] ?? s.minutes) },
    }));
  }
  if (s.entry === 'builder') {
    const r = await generateHomeWorkout({
      userProfile: profile, testLocation: loc.location, availableTime: s.minutes, difficulty: s.difficulty, targetDifficulty: s.difficulty,
      intentMode: s.difficulty === 3 && s.minutes <= 20 ? 'blast' : undefined, scheduledProgramIds: scheduled,
      requiredDomains: strict, strictDomains: (strict?.length ?? 0) > 0, parkEquipmentIds: parkIds, isManualOverride: true,
    } as Parameters<typeof generateHomeWorkout>[0]);
    return [{ scenario: s, bolt: s.difficulty, workout: r.workout, ctx }];
  }
  if (s.entry === 'ai') {
    const input = { durationMin: s.minutes, location: loc.location, difficulty: s.difficulty, domains: strict ?? [], equipment: [] as string[] };
    const opts = buildGenerateOptions(input as Parameters<typeof buildGenerateOptions>[0], profile, {}, parkIds);
    const r = await generateHomeWorkout(opts);
    return [{ scenario: s, bolt: s.difficulty, workout: r.workout, ctx, meta: { aiInput: input } }];
  }
  // park machines
  const diff: ParkWorkoutDifficulty = s.difficulty === 1 ? 'easy' : s.difficulty === 2 ? 'medium' : 'hard';
  const park = { id: PARK_TYPICAL_ID } as Parameters<typeof composeParkWorkout>[0];
  const r = await composeParkWorkout(park, profile, { difficulty: diff, availableTime: s.minutes });
  // Machine pseudo-exercises carry no gear contract of their own (they ARE the park's machines).
  return [{ scenario: s, bolt: s.difficulty, workout: r.workout, ctx: { ...ctx, location: 'park-machines' }, meta: { machines: r.blockASelectedMachineCount } }];
}

// ── Matrices ────────────────────────────────────────────────────────────────

export const LEVELS = [1, 3, 6, 10, 15, 20];
export const LOCS: LocKey[] = ['home-nogear', 'home-bar-band', 'park-typical', 'office', 'street'];
export const MINUTES = [10, 15, 20, 30, 45, 60];
const PROGRAMS: Program[] = ['auto', 'full_body', 'upper_body', 'legs', 'core', 'planche'];
const CHIP_SETS: (string[] | undefined)[] = [undefined, ['abs'], ['chest', 'shoulders'], ['back'], ['quads', 'glutes'], ['chest', 'back'], ['upper_body'], ['lower_body']];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sid = (s: Omit<Scenario, 'id'>) =>
  `${s.entry}/L${s.level}/${s.loc}/${s.minutes}m/D${s.difficulty}/${s.program}${s.chips?.length ? `/chips:${s.chips.join('+')}` : ''}`;

/** Seeded sample of the full matrix (a few hundred scenarios), every axis value covered. */
export function fullMatrix(seed = 20261018, perEntry: Record<Entry, number> = { trio: 70, builder: 110, ai: 90, park: 24 }): Scenario[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[], i: number) => (i < xs.length ? xs[i] : xs[Math.floor(rnd() * xs.length)]);
  const out: Scenario[] = []; const seen = new Set<string>();
  for (const entry of Object.keys(perEntry) as Entry[]) {
    for (let i = 0; out.filter(s => s.entry === entry).length < perEntry[entry] && i < perEntry[entry] * 5; i++) {
      const base: Omit<Scenario, 'id'> = {
        entry,
        level: pick(LEVELS, i % 997),
        loc: entry === 'park' ? 'park-typical' : entry === 'ai' ? pick(LOCS.filter(l => l !== 'home-bar-band'), i % 991) : pick(LOCS, i % 983),
        minutes: entry === 'park' ? pick([15, 20, 30], i % 977) : pick(MINUTES, i % 971),
        difficulty: pick([1, 2, 3] as const as unknown as (1 | 2 | 3)[], i % 967),
        program: entry === 'ai' || entry === 'park' ? 'auto' : pick(PROGRAMS, i % 953),
        chips: entry === 'builder' || entry === 'ai' ? pick(CHIP_SETS, i % 947) : undefined,
      };
      // rotate axes so the first N cover every value, then sample
      if (i < 48) {
        base.level = LEVELS[i % LEVELS.length]; base.minutes = entry === 'park' ? [15, 20, 30][i % 3] : MINUTES[(i + Math.floor(i / 6)) % MINUTES.length];
      }
      const id = sid(base);
      if (seen.has(id)) continue;
      seen.add(id); out.push({ ...base, id });
    }
  }
  return out;
}

/**
 * The CI subset: 40 fixed scenarios over the hard invariants' risk surface —
 * no-gear home + office (gear truth), body-area chips via builder AND AI (focus),
 * 10/15-minute sessions (minimum count), low and top levels (level band).
 */
export function ciMatrix(): Scenario[] {
  const rows: Omit<Scenario, 'id'>[] = [];
  for (const level of [1, 6, 15]) for (const loc of ['home-nogear', 'home-bar-band', 'office'] as LocKey[]) {
    rows.push({ entry: 'trio', level, loc, minutes: 30, difficulty: 2, program: 'auto' });
  }
  for (const [chips, minutes, d] of [[['abs'], 15, 2], [['chest', 'shoulders'], 20, 2], [['back'], 30, 1], [['quads', 'glutes'], 10, 3], [['upper_body'], 45, 2], [['lower_body'], 15, 1]] as [string[], number, 1 | 2 | 3][]) {
    for (const level of [3, 10]) rows.push({ entry: 'builder', level, loc: 'home-nogear', minutes, difficulty: d, program: 'auto', chips });
  }
  for (const [chips, minutes, loc] of [[['abs'], 10, 'home-nogear'], [['abs'], 15, 'office'], [['chest'], 10, 'home-nogear'], [['quads'], 15, 'office'], [undefined, 10, 'home-nogear'], [undefined, 15, 'office'], [['back'], 20, 'park-typical'], [undefined, 30, 'park-typical']] as [string[] | undefined, number, LocKey][]) {
    rows.push({ entry: 'ai', level: 6, loc, minutes, difficulty: 2, program: 'auto', chips });
  }
  for (const level of [1, 20]) for (const minutes of [10, 15]) rows.push({ entry: 'builder', level, loc: 'home-nogear', minutes, difficulty: 2, program: 'auto' });
  for (const program of ['legs', 'core'] as Program[]) rows.push({ entry: 'trio', level: 10, loc: 'home-nogear', minutes: 20, difficulty: 2, program });
  rows.push({ entry: 'trio', level: 6, loc: 'street', minutes: 15, difficulty: 2, program: 'auto' });
  rows.push({ entry: 'builder', level: 6, loc: 'office', minutes: 10, difficulty: 2, program: 'auto' });
  rows.push({ entry: 'builder', level: 6, loc: 'park-typical', minutes: 15, difficulty: 2, program: 'auto', chips: ['chest'] });
  rows.push({ entry: 'park', level: 3, loc: 'park-typical', minutes: 20, difficulty: 1, program: 'auto' });
  rows.push({ entry: 'park', level: 10, loc: 'park-typical', minutes: 30, difficulty: 2, program: 'auto' });
  return rows.map(r => ({ ...r, id: sid(r) }));
}
