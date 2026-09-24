/**
 * scripts/probe-station-search.ts — READ ONLY diagnosis (no fix).
 * Reproduces the hybrid station search at a user point and shows WHY nearby
 * parks are missed: reference point, radius, per-park pass/reject reasons, and
 * midpoint-vs-user vs whole-path candidate counts.
 * Usage: npx tsx scripts/probe-station-search.ts [lat] [lng]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).React = require('react');
function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
const R = 6371000;
function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// same synthetic loop the composer uses as fallback (target km)
function synthLoop(lat: number, lng: number, km: number): [number, number][] {
  const q = Math.max(0.2, km) / 4 / 111, ls = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const c: [number, number][] = [[lng, lat], [lng + q * ls, lat], [lng + q * ls, lat + q], [lng, lat + q], [lng, lat]];
  const p: [number, number][] = [];
  for (let i = 0; i < c.length - 1; i++) { p.push(c[i], [(c[i][0] + c[i + 1][0]) / 2, (c[i][1] + c[i + 1][1]) / 2]); }
  p.push(c[c.length - 1]);
  return p;
}
function isPrimary(p: any): boolean {
  const st = Array.isArray(p.sportTypes) ? p.sportTypes : [];
  const cat = p.category ?? p.facilityType;
  return st.some((t: string) => ['calisthenics', 'functional', 'crossfit'].includes(String(t))) || cat === 'gym_park';
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const lat = Number(process.argv[2] ?? 32.055), lng = Number(process.argv[3] ?? 34.775);
  const RADIUS = 300; // FACILITY_SNAP_RADIUS_METERS (current)
  const TARGET_KM = 2.5;
  const path = synthLoop(lat, lng, TARGET_KM);
  const midIdx = Math.floor(path.length / 2);
  const [mLng, mLat] = path[midIdx];
  const midDistFromUser = haversine(lat, lng, mLat, mLng);

  console.log(`\n══ STATION SEARCH DIAGNOSIS @ ${lat},${lng} ══`);
  console.log(`route: synthetic ${TARGET_KM}km loop · ${path.length} vertices`);
  console.log(`reference point (CURRENT = route MIDPOINT): ${mLat.toFixed(5)},${mLng.toFixed(5)}  → ${midDistFromUser.toFixed(0)}m from user`);
  console.log(`radius: ${RADIUS}m`);

  const parks = (await db.collection('parks').get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const distToPath = (p: any) => Math.min(...path.map(([lo, la]) => haversine(p.location?.lat, p.location?.lng, la, lo)));

  // parks within 800m of the user — the "should be findable" set
  const near = parks
    .filter((p) => p.location?.lat != null && p.location?.lng != null)
    .map((p) => ({ p, dU: haversine(lat, lng, p.location.lat, p.location.lng) }))
    .filter((x) => x.dU <= 800)
    .sort((a, b) => a.dU - b.dU);

  let noEquip = 0, notPrimary = 0, notPub = 0, ok = 0;
  for (const { p } of near) {
    const eq = (p.gymEquipment?.length ?? 0) > 0;
    const pri = isPrimary(p);
    const pub = p.published !== false; // legacy = published
    if (!eq) noEquip++;
    else if (!pri) notPrimary++;
    else if (!pub) notPub++;
    else ok++;
  }
  console.log(`\nparks within 800m of USER: ${near.length}`);
  console.log(`  reject: no-equipment=${noEquip} · not-PRIMARY=${notPrimary} · not-published=${notPub} · PASS(candidate)=${ok}`);

  const candidates = near.filter(({ p }) => (p.gymEquipment?.length ?? 0) > 0 && isPrimary(p) && p.published !== false);
  const withinMid = candidates.filter(({ p }) => haversine(mLat, mLng, p.location.lat, p.location.lng) <= RADIUS);
  const withinUser = candidates.filter((x) => x.dU <= RADIUS);
  const withinPath = candidates.filter(({ p }) => distToPath(p) <= RADIUS);
  console.log(`\ncandidate parks (PRIMARY + equipment + published): ${candidates.length} within 800m`);
  console.log(`  ✔ found by CURRENT search (≤${RADIUS}m of MIDPOINT): ${withinMid.length}   ← what the app finds`);
  console.log(`  · within ${RADIUS}m of USER: ${withinUser.length}`);
  console.log(`  · within ${RADIUS}m of ANY path vertex (proposed whole-path search): ${withinPath.length}`);

  console.log(`\nnearest candidate parks to USER:`);
  for (const { p, dU } of candidates.slice(0, 6)) {
    const dMid = haversine(mLat, mLng, p.location.lat, p.location.lng);
    const dPath = distToPath(p);
    console.log(`  "${p.name}"  ${dU.toFixed(0)}m from user · ${dMid.toFixed(0)}m from midpoint · ${dPath.toFixed(0)}m from path  ${dMid <= RADIUS ? '✔midpoint' : dPath <= RADIUS ? '↗path-only' : '✗missed'}  (${(p.gymEquipment?.length ?? 0)} gear)`);
  }

  // ── NEW whole-path logic: closest-to-path winner + gear translation ──
  const scored = candidates
    .map(({ p }) => ({ p, dPath: distToPath(p) }))
    .filter((x) => x.dPath <= RADIUS)
    .sort((a, b) => a.dPath - b.dPath);
  const winner = scored[0]?.p;
  console.log(`\n── NEW whole-path result ──`);
  if (!winner) { console.log('  no candidate within radius of path → A3 bodyweight (correct fallback)'); }
  else {
    const gymEquip = (await db.collection('gym_equipment').get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const { seedEquipmentCaches, normalizeGearIds } = await import('../src/features/workout-engine/shared/utils/gear-mapping.utils');
    seedEquipmentCaches([], gymEquip as any);
    const ids = (winner.gymEquipment ?? []).map((e: any) => e.equipmentId).filter(Boolean);
    const canonical = Array.from(new Set(normalizeGearIds(ids)));
    const known = canonical.filter((c) => /^[a-z][a-z_]+$/.test(c) && c.length < 20);
    console.log(`  WINNER: "${winner.name}" · ${scored[0].dPath.toFixed(0)}m from path · ${ids.length} gear`);
    console.log(`  translated canonical: ${known.join(', ') || '(none)'}`);
    console.log(`  → station ${known.length > 0 ? 'REAL EQUIPMENT ✅ (not A3)' : 'empty → A3'}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
