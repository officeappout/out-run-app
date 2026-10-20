/**
 * hybrid-counting — split ONE combined workout (route + strength stops, run/walk +
 * strength, full park workout with aerobic legs) into its per-category parts.
 *
 * Owner decision (20.10.2026, all users): a combined workout is COUNTED PER PART —
 * the running legs count as running (km, minutes, weekly run count), the walking
 * legs as walking, the stations as strength (sets, weekly domain counts). Every
 * writer (useHybridRun.finishHybrid) and reader (run count, done-today kinds,
 * progress tab, period totals) goes through these helpers so they can't drift.
 *
 * PURE: no React, no Firebase. Reads persisted `segments[]` defensively (works on
 * a fresh finalize result AND on a raw Firestore doc). Type-only imports.
 *
 * Rules:
 *  - Aerobic leg → its `aerobicType` bucket ('walking' → walk, anything else →
 *    run, or `defaultAerobic` when the leg has no type). Counted when it has an
 *    actual (the run clock only closes a leg on arrive / finish).
 *  - Strength station → counted when it has an actual and was NOT skipped
 *    ("דלג" time is not strength time).
 *  - Sets: per exercise, sets with a value > 0 (same rule as the v2 sequencer's
 *    countDoneSets). No log → the station's `actual.sets` (legacy docs).
 *  - Domain sets: the log entry's `domain` stamp, else the plan's exercise
 *    movementGroup → MG_TO_DOMAIN. Warm-up / cool-down / recovery entries count
 *    toward sets but never toward a training domain.
 */
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';

export interface AerobicPart {
  sec: number;
  km: number;
  legs: number;
}

export interface StrengthPart {
  sec: number;
  setsCompleted: number;
  setsPlanned: number;
  stations: number;
  domainSets: Record<string, number>;
  exerciseIds: string[];
}

export interface HybridParts {
  running: AerobicPart;
  walking: AerobicPart;
  strength: StrengthPart;
}

/** Minimal persisted-segment shape (SessionSegmentRecord, read defensively). */
interface SegLike {
  index?: unknown;
  kind?: unknown;
  aerobicType?: unknown;
  skipped?: unknown;
  planned?: { sets?: unknown } | null;
  actual?: {
    durationSec?: unknown;
    distanceKm?: unknown;
    sets?: unknown;
    exerciseLog?: unknown;
  } | null;
}

interface LogLike {
  exerciseId?: unknown;
  confirmedReps?: unknown;
  domain?: unknown;
  role?: unknown;
}

/** Minimal planned-segment shape (HybridPlannedSegment.content.exercises). */
export interface PlanSegLike {
  kind?: string;
  content?: {
    exercises?: ReadonlyArray<{
      exercise?: { id?: string; movementGroup?: string | null } | null;
      sets?: number;
      exerciseRole?: string;
    }>;
    totalPlannedSets?: number;
  } | null;
}

const NON_TRAINING_ROLES = new Set(['warmup', 'cooldown', 'recovery']);

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function emptyAerobic(): AerobicPart {
  return { sec: 0, km: 0, legs: 0 };
}

/** Sets actually done for one exercise log entry (values > 0). */
function doneSets(entry: LogLike): number {
  return Array.isArray(entry.confirmedReps)
    ? entry.confirmedReps.filter((v) => typeof v === 'number' && v > 0).length
    : 0;
}

/**
 * Sets to record for a finished station: the logged sets when a log exists,
 * else the planned count (legacy callers that pass no log).
 */
export function stationCompletedSets(log: ReadonlyArray<LogLike> | null | undefined, plannedSets: number): number {
  if (!log || log.length === 0) return Math.max(0, plannedSets || 0);
  return log.reduce((a, e) => a + doneSets(e), 0);
}

/** exerciseId → movementGroup over every strength stop of the plan. */
function movementGroupsOf(plan: ReadonlyArray<PlanSegLike> | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const seg of plan ?? []) {
    for (const we of seg?.content?.exercises ?? []) {
      const id = we?.exercise?.id;
      const mg = we?.exercise?.movementGroup;
      if (id && mg) out.set(id, mg);
    }
  }
  return out;
}

function addTo(map: Record<string, number>, key: string, n: number): void {
  if (n > 0) map[key] = (map[key] ?? 0) + n;
}

/**
 * Split a combined workout's segments into run / walk / strength parts.
 * `plan` (optional) = the planned segments, for domain fallback when a log entry
 * carries no domain stamp and for stations saved without a log.
 */
