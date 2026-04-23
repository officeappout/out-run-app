/**
 * ingestHealthSamples — "The Passive Door"
 *
 * Server-side ingestion of HealthKit / Health Connect samples sent from
 * the native Capacitor wrapper (iOS + Android). This is the ONLY callable
 * authorized to write the `passive*` fields on `dailyActivity` and to
 * mutate `users/{uid}.progression.globalXP` from sensor data.
 *
 * Native Phase rules (locked by David):
 *   • Passive data grants ONLY Global XP (Lemur rank). NEVER coins.
 *     NEVER per-program (Strength) XP.
 *   • Passive `activeMinutes` feed the existing `categories.cardio.minutes`
 *     bucket on `dailyActivity`, so they roll up automatically into the
 *     "Aerobic Activity Minutes" total used by `WHO_COMPLIANCE_BASELINE`.
 *   • Daily cap of 200 XP per user enforced via
 *     `dailyActivity.passiveXpAwardedToday` (see services/passive-xp.ts).
 *
 * Idempotency
 * ───────────
 * Each sample carries a stable `sampleUUID` from the HealthKit /
 * Health Connect record. We dedupe by checking `healthSamples/{uid}/{date}/{sampleUUID}`
 * existence before counting it. The native outbox retries on failure;
 * dedupe makes those retries safe.
 *
 * Anti-cheat clamps
 * ─────────────────
 * Per-day totals are clamped:
 *   steps          ≤ 100,000
 *   activeCalories ≤ 10,000
 *   exerciseTime   ≤ 1,440 minutes
 * Per-call payload size: ≤ 500 samples.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { applyAward } from './services/progression.service';
import {
  computePassiveXpDelta,
  DAILY_PASSIVE_XP_CAP,
} from './services/passive-xp';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ────────────────────────────────────────────────────────────────────────────
// Per-day clamps. The ingest function refuses to add anything beyond these
// values (delta is silently truncated). Tuned to be larger than any plausibly
// real day so legitimate users never hit them.
// ────────────────────────────────────────────────────────────────────────────
const MAX_STEPS_PER_DAY = 100_000;
const MAX_CALORIES_PER_DAY = 10_000;
const MAX_ACTIVE_MINUTES_PER_DAY = 1_440;
const MAX_SAMPLES_PER_CALL = 500;
const MAX_DEVICE_MODEL_LEN = 64;

type SampleType = 'steps' | 'activeEnergy' | 'exerciseTime';
type SampleSource = 'healthkit' | 'healthconnect';

interface HealthSamplePayload {
  /** Stable UUID from HealthKit/HealthConnect — used for dedupe. */
  sampleUUID: string;
  type: SampleType;
  /** Numeric value in the unit appropriate to `type`:
   *    steps          → count
   *    activeEnergy   → kcal
   *    exerciseTime   → minutes */
  value: number;
  /** ISO timestamp string. */
  startDate: string;
  /** ISO timestamp string. */
  endDate: string;
  source: SampleSource;
  /** Free-text device model (e.g. 'iPhone15,2', 'Pixel 8'). Truncated server-side. */
  deviceModel?: string;
}

interface IngestPayload {
  /** Local date the samples belong to, in YYYY-MM-DD format (user's local TZ). */
  date: string;
  samples: HealthSamplePayload[];
}

interface IngestResult {
  ok: true;
  accepted: number;
  deduped: number;
  rejected: number;
  /** XP awarded by this call (after the daily cap). */
  xpAwarded: number;
  /** True if the user has hit DAILY_PASSIVE_XP_CAP for this date. */
  capReached: boolean;
  /** Total XP awarded today via the passive door (post this call). */
  passiveXpAwardedToday: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s: unknown): s is string {
  return typeof s === 'string' && ISO_DATE_RE.test(s);
}

function isValidSample(raw: unknown): raw is HealthSamplePayload {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Partial<HealthSamplePayload>;
  if (typeof s.sampleUUID !== 'string' || s.sampleUUID.length === 0 || s.sampleUUID.length > 128) return false;
  if (s.type !== 'steps' && s.type !== 'activeEnergy' && s.type !== 'exerciseTime') return false;
  if (typeof s.value !== 'number' || !Number.isFinite(s.value) || s.value < 0) return false;
  if (typeof s.startDate !== 'string' || typeof s.endDate !== 'string') return false;
  if (s.source !== 'healthkit' && s.source !== 'healthconnect') return false;
  return true;
}

