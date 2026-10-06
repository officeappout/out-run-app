/**
 * Growth Hub — Funnel Analytics Service
 *
 * Powers the Dynamic Growth Funnel Dashboard at `/admin/analytics` with
 * server-side aggregated counts for a 6-stage acquisition → retention
 * funnel, sliced by marketing attribution and user demographics.
 *
 * Design contract:
 *   • Stages 1-3 use `getCountFromServer` — only a single primitive
 *     count is transferred per stage, never full user payloads. This
 *     keeps Firestore read costs flat at O(stages) regardless of
 *     dataset size and avoids the read-amplification anti-pattern in
 *     `cpo-analytics.service.ts` (which does full `getDocs()` scans).
 *     Stages 4-5 (activation/retention) are the one exception — see
 *     `getActivationRetentionCounts`'s own comment for why they need
 *     real documents, not just a count.
 *   • All filters (`campaign`, `source`, `medium`, `gender`, date range)
 *     are applied natively as `where()` constraints on the server, so
 *     Firestore returns a count for the exact filtered subset.
 *   • Stage queries run in parallel via `Promise.allSettled` — one
 *     failing stage (e.g. missing composite index) does not poison the
 *     whole funnel render. Failed stages surface as `FunnelStage.
 *     isUnavailable: true` (bug-fix round, 06.10.2026 — BUG 2; see
 *     `countStage`'s own comment) — a real failure is never rendered
 *     as a confident-looking "0 users," which is exactly how a missing
 *     index silently looked indistinguishable from a real empty stage
 *     before this fix. Stages 4-5 get the same treatment via
 *     `getActivationRetentionCounts`'s own `failed` flag.
 *
 * Index prerequisite (stages 1-3 — see the design-contract bullet
 * above for why 4-5 don't query `users` with an extra field any more):
 * composite indexes on `users` for combinations of (createdAt,
 * marketingAttribution.{source|campaign|medium|linkId}, core.gender,
 * onboardingStatus, onboardingCompletedAt, core.authorityId,
 * progression.globalLevel, core.birthDate, running.isUnlocked).
 * `progression.workoutCount` + `createdAt` is ALSO pre-provisioned in
 * `firestore.indexes.json` for historical completeness, even though no
 * code here queries that combination any more post-BUG-1-fix — harmless
 * to keep. `firestore.indexes.json` pre-provisions linkId+createdAt
 * plus every stage-defining-field / segmentation-dimension pairing
 * added in the 06.10.2026 bug-fix round (BUG 2 — see that file's own
 * comments for the full list); any OTHER simultaneous-filter
 * combination not pre-provisioned still auto-suggests its own index on
 * first failed query — click the console link to provision. A failed
 * stage now surfaces as `isUnavailable: true`, not a silent 0 (see
 * above).
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  getDocs,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasStrengthTrack, hasRunningTrack } from '@/lib/track-ownership';
import { levelTierToRange, type LevelTier } from '@/features/workout-engine/services/split-decision/split-decision.types';
import { ageRangeToBirthDateRange } from '@/lib/age-buckets';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';

const USERS_COLLECTION = 'users';

// ──────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────

/**
 * Filter set applied to every stage query. `null` = "no constraint" for
 * that dimension (e.g. `source: null` means "all sources").
 */
