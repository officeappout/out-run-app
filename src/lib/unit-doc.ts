/**
 * Shared, Firestore-SDK-agnostic shaping for a single `tenants/{orgId}/units/{unitId}`
 * document — used by both scripts/import-military-units.ts (Node, firebase-admin)
 * and the admin panel's pending-unit approval action (browser, firebase/firestore).
 * Two different SDKs can't share one write call, but the exact shape of what
 * gets written must stay identical between the two paths — hence this pure
 * function, with no Firestore import of its own.
 *
 * Deliberately does NOT include createdAt/updatedAt (serverTimestamp() has a
 * different import per SDK) — callers add that field themselves.
 */

// Cloud Function triggers (Eventarc) silently never fire for a document
// whose ID contains non-ASCII characters — discovered 05.09.2026 when 5 real
// bn_u_<hebrew-slug> battalions from Task 1's import were invisible in
// search with zero errors anywhere, found only by an end-to-end production
// test. buildUnitDoc is the one chokepoint both write paths (Task 1's
// import script, Task 2's approval action) already call — this guard here
// means neither path can ever write a bad id again, regardless of what
// produced it. Use src/lib/unit-id.ts's computeUnitId() to generate one.
const ASCII_UNIT_ID = /^[a-zA-Z0-9_-]+$/;

export interface UnitDocInput {
  /** The literal Firestore doc ID this data will be written under — checked
   *  here, not stored as a field (Firestore doesn't store its own doc id). */
  unitId: string;
  name: string;
  /** Real Firestore doc ID of the parent tenants/{orgId}/units/{parentUnitId}
   *  doc, or null when this unit sits directly under the brigade root. */
  parentUnitId: string | null;
  /** unitPath of the parent (names, root-to-parent), [] when parentUnitId is null. */
  parentUnitPath: string[];
  unitType: 'battalion' | 'company';
  nickname?: string | null;
  armType?: string | null;
  serviceType?: 'regular' | 'reserve' | 'mixed' | null;
  displayNumber?: number | null;
}

export interface UnitDocData {
  name: string;
  unitPath: string[];
  unitType: string;
  memberCount: number;
  parentUnitId?: string;
  nickname?: string;
  armType?: string;
  serviceType?: string;
  displayNumber?: number;
}

/**
 * Builds the exact doc data for a new unit — never mutates/returns a field
 * for an absent optional (matches unit-import.service.ts's existing
 * `if (unit.parentUnitId) data.parentUnitId = ...` convention: Firestore
 * `undefined` values throw, so omit rather than write null/undefined).
 */
export function buildUnitDoc(input: UnitDocInput): UnitDocData {
  if (!ASCII_UNIT_ID.test(input.unitId)) {
    throw new Error(
      `buildUnitDoc: unitId "${input.unitId}" contains non-ASCII characters — this document would never trigger onUnitWrite (Eventarc doesn't fire for non-ASCII doc ids, see this file's header comment). Use computeUnitId() from src/lib/unit-id.ts instead.`,
    );
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error('buildUnitDoc: name is required');
  }

  const data: UnitDocData = {
    name,
    unitPath: [...input.parentUnitPath, name],
    unitType: input.unitType,
    memberCount: 0,
  };

  if (input.parentUnitId) data.parentUnitId = input.parentUnitId;
  if (input.nickname) data.nickname = input.nickname;
  if (input.armType) data.armType = input.armType;
  if (input.serviceType) data.serviceType = input.serviceType;
  if (input.displayNumber != null && Number.isFinite(input.displayNumber)) {
    data.displayNumber = input.displayNumber;
  }

  return data;
}