function clampDelta(currentValue: number, addition: number, maxTotal: number): number {
  const remaining = Math.max(0, maxTotal - Math.max(0, currentValue));
  return Math.min(Math.max(0, addition), remaining);
}

export const ingestHealthSamples = onCall<IngestPayload, Promise<IngestResult>>(
  {
    cors: true,
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      logger.warn('[ingestHealthSamples] Rejected: no auth context');
      throw new HttpsError('unauthenticated', 'Must be signed in to sync health data.');
    }

    const uid = request.auth.uid;
    const data = request.data || ({} as IngestPayload);

    if (!isValidIsoDate(data.date)) {
      throw new HttpsError('invalid-argument', 'date must be YYYY-MM-DD.');
    }
    if (!Array.isArray(data.samples) || data.samples.length === 0) {
      throw new HttpsError('invalid-argument', 'samples must be a non-empty array.');
    }
    if (data.samples.length > MAX_SAMPLES_PER_CALL) {
      throw new HttpsError(
        'invalid-argument',
        `Too many samples (${data.samples.length}). Max ${MAX_SAMPLES_PER_CALL} per call.`,
      );
    }

    const date = data.date;
    const dailyDocId = `${uid}_${date}`;
    const dailyRef = db.collection('dailyActivity').doc(dailyDocId);
    const samplesCol = db
      .collection('healthSamples')
      .doc(uid)
      .collection(date);

    // ──────────────────────────────────────────────────────────────────
    // Step 1: Validate payload shape, normalize, and split valid/rejected.
    // ──────────────────────────────────────────────────────────────────
    const validSamples: HealthSamplePayload[] = [];
    let rejected = 0;
    for (const raw of data.samples) {
      if (isValidSample(raw)) {
        validSamples.push({
          ...raw,
          deviceModel: typeof raw.deviceModel === 'string'
            ? raw.deviceModel.slice(0, MAX_DEVICE_MODEL_LEN)
            : undefined,
        });
      } else {
        rejected++;
      }
    }
    if (validSamples.length === 0) {
      logger.info(`[ingestHealthSamples] ${uid} all ${rejected} samples rejected as invalid`);
      return {
        ok: true,
        accepted: 0,
        deduped: 0,
        rejected,
        xpAwarded: 0,
        capReached: false,
        passiveXpAwardedToday: 0,
      };
    }

    // ──────────────────────────────────────────────────────────────────
    // Step 2: Dedupe vs already-stored samples (parallel existence check).
    // ──────────────────────────────────────────────────────────────────
    const existing = await Promise.all(
      validSamples.map((s) => samplesCol.doc(s.sampleUUID).get()),
    );
    const newSamples: HealthSamplePayload[] = [];
    let deduped = 0;
    existing.forEach((snap, idx) => {
      if (snap.exists) {
        deduped++;
      } else {
        newSamples.push(validSamples[idx]);
      }
    });

    if (newSamples.length === 0) {
      logger.info(`[ingestHealthSamples] ${uid} all ${deduped} samples already stored`);
      return {
        ok: true,
        accepted: 0,
        deduped,
        rejected,
        xpAwarded: 0,
        capReached: false,
        passiveXpAwardedToday: 0,
      };
    }

    // ──────────────────────────────────────────────────────────────────
    // Step 3: Sum the new (deduped) deltas.
    // ──────────────────────────────────────────────────────────────────
    let deltaSteps = 0;
    let deltaCalories = 0;
    let deltaActiveMinutes = 0;
    for (const s of newSamples) {
      const v = Math.max(0, s.value);
      switch (s.type) {
        case 'steps':
          deltaSteps += v;
          break;
        case 'activeEnergy':
          deltaCalories += v;
          break;
        case 'exerciseTime':
          deltaActiveMinutes += v;
          break;
      }
    }
    deltaSteps = Math.floor(deltaSteps);
    deltaCalories = Math.round(deltaCalories);
    deltaActiveMinutes = Math.floor(deltaActiveMinutes);

    // ──────────────────────────────────────────────────────────────────
    // Step 4: Atomic transaction — read current daily doc, clamp deltas
    // against per-day caps, write samples + bump dailyActivity.
    // Note: dailyActivity write must include `userId` per firestore.rules.
    // ──────────────────────────────────────────────────────────────────
    let xpAwarded = 0;
    let capReached = false;
    let passiveXpAwardedToday = 0;

    await db.runTransaction(async (txn) => {
      const dailySnap = await txn.get(dailyRef);
      const cur = (dailySnap.exists ? dailySnap.data() : {}) as Record<string, any>;

      const curPassiveSteps = Number(cur.passiveSteps ?? 0);
      const curPassiveCalories = Number(cur.passiveCalories ?? 0);
      const curPassiveActiveMin = Number(cur.passiveActiveMinutes ?? 0);
      const curPassiveXpToday = Number(cur.passiveXpAwardedToday ?? 0);
      const curCardioMinutes = Number(cur.categories?.cardio?.minutes ?? 0);

      const addSteps = clampDelta(curPassiveSteps, deltaSteps, MAX_STEPS_PER_DAY);
      const addCalories = clampDelta(curPassiveCalories, deltaCalories, MAX_CALORIES_PER_DAY);
      const addActiveMin = clampDelta(
        curPassiveActiveMin,
        deltaActiveMinutes,
        MAX_ACTIVE_MINUTES_PER_DAY,
      );

      // Compute XP for this sync, respecting daily 200-XP cap.
      const xpResult = computePassiveXpDelta(
        { steps: addSteps, activeMinutes: addActiveMin },
        curPassiveXpToday,
      );
      xpAwarded = xpResult.xpDelta;
      capReached = xpResult.capReached;
      passiveXpAwardedToday = curPassiveXpToday + xpAwarded;

      // Persist each new sample doc.
      for (const s of newSamples) {
        txn.set(samplesCol.doc(s.sampleUUID), {
          ...s,
          uid,
          ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Bump dailyActivity. Use set({merge: true}) so this works whether
      // the doc exists or not. We also write `userId` and `date` on first
      // creation so the existing rules pass and downstream readers find
      // them where they expect.
      const dailyUpdate: Record<string, unknown> = {
        userId: uid,
        date,
        passiveSteps: curPassiveSteps + addSteps,
        passiveCalories: curPassiveCalories + addCalories,
        passiveActiveMinutes: curPassiveActiveMin + addActiveMin,
        passiveXpAwardedToday,
        lastPassiveSyncAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Steps total: bump the existing aggregate counter so the StepsWidget
      // and existing ring math see passive contributions.
      if (addSteps > 0) {
        dailyUpdate.steps = (Number(cur.steps ?? 0)) + addSteps;
      }

      // Cardio minutes → passive active-minutes feed the existing cardio
      // bucket so they roll up into "Aerobic Activity Minutes" automatically.
      if (addActiveMin > 0) {
        dailyUpdate['categories.cardio.minutes'] = curCardioMinutes + addActiveMin;
      }

      txn.set(dailyRef, dailyUpdate, { merge: true });
    });

    // ──────────────────────────────────────────────────────────────────
    // Step 5: Award XP via the shared progression service. Coins are
    // FORCIBLY DISABLED for the passive door. This is the only mutation
    // permitted on users/{uid}.progression.* from sensor data.
    // ──────────────────────────────────────────────────────────────────
    if (xpAwarded > 0) {
      try {
        await applyAward(
          uid,
          { xpDelta: xpAwarded, coinsDelta: 0, caloriesDelta: 0 },
          'passive_sensor',
          { awardCoins: false },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // We already wrote the samples + daily counters. If the user doc
        // is missing we log but don't fail the call — the XP can be
        // reconciled later. (User profile creation should run before
        // sensor sync in normal app flow.)
        logger.warn(`[ingestHealthSamples] applyAward failed for ${uid}: ${msg}`);
      }
    }

    logger.info(
      `[ingestHealthSamples] ${uid} date=${date} accepted=${newSamples.length} ` +
      `deduped=${deduped} rejected=${rejected} +${xpAwarded}XP ` +
      `(today=${passiveXpAwardedToday}/${DAILY_PASSIVE_XP_CAP})${capReached ? ' [CAP]' : ''}`,
    );

    return {
      ok: true,
      accepted: newSamples.length,
      deduped,
      rejected,
      xpAwarded,
      capReached,
      passiveXpAwardedToday,
    };
  },
);
