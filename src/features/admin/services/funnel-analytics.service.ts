/**
 * Growth Hub — Funnel Analytics Service
 *
 * Powers the Dynamic Growth Funnel Dashboard at `/admin/analytics` with
 * server-side aggregated counts for a 6-stage acquisition → retention
 * funnel, sliced by marketing attribution and user demographics.
 *
 * Design contract:
 *   • EVERY stage query uses `getCountFromServer` — only a single
 *     primitive count is transferred per stage, never full user
 *     payloads. This keeps Firestore read costs flat at O(stages)
 *     regardless of dataset size and avoids the read-amplification
 *     anti-pattern in `cpo-analytics.service.ts` (which does full
 *     `getDocs()` scans).
 *   • All filters (`campaign`, `source`, `medium`, `gender`, date range)
 *     are applied natively as `where()` constraints on the server, so
 *     Firestore returns a count for the exact filtered subset.
 *   • Stage queries run in parallel via `Promise.allSettled` — one
 *     failing stage (e.g. missing composite index) does not poison the
 *     whole funnel render. Failed stages surface as count 0 with the
 *     error logged to console.
 *
 * Index prerequisite: composite indexes on `users` for combinations of
 * (createdAt, marketingAttribution.{source|campaign|medium|linkId},
 * core.gender, onboardingStatus, onboardingCompletedAt,
 * progression.workoutCount). `firestore.indexes.json` pre-provisions the
 * single most common one (linkId + createdAt — "show me one QR code's
 * funnel"); every other filter combination auto-suggests its own index on
 * first failed query — click the console link to provision. A failed
 * stage returns 0 (see `countStage`), so a missing index degrades a
 * dashboard card, it never breaks the page.
 */

import {
  collection,
  query,
  where,
  getCountFromServer,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

  return constraints;
}

/**
 * Resolve a single stage's count via `getCountFromServer`. Returns 0
 * (not null) on failure so the caller can keep computing conversions
 * without special-casing rejected promises. The original error is
 * logged so missing composite indexes / rule failures are still
 * discoverable in DevTools.
 */
async function countStage(
  constraints: QueryConstraint[],
  stageLabel: string,
): Promise<number> {
  try {
    const q = query(collection(db, USERS_COLLECTION), ...constraints);
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (err) {
    console.error(`[FunnelAnalytics] Stage "${stageLabel}" count failed:`, err);
    return 0;
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

  const stage4Constraints: QueryConstraint[] = [
    ...buildBaseConstraints(filters, 'createdAt'),
    where('progression.workoutCount', '>=', 1),
  ];

  const stage5Constraints: QueryConstraint[] = [
    ...buildBaseConstraints(filters, 'createdAt'),
    where('progression.workoutCount', '>=', 3),
  ];

  // ── Fire all 5 stage counts in parallel ────────────────────────────
  //
  // `Promise.allSettled` (not `Promise.all`) so a single failed stage
  // doesn't poison the whole dashboard — the caller still gets the
  // other stages and the conversion math continues with 0 for the
  // failed one. Individual failures are logged inside `countStage`.
  const settled = await Promise.allSettled([
    countStage(stage1Constraints, 'registered'),
    countStage(stage2Constraints, 'midpoint'),
    countStage(stage3Constraints, 'completed'),
    countStage(stage4Constraints, 'activation'),
    countStage(stage5Constraints, 'retention'),
  ]);

  // `countStage` already swallows errors and returns 0, so the
  // `fulfilled` branch will always trigger — but we keep the defensive
  // unwrap for the impossible case where the wrapper itself rejected.
  const counts = settled.map((res) => (res.status === 'fulfilled' ? res.value : 0));
  const [c1, c2, c3, c4, c5] = counts;

  // ── Compose the stage entries with conversion math ─────────────────
  //
  // globalConversion = stage / Stage 1 (always anchored to top of funnel)
  // stepConversion   = stage / immediately previous stage
  // isDropWarning    = stepConversion is a real number AND < 50%
  //
  // Stage 1 is the anchor — its globalConversion is always 100% (when
  // there are users at all) and its stepConversion is null (no
  // predecessor).
  const stages: FunnelStage[] = [
    {
      id: 'registered',
      labelHe: 'נרשמו במערכת',
      count: c1,
      globalConversion: c1 > 0 ? 100 : null,
      stepConversion: null,
      isDropWarning: false,
    },
    {
      id: 'midpoint',
      labelHe: 'אמצע אונבורדינג',
      count: c2,
      globalConversion: pct(c2, c1),
      stepConversion: pct(c2, c1),
      isDropWarning: isDrop(pct(c2, c1)),
    },
    {
      id: 'completed',
      labelHe: 'סיימו אונבורדינג',
      count: c3,
      globalConversion: pct(c3, c1),
      stepConversion: pct(c3, c2),
      isDropWarning: isDrop(pct(c3, c2)),
    },
    {
      id: 'activation',
      labelHe: 'הפעלה (אימון ראשון)',
      count: c4,
      globalConversion: pct(c4, c1),
      stepConversion: pct(c4, c3),
      isDropWarning: isDrop(pct(c4, c3)),
    },
    {
      id: 'retention',
      labelHe: 'שימור (3 אימונים+)',
      count: c5,
      globalConversion: pct(c5, c1),
      stepConversion: pct(c5, c4),
      isDropWarning: isDrop(pct(c5, c4)),
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
