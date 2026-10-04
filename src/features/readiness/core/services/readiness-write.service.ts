/**
 * Military readiness ("מד כשירות") server-write foundation
 * (01.10.2026, 00-MASTER-PLAN.md §13.6x, backend-only stage — screens come
 * in a later stage per David's explicit instruction).
 *
 * This is the 4th domain built on the compute*() chokepoint pattern (after
 * park-write.service.ts, contribution-write.service.ts, and the existing
 * /api/units/member-workouts route). Same rules, reused verbatim, nothing
 * reinvented:
 *   - scope resolved from the caller's authenticated uid only
 *     (resolveUnitPermissionScope), never trusted from the request body
 *   - isMemberWithinScope is the ONLY authorization primitive for
 *     tenant/unit membership checks — see unitPermissionScope.ts
 *   - audit_logs written inside the same function, immediately after a
 *     successful write — not a separate call a future editor could forget
 *   - pure w.r.t. inputs (db, scope, ctx, body) for direct unit-test
 *     coverage without a real Firestore instance
 *
 * David's locked spec (01.10.2026), the 13 points this file implements:
 *  1. ONE global threshold — no per-tenant/per-unit config.
 *  2. Binary pass/fail only ("כשיר"/"לא כשיר") — no numeric score anywhere.
 *     'כשיר' is ALWAYS computed server-side from a raw measured value; the
 *     client can never send a pass/fail verdict directly — there is no
 *     field in any accepted request body that would let it try.
 *  3. A soldier record (readiness_soldiers) can exist before any user
 *     account exists for that person.
 *  4. No invite code for linking — an officer explicitly links a pending
 *     self-declared account to either an existing record or a freshly
 *     created one.
 *  5. Unlinking is possible and does NOT delete any results — results are
 *     anchored to the soldier record (soldierId), never to the uid.
 *  6. Every link and every unlink is written to audit_logs.
 *  7. Two uniqueness rules: (a) a soldier record has at most one linked
 *     uid; (b) a uid is linked to at most one soldier record, system-wide
 *     — enforced transactionally (see computeLinkSoldier).
 *  8. Merging duplicate soldier records is a root-only operation.
 *  9. Every result is kept forever — history is the asset. Nothing here
 *     ever deletes a readiness_results document.
 * 10. Every result has a validity window (default 365 days, configurable
 *     per test inside the global config). An expired result does not
 *     count as current readiness and does NOT become "לא כשיר" — it
 *     reverts to "טרם נבדק" (not-yet-tested). This is a READ-time
 *     derivation (computeSoldierCurrentStatus), never a stored mutation
 *     of the original result.
 * 11. "לא ביצע" (did not perform) is a complete, first-class result state
 *     — not a gap in the data — with its own reason (medical exemption /
 *     no-show / other). It is not counted as a fail.
 * 12. The outcome freezes at write time together with a snapshot of
 *     whichever threshold was in force on that date (thresholdSnapshot on
 *     the result) — changing the global config later never rewrites past
 *     results.
 * 13. No ID numbers, no personal/service numbers, no phone, no age — the
 *     soldier record and the result record carry only what this file's
 *     types declare, nothing more.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  isMemberWithinScope,
  type UnitPermissionScope,
} from '@/lib/unitPermissionScope';

// ── Shared context / messages ───────────────────────────────────────────

export interface ReadinessCtx {
  callerUid: string;
  tokenEmail: string | undefined;
  sourceIp: string;
}

const DENIED_MESSAGE = 'אין לך הרשאה לבצע פעולה זו.';
const ROOT_ONLY_MESSAGE = 'פעולה זו זמינה למנהל מערכת בלבד.';

// ── Types ────────────────────────────────────────────────────────────────

export type ReadinessGender = 'male' | 'female';

/**
 * A roster entry anchored to a real person in a unit — may or may not have
 * a linked app account (point 3). Never deleted; `mergedInto` marks a
 * record folded into another by the root-only merge op (point 8) without
 * destroying its history.
 */
export interface ReadinessSoldier {
  id: string;
  tenantId: string;
  unitId: string;
  name: string;
  gender: ReadinessGender;
  uid: string | null;
  linkedAt: Date | null;
  mergedInto: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /**
   * 04.10.2026 (§13.84, match-suggestion round) — "לא הוא": an officer's
   * explicit rejection of a specific uid as a match candidate for this
   * soldier record, remembered so the SAME suggestion never resurfaces
   * (David: "אחרת הקצין ידחה את אותו דבר כל שבוע מחדש"). Additive,
   * optional field — absent on every record created before this round,
   * which computeReadinessMatchSuggestions treats identically to an
   * empty array. Written only by computeRejectReadinessMatch
   * (FieldValue.arrayUnion) — never read or written by
   * computeLinkSoldier/computeUnlinkSoldier/computeBulkCreateSoldiers,
   * all untouched by this round.
   */
  rejectedUids?: string[];
}

export type ReadinessResultSource = 'organized_test' | 'app_measurement' | 'self_report';
export type ReadinessOutcome = 'pass' | 'fail' | 'not_performed';
export type NotPerformedReason = 'medical_exemption' | 'no_show' | 'other';

/** The soldier's CURRENT, derived (never stored) status for one test. */
export type ReadinessCurrentStatus = 'pass' | 'fail' | 'not_performed' | 'not_yet_tested';

export interface ReadinessThresholdSnapshot {
  thresholdVersion: number;
  gender: ReadinessGender;
  thresholdValue: number;
  lowerIsBetter: boolean;
  validityDays: number;
}

/**
 * The HISTORY fields (outcome/value/notPerformedReason/thresholdSnapshot/
 * source/recordedBy/recordedAt/testDate) are immutable once written
 * (point 9/12) — nothing in this file ever updates or deletes them
 * after creation.
 *
 * `uid` is the one deliberate exception, added 01.10.2026 (David, rules
 * review round): a read-key only, denormalized from the soldier record's
 * own `uid` at the moment this result is recorded — NOT part of the frozen
 * history. It exists purely so a soldier's own firestore.rules read rule
 * can be a direct field comparison (`resource.data.uid ==
 * request.auth.uid`) instead of a nested get() on the soldier record,
 * which would hit Firestore's 20-get()-per-query cap on any `list` query
 * once a soldier has more than 20 results. Kept in sync by
 * computeLinkSoldier/computeUnlinkSoldier (every existing result for a
 * soldier, updated atomically alongside the soldier record itself) and by
 * computeMergeSoldiers (reconciled on both the moved and the pre-existing
 * survivor results). The invariant this field exists to uphold: at any
 * moment, every readiness_results doc's `uid` equals its soldier record's
 * CURRENT `uid` — never stale, never partially updated.
 */
export interface ReadinessResult {
  id: string;
  soldierId: string;
  tenantId: string;
  unitId: string;
  testId: string;
  outcome: ReadinessOutcome;
  value: number | null;
  notPerformedReason: NotPerformedReason | null;
  source: ReadinessResultSource;
  thresholdSnapshot: ReadinessThresholdSnapshot | null;
  recordedBy: string;
  /** Write-time timestamp — when this record was typed into the system. */
  recordedAt: Date;
  /**
   * 03.10.2026 (David) — when the test actually happened, client-chosen
   * and server-validated (not in the future, not more than 90 days
   * back — see computeRecordResult). Deliberately separate from
   * recordedAt: an organized test is administered on paper in the
   * field and typed in days later, so "now" is never the right date to
   * stamp on the result. Threshold applicability is NOT testDate-aware
   * yet — thresholdSnapshot below is still the threshold in force at
   * RECORD time (now), not at testDate. Documented, not built, per
   * David's explicit instruction: real support requires threshold
   * version history, out of scope this round.
   */
  testDate: Date;
  uid: string | null;
}

export interface ReadinessTestDefinition {
  id: string;
  label: string;
  metric: string;
  unit: string;
  lowerIsBetter: boolean;
  threshold: { male: number; female: number };
  validityDays: number;
}