export interface FunnelFilters {
  campaign: string | null;
  source: string | null;
  medium: string | null;
  /**
   * `marketing_links/{id}` doc id — filters the funnel down to one specific
   * link (e.g. one physical QR code), independent of whether that link's
   * utm_* fields were filled in. See `marketingAttribution.linkId`.
   */
  linkId: string | null;
  /** Inclusive lower bound on the date field for the stage. */
  dateFrom: Date | null;
  /** Inclusive upper bound on the date field for the stage. */
  dateTo: Date | null;
  gender: 'male' | 'female' | 'other' | null;
  /** `authorities/{id}` doc id — Journey Hub Wave 2's "city" filter. */
  cityAuthorityId: string | null;
  /**
   * `LevelTier` ('beginner'/'intermediate'/'advanced', global-level-
   * based) when `program` is null/'running'/'map_only' — reuses
   * `getLevelTier`'s exact thresholds via `levelTierToRange`, never
   * re-derived. A plain `number` (next panel wave, 06.10.2026) ONLY
   * when `program` is a specific strength-program slug: "minimum
   * level within THAT program" (`progression.domains.<slug>.
   * currentLevel >= N`), replacing the global tier with the program's
   * own real level scale. See `buildBaseConstraints`'s own comment.
   */
  level: LevelTier | number | null;
  /**
   * 'running' / 'map_only' stay the 2 broad buckets they always were.
   * Any OTHER non-null value (next panel wave, 06.10.2026) is a real
   * strength-program SLUG (e.g. 'front_lever', 'planche') — the actual
   * named programs, replacing the old generic 'strength' bucket. See
   * `getFunnelCounts`'s own comment for the native-query cost split
   * between these 3 shapes.
   */
  program: string | null;
  /** Admin-defined range, in years — no fixed buckets. See `age-buckets.ts`. */
  ageFrom: number | null;
  ageTo: number | null;
}

/**
 * Single stage result, fully computed and ready for direct UI render.
 * `count: null` is reserved for the placeholder Revenue stage that has
 * no real data source yet — UIs should render it as "ממתין לנתונים".
 */
export interface FunnelStage {
  id:
    | 'registered'
    | 'midpoint'
    | 'completed'
    | 'activation'
    | 'retention'
    | 'revenue';
  labelHe: string;
  count: number | null;
  /** % of users at this stage relative to Stage 1 (Total Registered). */
  globalConversion: number | null;
  /** % of users at this stage relative to the immediately previous stage. */
  stepConversion: number | null;
  /** True when `stepConversion < 50` — flags acute leakage points. */
  isDropWarning: boolean;
  /**
   * True when this stage's underlying Firestore query threw (e.g. a
   * missing composite index) — bug-fix round, 06.10.2026 (BUG 2).
   * `count` is always 0 in this case, but it is NOT a real zero —
   * UIs must render this distinctly ("לא זמין" / an error treatment),
   * never as a confident "0 users." Previously `countStage` swallowed
   * every error into a bare `0`, indistinguishable from a real empty
   * stage — exactly how a missing index silently looked like "this
   * stage has no users" instead of "this query couldn't run."
   */
  isUnavailable?: boolean;
}

/**
 * Default no-op filter set — useful as initial state for the page.
 */
export const DEFAULT_FUNNEL_FILTERS: FunnelFilters = {
  campaign: null,
  source: null,
  medium: null,
  linkId: null,
  dateFrom: null,
  dateTo: null,
  gender: null,
  cityAuthorityId: null,
  level: null,
  program: null,
  ageFrom: null,
  ageTo: null,
};

// ──────────────────────────────────────────────────────────────────────
// Private constants
// ──────────────────────────────────────────────────────────────────────

/**
 * Onboarding steps considered "midpoint or beyond" (Stage 2). Pulled
 * from STEP_ORDER in onboarding-sync.service.ts — EQUIPMENT is step 4
 * out of 12, so users at this stage have crossed the dropout-heavy
 * intro/identity collection phase.
 *
 * Hardcoded here (not imported) because STEP_ORDER is module-private
 * inside the onboarding service, and duplicating the small allow-list
 * is safer than expanding that file's public surface. Length 10 stays
 * well under Firestore's `in` clause cap of 30.
 */
const MIDPOINT_STEPS = [
  'EQUIPMENT',
  'SCHEDULE',
  'HEALTH_DECLARATION',
  'ACCOUNT_SECURE',
  'PROCESSING',
  'HISTORY',
  'SOCIAL_MAP',
  'COMMUNITY',
  'COMPLETED',
  'SUMMARY',
] as const;

// ──────────────────────────────────────────────────────────────────────
// Private helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Build the shared QueryConstraint[] for a stage. `dateField` switches
 * between `createdAt` (Stages 1, 2, 4, 5) and `onboardingCompletedAt`
 * (Stage 3, which measures users who finished onboarding within the
 * window — not users who registered within the window).
 *
 * Returns an array suitable for spreading into `query(collection, ...)`.
 */
