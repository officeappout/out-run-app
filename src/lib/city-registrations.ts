/**
 * src/lib/city-registrations.ts — Phase 1 Stage A of the city-orchestrator
 * plan (CITY-ORCHESTRATOR-PLAN.md). The `city_registrations` Firestore
 * collection: a data-driven fallback for scripts/geo-discovery-routes.ts's
 * in-file `REGIONS` table, for any city not already hand-tuned there.
 *
 * Deliberately a PLAIN collection with its own small validation function —
 * NOT routed through src/lib/route-collections/schemas.ts's
 * SCHEMA_REGISTRY/buildValidatedDoc chokepoint. That chokepoint exists for
 * the 5-6 route/geo OUTPUT collections (axioms.md §23's multi-writer
 * create/authority-locking rules); a city registration has exactly one
 * writer (the future Add-City screen) and no authority-locking concern of
 * its own, so it doesn't fit that shape.
 *
 * Mirrors geo-discovery-routes.ts's `Region` interface's fields verbatim
 * (including the additive `computeLighting` field added by this same
 * stage) — see that file's own doc comments for what each field actually
 * does; not re-explained here to avoid drift between two copies of the
 * same prose. Known gaps, parking-lotted rather than solved here (per
 * David's 02.09.2026 review): `boundaryClipWikidata` is a wikidata QID, a
 * DIFFERENT identifier space than the raw OSM relation number
 * (`extract-osm-amenities-tlv.ts`'s `--relationId=`) — a future Add-City
 * screen must capture/normalize both, not assume they're interchangeable.
 * `areaWikidata`/`extraBboxes` are hand-curated judgment calls (Haifa
 * deliberately omits `areaWikidata` — see its own REGIONS comment) that a
 * newly-registered city will not automatically get right; document as a
 * "new-city discovery-scope may need manual tuning" caveat wherever this
 * collection is surfaced in the admin UI, not solved by this schema.
 */
import { z } from 'zod';

const BboxSchema = z.object({
  latMin: z.number(),
  lonMin: z.number(),
  latMax: z.number(),
  lonMax: z.number(),
});

const RoundTripAnchorSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
});

export const CityRegistrationSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  areaWikidata: z.string().min(1).optional(),
  boundaryClipWikidata: z.string().min(1).optional(),
  extraBboxes: z.array(BboxSchema).optional(),
  bbox: BboxSchema,
  roundTripAnchors: z.array(RoundTripAnchorSchema).optional(),
  batchId: z.string().min(1),
  /** Additive field (Stage A, 02.09.2026) — replaces geo-discovery-routes.ts's
   *  old `REGION.label === 'חיפה'` hardcode at the discovery-time lighting
   *  gate. Undefined/absent defaults to `true` at the call site (not here —
   *  this schema stays a pure shape check) — the lighting honesty-gate
   *  (`status:'unknown'`) already handles low-OSM-coverage cities
   *  gracefully, so there's no remaining reason to default a new city to
   *  `false` by omission. */
  computeLighting: z.boolean().optional(),
}).passthrough();

export type CityRegistration = z.infer<typeof CityRegistrationSchema>;

export class CityRegistrationValidationError extends Error {
  constructor(public issues: string[]) {
    super(`city_registrations validation: ${issues.length} issue(s):\n` + issues.map((i) => `  - ${i}`).join('\n'));
    this.name = 'CityRegistrationValidationError';
  }
}

/**
 * Validates a raw `city_registrations` doc (or a candidate about to be
 * written). Throws `CityRegistrationValidationError` with every issue found
 * (not fail-fast) — same discipline as `route-collections/validate.ts`'s
 * `buildValidatedDoc`, just sized for this collection's single-writer shape.
 */
export function validateCityRegistration(raw: unknown): CityRegistration {
  const result = CityRegistrationSchema.safeParse(raw);
  if (!result.success) {
    throw new CityRegistrationValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}