/** Single global doc — fixed id 'global', never per-tenant/per-unit (point 1). */
export interface ReadinessThresholdsConfig {
  id: 'global';
  version: number;
  tests: ReadinessTestDefinition[];
  updatedBy: string;
  updatedAt: Date;
}

const THRESHOLDS_DOC_ID = 'global';

// ── Audit ────────────────────────────────────────────────────────────────

async function resolveDisplayName(db: Firestore, uid: string, tokenEmail: string | undefined): Promise<string> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const core = (snap.exists ? snap.data()?.core : undefined) as { name?: string } | undefined;
    if (typeof core?.name === 'string' && core.name.trim().length > 0) {
      return core.name.trim().slice(0, 200);
    }
  } catch { /* fall through */ }
  return tokenEmail || 'Admin';
}

function clampAuditValue(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    const json = JSON.stringify(v);
    return typeof json === 'string' && json.length > 10_000 ? json.slice(0, 10_000) + '…[truncated]' : json;
  } catch {
    return null;
  }
}

async function writeReadinessAuditLog(
  db: Firestore,
  params: {
    uid: string;
    tokenEmail: string | undefined;
    actionType: 'CREATE' | 'UPDATE' | 'LINK' | 'UNLINK' | 'MERGE';
    targetEntity: 'ReadinessSoldier' | 'ReadinessResult' | 'ReadinessThresholds';
    targetId: string;
    details: string;
    oldValue: unknown;
    newValue: unknown;
    sourceIp: string;
  },
): Promise<void> {
  const adminName = await resolveDisplayName(db, params.uid, params.tokenEmail);
  await db.collection('audit_logs').add({
    adminId: params.uid,
    adminName,
    actionType: params.actionType,
    targetEntity: params.targetEntity,
    targetId: params.targetId,
    details: params.details,
    oldValue: clampAuditValue(params.oldValue),
    newValue: clampAuditValue(params.newValue),
    sourceIp: params.sourceIp,
    timestamp: new Date(),
  });
}

// ── Scope helpers ────────────────────────────────────────────────────────

/**
 * The tenantId an officer is allowed to act under, resolved from THEIR OWN
 * scope — never from the request body, except for root (who has no scope
 * of their own and must name one explicitly; validated against a real
 * tenants/{tenantId} doc by every caller below before use).
 */
function resolveCallerTenantId(scope: UnitPermissionScope, requestedTenantId: unknown): string | null {
  if (scope.kind === 'tenantOwner' || scope.kind === 'unitAdmin') return scope.tenantId;
  if (scope.kind === 'root') {
    return typeof requestedTenantId === 'string' && requestedTenantId.trim() ? requestedTenantId.trim() : null;
  }
  return null;
}

async function unitExists(db: Firestore, tenantId: string, unitId: string): Promise<boolean> {
  const snap = await db.collection('tenants').doc(tenantId).collection('units').doc(unitId).get();
  return snap.exists;
}

// ── Create soldier record ───────────────────────────────────────────────

export type CreateSoldierResult =
  | { status: 200; body: { soldierId: string } }
  | { status: 400 | 403 | 503; body: { error: string } };

/**
 * 03.10.2026 (David, bulk-import round) — extracted verbatim from
 * computeCreateSoldier's own body, same order, same messages, zero
 * behavior change. Condition David set on this extraction: every
 * existing computeCreateSoldier test must pass with NO test-code
 * changes — if one needs to change, that's proof the behavior moved,
 * not just the code. Shared by computeCreateSoldier (single row) and
 * computeBulkCreateSoldiers (N rows, validated once per row before any
 * write happens).
 */
function validateSoldierName(raw: unknown): { ok: true; name: string } | { ok: false; status: 400; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, status: 400, error: 'name is required' };
  }
  return { ok: true, name: raw.trim().slice(0, 200) };
}

function validateSoldierGender(raw: unknown): { ok: true; gender: ReadinessGender } | { ok: false; status: 400; error: string } {
  if (raw === 'male' || raw === 'female') {
    return { ok: true, gender: raw };
  }
  return { ok: false, status: 400, error: 'gender is required (male|female)' };
}

/**
 * tenantId/unitId resolution — identical logic to computeCreateSoldier's
 * own inline checks, extracted so both the single-create and bulk-create
 * paths resolve the SAME way. Caller must have already excluded
 * scope.kind 'unknown'/'denied' before calling this (same precondition
 * computeCreateSoldier's inline version always had).
 */
async function resolveTenantAndUnit(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
): Promise<{ ok: true; tenantId: string; unitId: string } | { ok: false; status: 400 | 403; error: string }> {
  const tenantId = resolveCallerTenantId(scope, requestBody.tenantId);
  if (!tenantId) {
    return { ok: false, status: 400, error: 'tenantId is required' };
  }

  const unitId = requestBody.unitId;
  if (typeof unitId !== 'string' || !unitId.trim()) {
    return { ok: false, status: 400, error: 'unitId is required' };
  }
  if (scope.kind === 'unitAdmin' && !scope.unitIds.includes(unitId)) {
    return { ok: false, status: 403, error: DENIED_MESSAGE };
  }
  if (!(await unitExists(db, tenantId, unitId))) {
    return { ok: false, status: 400, error: 'unitId does not exist for this tenant' };
  }

  return { ok: true, tenantId, unitId };
}

export async function computeCreateSoldier(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<CreateSoldierResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const nameResult = validateSoldierName(requestBody.name);
  if (!nameResult.ok) {
    return { status: nameResult.status, body: { error: nameResult.error } };
  }

  const tenantUnitResult = await resolveTenantAndUnit(db, scope, requestBody);
  if (!tenantUnitResult.ok) {
    return { status: tenantUnitResult.status, body: { error: tenantUnitResult.error } };
  }
  const { tenantId, unitId } = tenantUnitResult;

  // Point 4 — "open a new record and link it in one step": an immediate
  // uid is optional here. When present, this record is born already
  // linked — the same uniqueness/audit discipline as computeLinkSoldier
  // applies (point 7), just inline instead of a second round-trip.
  const requestedUid = requestBody.uid;
  let linkUid: string | null = null;
  let gender: ReadinessGender | null = null;

  if (typeof requestedUid === 'string' && requestedUid.trim()) {
    const targetUid = requestedUid.trim();
    const targetSnap = await db.collection('users').doc(targetUid).get();
    if (!targetSnap.exists) {
      return { status: 400, body: { error: 'uid does not exist' } };
    }
    const targetCore = (targetSnap.data()?.core ?? {}) as { tenantId?: unknown; unitId?: unknown; gender?: unknown };
    if (!isMemberWithinScope(scope, targetCore.tenantId, targetCore.unitId)) {
      return { status: 403, body: { error: DENIED_MESSAGE } };
    }
    linkUid = targetUid;

    const requestedGender = requestBody.gender;
    if (requestedGender === 'male' || requestedGender === 'female') {
      gender = requestedGender;
    } else if (targetCore.gender === 'male' || targetCore.gender === 'female') {
      // Auto-fill from the linked account's own profile — only when it's
      // cleanly male/female. core.gender also allows 'other' on the user
      // profile; the readiness domain has exactly two threshold tracks,
      // so 'other' is deliberately NOT auto-mapped to either one — the
      // officer must say explicitly which track applies (below, falls
      // through to the "gender is required" 400).
      gender = targetCore.gender;
    }
  }

  if (!gender) {
    const genderResult = validateSoldierGender(requestBody.gender);
    if (!genderResult.ok) {
      return { status: genderResult.status, body: { error: genderResult.error } };
    }
    gender = genderResult.gender;
  }

  const now = new Date();
  const doc: Omit<ReadinessSoldier, 'id'> = {
    tenantId,
    unitId,
    name: nameResult.name,
    gender,
    uid: linkUid,
    linkedAt: linkUid ? now : null,
    mergedInto: null,
    createdBy: ctx.callerUid,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection('readiness_soldiers').add(doc);

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'CREATE',
    targetEntity: 'ReadinessSoldier',
    targetId: ref.id,
    details: linkUid ? 'Created readiness soldier record (linked)' : 'Created readiness soldier record',
    oldValue: null,
    newValue: doc,
    sourceIp: ctx.sourceIp,
  });

  if (linkUid) {
    await writeReadinessAuditLog(db, {
      uid: ctx.callerUid,
      tokenEmail: ctx.tokenEmail,
      actionType: 'LINK',
      targetEntity: 'ReadinessSoldier',
      targetId: ref.id,
      details: `Linked uid ${linkUid} at creation`,
      oldValue: null,
      newValue: { uid: linkUid },
      sourceIp: ctx.sourceIp,
    });
  }

  return { status: 200, body: { soldierId: ref.id } };
}

