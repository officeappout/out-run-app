/**
 * scripts/_verify-launch-day-route-selection.ts
 *
 * READ-ONLY, urgent (David live in Sderot, 23.09.2026). Mirrors
 * resolveRouteStopsBackbone('existing_route', ...) EXACTLY
 * (start-hybrid-session.ts:646-677): nearest-VERTEX search over every
 * published official_route network-wide, capped at 800m — for the exact
 * point David is standing at.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const USER_LAT = 31.533280;
const USER_LNG = 34.599028;
const KALANIYOT_ID = 'L3q3SY0UaCeJHdtHUOV7';
const CAP_M = 800;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePath(raw: any): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => (Array.isArray(p) ? [p[0], p[1]] : [p?.lng ?? p?.longitude, p?.lat ?? p?.latitude]))
    .filter((c: any) => Number.isFinite(c[0]) && Number.isFinite(c[1])) as [number, number][];
}

async function main() {
  const snap = await db.collection('official_routes').limit(200).get();
  const routes = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => r.published !== false);

  let best: { id: string; name?: string; d: number } | null = null;
  const ranked: { id: string; name?: string; d: number; published: any }[] = [];
  for (const r of routes) {
    const path = normalizePath(r.path);
    if (path.length < 2) continue;
    let d = Infinity;
    for (const v of path) {
      const dv = haversineMeters(USER_LAT, USER_LNG, v[1], v[0]);
      if (dv < d) d = dv;
    }
    ranked.push({ id: r.id, name: r.name, d, published: r.published });
    if (!best || d < best.d) best = { id: r.id, name: r.name, d };
  }
  ranked.sort((a, b) => a.d - b.d);

  console.log(`Point: ${USER_LAT},${USER_LNG}. Published routes scanned: ${routes.length}\n`);
  console.log('── Nearest 8 (all published-eligible routes, by nearest-vertex distance) ──');
  for (const r of ranked.slice(0, 8)) {
    const mark = r.id === KALANIYOT_ID ? '  <== KALANIYOT' : '';
    console.log(`   ${r.d.toFixed(0)}m  ${r.name ?? '?'}  (${r.id})  published=${r.published}${mark}`);
  }

  console.log(`\n── WINNER (resolveRouteStopsBackbone logic) ──`);
  if (!best || best.d > CAP_M) {
    console.log(`   NONE — nearest is ${best ? `${best.name} @ ${best.d.toFixed(0)}m` : 'no route at all'}, beyond ${CAP_M}m cap → NO route_stops card at all.`);
  } else {
    console.log(`   "${best.name}" (${best.id}) @ ${best.d.toFixed(0)}m`);
    console.log(`   MATCHES KALANIYOT (${KALANIYOT_ID})? ${best.id === KALANIYOT_ID ? 'YES ✅' : 'NO ❌ — WRONG ROUTE SELECTED'}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
