/**
 * Lighting rules (owner decision 21.10.2026). Pure.
 *
 * A street point is "lit" when a lamp post stands within LIT_LAMP_RADIUS_M
 * of it (owner: 20–30 m, 25 m named default). A street piece is lit when at
 * least LIT_PIECE_MIN_SHARE of its sample points are — the same 0.6 the
 * trails pipeline uses for OSM street_lamp nodes (trail-graph/tags.ts
 * LAMP_COVERAGE_LIT). OSM `lit=*` is merged on top: `lit=no` wins over
 * lamps (explicitly unlit), `lit=yes` OR lamps ⇒ lit, else unknown —
 * untagged is never "unlit" (docs/routes/SHADE-LIGHT-DATA.md §6.1).
 */
export const LIT_LAMP_RADIUS_M = 25;
export const LIT_PIECE_MIN_SHARE = 0.6;
/** Sample spacing along a street piece when testing lamp proximity. */
export const LIT_SAMPLE_STEP_M = 5;

export const LIGHTING_STORAGE_PREFIX = 'lighting/v1';
export const lightingObjectPath = (citySlug: string) => `${LIGHTING_STORAGE_PREFIX}/${citySlug}.json.gz`;
export const LIGHTING_FILE_VERSION = 1;