// ── Bulk-create soldier records (atomic import) ─────────────────────────

/** Firestore WriteBatch hard-caps at 500 operations. David, 03.10.2026:
 * capped well under that (not at the exact ceiling) so a future field
 * added to this same batch doesn't silently break the import in the
 * field — and explicitly NOT split into multiple batches when exceeded,
 * since a 2nd batch failing after the 1st committed is "half a list in
 * costume." A caller over the cap gets a clear 400 telling them to split
 * into two imports themselves — never a silent/automatic split. */
export const BULK_IMPORT_MAX_ROWS = 300;

export interface BulkCreateSoldierRow {
  name: unknown;
  gender: unknown;
}

export type BulkCreateSoldiersResult =
  | { status: 200; body: { soldierIds: string[] } }
  | { status: 400 | 403 | 503; body: { error: string; invalidRows?: { index: number; error: string }[] } };

/**
 * ⚠️ SUPERSEDED 04.10.2026 (00-MASTER-PLAN.md §13.83) — the admin panel
 * no longer calls this function; /admin/authority/readiness/import now
 * calls computeBulkImportResults (below in this same file) instead,
 * which does everything this one does (name+gender bulk-create) plus
 * optional results in the same write. This function and its route
 * (/api/units/readiness/soldiers/bulk) are untouched and still fully
 * correct — kept, not deleted, as the rollback if something breaks in
 * production. Do not add new behavior here; computeBulkImportResults
 * is where the admin panel's bulk-import logic now lives.
 */

/**
 * Atomic bulk-create — David's explicit requirement: "הייבוא אטומי — או
 * שהכל נכנס או שכלום לא." computeCreateSoldier itself writes
 * immediately and individually (no batch param) — N sequential calls to
 * it would NOT be atomic, so this is a dedicated function, not a loop
 * calling computeCreateSoldier N times. Reuses the SAME validation
 * helpers computeCreateSoldier uses (validateSoldierName/
 * validateSoldierGender/resolveTenantAndUnit) — nothing reinvented, same
 * permission/scope checks, same error messages. No uid-linking path
 * here at all — bulk rows are name+gender only, matching the existing
 * model (point 13).
 *
 * Pattern mirrored from computeMergeSoldiers (this file, the merge op):
 * the data mutation is one WriteBatch/commit; the audit log is ONE
 * aggregate entry written AFTER the commit succeeds, not inside the
 * batch and not one entry per soldier (David: "פעולה אחת, רשומה אחת" —
 * per-soldier provenance already lives in createdBy/createdAt on each
 * record itself).
 */
export async function computeBulkCreateSoldiers(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<BulkCreateSoldiersResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const rawRows = requestBody.soldiers;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { status: 400, body: { error: 'soldiers is required and must be a non-empty array' } };
  }
  if (rawRows.length > BULK_IMPORT_MAX_ROWS) {
    return {
      status: 400,
      body: { error: `עד ${BULK_IMPORT_MAX_ROWS} חיילים בייבוא אחד — הרשימה הזו מכילה ${rawRows.length}. פצל לשתי העברות נפרדות.` },
    };
  }

  const tenantUnitResult = await resolveTenantAndUnit(db, scope, requestBody);
  if (!tenantUnitResult.ok) {
    return { status: tenantUnitResult.status, body: { error: tenantUnitResult.error } };
  }
  const { tenantId, unitId } = tenantUnitResult;

  // Validate EVERY row before writing anything at all — one invalid row
  // blocks the whole import (point: nothing is written before the
  // officer sees a clean preview; this is the server-side mirror of
  // that same rule, never trusting the client's own validation alone).
  const invalidRows: { index: number; error: string }[] = [];
  const validatedRows: { name: string; gender: ReadinessGender }[] = [];
  rawRows.forEach((row, index) => {
    if (typeof row !== 'object' || row === null) {
      invalidRows.push({ index, error: 'invalid row' });
      return;
    }
    const r = row as Record<string, unknown>;
    const nameResult = validateSoldierName(r.name);
    if (!nameResult.ok) {
      invalidRows.push({ index, error: nameResult.error });
      return;
    }
    const genderResult = validateSoldierGender(r.gender);
    if (!genderResult.ok) {
      invalidRows.push({ index, error: genderResult.error });
      return;
    }
    validatedRows.push({ name: nameResult.name, gender: genderResult.gender });
  });

  if (invalidRows.length > 0) {
    return { status: 400, body: { error: `${invalidRows.length} שורות לא תקינות`, invalidRows } };
  }

  const now = new Date();
  const batch = db.batch();
  const soldierIds: string[] = [];
  for (const row of validatedRows) {
    const ref = db.collection('readiness_soldiers').doc();
    const doc: Omit<ReadinessSoldier, 'id'> = {
      tenantId,
      unitId,
      name: row.name,
      gender: row.gender,
      uid: null,
      linkedAt: null,
      mergedInto: null,
      createdBy: ctx.callerUid,
      createdAt: now,
      updatedAt: now,
    };
    batch.create(ref, doc);
    soldierIds.push(ref.id);
  }
  await batch.commit();

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'CREATE',
    targetEntity: 'ReadinessSoldier',
    targetId: unitId,
    details: `Bulk-imported ${soldierIds.length} readiness soldier record(s) into unit ${unitId}`,
    oldValue: null,
    newValue: { tenantId, unitId, count: soldierIds.length },
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { soldierIds } };
}

// ── Bulk-import results (paste or file), two explicit modes ─────────────

/**
 * Firestore WriteBatch hard-caps at 500 operations. A results-import row
 * can need up to 4 operations in one batch (1 soldier-create in
 * 'new_roster' mode + up to 3 result-creates: run/pullups/dips) — unlike
 * computeBulkCreateSoldiers's 1-op-per-row shape, so that function's own
 * 300-row cap does NOT carry over here. 100 × 4 = 400, the same ~20%
 * margin-under-the-cap ratio as the existing 300/500 cap (David,
 * 04.10.2026, chose explicitly over keeping 300 and splitting batches —
 * same "never split into two batches" rule as computeBulkCreateSoldiers).
 */
export const BULK_RESULTS_IMPORT_MAX_ROWS = 100;

export type BulkResultsImportMode = 'new_roster' | 'existing_roster';

/**
 * Client-normalized values only — every raw text/time-format parsing
 * (paste or file) happens client-side before submission, same convention
 * as the existing single-entry screen's RunTimeInput (mm:ss → seconds
 * before it ever reaches the server). This function never sees a string
 * time value, never guesses a format — it only validates that a NUMBER
 * is present or absent.
 */
export interface BulkResultsImportRow {
  /** 'new_roster' mode only. */
  name?: unknown;
  /** 'new_roster' mode only. */
  gender?: unknown;
  /** 'existing_roster' mode only — resolved to a soldierId CLIENT-SIDE
   *  (the review step is where name-matching/ambiguity is shown to the
   *  officer); this function never matches by name itself, so the same
   *  matching logic never exists in two places that could disagree. */
  soldierId?: unknown;
  /** Per-row override of the top-level defaultTestDate. Absent/null = use the default. */
  testDate?: unknown;
  /** Absent/null = "not performed" for this test — never written as a
   *  result at all (not even a 'not_performed' outcome, which requires a
   *  specific reason this format doesn't capture). A soldier with no
   *  result document for a test reads as "טרם נבדק" at display time —
   *  exactly the point: an empty cell must never become a 0, and 0 is a
   *  real, distinct, failing value. */
  runSeconds?: unknown;
  pullupsReps?: unknown;
  dipsReps?: unknown;
}

