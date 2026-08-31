import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireRouteEditAccess } from '@/lib/api-auth';
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

// Auth: requireRouteEditAccess (src/lib/api-auth.ts) — agent key OR a
// superAdmin/authorityManager Bearer token/session cookie. Extracted
// 31.08.2026 (Stage 3) into that shared module so this route and the new
// accuracy-queue route don't carry two independently-drifting copies of the
// same gate logic; see that function's own doc comment for why it's NOT
// requireSection().
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
