/**
 * READ-ONLY export: a review table of all 88 service execution-methods for MANUAL gear
 * curation. No writes. Columns:
 *   exercise_id, name_he, park_gear (hint), home_gear (hint), video_url (Bunny embed),
 *   service_gear_final (EMPTY — you fill it by hand; blank = no gear)
 *
 * After you fill service_gear_final, apply-service-gear.ts writes it back (dry-run first).
 *
 * Usage: npx tsx scripts/export-service-gear-review.ts
 * Output: scripts/corpus/service-gear-review.csv
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const LIB = (process.env.BUNNY_LIBRARY_ID || '640043').trim();

const q = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;

(async () => {
  const db = admin.firestore();

  // id → name maps
  const gearMap = new Map<string, string>();
  (await db.collection('gear_definitions').get()).forEach(d => {
    const n = (d.data() as any).name; gearMap.set(d.id, (n?.he || n?.en || '').trim());
  });
  const equipMap = new Map<string, string>();
  (await db.collection('gym_equipment').get()).forEach(d => {
    const n = (d.data() as any).name; equipMap.set(d.id, (typeof n === 'string' ? n : n?.he || n?.en || '').trim());
  });
  const gearNames = (m: any): string[] => {
    const out: string[] = [];
    (m?.gearIds || []).forEach((id: string) => { const n = gearMap.get(id); if (n) out.push(n); });
    (m?.equipmentIds || []).forEach((id: string) => { const n = equipMap.get(id); if (n) out.push(n); });
    if (m?.gearId && gearMap.get(m.gearId)) out.push(gearMap.get(m.gearId)!);
    if (m?.equipmentId && equipMap.get(m.equipmentId)) out.push(equipMap.get(m.equipmentId)!);
    return [...new Set(out)];
  };
  const isLoc = (m: any, loc: string) => m?.location === loc || (m?.locationMapping || []).includes(loc);

  const results = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/corpus/upload-results-service.json'), 'utf8'));
  const ids = [...new Set(results.filter((r: any) => r.status === 'success').map((r: any) => r.exercise_id))] as string[];

  const rows: string[] = ['exercise_id,name_he,park_gear,home_gear,video_url,service_gear_final'];
  let noGear = 0;
  for (const id of ids) {
    const d = (await db.collection('exercises').doc(id).get()).data() as any;
    if (!d) continue;
    const methods = d.execution_methods ?? [];
    const parkGear = [...new Set(methods.filter((m: any) => isLoc(m, 'park')).flatMap(gearNames))];
    const homeGear = [...new Set(methods.filter((m: any) => isLoc(m, 'home')).flatMap(gearNames))];
    if (!parkGear.length && !homeGear.length) noGear++;
    const svc = methods.find((m: any) => isLoc(m, 'service'));
    const vid = svc?.media?.previewVideo?.he?.videoId;
    const embed = vid ? `https://iframe.mediadelivery.net/embed/${LIB}/${vid}` : '';
    rows.push([q(id), q(d.name?.he), q(parkGear.join(' | ')), q(homeGear.join(' | ')), q(embed), q('')].join(','));
  }

  const out = path.join(process.cwd(), 'scripts/corpus/service-gear-review.csv');
  fs.writeFileSync(out, rows.join('\n') + '\n');
  console.log(`Wrote ${out}`);
  console.log(`rows: ${rows.length - 1} | exercises with NO park/home gear hint: ${noGear}`);
  console.log('\nSample (first 3):');
  rows.slice(1, 4).forEach(r => console.log('  ' + r));
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