export type BulkResultsImportResult =
  | { status: 200; body: { soldierIds: string[]; resultsWritten: number } }
  | { status: 400 | 403 | 503; body: { error: string; invalidRows?: { index: number; error: string }[] } };

const RESULT_VALUE_FIELDS: { testId: string; field: 'runSeconds' | 'pullupsReps' | 'dipsReps' }[] = [
  { testId: 'run_3000m', field: 'runSeconds' },
  { testId: 'pullups', field: 'pullupsReps' },
  { testId: 'dips', field: 'dipsReps' },
];

/**
 * A fresh, standalone date-range check for this function only — NOT
 * extracted out of computeRecordResult's own inline version (David,
 * explicit: don't touch any existing function in this file). Same rule,
 * duplicated rather than shared: not in the future, not more than 90
 * days back, compared by calendar day.
 */
function validateImportTestDate(raw: unknown): { ok: true; date: Date } | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'תאריך בוחן נדרש' };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'תאריך בוחן אינו תקין' };
  }
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = startOfDay(date);
  const todayMs = startOfDay(now);
  if (dayMs > todayMs) {
    return { ok: false, error: 'תאריך הבוחן לא יכול להיות בעתיד.' };
  }
  if (todayMs - dayMs > 90 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'תאריך הבוחן רחוק מדי בעבר — עד 90 יום אחורה בלבד.' };
  }
  return { ok: true, date };
}

/** Same pass/fail comparison computeRecordResult's own inline version
 *  uses (lowerIsBetter-aware), factored out here only because THIS
 *  function calls it once per test per row — not shared with
 *  computeRecordResult, which keeps its own copy untouched. */
function computeOutcomeForValue(
  test: ReadinessTestDefinition,
  config: ReadinessThresholdsConfig,
  gender: ReadinessGender,
  value: number,
): { outcome: ReadinessOutcome; thresholdSnapshot: ReadinessThresholdSnapshot } {
  const thresholdValue = test.threshold[gender];
  const outcome: ReadinessOutcome = test.lowerIsBetter
    ? (value <= thresholdValue ? 'pass' : 'fail')
    : (value >= thresholdValue ? 'pass' : 'fail');
  return {
    outcome,
    thresholdSnapshot: {
      thresholdVersion: config.version,
      gender,
      thresholdValue,
      lowerIsBetter: test.lowerIsBetter,
      validityDays: test.validityDays,
    },
  };
}

interface ValidatedImportRow {
  name: string | null;
  gender: ReadinessGender;
  /** null in 'new_roster' mode (not yet created); a real id in 'existing_roster' mode. */
  soldierId: string | null;
  /** Denormalized read-key for the result docs below (ReadinessResult.uid
   *  — see its own doc comment). Always null in 'new_roster' mode (a
   *  freshly-created soldier is never linked). In 'existing_roster' mode,
   *  the EXISTING soldier's real current uid, read once during
   *  validation — never re-derived at write time. */
  uid: string | null;
  testDate: Date;
  values: { testId: string; value: number }[];
}

/**
 * Two explicit, officer-chosen modes sharing one function (David,
 * 04.10.2026, §13.83) — 'new_roster' creates soldiers (results
 * optional, same as computeBulkCreateSoldiers's existing shape, just
 * extended); 'existing_roster' creates NO soldier, ever — a name that
 * doesn't resolve to exactly one existing record is resolved (or
 * rejected) in the CLIENT-side review step, never guessed here. Same
 * pattern as computeBulkCreateSoldiers, mirrored exactly: validate
 * EVERY row first (collect invalidRows, 400 on any failure, nothing
 * written), then ONE WriteBatch for the whole operation, then ONE
 * aggregate audit log entry after commit — never split into two
 * batches, never one audit entry per row.
 */
