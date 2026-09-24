/**
 * scripts/upload-hybrid-badge-media-2.ts — Phase-2 Part-A extra writes (throwaway).
 * Scope LOCKED to 3 docs:
 *   #1 מקבילים ארוכים  → Urbanics.videoUrl = UBX-15 video (Drive→Bunny Stream; replaces current)
 *   #2 רצועות חתירה TRX → Ludos.videoUrl    = "TRX ברצועות" video (Drive→Bunny Stream)
 *   #3 רצועות חתירה מתכווננות → Ludos.videoUrl = inherit exercise "חתירות ב-60°" video (no Drive)
 * (#4 מתח מסתובב image = STOPPED, not here.)
 * Modes: (default) DRY-RUN · --live
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
import * as https from 'https';
import { Readable } from 'stream';

const LIVE = process.argv.includes('--live');
const URBANICS = 'LfKL3h2NBrZXp4E8w56G';
const LUDOS = 'MfLM9AKpHz2p7YYQIAoH';
const EX_INHERIT_VIDEO = 'https://vz-b17872ab-7a7.b-cdn.net/2e566d91-75f3-4432-8873-38ea8d4869f6/play_360p.mp4'; // "חתירות ב-60°" park demo

const TARGETS = {
  arukim: { name: 'מקבילים ארוכים', docId: 'VQoqHLfhHGhPsaz2zsQO', driveId: '1aRg5ZJ1Dk2j1wkR5i1ES9z0M8whhmVzY' },
  trx:    { name: 'רצועות חתירה TRX', docId: 's8goMzF59VCNbKhf0BhE', driveId: '10Bnf67-_EoC-2DgPU6Z62ASDGWKyOvvq' },
  mitk:   { name: 'רצועות חתירה מתכווננות', docId: 'BlaaMRjaztS9ljty9h1L' },
};

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
async function downloadDrive(drive: any, fileId: string) {
  const meta = await drive.files.get({ fileId, fields: 'name,mimeType', supportsAllDrives: true });
  const resp = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return { buffer: Buffer.from(resp.data as ArrayBuffer), mimeType: meta.data.mimeType as string, name: meta.data.name as string };
}
function bunny() {
  const apiKey = (process.env.BUNNY_API_KEY ?? '').trim();
  const libraryId = (process.env.BUNNY_LIBRARY_ID ?? '').trim();
  if (!apiKey || !libraryId) throw new Error('BUNNY_API_KEY / BUNNY_LIBRARY_ID not set');
  return { apiKey, libraryId };
}
async function bunnyCreateSlot(title: string): Promise<string> {
  const { apiKey, libraryId } = bunny();
  const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: 'POST', headers: { AccessKey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Bunny create ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { guid: string }).guid;
}
function bunnyPutStream(videoId: string, stream: NodeJS.ReadableStream, fileSize: number, mimeType: string): Promise<void> {
  const { apiKey, libraryId } = bunny();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'video.bunnycdn.com', path: `/library/${libraryId}/videos/${videoId}`, method: 'PUT',
      headers: { AccessKey: apiKey, 'Content-Type': mimeType.startsWith('video/') ? mimeType : 'video/mp4', 'Content-Length': fileSize },
    }, (res) => {
      if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) { res.resume(); resolve(); }
      else { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => reject(new Error(`Bunny PUT ${res.statusCode}: ${b}`))); }
    });
    req.on('error', reject); stream.pipe(req);
  });
}
async function bunnyPoll(videoId: string, maxMin = 20): Promise<void> {
  const { apiKey, libraryId } = bunny();
  const deadline = Date.now() + maxMin * 60_000;
  while (Date.now() < deadline) {
    const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, { headers: { AccessKey: apiKey, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Bunny poll ${res.status}`);
    const j = (await res.json()) as { status: number; encodeProgress?: number };
    if (j.status === 3 || j.status === 4) return;
    if (j.status === 5) throw new Error(`Bunny encode failed ${videoId}`);
    process.stdout.write(`\r    encoding ${j.encodeProgress ?? 0}%   `);
    await new Promise((r) => setTimeout(r, 8_000));
  }
  throw new Error(`Bunny encode timeout`);
}
async function updateBrand(db: admin.firestore.Firestore, docId: string, brandId: string, brandName: string, patch: { imageUrl?: string; videoUrl?: string }) {
  const ref = db.collection('gym_equipment').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`gym_equipment/${docId} not found`);
  const brands: any[] = Array.isArray(snap.data()!.brands) ? (snap.data()!.brands as any[]).map((b) => ({ ...b })) : [];
  const idx = brands.findIndex((b) => b.brandId === brandId || b.brandName === brandName);
  if (idx >= 0) { if (patch.imageUrl) brands[idx].imageUrl = patch.imageUrl; if (patch.videoUrl) brands[idx].videoUrl = patch.videoUrl; }
  else brands.push({ brandName, brandId, ...patch });
  await ref.update({ brands });
}
async function uploadDriveVideo(drive: any, driveId: string, title: string): Promise<{ url: string; note: string }> {
  const { buffer, mimeType, name } = await downloadDrive(drive, driveId);
  const mb = (buffer.length / 1048576).toFixed(1);
  if (!LIVE) return { url: '(dry)', note: `"${name}" ${mb}MB ${mimeType}` };
  const guid = await bunnyCreateSlot(title);
  await bunnyPutStream(guid, Readable.from(buffer), buffer.length, mimeType);
  await bunnyPoll(guid);
  return { url: `https://iframe.bunnycdn.com/embed/${bunny().libraryId}/${guid}`, note: `"${name}" ${mb}MB` };
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const drive = await makeDriveClient();
  console.log(`\n═══ Part-A extra — ${LIVE ? '🔴 LIVE' : '🟡 DRY-RUN'} ═══`);

  console.log('\n── BACKUP (before) ──');
  for (const t of Object.values(TARGETS)) {
    const s = await db.collection('gym_equipment').doc(t.docId).get();
    console.log(`  ${t.name}: ${JSON.stringify(s.data()?.brands ?? [])}`);
  }

  // #1 מקבילים ארוכים → Urbanics.videoUrl = UBX-15
  console.log('\n── #1 מקבילים ארוכים ← UBX-15 (Urbanics.videoUrl) ──');
  try {
    const { url, note } = await uploadDriveVideo(drive, TARGETS.arukim.driveId, 'מקבילים ארוכים UBX-15');
    if (!LIVE) console.log(`  [dry] ${note} → Urbanics.videoUrl (replaces existing)`);
    else { await updateBrand(db, TARGETS.arukim.docId, URBANICS, 'Urbanics', { videoUrl: url }); console.log(`  ✅ ${note} → ${url}`); }
  } catch (e) { console.error('  ❌ #1 failed:', (e as Error).message); }

  // #2 רצועות חתירה TRX → Ludos.videoUrl
  console.log('\n── #2 רצועות חתירה TRX ← TRX ברצועות (Ludos.videoUrl) ──');
  try {
    const { url, note } = await uploadDriveVideo(drive, TARGETS.trx.driveId, 'רצועות חתירה TRX');
    if (!LIVE) console.log(`  [dry] ${note} → Ludos.videoUrl (fill)`);
    else { await updateBrand(db, TARGETS.trx.docId, LUDOS, 'Ludos', { videoUrl: url }); console.log(`  ✅ ${note} → ${url}`); }
  } catch (e) { console.error('  ❌ #2 failed:', (e as Error).message); }

  // #3 רצועות חתירה מתכווננות → Ludos.videoUrl = inherit exercise video (no upload)
  console.log('\n── #3 רצועות חתירה מתכווננות ← inherit "חתירות ב-60°" (Ludos.videoUrl) ──');
  try {
    if (!LIVE) console.log(`  [dry] Ludos.videoUrl ← ${EX_INHERIT_VIDEO}`);
    else { await updateBrand(db, TARGETS.mitk.docId, LUDOS, 'Ludos', { videoUrl: EX_INHERIT_VIDEO }); console.log(`  ✅ inherited → ${EX_INHERIT_VIDEO}`); }
  } catch (e) { console.error('  ❌ #3 failed:', (e as Error).message); }

  console.log(`\n═══ done (${LIVE ? 'LIVE' : 'dry-run'}) ═══`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
