/**
 * awardWorkoutXP — "The Guardian" (Active Door)
 *
 * Sole authorized writer of game-integrity fields on `users/{uid}.progression`
 * for the ACTIVE path (manual / GPS workouts):
 *   • progression.coins
 *   • progression.globalXP
 *   • progression.globalLevel
 *   • progression.totalCaloriesBurned
 *
 * Firestore Security Rules block direct client writes to those fields
 * (see firestore.rules → noGameIntegrityFieldsChanged()). The browser must
 * therefore call this callable, which runs on a privileged server context
 * via the Admin SDK and bypasses those rules.
 *
 * Implementation note (Native Phase refactor)
 * ───────────────────────────────────────────
 * The actual write logic lives in `services/progression.service.ts` so the
 * passive sensor door (`ingestHealthSamples`) can reuse it with
 * `awardCoins: false`. This callable's external surface (request shape,
 * response shape, region, App Check enforcement) is byte-identical to
 * pre-refactor — the body simply delegates to `applyAward`.
 *
 * Region
 * ──────
 * Pinned to us-central1 to match validateAccessCode (and the client SDK
 * default), so callers don't need to specify a region.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { applyAward, sanitizeSource } from './services/progression.service';

interface AwardPayload {
  /** XP to add. Optional — pass 0/omit if only awarding coins/calories. */
  xpDelta?: number;
  /** Coins to add (1 cal ≈ 1 coin). */
  coinsDelta?: number;
  /** Calories burned to add. */
  caloriesDelta?: number;
  /** Free-text label (e.g. 'workout:strength', 'goal-bonus', 'park-contribution'). */
  source: string;
}

interface AwardResult {
  ok: true;
  xpDelta: number;
  coinsDelta: number;
  caloriesDelta: number;
  newGlobalXP: number;
  newGlobalLevel: number;
  leveledUp: boolean;
  noop?: boolean;
}

export const awardWorkoutXP = onCall<AwardPayload, Promise<AwardResult>>(
  {
    cors: true,
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    // App Check enforcement (Ashkelon Req. 22.1) — every browser call must
    // present a valid App Check token (reCAPTCHA Enterprise in prod;
    // debug token for local dev). Direct curl/automation is rejected.
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      logger.warn('[awardWorkoutXP] Rejected: no auth context');
      throw new HttpsError('unauthenticated', 'Must be signed in to record workout rewards.');
    }

    const uid = request.auth.uid;
    const data = request.data || ({} as AwardPayload);
    const source = sanitizeSource(data.source);

    try {
      const result = await applyAward(
        uid,
        {
          xpDelta: data.xpDelta,
          coinsDelta: data.coinsDelta,
          caloriesDelta: data.caloriesDelta,
        },
        source,
        { awardCoins: true },
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'user-not-found') {
        throw new HttpsError('not-found', 'User profile not found.');
      }
      logger.error('[awardWorkoutXP] applyAward failed', err);
      throw new HttpsError('internal', 'Failed to award progression.');
    }
  },
);
