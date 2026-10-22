/**
 * official_routes publish state — what a MISSING `published` / `status` means, decided from
 * the readers that exist today (22.10.2026), not assumed:
 *
 *   reader                                         missing `published` means
 *   ─────────────────────────────────────────────  ──────────────────────────────────────
 *   InventoryService.fetchOfficialRoutes(_, true)  LIVE — only `published === false` is
 *     (map, search, hybrid, planned activity,        dropped, so a doc with no field is shown
 *      onboarding, route-fit, the carousel)          to every user.
 *   heatmap route-overlay.service.ts               LIVE — same `=== false` test.
 *   approval center (loadPendingRoutes)            INVISIBLE — `where('published','==',false)`
 *     + admin-ai pending-approvals.server.ts         never matches an absent field (axiom §33).
 *   city-mapping-summary.ts                        NEITHER approved (`=== true`) NOR pending
 *                                                   (`=== false`) — not counted at all.
 *
 * So a route with no `published` is live for users but never went through moderation and is
 * not counted anywhere an admin looks. This module is the one place that classifies it, used
 * by the approval center's server-side "no status" list and by the backfill script.
 *
 * Backfill rule (read-before-write — the seed-script lesson in feature-flag-defs.ts): only a
 * key that is genuinely ABSENT is ever filled, and only with the value that matches what users
 * see today, so the write changes no visibility:
 *   published absent, status absent      → { published: true, status: 'published' }
 *   published absent, status 'published' → { published: true }
 *   published true,   status absent      → { status: 'published' }
 *   published false,  status absent      → { status: 'pending' }   (already in the queue)
 *   published absent, status pending / archived / rejected → CONFLICT, reported, never written
 *     (users see it, the status says otherwise — an owner decision, not a script's).
 *   anything else (both explicit)        → nothing to do.
 * Values of the wrong type (e.g. published: "yes") are reported as conflicts too.
 */

export interface PublishStateInput {
  published?: unknown;
  status?: unknown;
}

export type PublishPatch = { published?: true; status?: 'published' | 'pending' };

export type PublishPlan =
  | { kind: 'ok' }
  | { kind: 'fill'; patch: PublishPatch }
  | { kind: 'conflict'; reason: string };

const KNOWN_STATUSES = new Set(['pending', 'published', 'archived', 'rejected']);

/** True when the doc has no explicit `published` boolean (absent or null) — live for users, invisible to the queue. */
export function hasNoPublishedField(d: PublishStateInput): boolean {
  return d.published === undefined || d.published === null;
}

/** Visible to app users? Mirrors fetchOfficialRoutes(publishedOnly=true): only an explicit false hides. */
export function isVisibleToUsers(d: PublishStateInput): boolean {
  return d.published !== false;
}

export function planPublishState(d: PublishStateInput): PublishPlan {
  const pubAbsent = hasNoPublishedField(d);
  const statusAbsent = d.status === undefined || d.status === null || d.status === '';

  if (!pubAbsent && typeof d.published !== 'boolean') {
    return { kind: 'conflict', reason: `published has non-boolean value ${JSON.stringify(d.published)}` };
  }
  if (!statusAbsent && (typeof d.status !== 'string' || !KNOWN_STATUSES.has(d.status))) {
    return { kind: 'conflict', reason: `status has unknown value ${JSON.stringify(d.status)}` };
  }

  if (pubAbsent && statusAbsent) return { kind: 'fill', patch: { published: true, status: 'published' } };
  if (pubAbsent) {
    if (d.status === 'published') return { kind: 'fill', patch: { published: true } };
    return { kind: 'conflict', reason: `no published field (live for users) but status is '${String(d.status)}'` };
  }
  if (statusAbsent) {
    return d.published === true
      ? { kind: 'fill', patch: { status: 'published' } }
      : { kind: 'fill', patch: { status: 'pending' } };
  }
  return { kind: 'ok' };
}

export interface PublishPlanRow {
  id: string;
  name: string;
  city: string | null;
  authorityId: string | null;
  plan: PublishPlan;
}

export interface PublishPlanSummary {
  total: number;
  noPublishedField: number;
  fills: number;
  conflicts: number;
  /** per city (or '∅'): docs with no `published` field */
  noPublishedByCity: Record<string, number>;
}

export function summarizePublishPlan(
  rows: Array<PublishPlanRow & { noPublished: boolean }>,
): PublishPlanSummary {
  const noPublishedByCity: Record<string, number> = {};
  let noPublishedField = 0;
  let fills = 0;
  let conflicts = 0;
  for (const r of rows) {
    if (r.noPublished) {
      noPublishedField++;
      const k = r.city ?? '∅';
      noPublishedByCity[k] = (noPublishedByCity[k] ?? 0) + 1;
    }
    if (r.plan.kind === 'fill') fills++;
    if (r.plan.kind === 'conflict') conflicts++;
  }
  return { total: rows.length, noPublishedField, fills, conflicts, noPublishedByCity };
}
