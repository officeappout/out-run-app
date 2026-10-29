// i18n-exempt: Hebrew here is exercise-name matching data, not UI copy
/**
 * density-block — the EMOM / AMRAP block of a strength session (owner 28.10.2026,
 * training-audit PR 6). Pure.
 *
 * Before: when the protocol lottery picked EMOM, the WHOLE main part became one
 * timed block (holds and skill work included, up to 20 min). Now the heavy / skill
 * work stays as classic sets and a separate short block is added after it, built
 * from easy dynamic rep exercises:
 *   - dynamic reps only: no holds, eccentrics, partial range, band-assisted, skills;
 *   - at least 2 levels below the user's level in that domain (2-3 in one-domain sessions);
 *   - several domains: 3-5 exercises, 8-12 min, EMOM or AMRAP;
 *   - one domain: EMOM only (AMRAP fatigues one muscle group too fast), one exercise
 *     or two alternating, 8-10 min, ~60% of the usual reps but at least 5 a minute;
 *   - an EMOM set must fit in 40 s (rest until the next minute);
 *   - full pull-ups enter an AMRAP only from pull level 14 (rows / easier variants below).
 * Too few eligible exercises → no block (the caller keeps classic sets).
 */
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise } from '../workout-generator.types';
import { isTimeBasedExercise } from '../workout-budgeting.utils';
import { MG_TO_DOMAIN } from '../../shared/constants/domain-mapping.constants';
import { resolveToSlug } from '../../services/program-hierarchy.utils';

export type DensityFormat = 'emom' | 'amrap';
export type DensityDomain = 'push' | 'pull' | 'legs' | 'core';

export interface DensityBlockSpec {
  format: DensityFormat;
  minutes: number;
  /** exercise.id of each member — the plan mappers split these into their own segment. */
  exerciseIds: string[];
  singleDomain: boolean;
}

export const DENSITY_DOMAINS: readonly DensityDomain[] = ['push', 'pull', 'legs', 'core'];
export const DENSITY_MIN_LEVEL_GAP = 2;
export const DENSITY_SINGLE_MAX_LEVEL_GAP = 3;
export const DENSITY_MULTI_MEMBERS = { min: 3, max: 5 } as const;
export const DENSITY_MINUTES = { multi: { min: 8, max: 12 }, single: { min: 8, max: 10 } } as const;
export const EMOM_SET_CAP_SEC = 40;
export const AMRAP_PULL_UP_MIN_LEVEL = 14;

/** Name fragments that mark a non-dynamic or skill exercise (the corpus has no reliable tag). */
const EXCLUDED_NAME_PARTS = [
  'החזק', 'אקצנטרי', 'טווח חלקי', 'טווח עליון', 'טווח תחתון', 'גומי', 'סטטי',
  'פלאנץ', 'פרונט', 'בק לבר', 'עמידת ידיים', 'עמידת פייק', 'הליכות קיר', 'דגל', 'יד אחת', 'דרגון פלאג', 'עליית כוח', 'סקין דה קאט',
];
const EXPLOSIVE_NAME_PART = 'מתפרץ';

const nameOf = (ex: Exercise) => getLocalizedText(ex.name) ?? '';

/** The exercise's foundational domain, or null (skill movement groups / unknown). */
export function densityDomainOf(ex: Exercise): DensityDomain | null {
  const d = MG_TO_DOMAIN[ex.movementGroup ?? ''];
  return (DENSITY_DOMAINS as readonly string[]).includes(d) ? (d as DensityDomain) : null;
}

/** Level of the exercise in its own domain program, or null when it is not tagged there. */
export function densityLevelOf(ex: Exercise, domain: DensityDomain): number | null {
  const tp = (ex.targetPrograms ?? []).find((t) => t.programId === domain || resolveToSlug(t.programId) === domain);
  return typeof tp?.level === 'number' ? tp.level : null;
}

