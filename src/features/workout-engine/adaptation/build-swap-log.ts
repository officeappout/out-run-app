/**
 * buildExerciseSwapPayload — the PURE half of logExerciseSwap: turns the
 * caller's loosely-typed context into exactly the exercise_swaps doc shape
 * firestore.rules accepts (whitelisted keys, enum-checked values, finite
 * numbers, bounded strings, NO undefined/null keys). `at` is NOT set here —
 * the writer adds serverTimestamp() (the rule requires at == request.time).
 */
import {
  SWAP_DIRECTIONS,
  SWAP_FLOWS,
  SWAP_REASONS,
  SWAP_SOURCES,
  SWAP_TABS,
  type SwapDirection,
  type SwapFlow,
  type SwapReason,
  type SwapSource,
  type SwapTab,
} from './adaptation.types';

export interface ExerciseSwapInput {
  userId: string;
  sessionClientId?: string | null;
  fromExerciseId: string;
  fromName?: string | null;
  toExerciseId: string;
  toName?: string | null;
  domain?: string | null;
  fromLevel?: number | null;
  toLevel?: number | null;
  userDomainLevel?: number | null;
  /** Modal's levelComparison. Derived from from/to level when omitted. */
  direction?: SwapDirection | null;
  tab?: SwapTab | null;
  source: SwapSource;
  flow?: SwapFlow | null;
  userInitiated: boolean;
  location?: string | null;
  parkId?: string | null;
  segmentRole?: string | null;
  setsDoneBefore?: number | null;
  lastSetReps?: number | null;
  rangeMin?: number | null;
  reason?: SwapReason | null;
  appVersion?: string | null;
}

export type ExerciseSwapPayload = Record<string, string | number | boolean>;

/** Max length of any free string field — mirrored by firestore.rules' size() checks. */
export const SWAP_STRING_MAX = 120;
export const SWAP_ID_MAX = 128;

function str(v: unknown, max = SWAP_STRING_MAX): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

function num(v: unknown, min = 0, max = 10_000): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (v < min || v > max) return undefined;
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** lower / same / higher from two levels; undefined when either is unknown. */
export function directionFromLevels(
  fromLevel: number | null | undefined,
  toLevel: number | null | undefined,
): SwapDirection | undefined {
  if (typeof fromLevel !== 'number' || typeof toLevel !== 'number') return undefined;
  if (!Number.isFinite(fromLevel) || !Number.isFinite(toLevel)) return undefined;
  if (toLevel < fromLevel) return 'lower';
  if (toLevel > fromLevel) return 'higher';
  return 'same';
}

/**
 * Returns null when the swap is not loggable (no user, no ids, or a no-op
 * "swap" to the same exercise) — callers simply skip the write.
 */
export function buildExerciseSwapPayload(input: ExerciseSwapInput): ExerciseSwapPayload | null {
  const userId = str(input.userId, SWAP_ID_MAX);
  const fromExerciseId = str(input.fromExerciseId, SWAP_ID_MAX);
  const toExerciseId = str(input.toExerciseId, SWAP_ID_MAX);
  const source = oneOf(input.source, SWAP_SOURCES);
  if (!userId || !fromExerciseId || !toExerciseId || !source) return null;
  if (fromExerciseId === toExerciseId) return null;

  const fromLevel = num(input.fromLevel, 0, 100);
  const toLevel = num(input.toLevel, 0, 100);
  const direction = oneOf(input.direction, SWAP_DIRECTIONS) ?? directionFromLevels(fromLevel, toLevel);

  const out: ExerciseSwapPayload = {
    userId,
    fromExerciseId,
    toExerciseId,
    source,
    userInitiated: input.userInitiated === true,
  };
  const optional: Record<string, string | number | undefined> = {
    sessionClientId: str(input.sessionClientId, SWAP_ID_MAX),
    fromName: str(input.fromName),
    toName: str(input.toName),
    domain: str(input.domain, 40),
    fromLevel,
    toLevel,
    userDomainLevel: num(input.userDomainLevel, 0, 100),
    direction,
    tab: oneOf(input.tab, SWAP_TABS),
    flow: oneOf(input.flow, SWAP_FLOWS),
    location: str(input.location, 40),
    parkId: str(input.parkId, SWAP_ID_MAX),
    segmentRole: str(input.segmentRole, 40),
    setsDoneBefore: num(input.setsDoneBefore, 0, 100),
    lastSetReps: num(input.lastSetReps, 0, 10_000),
    rangeMin: num(input.rangeMin, 0, 10_000),
    reason: oneOf(input.reason, SWAP_REASONS),
    appVersion: str(input.appVersion, 40),
  };
  for (const [k, v] of Object.entries(optional)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Best-effort build identifier (no app-version constant exists in this repo). */
export function resolveAppVersion(): string | undefined {
  // Literal process.env.NEXT_PUBLIC_* references — Next inlines only these
  // exact expressions into the client bundle. Both unset → field omitted.
  const explicit = process.env.NEXT_PUBLIC_APP_VERSION;
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return explicit || (sha ? sha.slice(0, 7) : undefined);
}
