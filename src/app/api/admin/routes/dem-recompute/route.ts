import 'server-only';
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity, getAdminDb } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-session';
import { fetchLiveDemProfile } from '@/lib/dem-tile-cache/dem-tile-fetch-live.node';
import { computeDifficulty, difficultyLevelToRouteDifficulty } from '@/features/parks/core/services/route-difficulty.service';

/**
 * POST /api/admin/routes/dem-recompute — server-side DEM fallback for the
 * route editor's Phase 2 fix (route-editor-scoping-spec.md, "elevation
 * goes stale after a geometry edit"). Given a path, live-fetches Terrain-RGB
 * tiles (fetchLiveDemProfile — no caching, this is a one-off per-edit
 * sample) and returns real elevation/grade/difficulty, or coverage:false
 * if genuinely unavailable. NEVER a guessed value either way.
 *
 * This route performs NO Firestore writes — it's a pure read+compute. The
 * actual route-doc write still happens exactly where it always has,
 * through InventoryService.updateRoute from route-geometry-edit.service.ts.
 */

/**
 * Auth: X-Agent-Key (machine driver — the future accuracy agent, Phase 5)
 * OR a Bearer ID token / session cookie belonging to a superAdmin OR
 * authorityManager — deliberately NOT requireSection() from
 * src/lib/api-auth.ts, because that helper's Firestore role check only
 * recognizes isSuperAdmin/allowedSections/vertical-admin, never
 * isAuthorityManager. The canonical route editor
 * (admin/authority/routes/[id]/edit) itself allows superAdmin OR
 * authorityManager (its own gate: `!role.isSuperAdmin && !role.isAuthorityManager`)
 * — this route must match that exactly, or authority managers who can
 * fully edit/save a route would silently lose just this DEM fallback.
 * isAuthorityManager is mirrored here via the same `authorities.managerIds
 * array-contains uid` query getAuthoritiesByManager() (client-SDK) uses,
 * since no Admin-SDK equivalent already exists.
 */
async function requireRouteEditAccess(request: NextRequest): Promise<NextResponse | null> {
  const agentKey = process.env.AGENT_API_KEY;
  if (agentKey) {
    const presented = request.headers.get('x-agent-key') ?? '';
    if (presented.length === agentKey.length) {
      const a = Buffer.from(presented);
      const b = Buffer.from(agentKey);
      if (timingSafeEqual(a, b)) return null;
    }
  }

  let uid: string | null = null;

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) {
    try {
      const identity = await resolveIdentity(bearer);
      if (identity.admin) uid = identity.uid;
    } catch { /* fall through to cookie */ }
  }

  if (!uid) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (cookie) {
      const session = await verifyAdminSession(cookie);
      if (session?.admin === true) uid = session.uid;
    }
  }

  if (!uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  const userSnap = await db.collection('users').doc(uid).get();
  const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;
  if (core.isSuperAdmin === true) return null;

  const managedSnap = await db.collection('authorities').where('managerIds', 'array-contains', uid).limit(1).get();
  if (!managedSnap.empty) return null;

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const denied = await requireRouteEditAccess(request);
  if (denied) return denied;

  let body: { path?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const path = body.path;
  if (!Array.isArray(path) || path.length < 2 || !path.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')) {
    return NextResponse.json({ error: 'path must be an array of at least 2 [lng, lat] number pairs' }, { status: 400 });
  }

  // Route.path convention is [lng, lat]; dem-sampling.service.ts's
  // convention (and fetchLiveDemProfile's) is [lat, lng] — same conversion
  // generator-elevation.service.ts's own header comment documents.
  const pathLatLng: Array<[number, number]> = (path as Array<[number, number]>).map(([lng, lat]) => [lat, lng]);

  let distanceMeters = 0;
  for (let i = 1; i < pathLatLng.length; i++) {
    const [lat1, lng1] = pathLatLng[i - 1];
    const [lat2, lng2] = pathLatLng[i];
    const R = 6_371_000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    distanceMeters += R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  const distanceKm = distanceMeters / 1000;

  let profile;
  try {
    profile = await fetchLiveDemProfile(pathLatLng);
  } catch (err) {
    console.error('[dem-recompute] fetchLiveDemProfile threw:', err);
    return NextResponse.json({ coverage: false });
  }

  if (!profile) {
    return NextResponse.json({ coverage: false });
  }

  const result = computeDifficulty(profile.elevationGainM, profile.maxGradePercent, distanceKm);
  return NextResponse.json({
    coverage: true,
    elevationGain: profile.elevationGainM,
    maxGrade: profile.maxGradePercent,
    difficulty: difficultyLevelToRouteDifficulty(result.level),
  });
}