export async function computeBulkImportResults(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<BulkResultsImportResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const mode = requestBody.mode;
  if (mode !== 'new_roster' && mode !== 'existing_roster') {
    return { status: 400, body: { error: 'mode must be new_roster or existing_roster' } };
  }

  const rawRows = requestBody.rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { status: 400, body: { error: 'rows is required and must be a non-empty array' } };
  }
  if (rawRows.length > BULK_RESULTS_IMPORT_MAX_ROWS) {
    return {
      status: 400,
      body: { error: `עד ${BULK_RESULTS_IMPORT_MAX_ROWS} שורות בייבוא אחד — הרשימה הזו מכילה ${rawRows.length}. פצל לשתי העברות נפרדות.` },
    };
  }

  const tenantUnitResult = await resolveTenantAndUnit(db, scope, requestBody);
  if (!tenantUnitResult.ok) {
    return { status: tenantUnitResult.status, body: { error: tenantUnitResult.error } };
  }
  const { tenantId, unitId } = tenantUnitResult;

  const defaultDateResult = validateImportTestDate(requestBody.defaultTestDate);
  if (!defaultDateResult.ok) {
    return { status: 400, body: { error: defaultDateResult.error } };
  }

  // Thresholds are only needed if at least one row carries at least one
  // numeric value — a pure 'new_roster' name+gender import (results
  // optional, point in the spec) never has to touch this collection.
  const anyValuePresent = rawRows.some((row) => {
    if (typeof row !== 'object' || row === null) return false;
    const r = row as Record<string, unknown>;
    return RESULT_VALUE_FIELDS.some(({ field }) => typeof r[field] === 'number');
  });

  let config: ReadinessThresholdsConfig | null = null;
  if (anyValuePresent) {
    const configSnap = await db.collection('readiness_thresholds').doc(THRESHOLDS_DOC_ID).get();
    if (!configSnap.exists) {
      return { status: 400, body: { error: 'לא הוגדר סף כשירות גלובלי.' } };
    }
    config = configSnap.data() as ReadinessThresholdsConfig;
  }

  // 'existing_roster' mode — fetch every referenced soldier ONCE up
  // front (deduplicated), before validating any individual row. Never a
  // name-match here: the client already resolved name → soldierId in
  // the review step (including ambiguity), so this function only ever
  // confirms the id it was given is real, unmerged, in the right
  // tenant/unit, and in the caller's own scope.
  const existingSoldierById = new Map<string, { tenantId: string; unitId: string; gender: ReadinessGender; uid: string | null; mergedInto: string | null }>();
  if (mode === 'existing_roster') {
    const ids = Array.from(new Set(
      rawRows
        .map((r) => (typeof r === 'object' && r !== null ? (r as Record<string, unknown>).soldierId : null))
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    ));
    const snaps = await Promise.all(ids.map((id) => db.collection('readiness_soldiers').doc(id).get()));
    snaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const data = snap.data() as Omit<ReadinessSoldier, 'id'>;
      existingSoldierById.set(ids[i], { tenantId: data.tenantId, unitId: data.unitId, gender: data.gender, uid: data.uid, mergedInto: data.mergedInto });
    });
  }

  const invalidRows: { index: number; error: string }[] = [];
  const validated: ValidatedImportRow[] = [];

  rawRows.forEach((row, index) => {
    if (typeof row !== 'object' || row === null) {
      invalidRows.push({ index, error: 'invalid row' });
      return;
    }
    const r = row as Record<string, unknown>;

    let name: string | null = null;
    let gender: ReadinessGender;
    let soldierId: string | null = null;
    let uid: string | null = null;

    if (mode === 'new_roster') {
      const nameResult = validateSoldierName(r.name);
      if (!nameResult.ok) { invalidRows.push({ index, error: nameResult.error }); return; }
      const genderResult = validateSoldierGender(r.gender);
      if (!genderResult.ok) { invalidRows.push({ index, error: genderResult.error }); return; }
      name = nameResult.name;
      gender = genderResult.gender;
    } else {
      const rawId = r.soldierId;
      if (typeof rawId !== 'string' || !rawId.trim()) {
        invalidRows.push({ index, error: 'soldierId is required' });
        return;
      }
      soldierId = rawId.trim();
      const existing = existingSoldierById.get(soldierId);
      if (!existing) {
        invalidRows.push({ index, error: 'soldierId not found' });
        return;
      }
      if (existing.mergedInto) {
        invalidRows.push({ index, error: 'soldier record was merged into another' });
        return;
      }
      if (existing.tenantId !== tenantId || existing.unitId !== unitId) {
        invalidRows.push({ index, error: 'soldier does not belong to this unit' });
        return;
      }
      if (!isMemberWithinScope(scope, existing.tenantId, existing.unitId)) {
        invalidRows.push({ index, error: DENIED_MESSAGE });
        return;
      }
      gender = existing.gender;
      uid = existing.uid;
    }

    const rowDate = r.testDate !== undefined && r.testDate !== null
      ? validateImportTestDate(r.testDate)
      : { ok: true as const, date: defaultDateResult.date };
    if (!rowDate.ok) {
      invalidRows.push({ index, error: rowDate.error });
      return;
    }

    const values: { testId: string; value: number }[] = [];
    for (const { testId, field } of RESULT_VALUE_FIELDS) {
      const raw = r[field];
      if (raw === undefined || raw === null) continue; // empty cell = not performed, never written as 0
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        invalidRows.push({ index, error: `${field} is not a valid number` });
        return;
      }
      if (!config || !config.tests.find((t) => t.id === testId)) {
        invalidRows.push({ index, error: `${testId} אינו קיים בהגדרת הסף הגלובלית` });
        return;
      }
      values.push({ testId, value: raw });
    }

    validated.push({ name, gender, soldierId, uid, testDate: rowDate.date, values });
  });

  if (invalidRows.length > 0) {
    return { status: 400, body: { error: `${invalidRows.length} שורות לא תקינות`, invalidRows } };
  }

  const now = new Date();
  const batch = db.batch();
  const soldierIds: string[] = [];
  let resultsWritten = 0;

  for (const row of validated) {
    let soldierId: string;
    if (row.soldierId) {
      soldierId = row.soldierId;
    } else {
      const ref = db.collection('readiness_soldiers').doc();
      const soldierDoc: Omit<ReadinessSoldier, 'id'> = {
        tenantId,
        unitId,
        name: row.name!,
        gender: row.gender,
        uid: null,
        linkedAt: null,
        mergedInto: null,
        createdBy: ctx.callerUid,
        createdAt: now,
        updatedAt: now,
      };
      batch.create(ref, soldierDoc);
      soldierId = ref.id;
    }
    soldierIds.push(soldierId);

    for (const { testId, value } of row.values) {
      const test = config!.tests.find((t) => t.id === testId)!;
      const { outcome, thresholdSnapshot } = computeOutcomeForValue(test, config!, row.gender, value);
      const resultRef = db.collection('readiness_results').doc();
      const resultDoc: Omit<ReadinessResult, 'id'> = {
        soldierId,
        tenantId,
        unitId,
        testId,
        outcome,
        value,
        notPerformedReason: null,
        source: 'organized_test',
        thresholdSnapshot,
        recordedBy: ctx.callerUid,
        recordedAt: now,
        testDate: row.testDate,
        // Same denormalized read-key convention as computeRecordResult —
        // resolved once during validation (ValidatedImportRow.uid): null
        // for a soldier created in this same batch ('new_roster' mode,
        // never linked at creation), or the EXISTING soldier's real
        // current uid in 'existing_roster' mode.
        uid: row.uid,
      };
      batch.create(resultRef, resultDoc);
      resultsWritten++;
    }
  }

  await batch.commit();

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'CREATE',
    targetEntity: 'ReadinessResult',
    targetId: unitId,
    details: mode === 'new_roster'
      ? `Bulk-imported ${soldierIds.length} readiness soldier record(s) with ${resultsWritten} result(s) into unit ${unitId}`
      : `Bulk-imported ${resultsWritten} readiness result(s) for ${soldierIds.length} existing soldier(s) in unit ${unitId}`,
    oldValue: null,
    newValue: { tenantId, unitId, mode, soldiersCreated: mode === 'new_roster' ? soldierIds.length : 0, resultsWritten },
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { soldierIds, resultsWritten } };
}

// ── Link ─────────────────────────────────────────────────────────────────

export type LinkSoldierResult =
  | { status: 200; body: { soldierId: string } }
  | { status: 400 | 403 | 404 | 409 | 503; body: { error: string } };

export async function computeLinkSoldier(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<LinkSoldierResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const soldierId = requestBody.soldierId;
  const targetUid = requestBody.uid;
  if (typeof soldierId !== 'string' || !soldierId.trim()) {
    return { status: 400, body: { error: 'soldierId is required' } };
  }
  if (typeof targetUid !== 'string' || !targetUid.trim()) {
    return { status: 400, body: { error: 'uid is required' } };
  }

  const soldierRef = db.collection('readiness_soldiers').doc(soldierId);
  const targetRef = db.collection('users').doc(targetUid);

  // Point 7's uniqueness pair enforced inside one transaction: (a) this
  // soldier record must not already be linked to someone else, (b) this
  // uid must not already be linked to a different soldier record anywhere
  // in the system. A second, out-of-transaction query can't race-proof
  // (b) — both reads and the write live in the same transaction.
  //
  // 01.10.2026 (David, rules review round) — this soldier's EXISTING
  // results also get their denormalized `uid` updated here, in the same
  // transaction as the soldier-record link. Firestore requires every read
  // in a transaction to happen before any write, so the results query is
  // read alongside the other three below, not deferred until after the
  // soldier doc is validated.
  const result = await db.runTransaction<LinkSoldierResult>(async (tx: Transaction) => {
    const [soldierSnap, targetSnap, dupSnap, existingResultsSnap] = await Promise.all([
      tx.get(soldierRef),
      tx.get(targetRef),
      tx.get(db.collection('readiness_soldiers').where('uid', '==', targetUid).limit(2)),
      tx.get(db.collection('readiness_results').where('soldierId', '==', soldierId)),
    ]);

    if (!soldierSnap.exists) {
      return { status: 404, body: { error: 'רשומת חייל לא נמצאה.' } };
    }
    if (!targetSnap.exists) {
      return { status: 400, body: { error: 'uid does not exist' } };
    }

    const soldier = soldierSnap.data() as Omit<ReadinessSoldier, 'id'>;
    if (soldier.mergedInto) {
      return { status: 409, body: { error: 'רשומה זו מוזגה לרשומה אחרת ואינה ניתנת לשיוך.' } };
    }
    if (soldier.uid) {
      return { status: 409, body: { error: 'רשומה זו כבר משויכת לחשבון אחר. בטל שיוך קודם.' } };
    }
    if (!isMemberWithinScope(scope, soldier.tenantId, soldier.unitId)) {
      return { status: 403, body: { error: DENIED_MESSAGE } };
    }

    const targetCore = (targetSnap.data()?.core ?? {}) as { tenantId?: unknown; unitId?: unknown };
    if (!isMemberWithinScope(scope, targetCore.tenantId, targetCore.unitId)) {
      return { status: 403, body: { error: DENIED_MESSAGE } };
    }

    const dupExists = dupSnap.docs.some((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data() as { mergedInto?: unknown };
      return !data.mergedInto; // a merged-away duplicate doesn't block — it's no longer a live link
    });
    if (dupExists) {
      return { status: 409, body: { error: 'חשבון זה כבר משויך לרשומת חייל אחרת.' } };
    }

    const now = new Date();
    tx.update(soldierRef, { uid: targetUid, linkedAt: now, updatedAt: now });
    // This is NOT a history rewrite (points 9/12 still hold for
    // outcome/value/thresholdSnapshot/etc.) — `uid` is a deliberate,
    // documented exception: a denormalized read-key only, re-synced here
    // on purpose. Do not "fix" this into only touching new results.
    for (const resultDoc of existingResultsSnap.docs) {
      tx.update(resultDoc.ref, { uid: targetUid });
    }

    return { status: 200, body: { soldierId } };
  });

  if (result.status === 200) {
    await writeReadinessAuditLog(db, {
      uid: ctx.callerUid,
      tokenEmail: ctx.tokenEmail,
      actionType: 'LINK',
      targetEntity: 'ReadinessSoldier',
      targetId: soldierId,
      details: `Linked uid ${targetUid}`,
      oldValue: { uid: null },
      newValue: { uid: targetUid },
      sourceIp: ctx.sourceIp,
    });
  }

  return result;
}