const isPullUp = (name: string) => name.startsWith('מתח') && !name.includes('אוסטרלי');

/** Dynamic rep exercise allowed in a density block of this format (level not checked here). */
export function isDensityEligible(ex: Exercise, format: DensityFormat): boolean {
  if (ex.isFollowAlong || isTimeBasedExercise(ex)) return false;
  const name = nameOf(ex);
  if (EXCLUDED_NAME_PARTS.some((p) => name.includes(p))) return false;
  // 'שלילי' = a negative (eccentric) rep, except 'שיפוע שלילי' (decline push-ups, dynamic).
  if (name.replace('שיפוע שלילי', '').includes('שלילי')) return false;
  if (format === 'amrap' && name.includes(EXPLOSIVE_NAME_PART)) return false;
  return true;
}

/**
 * Reps by how far below the user the exercise sits (the scenario-sheet rule, 28.10):
 * gap ≥5 → 40, 3-4 → 25, 2 → 15 base; × format share (EMOM 0.35, AMRAP 0.4),
 * × 0.6 in one-domain sessions, × 0.7 per side for unilateral moves; an EMOM set
 * is capped to fit EMOM_SET_CAP_SEC. Never below 3 (5 in a one-domain EMOM).
 */
export function densityReps(
  ex: Pick<Exercise, 'symmetry' | 'secondsPerRep'>,
  gap: number,
  format: DensityFormat,
  singleDomain: boolean,
): number {
  const base = gap >= 5 ? 40 : gap >= 3 ? 25 : 15;
  let r = base * (format === 'emom' ? 0.35 : 0.4);
  if (singleDomain) r *= 0.6;
  if (ex.symmetry === 'unilateral') r *= 0.7;
  if (format === 'emom') r = Math.min(r, EMOM_SET_CAP_SEC / (ex.secondsPerRep && ex.secondsPerRep > 0 ? ex.secondsPerRep : 3));
  const rounded = r >= 20 ? Math.round(r / 5) * 5 : Math.round(r);
  // One-domain EMOM: at least 5 reps a minute (owner 29.10.2026).
  return Math.max(singleDomain && format === 'emom' ? 5 : 3, rounded);
}

export interface DensityCandidate {
  exercise: Exercise;
  method: ExecutionMethod;
}

export interface DensityBuildInput {
  format: DensityFormat;
  /** Domains of the session's main exercises (push / pull / legs / core). */
  sessionDomains: DensityDomain[];
  /** User level per domain slug. */
  domainLevels: (domain: DensityDomain) => number;
  /** Session-valid candidates (location / gear / injuries already applied). */
  pool: DensityCandidate[];
  /** Minutes left for the block (available time − classic part). */
  headroomMinutes: number;
  /** Exercises already in the session (never repeated). */
  excludeIds: Set<string>;
  rand?: () => number;
}

export interface DensityBuildResult {
  spec: DensityBlockSpec;
  members: WorkoutExercise[];
}