export function splitHybridWorkout(
  segments: unknown,
  plan?: ReadonlyArray<PlanSegLike> | null,
  defaultAerobic: 'running' | 'walking' = 'running',
): HybridParts {
  const running = emptyAerobic();
  const walking = emptyAerobic();
  const strength: StrengthPart = { sec: 0, setsCompleted: 0, setsPlanned: 0, stations: 0, domainSets: {}, exerciseIds: [] };
  const mgById = movementGroupsOf(plan);
  const ids = new Set<string>();

  const segs = Array.isArray(segments) ? (segments as SegLike[]) : [];
  for (const seg of segs) {
    if (!seg || !seg.actual) continue;
    if (seg.kind === 'aerobic') {
      const type = typeof seg.aerobicType === 'string' ? seg.aerobicType : defaultAerobic;
      if (type === 'cycling') continue; // never composed into a hybrid; not run or walk
      const bucket = type === 'walking' ? walking : running;
      bucket.sec += num(seg.actual.durationSec);
      bucket.km += num(seg.actual.distanceKm);
      bucket.legs += 1;
      continue;
    }
    if (seg.kind !== 'strength' || seg.skipped === true) continue;

    strength.stations += 1;
    strength.sec += num(seg.actual.durationSec);
    strength.setsPlanned += num(seg.planned?.sets);
    const log = Array.isArray(seg.actual.exerciseLog) ? (seg.actual.exerciseLog as LogLike[]) : [];

    if (log.length > 0) {
      for (const entry of log) {
        const n = doneSets(entry);
        if (n === 0) continue;
        strength.setsCompleted += n;
        const id = typeof entry.exerciseId === 'string' ? entry.exerciseId : '';
        if (id) ids.add(id);
        if (typeof entry.role === 'string' && NON_TRAINING_ROLES.has(entry.role)) continue;
        const stamped = typeof entry.domain === 'string' && entry.domain ? entry.domain : undefined;
        const domain = stamped ?? (id ? MG_TO_DOMAIN[mgById.get(id) ?? ''] : undefined);
        if (domain) addTo(strength.domainSets, domain, n);
      }
      continue;
    }

    // Legacy / no-log station: the recorded set count, domains from the plan stop.
    const sets = num(seg.actual.sets);
    strength.setsCompleted += sets;
    const idx = typeof seg.index === 'number' ? seg.index : -1;
    const planned = idx >= 0 ? plan?.[idx] : undefined;
    if (sets > 0 && planned?.kind === 'strength') {
      for (const we of planned.content?.exercises ?? []) {
        const id = we?.exercise?.id;
        if (id) ids.add(id);
        if (we?.exerciseRole && NON_TRAINING_ROLES.has(we.exerciseRole)) continue;
        const domain = MG_TO_DOMAIN[we?.exercise?.movementGroup ?? ''];
        if (domain) addTo(strength.domainSets, domain, num(we?.sets));
      }
    }
  }

  running.km = Number(running.km.toFixed(3));
  walking.km = Number(walking.km.toFixed(3));
  strength.exerciseIds = Array.from(ids);
  return { running, walking, strength };
}

/** Whole-minute view of the parts — what dailyActivity / period totals record. */
export interface HybridPartMinutes {
  runMinutes: number;
  runKm: number;
  walkMinutes: number;
  walkKm: number;
  strengthMinutes: number;
  strengthSets: number;
}

export function hybridPartMinutes(parts: HybridParts): HybridPartMinutes {
  return {
    runMinutes: Math.round(parts.running.sec / 60),
    runKm: parts.running.km,
    walkMinutes: Math.round(parts.walking.sec / 60),
    walkKm: parts.walking.km,
    strengthMinutes: Math.round(parts.strength.sec / 60),
    strengthSets: parts.strength.setsCompleted,
  };
}

/** Which activity kinds a saved workout doc contains (solo or combined). */
export type DoneKind = 'run' | 'walk' | 'strength';

interface DocLike {
  workoutType?: string | null;
  activityType?: string | null;
  segments?: unknown;
}

export function isHybridDoc(doc: DocLike | null | undefined): boolean {
  if (!doc) return false;
  return doc.workoutType === 'hybrid' || doc.activityType === 'hybrid';
}

/**
 * Kinds in one workout doc. A combined doc → the kinds of the parts it actually
 * has (a run leg → 'run', a walk leg → 'walk', a done station → 'strength').
 * A combined doc with no segments (very old) → its historical label: strength +
 * run when activityType says 'running', else strength + walk. (Real hybrid docs
 * carry activityType 'hybrid', so their leg types decide.)
 */
export function doneKindsOfDoc(doc: DocLike | null | undefined): DoneKind[] {
  if (!doc) return [];
  if (isHybridDoc(doc)) {
    if (!Array.isArray(doc.segments) || doc.segments.length === 0) {
      return [doc.activityType === 'running' ? 'run' : 'walk', 'strength'];
    }
    const p = splitHybridWorkout(doc.segments);
    const out: DoneKind[] = [];
    if (p.running.legs > 0 && (p.running.km > 0 || p.running.sec > 0)) out.push('run');
    if (p.walking.legs > 0 && (p.walking.km > 0 || p.walking.sec > 0)) out.push('walk');
    if (p.strength.stations > 0) out.push('strength');
    return out;
  }
  const t = doc.workoutType || doc.activityType || '';
  if (t === 'walking') return ['walk'];
  if (t === 'running') return ['run'];
  if (t === 'strength' || t === 'workout') return ['strength'];
  return [];
}