// ── Match suggestions: reject + bulk-approve ─────────────────────────────

export type RejectReadinessMatchResult =
  | { status: 200; body: { soldierId: string } }
  | { status: 400 | 403 | 404 | 503; body: { error: string } };

/**
 * "לא הוא" (David, §13.84) — remembers a rejected (soldierId, uid) pair
 * forever, on the soldier record itself (rejectedUids, FieldValue.
 * arrayUnion), so computeReadinessMatchSuggestions never re-offers it.
 * Same scope-check shape as computeLinkSoldier/computeUnlinkSoldier —
 * deliberately NOT a transaction (unlike computeLinkSoldier): rejecting
 * a candidate has no uniqueness invariant to protect, a single
 * conditional update is enough and keeps this function simple.
 */
export async function computeRejectReadinessMatch(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<RejectReadinessMatchResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const soldierId = requestBody.soldierId;
  const rejectedUid = requestBody.uid;
  if (typeof soldierId !== 'string' || !soldierId.trim()) {
    return { status: 400, body: { error: 'soldierId is required' } };
  }
  if (typeof rejectedUid !== 'string' || !rejectedUid.trim()) {
    return { status: 400, body: { error: 'uid is required' } };
  }

  const soldierRef = db.collection('readiness_soldiers').doc(soldierId);
  const soldierSnap = await soldierRef.get();
  if (!soldierSnap.exists) {
    return { status: 404, body: { error: 'רשומת חייל לא נמצאה.' } };
  }
  const soldier = soldierSnap.data() as Omit<ReadinessSoldier, 'id'>;
  if (soldier.mergedInto) {
    return { status: 400, body: { error: 'רשומה זו מוזגה לרשומה אחרת.' } };
  }
  if (!isMemberWithinScope(scope, soldier.tenantId, soldier.unitId)) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  await soldierRef.update({
    rejectedUids: FieldValue.arrayUnion(rejectedUid),
    updatedAt: new Date(),
  });

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'UPDATE',
    targetEntity: 'ReadinessSoldier',
    targetId: soldierId,
    details: `Rejected a match suggestion (uid ${rejectedUid})`,
    oldValue: null,
    newValue: { rejectedUid },
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { soldierId } };
}

/** Firestore WriteBatch's 500-op cap doesn't apply here the way it does
 *  for computeBulkCreateSoldiers/computeBulkImportResults — this
 *  function never builds one batch at all (see its own doc comment for
 *  why). 100 chosen for consistency with those two rounds' same-shaped
 *  cap, not because of a different Firestore ceiling here. */
export const BULK_APPROVE_MATCHES_MAX_PAIRS = 100;

export interface BulkApproveMatchesResult200 {
  linked: string[];
  failed: { soldierId: string; error: string }[];
}
export type BulkApproveMatchesResult =
  | { status: 200; body: BulkApproveMatchesResult200 }
  | { status: 400 | 403 | 503; body: { error: string } };

/**
 * "אשר את כל ההתאמות החד-משמעיות" (David, §13.84) — David's explicit
 * constraint: "הכתיבה דרך computeLinkSoldier הקיים. אל תיצור נתיב קישור
 * שני." This function creates NO new linking logic whatsoever — it is
 * purely an orchestrator that calls computeLinkSoldier once per pair,
 * unchanged, in a loop. Deliberately NOT one Firestore WriteBatch/
 * transaction spanning all pairs: computeLinkSoldier already wraps each
 * link in its OWN transaction (soldier/user/dup-check reads, point 7's
 * system-wide uniqueness) — collapsing N independent people's links
 * into one shared transaction would mean either reimplementing that
 * uniqueness check at a different granularity (the "second linking
 * path" David explicitly forbade) or accepting that Firestore
 * transactions don't compose that way to begin with. One person's
 * conflict (e.g. linked elsewhere a moment ago) does not block the
 * other 99 — each pair's outcome is reported individually in `linked`/
 * `failed`, never silently swallowed.
 */
export async function computeBulkApproveReadinessMatches(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<BulkApproveMatchesResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const rawPairs = requestBody.pairs;
  if (!Array.isArray(rawPairs) || rawPairs.length === 0) {
    return { status: 400, body: { error: 'pairs is required and must be a non-empty array' } };
  }
  if (rawPairs.length > BULK_APPROVE_MATCHES_MAX_PAIRS) {
    return {
      status: 400,
      body: { error: `עד ${BULK_APPROVE_MATCHES_MAX_PAIRS} אישורים בפעולה אחת — הרשימה הזו מכילה ${rawPairs.length}. פצל לשתי העברות נפרדות.` },
    };
  }

  const linked: string[] = [];
  const failed: { soldierId: string; error: string }[] = [];

  for (const raw of rawPairs) {
    if (typeof raw !== 'object' || raw === null) {
      failed.push({ soldierId: '', error: 'invalid pair' });
      continue;
    }
    const r = raw as Record<string, unknown>;
    const soldierId = typeof r.soldierId === 'string' ? r.soldierId : '';
    const uid = typeof r.uid === 'string' ? r.uid : '';
    if (!soldierId || !uid) {
      failed.push({ soldierId: soldierId || '', error: 'soldierId and uid are required' });
      continue;
    }
    // Every scope/uniqueness/validity check lives inside this ONE call —
    // nothing above re-derives or re-checks any of it.
    const result = await computeLinkSoldier(db, scope, { soldierId, uid }, ctx);
    if (result.status === 200) {
      linked.push(soldierId);
    } else {
      failed.push({ soldierId, error: result.body.error });
    }
  }

  return { status: 200, body: { linked, failed } };
}

// ── Unlink ───────────────────────────────────────────────────────────────

export type UnlinkSoldierResult =
  | { status: 200; body: { soldierId: string } }
  | { status: 400 | 403 | 404 | 503; body: { error: string } };

export async function computeUnlinkSoldier(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<UnlinkSoldierResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const soldierId = requestBody.soldierId;
  if (typeof soldierId !== 'string' || !soldierId.trim()) {
    return { status: 400, body: { error: 'soldierId is required' } };
  }

  const soldierRef = db.collection('readiness_soldiers').doc(soldierId);

  // Point 5 — unlinking never changes which soldierId a result belongs to;
  // soldierId stays the anchor. But (01.10.2026, David, rules review
  // round) the denormalized `uid` read-key on every one of this soldier's
  // EXISTING results must be cleared to null atomically with the soldier
  // record's own unlink — otherwise a soldier could, for a window, see
  // PART of their result history (whatever hadn't been cleared yet) and
  // not the rest, once the firestore.rules self-read rule compares
  // resource.data.uid directly. Same transactional shape as
  // computeLinkSoldier: all reads (soldier + their results) happen before
  // any write, per Firestore's transaction rules.
  const txResult = await db.runTransaction<UnlinkSoldierResult & { previousUid?: string }>(async (tx: Transaction) => {
    const [snap, existingResultsSnap] = await Promise.all([
      tx.get(soldierRef),
      tx.get(db.collection('readiness_results').where('soldierId', '==', soldierId)),
    ]);

    if (!snap.exists) {
      return { status: 404, body: { error: 'רשומת חייל לא נמצאה.' } };
    }
    const soldier = snap.data() as Omit<ReadinessSoldier, 'id'>;
    if (!isMemberWithinScope(scope, soldier.tenantId, soldier.unitId)) {
      return { status: 403, body: { error: DENIED_MESSAGE } };
    }
    if (!soldier.uid) {
      return { status: 400, body: { error: 'רשומה זו אינה משויכת לחשבון.' } };
    }

    const previousUid = soldier.uid;
    tx.update(soldierRef, { uid: null, linkedAt: null, updatedAt: new Date() });
    // Same deliberate exception as computeLinkSoldier above — `uid` is a
    // read-key, not part of the frozen history (points 9/12). Clearing
    // it on every existing result here is intentional, not a regression.
    for (const resultDoc of existingResultsSnap.docs) {
      tx.update(resultDoc.ref, { uid: null });
    }

    return { status: 200, body: { soldierId }, previousUid };
  });

  if (txResult.status !== 200) {
    return txResult;
  }
  const previousUid = txResult.previousUid as string;

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'UNLINK',
    targetEntity: 'ReadinessSoldier',
    targetId: soldierId,
    details: `Unlinked uid ${previousUid}`,
    oldValue: { uid: previousUid },
    newValue: { uid: null },
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { soldierId } };
}