/** One domain (ignoring core when a strength domain is present) → single-domain rules. */
export function isSingleDomainSession(domains: DensityDomain[]): boolean {
  const strength = new Set(domains.filter((d) => d !== 'core'));
  return strength.size <= 1;
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** EMOM minutes are whole rotations of the members; AMRAP takes the headroom as is. */
function blockMinutes(format: DensityFormat, members: number, single: boolean, headroom: number): number | null {
  const { min, max } = single ? DENSITY_MINUTES.single : DENSITY_MINUTES.multi;
  const cap = Math.min(max, Math.floor(headroom));
  if (cap < min) return null;
  if (format === 'amrap') return cap;
  for (let m = cap; m >= min; m--) if (m % members === 0) return m;
  return null;
}

/** The block, or null (too few eligible exercises / not enough time). */
export function buildDensityBlock(input: DensityBuildInput): DensityBuildResult | null {
  const rand = input.rand ?? Math.random;
  const single = isSingleDomainSession(input.sessionDomains);
  const format: DensityFormat = single ? 'emom' : input.format;
  const strength = input.sessionDomains.filter((d) => d !== 'core');
  const domains = single ? [strength[0] ?? 'core'] : Array.from(new Set(input.sessionDomains));
  const maxGap = single ? DENSITY_SINGLE_MAX_LEVEL_GAP : Infinity;

  const byDomain = new Map<DensityDomain, Array<DensityCandidate & { gap: number }>>();
  const seen = new Set<string>();
  for (const c of input.pool) {
    const ex = c.exercise;
    if (input.excludeIds.has(ex.id) || seen.has(ex.id)) continue;
    const domain = densityDomainOf(ex);
    if (!domain || !domains.includes(domain) || !isDensityEligible(ex, format)) continue;
    const level = densityLevelOf(ex, domain);
    if (level == null) continue;
    const userLevel = input.domainLevels(domain);
    const gap = userLevel - level;
    if (gap < DENSITY_MIN_LEVEL_GAP || gap > maxGap) continue;
    if (format === 'amrap' && domain === 'pull' && userLevel < AMRAP_PULL_UP_MIN_LEVEL && isPullUp(nameOf(ex))) continue;
    seen.add(ex.id);
    const list = byDomain.get(domain) ?? [];
    list.push({ ...c, gap });
    byDomain.set(domain, list);
  }
  byDomain.forEach((list, d) => byDomain.set(d, shuffle(list, rand)));

  const picked: Array<DensityCandidate & { gap: number }> = [];
  if (single) {
    const list = byDomain.get(domains[0]) ?? [];
    if (list.length === 0) return null;
    picked.push(...list.slice(0, list.length >= 2 && rand() < 0.5 ? 2 : 1));
  } else {
    const order = shuffle(domains, rand);
    for (let round = 0; picked.length < DENSITY_MULTI_MEMBERS.max; round++) {
      let added = false;
      for (const d of order) {
        const next = byDomain.get(d)?.[round];
        if (next && picked.length < DENSITY_MULTI_MEMBERS.max) { picked.push(next); added = true; }
      }
      if (!added) break;
    }
    if (picked.length < DENSITY_MULTI_MEMBERS.min) return null;
  }

  // Trim members until an EMOM rotation fits the minutes window (multi only).
  let minutes = blockMinutes(format, picked.length, single, input.headroomMinutes);
  while (minutes == null && !single && picked.length > DENSITY_MULTI_MEMBERS.min) {
    picked.pop();
    minutes = blockMinutes(format, picked.length, single, input.headroomMinutes);
  }
  if (minutes == null) return null;

  const members: WorkoutExercise[] = picked.map(({ exercise: ex, method, gap }) => ({
    exercise: ex,
    method,
    mechanicalType: ex.mechanicalType ?? 'none',
    sets: 1,
    reps: densityReps(ex, gap, format, single),
    isTimeBased: false,
    restSeconds: 0,
    priority: 'compound',
    score: 0,
    reasoning: [`density_block:${format}`, `level_gap:${gap}`],
    exerciseRole: 'main',
    tier: 'match',
    protocolBlock: 'density',
  } as WorkoutExercise));

  return {
    spec: { format, minutes, exerciseIds: members.map((m) => m.exercise.id), singleDomain: single },
    members,
  };
}

/** Split a segment's exercises into block members vs the classic rest (mapper side). */
export function partitionByDensityBlock<T extends { id: string }>(
  exercises: T[],
  block: DensityBlockSpec | undefined | null,
): { density: T[]; rest: T[] } {
  if (!block?.exerciseIds?.length) return { density: [], rest: exercises };
  const ids = new Set(block.exerciseIds);
  const density = exercises.filter((e) => ids.has(e.id));
  if (density.length === 0) return { density: [], rest: exercises };
  return { density, rest: exercises.filter((e) => !ids.has(e.id)) };
}