function buildBaseConstraints(
  filters: FunnelFilters,
  dateField: 'createdAt' | 'onboardingCompletedAt',
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];

  if (filters.dateFrom) {
    constraints.push(where(dateField, '>=', Timestamp.fromDate(filters.dateFrom)));
  }
  if (filters.dateTo) {
    constraints.push(where(dateField, '<=', Timestamp.fromDate(filters.dateTo)));
  }
  if (filters.source) {
    constraints.push(where('marketingAttribution.source', '==', filters.source));
  }
  if (filters.campaign) {
    constraints.push(where('marketingAttribution.campaign', '==', filters.campaign));
  }
  if (filters.medium) {
    constraints.push(where('marketingAttribution.medium', '==', filters.medium));
  }
  if (filters.linkId) {
    constraints.push(where('marketingAttribution.linkId', '==', filters.linkId));
  }
  if (filters.gender) {
    constraints.push(where('core.gender', '==', filters.gender));
  }
  if (filters.cityAuthorityId) {
    constraints.push(where('core.authorityId', '==', filters.cityAuthorityId));
  }
  const specificProgramSlug = isSpecificProgramSlug(filters.program) ? filters.program : null;

  if (typeof filters.level === 'number') {
    // Next panel wave, 06.10.2026: a specific program is selected, so
    // "level" means "minimum level WITHIN that program," not the
    // global tier. Only meaningful paired with a specific program —
    // if one isn't selected, there's no `progression.domains.<slug>`
    // path to constrain, so this is silently a no-op (matches the UI,
    // which only ever shows a numeric level option once a program is
    // chosen — see JourneyFilterBar.tsx).
    if (specificProgramSlug) {
      constraints.push(where(`progression.domains.${specificProgramSlug}.currentLevel`, '>=', filters.level));
    }
  } else if (filters.level) {
    // Range on the SAME field (`progression.globalLevel`) — Firestore
    // allows multiple inequality constraints on one field in one query.
    // Thresholds come from `levelTierToRange`, never re-derived here.
    const [min, max] = levelTierToRange(filters.level);
    constraints.push(where('progression.globalLevel', '>=', min));
    if (max != null) constraints.push(where('progression.globalLevel', '<=', max));
  }
  if (filters.ageFrom != null || filters.ageTo != null) {
    // A larger age -> an EARLIER birthDate, so min/max flip — see
    // ageRangeToBirthDateRange's own doc comment.
    const [minBirthDate, maxBirthDate] = ageRangeToBirthDateRange(filters.ageFrom, filters.ageTo, new Date());
    if (minBirthDate) constraints.push(where('core.birthDate', '>=', Timestamp.fromDate(minBirthDate)));
    if (maxBirthDate) constraints.push(where('core.birthDate', '<=', Timestamp.fromDate(maxBirthDate)));
  }
  if (filters.program === 'running') {
    constraints.push(where('running.isUnlocked', '==', true));
  } else if (specificProgramSlug) {
    // Next panel wave, 06.10.2026: a real named strength program
    // (e.g. 'front_lever'), not the old generic 'strength' bucket.
    // Unlike that old bucket, this IS a native constraint — no
    // `hasStrengthTrack` full-doc fallback needed, because we're
    // checking ONE known field path, not "any of N possible domain
    // keys." KNOWN GAP, documented not silently assumed away: a small
    // number of users have this exact program entry keyed by its
    // Firestore doc-ID hash instead of this slug in `progression.
    // domains` (see [[healingpass-dualkey-domains]] memory / `.claude/
    // knowledge/parking-lot.md` — separately-tracked tech debt, a
    // dedicated writer-normalize + backfill task, not something to
    // bolt onto this filter). Those users won't match here until that
    // backfill lands — see `getFunnelCounts`'s own comment for why
    // `growth-metrics` (in-memory, same wave) checks both keys instead.
    constraints.push(where(`progression.domains.${specificProgramSlug}.currentLevel`, '>', 0));
  }
  // 'map_only' (neither strength nor running) still can't be a native
  // constraint — "no domain key is present" isn't expressible as a
  // single where() without knowing every possible key in advance. See
  // countStage's own fallback for how it's handled instead.

  return constraints;
}

