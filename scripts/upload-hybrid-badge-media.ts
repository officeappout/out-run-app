/**
 * scripts/upload-hybrid-badge-media.ts — Phase-2 badge media (throwaway).
 *
 * Reuses the proven upload-equipment-additions pipeline (service-account Drive
 * download → Bunny Storage PUT → gym_equipment.brands[] update). Scope is LOCKED
 * to 4 docs only:
 *   • 3 🟢 Urbanics IMAGE uploads (מתח גריפ · מתח מדורג · מקבילים כנף)
 *   • 1 מתח מסתובב Urbanics VIDEO-fallback (borrows a pullupbar_park sibling video)
 * Also downloads the 2 🟡 candidate images to scratchpad for visual review.
 *
 * Modes:  (default) DRY-RUN — no writes.   --live — perform writes.
 * Usage:  npx tsx scripts/upload-hybrid-badge-media.ts [--live]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
import * as fs from 'fs';

const LIVE = process.argv.includes('--live');
const URBANICS = 'LfKL3h2NBrZXp4E8w56G';
const SCRATCH = '/private/tmp/claude-501/-Users-calisthenicsltd-Development-appout-1/dcb59dbc-0160-4a08-b3e7-2bd999aff0ab/scratchpad';

const IMAGE_ROWS = [
  { name: 'מתח גריפ',   docId: 'YrBvbzeC3HiGhFMJwuzK', driveId: '1wgaDZSyyLaRDdKzpcGNnTJxeCivC_MOw' },
  { name: 'מתח מדורג',  docId: 'UbssQiwmyKnAcm1QGsVO', driveId: '1DZvos037DxkYQSQHTJyVJZxwYR255M80' },
  { name: 'מקבילים כנף', docId: 'csqmVzvLLVADJigVEYLd', driveId: '177qx2kp7WpRY_psc9WKb2hoXrcFBb463' },
];
const MSTOVEV = { name: 'מתח מסתובב', docId: 'cb2LOAzQFISkI1FUXohQ' };
const YELLOW = [
  { label: 'ubx-dip',  driveId: '1DXRHSoNeBflNu0TVVfJa0HiDJXFDAgWj' },
  { label: 'ubx-rpb',  driveId: '1ha3E4PK1WA2DgggZuTJPwna0lLTOdHeu' },
];

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
async function makeDriveClient() {
  const { google } = await import('googleapis');
  const { JWT } = await import('google-auth-library');
  const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  const auth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return google.drive({ version: 'v3', auth }) as any;
}
async function downloadDrive(drive: any, fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const meta = await drive.files.get({ fileId, fields: 'name,mimeType', supportsAllDrives: true });
  const resp = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return { buffer: Buffer.from(resp.data as ArrayBuffer), mimeType: meta.data.mimeType, name: meta.data.name };
}
async function uploadImageToBunny(equipmentId: string, brandId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const zone = (process.env.BUNNY_STORAGE_ZONE ?? '').trim();
  const accessKey = (process.env.BUNNY_STORAGE_ACCESSKEY ?? '').trim();
  const pullZone = (process.env.BUNNY_STORAGE_PULLZONE ?? '').trim();
  if (!zone || !accessKey || !pullZone) throw new Error('BUNNY_STORAGE_* not set');
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const storagePath = `equipment/${equipmentId}/${brandId}.${ext}`;
  const res = await fetch(`https://storage.bunnycdn.com/${zone}/${storagePath}`, {
    method: 'PUT', headers: { AccessKey: accessKey, 'Content-Type': mimeType }, body: buffer as any,
  });
  if (!res.ok) throw new Error(`Bunny PUT ${res.status}: ${await res.text().catch(() => '')}`);
  return `https://${pullZone}/${storagePath}`;
}
async function updateBrand(db: admin.firestore.Firestore, docId: string, patch: { imageUrl?: string; videoUrl?: string }) {
  const ref = db.collection('gym_equipment').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`gym_equipment/${docId} not found`);
  const brands: any[] = Array.isArray(snap.data()!.brands) ? (snap.data()!.brands as any[]).map((b) => ({ ...b })) : [];
  const idx = brands.findIndex((b) => b.brandId === URBANICS || b.brandName === 'Urbanics');
  if (idx >= 0) {
    if (patch.imageUrl) brands[idx].imageUrl = patch.imageUrl;
    if (patch.videoUrl) brands[idx].videoUrl = patch.videoUrl;
  } else {
    brands.push({ brandName: 'Urbanics', brandId: URBANICS, ...patch });
  }
  await ref.update({ brands });
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const drive = await makeDriveClient();
  console.log(`\n═══ Phase-2 badge media — ${LIVE ? '🔴 LIVE (writing)' : '🟡 DRY-RUN (no writes)'} ═══\n`);

  // ── 0. Download the 2 🟡 candidates for visual review (always, read-only) ──
  for (const y of YELLOW) {
    const { buffer, mimeType, name } = await downloadDrive(drive, y.driveId);
    const out = `${SCRATCH}/preview-${y.label}.jpg`;
    fs.writeFileSync(out, buffer);
    console.log(`👁  preview: ${name} (${mimeType}, ${(buffer.length / 1024).toFixed(0)}KB) → ${out}`);
  }

  // ── 1. Backup the 4 target docs' brands[] BEFORE any write ──
  console.log('\n── BACKUP (before) ──');
  for (const r of [...IMAGE_ROWS, MSTOVEV]) {
    const s = await db.collection('gym_equipment').doc(r.docId).get();
    console.log(`  ${r.name} [${r.docId}]: ${JSON.stringify(s.data()?.brands ?? [])}`);
  }

  // ── 2. 🟢 image uploads ──
  console.log('\n── 🟢 Urbanics IMAGE uploads ──');
  for (const r of IMAGE_ROWS) {
    const { buffer, mimeType, name } = await downloadDrive(drive, r.driveId);
    const targetUrl = `https://${(process.env.BUNNY_STORAGE_PULLZONE ?? '').trim()}/equipment/${r.docId}/${URBANICS}.jpg`;
    if (!LIVE) { console.log(`  [dry] ${r.name}: "${name}" (${(buffer.length / 1024).toFixed(0)}KB) → ${targetUrl}`); continue; }
    const url = await uploadImageToBunny(r.docId, URBANICS, buffer, mimeType);
    await updateBrand(db, r.docId, { imageUrl: url });
    console.log(`  ✅ ${r.name}: uploaded + Urbanics.imageUrl set → ${url}`);
  }

  // ── 3. מתח מסתובב video-fallback → borrow a pullupbar_park sibling video ──
  console.log('\n── מתח מסתובב video-fallback (pullup_bar) ──');
  const all = await db.collection('gym_equipment').get();
  const sibling = all.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((g) => g.id !== MSTOVEV.docId && g.iconKey === 'pullupbar_park' &&
      (g.brands ?? []).some((b: any) => b.brandId === URBANICS && b.videoUrl));
  const sibVideo = (sibling?.brands ?? []).find((b: any) => b.brandId === URBANICS && b.videoUrl)?.videoUrl;
  if (!sibVideo) { console.log('  ⚠️ no pullup_bar sibling video found — skipped'); }
  else if (!LIVE) { console.log(`  [dry] מתח מסתובב ← borrow video from "${sibling.name}": ${sibVideo}`); }
  else { await updateBrand(db, MSTOVEV.docId, { videoUrl: sibVideo }); console.log(`  ✅ מתח מסתובב: Urbanics.videoUrl set (fallback from "${sibling.name}") → ${sibVideo}`); }

  console.log(`\n═══ done (${LIVE ? 'LIVE' : 'dry-run'}) ═══`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
