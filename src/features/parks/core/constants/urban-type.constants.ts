/**
 * urbanType classification shared between the server (catalog build,
 * /api/catalog/parks/route.ts) and the client (mapPinIcons.ts's isMinor
 * pin-tier split). Extracted here — not duplicated — because it used to
 * live in mapPinIcons.ts, which imports mapbox-gl (client-only) and can't
 * be imported from a Node.js server route (SPEC-07, 16.09.2026).
 *
 * Duplicated constants across a server/client boundary is exactly the
 * "new source of truth without migrating the old one" failure that's hit
 * this codebase three times already this week (inviteCode, userPublic,
 * user_memberships) — one module, both sides import it.
 */
export const MINOR_URBAN_TYPES = ['water_fountain', 'toilets', 'parking', 'bike_rack', 'bench'];
