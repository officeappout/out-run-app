/**
 * progression.service — shared progression writer.
 *
 * The single authoritative module that mutates game-integrity fields on
 * `users/{uid}.progression`. Both `awardWorkoutXP` (active door, manual /
 * GPS workouts) and `ingestHealthSamples` (passive door, sensor data)
 * call into this service. No other code path is permitted to touch
 * `progression.globalXP / globalLevel / coins / totalCaloriesBurned`.
 *
 * Defense in depth
 * ────────────────
 * 1. Firestore Security Rules block direct client writes
 *    (firestore.rules → noGameIntegrityFieldsChanged()).
 * 2. Both callables enforce App Check + auth.
 * 3. `applyAward` clamps every delta to a per-call cap.
 * 4. `applyAward` recomputes globalLevel server-side from the canonical
 *    threshold table; the caller cannot forge a level value.
 * 5. The passive door MUST pass `awardCoins: false`; this service
 *    silently zeros `coinsDelta` when the flag is false even if the
 *    caller mistakenly passed a positive value.
 *
 * NOTE on per-program (Strength) XP
 * ─────────────────────────────────
 * This service intentionally only writes the *global* progression fields.
 * Per-program (Strength) XP/level fields are NEVER touched here. Strength
 * progression remains strictly tied to manual workout completion and is
 * mutated elsewhere by the strength engine, not by passive sensor data.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ────────────────────────────────────────────────────────────────────────────
// Anti-cheat caps — server clamps every delta to these maxima.
// Tuned generously so legitimate workouts always succeed; tight enough that
// a forged "give me 1M XP" call is rejected on its face.
// ────────────────────────────────────────────────────────────────────────────
export const MAX_XP_PER_CALL = 2_000;        //  ~ a 5h elite cardio session capped
export const MAX_COINS_PER_CALL = 5_000;     //  ~ a 5h workout @ 1 cal = 1 coin
export const MAX_CALORIES_PER_CALL = 5_000;  //  same as coins
export const MAX_SOURCE_LEN = 64;

// ────────────────────────────────────────────────────────────────────────────
// Mirror of GLOBAL_LEVEL_THRESHOLDS from
// src/features/user/progression/config/xp-rules.ts
//
// Keep in sync if the client constants change. The admin tooling can
// override these via Firestore (`levels` collection) for display, but
// the Guardian uses this fallback table for level computation so the
// authoritative server value is deterministic.
// ────────────────────────────────────────────────────────────────────────────
export const GLOBAL_LEVEL_THRESHOLDS: ReadonlyArray<{ level: number; minXP: number }> = [
  { level: 1,  minXP: 0 },
  { level: 2,  minXP: 300 },
  { level: 3,  minXP: 800 },
  { level: 4,  minXP: 2_000 },
  { level: 5,  minXP: 5_000 },
  { level: 6,  minXP: 11_000 },
  { level: 7,  minXP: 22_000 },
  { level: 8,  minXP: 40_000 },
  { level: 9,  minXP: 65_000 },
  { level: 10, minXP: 100_000 },
];

export interface AwardDeltas {
  /** XP to add. Optional — pass 0/omit if only awarding coins/calories. */
  xpDelta?: number;
  /** Coins to add (1 cal ≈ 1 coin). Ignored when opts.awardCoins === false. */
  coinsDelta?: number;
  /** Calories burned to add. */
  caloriesDelta?: number;
}

export interface ApplyAwardOptions {
  /**
   * When false, coinsDelta is forced to 0 regardless of the caller's value.
   * The passive sensor door (`ingestHealthSamples`) must pass false so that
   * step counts can never accidentally award coins. Default: true.
   */
  awardCoins?: boolean;
}

export interface AwardResult {
  ok: true;
  xpDelta: number;
  coinsDelta: number;
  caloriesDelta: number;
  newGlobalXP: number;
  newGlobalLevel: number;
  leveledUp: boolean;
  noop?: boolean;
}

export function sanitizeDelta(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), max);
}

export function computeGlobalLevel(totalXP: number): number {
  let level = 1;
  for (const t of GLOBAL_LEVEL_THRESHOLDS) {
    if (totalXP >= t.minXP) level = t.level;
  }
  return level;
}

export function sanitizeSource(source: unknown): string {
  return (typeof source === 'string' ? source : 'unknown').slice(0, MAX_SOURCE_LEN);
}

/**
 * Apply an XP / coins / calories award to `users/{uid}.progression`.
 *
 * Pure server-side function. Throws nothing — returns a result object
 * with `noop: true` when all deltas resolve to zero. Callers (callables,
 * triggers) handle HTTPS-level errors above this layer.
 *
 * @returns AwardResult with the post-write state.
 * @throws  Error('user-not-found') if the user doc does not exist.
 */
export async function applyAward(
  uid: string,
  deltas: AwardDeltas,
  source: string,
  opts: ApplyAwardOptions = {},
): Promise<AwardResult> {
  const awardCoins = opts.awardCoins !== false; // default true

  const xpDelta = sanitizeDelta(deltas.xpDelta, MAX_XP_PER_CALL);
  const coinsDelta = awardCoins
    ? sanitizeDelta(deltas.coinsDelta, MAX_COINS_PER_CALL)
    : 0;
  const caloriesDelta = sanitizeDelta(deltas.caloriesDelta, MAX_CALORIES_PER_CALL);
  const cleanSource = sanitizeSource(source);

  if (xpDelta === 0 && coinsDelta === 0 && caloriesDelta === 0) {
    logger.info(`[applyAward] noop call from ${uid} (source=${cleanSource})`);
    return {
      ok: true,
      noop: true,
      xpDelta: 0,
      coinsDelta: 0,
      caloriesDelta: 0,
      newGlobalXP: 0,
      newGlobalLevel: 1,
      leveledUp: false,
    };
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    logger.warn(`[applyAward] User doc missing for ${uid}`);
    throw new Error('user-not-found');
  }

  const progression = (snap.data()?.progression ?? {}) as {
    globalXP?: number;
    globalLevel?: number;
  };
  const currentXP = Number(progression.globalXP ?? 0);
  const currentLevel = Number(progression.globalLevel ?? 1);
  const newXP = currentXP + xpDelta;
  const newLevel = computeGlobalLevel(newXP);
  const leveledUp = newLevel > currentLevel;

  const updates: Record<string, unknown> = {
    'progression.lastAwardSource': cleanSource,
    'progression.lastAwardAt': admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (xpDelta > 0) {
    updates['progression.globalXP'] = admin.firestore.FieldValue.increment(xpDelta);
    updates['progression.globalLevel'] = newLevel;
  }
  if (coinsDelta > 0) {
    updates['progression.coins'] = admin.firestore.FieldValue.increment(coinsDelta);
  }
  if (caloriesDelta > 0) {
    updates['progression.totalCaloriesBurned'] =
      admin.firestore.FieldValue.increment(caloriesDelta);
  }

  await userRef.update(updates);

  logger.info(
    `[applyAward] ${uid} +${xpDelta}XP +${coinsDelta}c +${caloriesDelta}cal ` +
    `→ XP=${newXP} L${newLevel}${leveledUp ? ' (LEVEL UP!)' : ''} src=${cleanSource}`,
  );

  return {
    ok: true,
    xpDelta,
    coinsDelta,
    caloriesDelta,
    newGlobalXP: newXP,
    newGlobalLevel: newLevel,
    leveledUp,
  };
}
