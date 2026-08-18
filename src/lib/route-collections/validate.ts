/**
 * buildValidatedDoc — THE chokepoint. Every writer (InventoryService
 * methods, geo-discovery-routes.ts and friends) calls this immediately
 * before the actual Firestore write. It is what structurally closes the
 * class of bug that started this plan: `difficulty: difficulty as any` in
 * the admin edit page defeated `tsc` by design — a cast can always beat a
 * compile-time type. It cannot beat a check that runs at the moment of the
 * write itself.
 *
 * Two hard rules enforced here (route-enrichment-pipeline plan):
 *   1. No CREATE without a resolved city/authority. UPDATE is deliberately
 *      NOT held to the same bar — see the grandfather-clause comment below.
 *   2. Every value must match its schema's real type (the zod schemas in
 *      schemas.ts mirror route.types.ts's TS unions verbatim) — 'moderate'
 *      simply isn't a member of DifficultySchema, cast or no cast.
 *
 * Zero firebase/firebase-admin imports — importable unmodified from both
 * browser code (client SDK) and Node/tsx scripts (Admin SDK).
 */

import { SCHEMA_REGISTRY, CITY_ONLY_COLLECTIONS, CITY_FIELD_BY_COLLECTION, type RouteCollectionName } from './schemas';

export class RouteDocValidationError extends Error {
  constructor(
    public collection: RouteCollectionName,
    public issues: string[],
  ) {
    super(`[${collection}] ${issues.length} validation issue(s):\n` + issues.map((i) => `  - ${i}`).join('\n'));
    this.name = 'RouteDocValidationError';
  }
}

/**
 * Recursively strips `undefined` values — Firestore rejects them outright
 * (`Unsupported field value: undefined`). Moved here from its previous
 * private copy in inventory.service.ts (Stage 1B) so every writer —
 * client-SDK service and Admin-SDK script alike — shares one implementation
 * instead of each keeping its own.
 *
 * ONLY recurses into genuine plain-object literals (`Object.getPrototypeOf
 * === Object.prototype`) — never into a class instance. This is load-bearing,
 * not cosmetic: a Firestore `FieldValue` sentinel (`serverTimestamp()`,
 * `arrayUnion()`, `increment()`, …), a `GeoPoint`, a `Timestamp`, or a
 * `DocumentReference` is ALSO `typeof === 'object'` but is a class instance
 * with no own enumerable keys — recursing into one (as an earlier version of
 * this function did, checking only `!Array.isArray` / `!(value instanceof
 * Date)`) silently flattens it to `{}`, destroying the sentinel while the
 * write still "succeeds." Found live 17.08.2026 (route-enrichment-pipeline
 * plan, Stage 3): `updatedAt: serverTimestamp()` was being corrupted into an
 * empty map on every chokepoint caller that builds the sentinel INSIDE the
 * object passed to `buildValidatedDoc` — confirmed against 27 official_routes
 * + 18 curated_routes docs already written that way since Stage 1B. Verified
 * fix against a real `ServerTimestampTransform`, `ArrayUnionTransform`, and
 * `GeoPoint` — see `__tests__/validate.test.ts`.
 */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const clean = {} as any;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    // An array's own prototype is Array.prototype, not Object.prototype, so
    // this check alone already excludes arrays too — no separate
    // Array.isArray guard needed.
    const isPlainObject = value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
    if (isPlainObject) {
      clean[key] = stripUndefined(value);
    } else {
      clean[key] = value;
    }
  }
  return clean as T;
}

export type ValidateContext =
  | { mode: 'create'; knownAuthorityIds: Set<string> }
  | { mode: 'update'; knownAuthorityIds: Set<string>; existing: { authorityId?: string; city?: string; cityName?: string } };