/** True when `program` is a real strength-program slug, not one of the 2 broad buckets or null. */
function isSpecificProgramSlug(program: string | null): program is string {
  return !!program && program !== 'running' && program !== 'map_only';
}

/**
 * A stage count, plus whether the underlying query actually failed.
 * `count` is always 0 when `failed` is true — but callers must treat
 * that 0 as "unavailable," never as "really zero." See `FunnelStage.
 * isUnavailable`'s own doc comment for why this distinction exists.
 */
interface StageCountResult {
  count: number;
  failed: boolean;
}

/**
 * Resolve a single stage's count.
 *
 * Bug-fix round, 06.10.2026 (BUG 2): previously returned a bare
 * `number`, swallowing every error into a plain `0` — indistinguishable
 * from a real empty stage. A missing composite index (the actual root
 * cause an admin hit: a 30-day date filter zeroed out every stage past
 * Stage 1) looked exactly like "this stage really has 0 users." Now
 * returns `{count, failed}` so the caller (`getFunnelCounts`) can mark
 * the resulting `FunnelStage.isUnavailable = true` and the UI can
 * render an explicit "לא זמין" state instead. The original error is
 * still logged to console either way, for DevTools-level debugging.
 *
 * `programFilter === 'map_only'` can't be expressed as a native
 * Firestore constraint — "no domain key is present" isn't a single
 * field check, it's the ABSENCE of every possible one, which
 * `getCountFromServer`'s pure count aggregation has no way to post-
 * filter. Only when that one value is active, this falls back to a
 * real `getDocs` fetch + an in-memory `hasStrengthTrack`/
 * `hasRunningTrack` check — genuinely more expensive (full documents,
 * not just a count) than the normal path, but bounded to exactly the
 * stage's other constraints and only paid when an admin selects it.
 * `null`, `'running'`, and any specific program slug (next panel wave,
 * 06.10.2026 — real named programs replacing the old generic
 * 'strength' bucket) all stay on the cheap `getCountFromServer` path
 * via a native `where()` constraint `buildBaseConstraints` already
 * adds for each.
 */
async function countStage(
  constraints: QueryConstraint[],
  stageLabel: string,
  programFilter: FunnelFilters['program'] = null,
): Promise<StageCountResult> {
  try {
    const q = query(collection(db, USERS_COLLECTION), ...constraints);
    if (programFilter === 'map_only') {
      // The one remaining program value that isn't a native constraint
      // — "no domain key present" can't be expressed without knowing
      // every possible key in advance. Specific-program slugs and
      // 'running' are now both native where() clauses (buildBaseConstraints),
      // so this fallback only exists for 'map_only'.
      const snapshot = await getDocs(q);
      const count = snapshot.docs.filter((d) => {
        const data = d.data();
        return !hasStrengthTrack(data) && !hasRunningTrack(data);
      }).length;
      return { count, failed: false };
    }
    const snapshot = await getCountFromServer(q);
    return { count: snapshot.data().count, failed: false };
  } catch (err) {
    console.error(`[FunnelAnalytics] Stage "${stageLabel}" count failed — likely a missing composite index, see the Firestore error below for the console link to provision it:`, err);
    return { count: 0, failed: true };
  }
}

/**
 * Safe percentage calculator. Rounds to 1 decimal place and returns
 * `null` (NOT 0) when the denominator is 0 — UIs should render `null`
 * as "—" to distinguish "no data yet" from "true 0% conversion".
 */