// ── Merge (root-only) ───────────────────────────────────────────────────

export type MergeSoldiersResult =
  | { status: 200; body: { survivorId: string; mergedId: string; movedResults: number } }
  | { status: 400 | 403 | 404 | 409; body: { error: string } };

export async function computeMergeSoldiers(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<MergeSoldiersResult> {
  if (scope.kind !== 'root') {
    return { status: 403, body: { error: ROOT_ONLY_MESSAGE } };
  }

  const survivorId = requestBody.survivorId;
  const mergedId = requestBody.mergedId;
  if (typeof survivorId !== 'string' || !survivorId.trim() || typeof mergedId !== 'string' || !mergedId.trim()) {
    return { status: 400, body: { error: 'survivorId and mergedId are required' } };
  }
  if (survivorId === mergedId) {
    return { status: 400, body: { error: 'survivorId and mergedId must differ' } };
  }

  const survivorRef = db.collection('readiness_soldiers').doc(survivorId);
  const mergedRef = db.collection('readiness_soldiers').doc(mergedId);
  const [survivorSnap, mergedSnap] = await Promise.all([survivorRef.get(), mergedRef.get()]);

  if (!survivorSnap.exists || !mergedSnap.exists) {
    return { status: 404, body: { error: 'אחת הרשומות לא נמצאה.' } };
  }
  const survivor = survivorSnap.data() as Omit<ReadinessSoldier, 'id'>;
  const merged = mergedSnap.data() as Omit<ReadinessSoldier, 'id'>;

  if (survivor.mergedInto || merged.mergedInto) {
    return { status: 409, body: { error: 'אחת הרשומות כבר מוזגה בעבר.' } };
  }
  if (merged.uid && survivor.uid && merged.uid !== survivor.uid) {
    return { status: 409, body: { error: 'שתי הרשומות משויכות לחשבונות שונים — לא ניתן למזג אוטומטית. בטל שיוך אחד תחילה.' } };
  }

  // Point 9 — results are never deleted or rewritten; they're
  // re-pointed to the survivor's soldierId, keeping every original
  // thresholdSnapshot/outcome/recordedAt intact. `uid` is the one
  // DELIBERATE exception (see ReadinessResult's own comment) — a
  // denormalized read-key only, not an audited datum, not a history
  // rewrite. Both the moved results AND the survivor's own pre-existing
  // results are reconciled to the survivor's FINAL uid below (01.10.2026,
  // David, rules review round), so the invariant "every result's uid
  // matches its soldier's current uid" holds after a merge too, not just
  // after link/unlink. Do not "fix" this into leaving uid untouched.
  const finalUid = survivor.uid ?? merged.uid ?? null;
  const [orphanResults, survivorExistingResults] = await Promise.all([
    db.collection('readiness_results').where('soldierId', '==', mergedId).get(),
    db.collection('readiness_results').where('soldierId', '==', survivorId).get(),
  ]);

  const batch = db.batch();
  for (const doc of orphanResults.docs) {
    batch.update(doc.ref, { soldierId: survivorId, uid: finalUid });
  }
  for (const doc of survivorExistingResults.docs) {
    batch.update(doc.ref, { uid: finalUid });
  }
  batch.update(mergedRef, { mergedInto: survivorId, updatedAt: new Date() });
  if (!survivor.uid && merged.uid) {
    batch.update(survivorRef, { uid: merged.uid, linkedAt: merged.linkedAt ?? new Date(), updatedAt: new Date() });
  }
  await batch.commit();

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'MERGE',
    targetEntity: 'ReadinessSoldier',
    targetId: survivorId,
    details: `Merged ${mergedId} into ${survivorId} (${orphanResults.size} result(s) moved)`,
    oldValue: { survivorId, mergedId },
    newValue: { survivorId, mergedId, movedResults: orphanResults.size },
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { survivorId, mergedId, movedResults: orphanResults.size } };
}

// ── Thresholds (global config) ──────────────────────────────────────────

export type GetThresholdsResult =
  | { status: 200; body: { config: ReadinessThresholdsConfig | null } }
  | { status: 403 | 503; body: { error: string } };

export async function computeGetThresholds(
  db: Firestore,
  scope: UnitPermissionScope,
): Promise<GetThresholdsResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }
  if (scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind !== 'unitAdmin') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }
  const snap = await db.collection('readiness_thresholds').doc(THRESHOLDS_DOC_ID).get();
  if (!snap.exists) {
    return { status: 200, body: { config: null } };
  }
  return { status: 200, body: { config: snap.data() as ReadinessThresholdsConfig } };
}

export type SetThresholdsResult =
  | { status: 200; body: { version: number } }
  | { status: 400 | 403; body: { error: string } };

export async function computeSetThresholds(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<SetThresholdsResult> {
  if (scope.kind !== 'root') {
    return { status: 403, body: { error: ROOT_ONLY_MESSAGE } };
  }

  const tests = requestBody.tests;
  if (!Array.isArray(tests) || tests.length === 0) {
    return { status: 400, body: { error: 'tests must be a non-empty array' } };
  }
  const validated: ReadinessTestDefinition[] = [];
  for (const raw of tests) {
    const t = raw as Partial<ReadinessTestDefinition>;
    if (
      typeof t.id !== 'string' || !t.id.trim() ||
      typeof t.label !== 'string' || !t.label.trim() ||
      typeof t.metric !== 'string' || !t.metric.trim() ||
      typeof t.unit !== 'string' || !t.unit.trim() ||
      typeof t.lowerIsBetter !== 'boolean' ||
      !t.threshold || typeof t.threshold.male !== 'number' || typeof t.threshold.female !== 'number'
    ) {
      return { status: 400, body: { error: `test definition invalid: ${JSON.stringify(raw)}` } };
    }
    validated.push({
      id: t.id.trim(),
      label: t.label.trim(),
      metric: t.metric.trim(),
      unit: t.unit.trim(),
      lowerIsBetter: t.lowerIsBetter,
      threshold: { male: t.threshold.male, female: t.threshold.female },
      validityDays: typeof t.validityDays === 'number' && t.validityDays > 0 ? t.validityDays : 365,
    });
  }

  const ref = db.collection('readiness_thresholds').doc(THRESHOLDS_DOC_ID);
  const existing = await ref.get();
  const prevVersion = existing.exists ? ((existing.data() as ReadinessThresholdsConfig).version ?? 0) : 0;
  const newVersion = prevVersion + 1;

  const doc: ReadinessThresholdsConfig = {
    id: 'global',
    version: newVersion,
    tests: validated,
    updatedBy: ctx.callerUid,
    updatedAt: new Date(),
  };
  await ref.set(doc);

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'UPDATE',
    targetEntity: 'ReadinessThresholds',
    targetId: THRESHOLDS_DOC_ID,
    details: `Updated global readiness thresholds to version ${newVersion}`,
    oldValue: existing.exists ? existing.data() : null,
    newValue: doc,
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { version: newVersion } };
}

