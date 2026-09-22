/**
 * Shared "no real coordinates available" map fallback.
 *
 * A deliberately NEUTRAL, whole-of-Israel viewpoint — NOT any specific
 * city's coordinates. Replaces several independent, hardcoded
 * `{ lat: 31.525, lng: 34.5955 }`-shaped fallbacks that used to be
 * scattered across heatmap/page.tsx, LiveHeatMap.tsx, RouteEditor.tsx,
 * CommunityEvents.tsx, and CommunityGroups.tsx.
 *
 * Those were Sderot's real coordinates (see
 * src/features/admin/services/seed-sderot-demo.ts's SDEROT_CENTER) —
 * carried over from when Sderot was the only real seeded city and reusing
 * its coordinates was a convenient "just show something" default. Once
 * other real authorities without a `location` field started reaching
 * these same code paths, that default silently became "every
 * unconfigured authority's map opens centered on Sderot" — found via a
 * production authority-manager smoke test (00-MASTER-PLAN.md §13.11).
 *
 * The exact value below is a reasonable central viewpoint for a
 * whole-of-Israel map view (roughly the country's north-south midpoint) —
 * not claimed to be a precise geographic centroid, since nothing here
 * depends on it being one.
 */
export const ISRAEL_GENERAL_MAP_CENTER = { lat: 31.5, lng: 34.85 };

/** Paired zoom level for ISRAEL_GENERAL_MAP_CENTER — zoomed out enough to
 * show the country's shape, not a tight city-level view centered on
 * nothing in particular. Callers showing a REAL, known location should
 * use their own city-appropriate zoom instead (typically 13-14). */
export const ISRAEL_GENERAL_MAP_ZOOM = 7;
