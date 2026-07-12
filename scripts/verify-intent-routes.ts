/**
 * scripts/verify-intent-routes.ts — DEV verification (read-only) for Phase 1.
 * Fetches published Zichron routes via the Admin SDK, normalises paths to
 * [lng,lat] tuples (as fetchOfficialRoutes does), then runs the PURE
 * selectIntentOptions for a few origins/targets and prints the 3 buckets.
 * Also does one live buildOutAndBack (Mapbox) check.
 *
 *   npx tsx <worktree>/scripts/verify-intent-routes.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { selectIntentOptions, buildOutAndBack, type IntentOptionsResult } from '../src/features/parks/core/services/intent-routes.service';

function initFb() { const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!); if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return admin.firestore(); }

async function fetchZichron(): Promise<any[]> {
  const db = initFb();
  const snap = await db.collection('official_routes')
    .where('importBatchId', '==', 'zichron-geodiscovery-2026-07-10').get();
  return snap.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .filter((x: any) => x.published === true)
    .map((x: any) => ({ ...x, path: (x.path || []).map((p: any) => [p.lng, p.lat]) }));
}

function printResult(label: string, r: IntentOptionsResult) {
  console.log(`\n── ${label} ──`);
  for (const bucket of ['here', 'near', 'drive'] as const) {
    const list = r[bucket];
    const top = list[0];
    console.log(`  ${bucket.toUpperCase().padEnd(5)} (${list.length} candidates)` +
      (top ? `  → ${top.shape}${top.laps > 1 ? ` ×${top.laps}` : ''} ${top.effectiveKm}km · ${top.accessMeters}m access${top.accessMinutes ? ` (~${top.accessMinutes}min)` : ''} · q=${top.quality.toFixed(0)} · ${top.route.name}` : '  → (empty)'));
    for (const o of list.slice(1, 3)) console.log(`         swap: ${o.shape}${o.laps > 1 ? ` ×${o.laps}` : ''} ${o.effectiveKm}km · ${o.accessMeters}m · ${o.route.name}`);
  }
}

async function main() {
  const routes = await fetchZichron();
  console.log(`fetched ${routes.length} published Zichron routes`);
  const loops = routes.filter((r: any) => { const p = r.path; if (!p || p.length < 3) return false; const dx = p[0][0] - p[p.length-1][0], dy = p[0][1] - p[p.length-1][1]; return Math.hypot(dx, dy) < 0.001; });
  console.log(`  ~loops (rough): ${loops.length}`);

  const ZICHRON_CENTER = { lat: 32.5736, lng: 34.9518 };
  const RAMAT_HANADIV = { lat: 32.5520, lng: 34.9430 };

  for (const activity of ['walking'] as const) {
    for (const [name, origin] of [['Zichron center', ZICHRON_CENTER], ['Ramat HaNadiv', RAMAT_HANADIV]] as const) {
      for (const targetKm of [2, 5, 10]) {
        const r = selectIntentOptions(routes, { origin, targetKm, activity });
        printResult(`${name} · ${activity} · target ${targetKm}km`, r);
      }
    }
  }

  // Live out-and-back calibration check (Mapbox) — must land within ±10% of target.
  console.log('\n── buildOutAndBack calibration (Mapbox live) · Zichron center · walking ──');
  for (const target of [2, 4, 6]) {
    const oab = await buildOutAndBack(ZICHRON_CENTER, target, 'walking');
    if (oab) {
      const err = ((oab.effectiveKm - target) / target) * 100;
      const ok = Math.abs(err) <= 10 ? '✓' : '✗ OUT OF ±10%';
      console.log(`  target ${target}km → ${oab.effectiveKm}km (${err >= 0 ? '+' : ''}${err.toFixed(0)}%) ${ok} · ${oab.route.path.length} pts`);
    } else console.log(`  target ${target}km → ✗ Mapbox returned nothing`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