// ── Record a result ─────────────────────────────────────────────────────

export type RecordResultResult =
  | { status: 200; body: { resultId: string; outcome: ReadinessOutcome } }
  | { status: 400 | 403 | 404 | 503; body: { error: string } };

export async function computeRecordResult(
  db: Firestore,
  scope: UnitPermissionScope,
  requestBody: Record<string, unknown>,
  ctx: ReadinessCtx,
): Promise<RecordResultResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: 'לא הצלחנו לאמת את ההרשאה שלך כרגע. נסה שוב בעוד רגע.' } };
  }

  const soldierId = requestBody.soldierId;
  const testId = requestBody.testId;
  const source = requestBody.source;
  if (typeof soldierId !== 'string' || !soldierId.trim()) {
    return { status: 400, body: { error: 'soldierId is required' } };
  }
  if (typeof testId !== 'string' || !testId.trim()) {
    return { status: 400, body: { error: 'testId is required' } };
  }
  if (source !== 'organized_test' && source !== 'app_measurement' && source !== 'self_report') {
    return { status: 400, body: { error: 'source must be organized_test|app_measurement|self_report' } };
  }

  // 03.10.2026 (David) — an organized test happens on paper in the field
  // and is typed in days later; recordedAt (below, write-time "now") is
  // never the right date to represent WHEN THE TEST HAPPENED. testDate is
  // client-chosen, server-validated — rejected with a clear message on
  // an invalid date, never silently corrected or defaulted. Compared by
  // calendar day, not exact timestamp, so a same-day entry near midnight
  // isn't rejected as "future" by a timezone quirk.
  const testDateRaw = requestBody.testDate;
  if (typeof testDateRaw !== 'string' || !testDateRaw.trim()) {
    return { status: 400, body: { error: 'testDate is required' } };
  }
  const testDate = new Date(testDateRaw);
  if (Number.isNaN(testDate.getTime())) {
    return { status: 400, body: { error: 'testDate is not a valid date' } };
  }
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const testDayMs = startOfDay(testDate);
  const todayMs = startOfDay(now);
  if (testDayMs > todayMs) {
    return { status: 400, body: { error: 'תאריך הבוחן לא יכול להיות בעתיד.' } };
  }
  if (todayMs - testDayMs > 90 * 24 * 60 * 60 * 1000) {
    return { status: 400, body: { error: 'תאריך הבוחן רחוק מדי בעבר — עד 90 יום אחורה בלבד.' } };
  }

  const soldierSnap = await db.collection('readiness_soldiers').doc(soldierId).get();
  if (!soldierSnap.exists) {
    return { status: 404, body: { error: 'רשומת חייל לא נמצאה.' } };
  }
  const soldier = soldierSnap.data() as Omit<ReadinessSoldier, 'id'>;
  if (soldier.mergedInto) {
    return { status: 400, body: { error: 'רשומה זו מוזגה לרשומה אחרת.' } };
  }

  // Authorization: an officer with scope over this soldier's unit, OR the
  // soldier recording their own result (requires the record to already be
  // linked to them — an unlinked record has no uid, so this path is never
  // reachable for a record that isn't theirs). The self path is checked
  // independently of scope.kind — including 'denied'/'unknown' — because
  // an ordinary soldier legitimately resolves to no managerial scope at
  // all; that's expected, not a reason to block self-reporting.
  const isSelf = soldier.uid !== null && soldier.uid === ctx.callerUid;
  const isOfficerInScope =
    (scope.kind === 'root' || scope.kind === 'tenantOwner' || scope.kind === 'unitAdmin') &&
    isMemberWithinScope(scope, soldier.tenantId, soldier.unitId);
  if (!isSelf && !isOfficerInScope) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const notPerformedReasonRaw = requestBody.notPerformedReason;
  const isNotPerformed = notPerformedReasonRaw === 'medical_exemption' || notPerformedReasonRaw === 'no_show' || notPerformedReasonRaw === 'other';

  let outcome: ReadinessOutcome;
  let value: number | null = null;
  let notPerformedReason: NotPerformedReason | null = null;
  let thresholdSnapshot: ReadinessThresholdSnapshot | null = null;

  if (isNotPerformed) {
    // Point 11 — a full state, not a hole. Never counted as a fail.
    outcome = 'not_performed';
    notPerformedReason = notPerformedReasonRaw as NotPerformedReason;
  } else {
    // Point 2/point-2-corollary — the client sends a raw measured value
    // only. There is no field anywhere in this body that lets a caller
    // send 'pass'/'fail'/'outcome' directly; it is computed below, from
    // the CURRENT global threshold, and frozen onto the result.
    const rawValue = requestBody.value;
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      return { status: 400, body: { error: 'value (number) or notPerformedReason is required' } };
    }

    const configSnap = await db.collection('readiness_thresholds').doc(THRESHOLDS_DOC_ID).get();
    if (!configSnap.exists) {
      return { status: 400, body: { error: 'לא הוגדר סף כשירות גלובלי.' } };
    }
    const config = configSnap.data() as ReadinessThresholdsConfig;
    const test = config.tests.find((t) => t.id === testId);
    if (!test) {
      return { status: 400, body: { error: 'testId אינו קיים בהגדרת הסף הגלובלית.' } };
    }

    const thresholdValue = test.threshold[soldier.gender];
    outcome = test.lowerIsBetter
      ? (rawValue <= thresholdValue ? 'pass' : 'fail')
      : (rawValue >= thresholdValue ? 'pass' : 'fail');
    value = rawValue;
    thresholdSnapshot = {
      thresholdVersion: config.version,
      gender: soldier.gender,
      thresholdValue,
      lowerIsBetter: test.lowerIsBetter,
      validityDays: test.validityDays,
    };
  }

  const doc: Omit<ReadinessResult, 'id'> = {
    soldierId,
    tenantId: soldier.tenantId,
    unitId: soldier.unitId,
    testId,
    outcome,
    value,
    notPerformedReason,
    source,
    thresholdSnapshot,
    recordedBy: ctx.callerUid,
    recordedAt: new Date(),
    testDate,
    // Denormalized read-key (see ReadinessResult's own comment) —
    // snapshotted from the soldier record fetched above. A soldier
    // linked/unlinked between this fetch and the write below would see
    // the new result briefly carry a stale uid until their next
    // link/unlink op re-syncs it (computeLinkSoldier/computeUnlinkSoldier
    // only touch EXISTING results at the moment they run) — a narrow,
    // accepted race, not covered by a transaction here since this
    // function wasn't asked to be transactional with the soldier fetch.
    uid: soldier.uid,
  };

  const ref = await db.collection('readiness_results').add(doc);

  await writeReadinessAuditLog(db, {
    uid: ctx.callerUid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'CREATE',
    targetEntity: 'ReadinessResult',
    targetId: ref.id,
    details: `Recorded readiness result for soldier ${soldierId}, test ${testId}: ${outcome}`,
    oldValue: null,
    newValue: doc,
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { resultId: ref.id, outcome } };
}

// ── Current status derivation (pure, read-side) ─────────────────────────

/**
 * Point 10 — an expired result is never rewritten; this function just
 * decides how to DISPLAY the soldier's current state for one test, given
 * their full result history. Pure and Firestore-free so it's trivially
 * unit-testable without a fake db.
 */
export function computeSoldierCurrentStatus(
  results: ReadinessResult[],
  testId: string,
  now: Date,
): ReadinessCurrentStatus {
  const forTest = results
    .filter((r) => r.testId === testId)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());

  const latest = forTest[0];
  if (!latest) return 'not_yet_tested';

  const validityDays = latest.thresholdSnapshot?.validityDays ?? 365;
  const expiresAt = latest.recordedAt.getTime() + validityDays * 24 * 60 * 60 * 1000;
  if (now.getTime() > expiresAt) return 'not_yet_tested';

  return latest.outcome;
}
