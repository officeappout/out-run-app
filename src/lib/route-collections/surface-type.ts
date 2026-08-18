/**
 * SurfaceType — granular physical ground-material vocabulary, populated
 * from OSM `surface=*` tags. Route-enrichment-pipeline plan, surface-type
 * phase (16.08.2026).
 *
 * DELIBERATELY SEPARATE from `RouteFeatures.surface` (route.types.ts) —
 * that field is a different, coarser concept ("paved-ish vs trail-ish vs
 * mixed", values like 'road'/'trail'/'asphalt'/'paved'/'dirt'/'mixed',
 * verified live against every writer AND every reader before this file was
 * written): `useRouteFilter.ts`'s match-scoring compares it against a
 * 'road'|'trail' user preference, and RouteDetailSheet.tsx's SURFACE_LABELS
 * table only recognizes that coarse vocabulary, falling through to the raw
 * value for anything else. Writing granular values into `features.surface`
 * would have silently broken both — this is exactly the "enrich, don't
 * replace-and-break" instruction, taken literally: a new field, old field
 * untouched.
 *
 * Vocabulary aligned to what already exists in this codebase, not invented:
 * the admin route-create picker (RouteEditor.tsx's terrainOptions) already
 * uses id/label pairs 'asphalt'->'אספלט' and 'dirt'->'שטח/עפר' — reused
 * verbatim below for the overlapping categories. The OSM tag values
 * (asphalt/paving_stones/concrete/gravel/dirt) are the exact same set
 * osm-segment-importer.ts's scoreSegment() already branches on — this
 * mapping isn't guessing at OSM's vocabulary, it's the same one already
 * proven live in this codebase.
 */

export type SurfaceType =
  | 'asphalt'
  | 'gravel'
  | 'paving_stones'
  | 'concrete'
  | 'dirt'
  | 'grass'
  | 'unknown';

export const ALL_SURFACE_TYPES: SurfaceType[] = [
  'asphalt',
  'gravel',
  'paving_stones',
  'concrete',
  'dirt',
  'grass',
  'unknown',
];

export const SURFACE_TYPE_LABELS: Record<SurfaceType, string> = {
  asphalt: 'אספלט',
  gravel: 'כורכר',
  paving_stones: 'ריצוף/אבן משתלבת',
  concrete: 'בטון',
  dirt: 'עפר',
  grass: 'דשא',
  unknown: 'לא ידוע',
};

/**
 * Maps a raw OSM `surface=*` tag value to the canonical SurfaceType.
 * Anything not explicitly recognized returns 'unknown' — including OSM's
 * own generic `surface=paved`/`surface=unpaved` fallback values, which
 * describe "some hard/soft surface, material unspecified" and would be a
 * GUESS to classify further. Never guess; 'unknown' is a correct, honest
 * answer, not a failure state — OSM surface coverage is decent for named
 * roads/paths and sparse elsewhere, and the admin completes gaps manually
 * via the panel, same hybrid pattern as every other enrichment layer in
 * this plan.
 */
export function mapOsmSurfaceToType(osmSurface: string | null | undefined): SurfaceType {
  if (!osmSurface) return 'unknown';
  switch (osmSurface) {
    case 'asphalt':
      return 'asphalt';
    case 'gravel':
    case 'fine_gravel':
    case 'compacted':
      return 'gravel';
    case 'paving_stones':
    case 'sett':
    case 'cobblestone':
    case 'unhewn_cobblestone':
      return 'paving_stones';
    case 'concrete':
    case 'concrete:plates':
    case 'concrete:lanes':
      return 'concrete';
    case 'ground':
    case 'earth':
    case 'dirt':
      return 'dirt';
    case 'grass':
      return 'grass';
    default:
      return 'unknown';
  }
}