function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Stage 4 (activation) + Stage 5 (retention) — bug-fix round, 06.10.2026
 * (BUG 1). Previously `where('progression.workoutCount', '>=', N)`: a
 * client-written best-effort counter (`completion-sync.service.ts:
 * 137-146`) that silently under-counts on any write failure, and reads
 * 0 even when real completions exist. Fixed by adopting the SAME real-
 * completion source already proven in `users.service.ts:162-167` /
 * `admin/users/all/page.tsx:211-217` — one unscoped read of the real
 * `workouts` collection, not a second denormalized counter.
 *
 * Both stages share Stage 1's exact eligible-user population (same
 * `constraints` — no extra Firestore-side field needed any more), so
 * this takes `eligibleConstraints` once and cross-references real
 * workouts in memory: per-user qualifying-workout counts via
 * `isRealWorkoutCompletion` (workout-completion-kpi.ts, the locked KPI
 * definition — docs/product/kpi-definitions.md), then activation =
 * count>=1, retention = count>=3. A side benefit: removing the
 * Firestore-side `workoutCount` constraint means neither stage needs a
 * composite index any more (BUG 2's missing-index problem doesn't
 * apply here at all).
 *
 * Returns `failed` (bug-fix round, 06.10.2026 — BUG 2's `countStage`
 * hardening, extended here to cover these 2 stages too, since they
 * stopped going through `countStage` once BUG 1's fix landed): true
 * when the eligible-user query OR the `workouts` read threw. `activation`/
 * `retention` are always 0 in that case but, same as every other
 * stage, that 0 is NOT a real zero — see `FunnelStage.isUnavailable`.
 */
async function getActivationRetentionCounts(
  eligibleConstraints: QueryConstraint[],
  programFilter: FunnelFilters['program'],
): Promise<{ activation: number; retention: number; failed: boolean }> {
  try {
    const eligibleSnap = await getDocs(query(collection(db, USERS_COLLECTION), ...eligibleConstraints));
    let eligibleDocs = eligibleSnap.docs;
    if (programFilter === 'map_only') {
      // 'running' and a specific program slug are already applied as
      // native where() clauses inside `eligibleConstraints` (built by
      // buildBaseConstraints) — only 'map_only' still needs this
      // in-memory fallback. See that function's own comment.
      eligibleDocs = eligibleDocs.filter((d) => {
        const data = d.data();
        return !hasStrengthTrack(data) && !hasRunningTrack(data);
      });
    }
    const eligibleUserIds = new Set(eligibleDocs.map((d) => d.id));

    const workoutsSnap = await getDocs(collection(db, 'workouts'));
    const qualifyingCountByUid = new Map<string, number>();
    workoutsSnap.docs.forEach((d) => {
      const data = d.data();
      const uid = data?.userId;
      if (typeof uid !== 'string' || !eligibleUserIds.has(uid)) return;
      if (!isRealWorkoutCompletion(data)) return;
      qualifyingCountByUid.set(uid, (qualifyingCountByUid.get(uid) ?? 0) + 1);
    });

    let activation = 0;
    let retention = 0;
    eligibleUserIds.forEach((uid) => {
      const count = qualifyingCountByUid.get(uid) ?? 0;
      if (count >= 1) activation++;
      if (count >= 3) retention++;
    });
    return { activation, retention, failed: false };
  } catch (err) {
    console.error('[FunnelAnalytics] Activation/retention count failed — likely a missing composite index, see the Firestore error below for the console link to provision it:', err);
    return { activation: 0, retention: 0, failed: true };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/**
 * Compute the full 6-stage funnel for the given filters.
 *
 * Returns a deterministic, ordered array — UIs can index by position or
 * by `stage.id`. The `revenue` stage always has `count: null` (no
 * payment integration yet); other stages return real server-aggregated
 * counts.
 *
 * Conversion math runs in memory after all stages resolve, so there is
 * exactly one network round-trip per stage and zero post-hoc Firestore
 * reads for the percentage math.
 */
export async function getFunnelCounts(
  filters: FunnelFilters,
): Promise<FunnelStage[]> {
  // ── Build stage-specific constraint sets ───────────────────────────
  const stage1Constraints = buildBaseConstraints(filters, 'createdAt');

  const stage2Constraints: QueryConstraint[] = [
    ...buildBaseConstraints(filters, 'createdAt'),
    where('onboardingStep', 'in', [...MIDPOINT_STEPS]),
  ];

  const stage3Constraints: QueryConstraint[] = [
    ...buildBaseConstraints(filters, 'onboardingCompletedAt'),
    where('onboardingStatus', '==', 'COMPLETED'),
  ];

  // Stages 4/5 (activation/retention) share Stage 1's exact eligible
  // population — see getActivationRetentionCounts above for why there's
  // no separate Firestore-side constraint for them any more.

  // ── Fire all stage counts in parallel ──────────────────────────────
  //
  // `Promise.allSettled` (not `Promise.all`) so a single failed stage
  // doesn't poison the whole dashboard — the caller still gets the
  // other stages and the conversion math continues with 0 for the
  // failed one. `countStage` / `getActivationRetentionCounts` never
  // reject (each catches its own errors into its own `failed: true`
  // result), so `allSettled` is really just defensive-in-depth here,
  // not the primary failure-reporting mechanism — that's each result's
  // own `.failed` flag, unpacked below.
  const settled = await Promise.allSettled([
    countStage(stage1Constraints, 'registered', filters.program),
    countStage(stage2Constraints, 'midpoint', filters.program),
    countStage(stage3Constraints, 'completed', filters.program),
    getActivationRetentionCounts(stage1Constraints, filters.program),
  ]);

  const [registeredResult, midpointResult, completedResult, activationRetentionResult] = settled;
  const r1 = registeredResult.status === 'fulfilled' ? registeredResult.value : { count: 0, failed: true };
  const r2 = midpointResult.status === 'fulfilled' ? midpointResult.value : { count: 0, failed: true };
  const r3 = completedResult.status === 'fulfilled' ? completedResult.value : { count: 0, failed: true };
  // Stages 4/5 share one underlying query pair (getActivationRetentionCounts),
  // so they also share one `failed` flag — see r45.failed's 2 uses below.
  const r45 = activationRetentionResult.status === 'fulfilled'
    ? activationRetentionResult.value
    : { activation: 0, retention: 0, failed: true };
  const c1 = r1.count;
  const c2 = r2.count;
  const c3 = r3.count;
  const c4 = r45.activation;
  const c5 = r45.retention;

  // ── Compose the stage entries with conversion math ─────────────────
  //
  // globalConversion = stage / Stage 1 (always anchored to top of funnel)
  // stepConversion   = stage / immediately previous stage
  // isDropWarning    = stepConversion is a real number AND < 50%
  //
  // Stage 1 is the anchor — its globalConversion is always 100% (when
  // there are users at all) and its stepConversion is null (no
  // predecessor).
  //
  // `safePct` additionally forces `null` whenever EITHER side of the
  // ratio came from a failed stage — `pct()` alone would compute a
  // misleading "0%" from a failed stage's fake `count:0`, exactly the
  // "confident-looking wrong number" BUG 2's fix is about eliminating.
  const safePct = (numeratorCount: number, numeratorFailed: boolean, denomCount: number, denomFailed: boolean): number | null =>
    (numeratorFailed || denomFailed) ? null : pct(numeratorCount, denomCount);

  const stages: FunnelStage[] = [
    {
      id: 'registered',
      labelHe: 'נרשמו במערכת',
      count: c1,
      globalConversion: r1.failed ? null : (c1 > 0 ? 100 : null),
      stepConversion: null,
      isDropWarning: false,
      isUnavailable: r1.failed,
    },
    {
      id: 'midpoint',
      labelHe: 'אמצע אונבורדינג',
      count: c2,
      globalConversion: safePct(c2, r2.failed, c1, r1.failed),
      stepConversion: safePct(c2, r2.failed, c1, r1.failed),
      isDropWarning: isDrop(safePct(c2, r2.failed, c1, r1.failed)),
      isUnavailable: r2.failed,
    },
    {
      id: 'completed',
      labelHe: 'סיימו אונבורדינג',
      count: c3,
      globalConversion: safePct(c3, r3.failed, c1, r1.failed),
      stepConversion: safePct(c3, r3.failed, c2, r2.failed),
      isDropWarning: isDrop(safePct(c3, r3.failed, c2, r2.failed)),
      isUnavailable: r3.failed,
    },
    {
      id: 'activation',
      labelHe: 'הפעלה (אימון ראשון)',
      count: c4,
      globalConversion: safePct(c4, r45.failed, c1, r1.failed),
      stepConversion: safePct(c4, r45.failed, c3, r3.failed),
      isDropWarning: isDrop(safePct(c4, r45.failed, c3, r3.failed)),
      isUnavailable: r45.failed,
    },
    {
      id: 'retention',
      labelHe: 'שימור (3 אימונים+)',
      count: c5,
      globalConversion: safePct(c5, r45.failed, c1, r1.failed),
      stepConversion: safePct(c5, r45.failed, c4, r45.failed),
      isDropWarning: isDrop(safePct(c5, r45.failed, c4, r45.failed)),
      isUnavailable: r45.failed,
    },
    {
      id: 'revenue',
      labelHe: 'הכנסה (תשלום)',
      count: null,
      globalConversion: null,
      stepConversion: null,
      isDropWarning: false,
    },
  ];

  return stages;
}

/**
 * Count of registered users attributed to any non-organic marketing
 * touchpoint, WITHIN the given filters — the filter-aware counterpart
 * of `account-metrics.service.ts`'s `getMarketingAttributedCount`
 * (built for the Marketing Hub's single, always-unfiltered KPI card).
 *
 * Journey Hub Wave 2: once the shared filter row can scope Stage 1's
 * registered count (e.g. to one city), the organic/attributed split
 * computed from it has to be scoped the SAME way, or the split math
 * breaks (an unfiltered attributed count could exceed a filtered
 * registered count). Reuses the exact same `buildBaseConstraints` +
 * `countStage` this file's stage-1 query already uses, with the one
 * extra `source != 'organic'` constraint — not a parallel query
 * builder. With `DEFAULT_FUNNEL_FILTERS`, this returns the identical
 * number `getMarketingAttributedCount` would.
 */
export async function getAttributedCount(filters: FunnelFilters): Promise<number> {
  const constraints: QueryConstraint[] = [
    ...buildBaseConstraints(filters, 'createdAt'),
    where('marketingAttribution.source', '!=', 'organic'),
  ];
  const result = await countStage(constraints, 'attributed', filters.program);
  return result.count;
}

/** Centralised drop-warning rule so both service and UI agree. */
function isDrop(stepConversion: number | null): boolean {
  return stepConversion !== null && stepConversion < 50;
}

/**
 * Convenience export so the page component can use the exact same
 * threshold logic for badge rendering without duplicating the rule.
 */
export const FUNNEL_DROP_THRESHOLD = 50;
export const FUNNEL_CAUTION_THRESHOLD = 70;

// ──────────────────────────────────────────────────────────────────────
// Distinct-value loader — moved here from /admin/analytics/page.tsx
// (Journey Hub Wave 2, 05.10.2026) so the new cross-tab filter bar can
// reuse the exact same loader instead of a second copy. Fills the
// campaign/source dropdowns from the existing user docs that have a
// marketingAttribution object. Capped at 200 docs so even on a very
// large user base this stays a single cheap query.
//
// Note: this is a deliberate trade-off — for very large datasets the
// "distinct values" list may be incomplete (a long-tail campaign in
// doc #201+ would not appear). The trade-off is acceptable because:
//   • The most common campaigns/sources will dominate the top docs.
//   • Admins can still type-filter by URL param if needed.
//   • A proper "distinct" query would require a separate aggregation
//     pipeline that's overkill for v1.
// ──────────────────────────────────────────────────────────────────────

export interface DistinctAttribution {
  campaigns: string[];
  sources: string[];
  mediums: string[];
}

export async function loadDistinctAttributionValues(): Promise<DistinctAttribution> {
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where('marketingAttribution.source', '!=', null),
      orderBy('marketingAttribution.source'),
      limit(200),
    );
    const snap = await getDocs(q);
    const campaigns = new Set<string>();
    const sources   = new Set<string>();
    const mediums   = new Set<string>();
    snap.forEach((doc) => {
      const a = doc.data()?.marketingAttribution;
      if (!a) return;
      if (typeof a.campaign === 'string' && a.campaign) campaigns.add(a.campaign);
      if (typeof a.source   === 'string' && a.source)   sources.add(a.source);
      if (typeof a.medium   === 'string' && a.medium)   mediums.add(a.medium);
    });
    return {
      campaigns: Array.from(campaigns).sort(),
      sources:   Array.from(sources).sort(),
      mediums:   Array.from(mediums).sort(),
    };
  } catch (err) {
    console.error('[FunnelAnalytics] Failed to load distinct attribution values:', err);
    return { campaigns: [], sources: [], mediums: [] };
  }
}
