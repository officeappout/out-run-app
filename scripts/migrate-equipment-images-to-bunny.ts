/**
 * migrate-equipment-images-to-bunny.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrate gym_equipment brand images OFF the old server (api.appout.co.il/files/…)
 * onto Bunny Storage (BUNNY_STORAGE_PULLZONE), then point Firestore imageUrl at the
 * new Bunny URL.
 *
 *   source  : brand.imageUrl on  https://api.appout.co.il/files/{hash}
 *   target  : https://{PULLZONE}/equipment/{docId}/{brandId}.{ext}   (existing convention)
 *   write   : gym_equipment/{docId}.brands[i].imageUrl  → new Bunny URL
 *
 * SAFETY
 *   • DRY-RUN by default — prints the full plan, verifies every source is still
 *     reachable, uploads NOTHING and writes NOTHING. Pass  --apply  to execute.
 *   • Firestore update is transaction-safe: re-reads the doc inside runTransaction,
 *     locates the brand by brandId (not index), and only rewrites if the imageUrl
 *     is still on the old host (idempotent — safe to re-run).
 *   • Uploads to Bunny FIRST; only on a verified upload does it touch Firestore.
 *
 * ⏰ Must run while api.appout.co.il is still online — it is the fetch source.
 *
 * Run:  npx tsx scripts/migrate-equipment-images-to-bunny.ts            (dry-run)
 *       npx tsx scripts/migrate-equipment-images-to-bunny.ts --apply    (execute)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const OLD_HOST_RE = /api\.appout\.co\.il|files\.appout\.co\.il|firebasestorage\.googleapis\.com|storage\.googleapis\.com/i;
const FETCH_TIMEOUT_MS = 20_000;

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

function getBunnyConfig() {
  const zone      = (process.env.BUNNY_STORAGE_ZONE      ?? '').trim();
  const accessKey = (process.env.BUNNY_STORAGE_ACCESSKEY ?? '').trim();
  const pullZone  = (process.env.BUNNY_STORAGE_PULLZONE  ?? '').trim();
  return { zone, accessKey, pullZone };
}
function maskKey(k: string) { return k ? `${k.slice(0, 4)}…${k.slice(-4)} (len=${k.length})` : '<empty>'; }

function pickExt(contentType: string | null, url: string): string {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  const m = url.toLowerCase().match(/\.(png|webp|gif|jpe?g)(?:\?|$)/);
  if (m) return m[1] === 'jpeg' ? 'jpg' : m[1];
  return 'jpg'; // matches existing equipment convention
}
function extToMime(ext: string): string {
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
}

interface Item {
  docId: string; equipmentName: string; brandId: string; brandName: string; oldUrl: string;
}

async function fetchOld(url: string): Promise<{ ok: boolean; status: number; bytes: number; contentType: string | null; buffer?: Buffer; note?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type');
    const isImage = (ct ?? '').startsWith('image/');
    return { ok: res.ok && isImage, status: res.status, bytes: buf.length, contentType: ct, buffer: buf,
             note: res.ok ? (isImage ? '' : `NOT-IMAGE content-type=${ct}`) : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, bytes: 0, contentType: null, note: `fetch-error: ${e instanceof Error ? e.message : e}` };
  } finally { clearTimeout(timer); }
}

async function uploadToBunny(buffer: Buffer, storagePath: string, mime: string): Promise<string> {
  const { zone, accessKey, pullZone } = getBunnyConfig();
  const res = await fetch(`https://storage.bunnycdn.com/${zone}/${storagePath}`, {
    method: 'PUT', headers: { AccessKey: accessKey, 'Content-Type': mime }, body: buffer,
  });
  if (!res.ok) throw new Error(`Bunny PUT ${res.status}: ${await res.text().catch(() => '')}`);
  return `https://${pullZone}/${storagePath}`;
}

async function main() {
  console.log(`\n${DRY_RUN ? '⚠️  DRY-RUN — no uploads, no Firestore writes' : '🚀 APPLY — uploading to Bunny + writing Firestore'}\n`);
  initFirebase();
  const db = admin.firestore();

  const bunny = getBunnyConfig();
  const bunnyOk = !!(bunny.zone && bunny.accessKey && bunny.pullZone);
  console.log('Bunny Storage config:');
  console.log(`  zone=${bunny.zone || '<MISSING>'}  key=${maskKey(bunny.accessKey)}  pullZone=${bunny.pullZone || '<MISSING>'}`);
  if (!bunnyOk) console.log('  ⛔ Bunny creds incomplete — an --apply run would FAIL. (dry-run continues.)');
  console.log();

  // Build the work-list: every gym_equipment brand image still on the old host.
  const snap = await db.collection('gym_equipment').get();
  const items: Item[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const brands = Array.isArray(data.brands) ? data.brands : [];
    for (const b of brands) {
      if (typeof b?.imageUrl === 'string' && OLD_HOST_RE.test(b.imageUrl)) {
        items.push({ docId: d.id, equipmentName: data.name ?? '(no name)', brandId: b.brandId ?? '(no brandId)', brandName: b.brandName ?? '(no brand)', oldUrl: b.imageUrl });
      }
    }
  }
  console.log(`Found ${items.length} brand-image(s) on legacy hosts (old server + Firebase Storage).\n`);
  console.log('─'.repeat(100));

  const stats = { reachable: 0, unreachable: 0, uploaded: 0, updated: 0, bytes: 0 };
  const problems: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const probe = await fetchOld(it.oldUrl);
    const ext = pickExt(probe.contentType, it.oldUrl);
    const storagePath = `equipment/${it.docId}/${it.brandId}.${ext}`;
    const newUrl = `https://${bunny.pullZone || '<PULLZONE>'}/${storagePath}`;

    if (probe.ok) { stats.reachable++; stats.bytes += probe.bytes; }
    else { stats.unreachable++; problems.push(`${it.equipmentName} [${it.brandName}]: ${probe.note}`); }

    console.log(`${String(i + 1).padStart(2)}. ${it.equipmentName}  ·  ${it.brandName}`);
    console.log(`    doc     : gym_equipment/${it.docId}   brandId=${it.brandId}`);
    console.log(`    source  : ${it.oldUrl}`);
    console.log(`    fetch   : ${probe.ok ? `OK ${probe.status}` : `❌ ${probe.note}`}  ${probe.bytes ? `${(probe.bytes / 1024).toFixed(1)} KB  ${probe.contentType}` : ''}`);
    console.log(`    → target: ${newUrl}`);
    console.log(`    → write : brands[brandId=${it.brandId}].imageUrl  =  <target>  (+ updatedAt)`);

    if (APPLY) {
      if (!probe.ok || !probe.buffer) { console.log('    ⏭  skipped write — source not fetchable\n'); continue; }
      if (!bunnyOk) { console.log('    ⏭  skipped — Bunny creds missing\n'); continue; }
      const uploaded = await uploadToBunny(probe.buffer, storagePath, extToMime(ext));
      stats.uploaded++;
      const docRef = db.collection('gym_equipment').doc(it.docId);
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(docRef);
        const brands = Array.isArray(cur.data()?.brands) ? [...cur.data()!.brands] : [];
        const idx = brands.findIndex((b: any) => b?.brandId === it.brandId && OLD_HOST_RE.test(b?.imageUrl ?? ''));
        if (idx === -1) return; // already migrated / changed — idempotent no-op
        brands[idx] = { ...brands[idx], imageUrl: uploaded };
        tx.update(docRef, { brands, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      stats.updated++;
      console.log(`    ✅ uploaded + updated → ${uploaded}\n`);
    } else {
      console.log('');
    }
  }

  console.log('─'.repeat(100));
  console.log(`\nSummary (${DRY_RUN ? 'DRY-RUN' : 'APPLY'}):`);
  console.log(`  items on old server   : ${items.length}`);
  console.log(`  source reachable      : ${stats.reachable}`);
  console.log(`  source UNREACHABLE    : ${stats.unreachable}`);
  console.log(`  total bytes to move   : ${(stats.bytes / 1024 / 1024).toFixed(2)} MB`);
  if (APPLY) { console.log(`  uploaded to Bunny     : ${stats.uploaded}`); console.log(`  Firestore updated     : ${stats.updated}`); }
  if (problems.length) { console.log(`\n  ⚠️  problems (${problems.length}):`); for (const p of problems) console.log(`     - ${p}`); }
  if (DRY_RUN) console.log('\n  → Re-run with  --apply  to execute (uploads to Bunny + writes Firestore).');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