/**
 * Validates + returns a Firestore-write-ready doc (stripped of undefineds).
 * Throws RouteDocValidationError with EVERY issue found (not fail-fast on
 * the first) so a bad batch script gets one report, not N sequential re-runs.
 *
 * GRANDFATHER CLAUSE (read this before changing anything below): production
 * has many existing official_routes/etc. docs with no authorityId/city at
 * all — that's the entire reason InventoryService.bulkAssignAuthority
 * exists. This function must never start rejecting an update to one of
 * those legacy docs just because the update doesn't (or can't) resolve the
 * authority — that would break the admin panel's ordinary edit flow for
 * every route created before this rule existed.
 *
 * The rule actually enforced, precisely (the "city field" is whichever one
 * CITY_FIELD_BY_COLLECTION says for this collection — `city` for most,
 * `cityName` for street_segments — never a hardcoded literal):
 *   - CREATE: authorityId + the city field are REQUIRED, and authorityId
 *     must be a real doc in `knownAuthorityIds`.
 *   - UPDATE: NEITHER field is required. If the update payload doesn't
 *     touch authorityId/city-field at all, nothing is enforced — a legacy
 *     authority-less doc keeps saving exactly as it always did. If the
 *     payload DOES include authorityId/city-field, and the EXISTING doc
 *     already had a non-empty value for that field, the new value must
 *     match it (the field is "locked once set" — mirrors
 *     noTenantFieldsChanged()'s shape for users/{uid}.core.authorityId). If
 *     the existing value was empty, the payload is free to set it (that's
 *     the legacy doc's authority resolution finally completing) with no
 *     lock to violate.
 */
export function buildValidatedDoc(
  collection: RouteCollectionName,
  raw: unknown,
  ctx: ValidateContext,
): Record<string, unknown> {
  const issues: string[] = [];
  const stripped = stripUndefined(raw as Record<string, any>);

  const schema = ctx.mode === 'create' ? SCHEMA_REGISTRY[collection].create : SCHEMA_REGISTRY[collection].update;
  const parsed = schema.safeParse(stripped);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
  }

  const cityOnly = CITY_ONLY_COLLECTIONS.has(collection);
  // Which field actually holds the city string for THIS collection — not
  // uniform (official_routes/curated_routes/climb_segments use `city`;
  // street_segments uses `cityName`). Never hardcode the literal 'city'
  // here — that already produced one real bug (street_segments' schema
  // originally required a nonexistent `city` field), caught and fixed
  // alongside this lookup in the surface-type phase.
  const cityField = CITY_FIELD_BY_COLLECTION[collection];

  if (!cityOnly) {
    if (ctx.mode === 'create') {
      // Schema already enforced non-empty authorityId/cityField via the
      // Create schema. This adds the one check a static schema can't do on
      // its own: is it a REAL authority, not just a non-empty string (this
      // is what would have caught the shipped 'placeholder_tlv' non-existent-
      // authority-id bug found during the original investigation).
      const authorityId = stripped.authorityId;
      if (typeof authorityId === 'string' && authorityId.length > 0 && !ctx.knownAuthorityIds.has(authorityId)) {
        issues.push(`authorityId: "${authorityId}" is not a known authority (checked against ${ctx.knownAuthorityIds.size} known ids)`);
      }
    } else {
      for (const key of ['authorityId', cityField] as const) {
        const payloadHasKey = Object.prototype.hasOwnProperty.call(stripped, key);
        if (!payloadHasKey) continue; // didn't touch it — always fine, legacy doc or not
        const existingValue = ctx.existing[key];
        const newValue = stripped[key];
        if (existingValue && newValue !== existingValue) {
          issues.push(`${key}: locked once set — was "${existingValue}", payload tried to change it to "${newValue}"`);
        }
      }
      // authorityId existence check applies even on the "legacy doc resolving
      // for the first time" path — a newly-set authorityId should still be real.
      const newAuthorityId = stripped.authorityId;
      if (
        !ctx.existing.authorityId &&
        typeof newAuthorityId === 'string' &&
        newAuthorityId.length > 0 &&
        !ctx.knownAuthorityIds.has(newAuthorityId)
      ) {
        issues.push(`authorityId: "${newAuthorityId}" is not a known authority (checked against ${ctx.knownAuthorityIds.size} known ids)`);
      }
    }
  }

  if (issues.length > 0) {
    throw new RouteDocValidationError(collection, issues);
  }

  return stripped;
}
