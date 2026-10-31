/**
 * AH6 (owner 31.10): exercise thumbnails that still point at Firebase Storage
 * (exercises/{id}.execution_methods[i].media.imageUrl = https://firebasestorage.googleapis.com/…,
 * full-size screenshots of ~1 MB each) move to Bunny Storage as small WebP files, so they load
 * like the park photos.
 *
 *   dry run (default)  reads only: counts them, downloads each once, makes the small copy in a temp
 *                      folder and reports sizes before / after plus a sample. Writes nothing.
 *   --apply            uploads each small copy to Bunny Storage (exercises/thumbs/<hash>.webp) and
 *                      sets media.imageUrl to the Bunny URL, keeping the old one in
 *                      media.imageUrlOriginal. Needs the owner's explicit OK.
 *   --rollback         puts media.imageUrlOriginal back into media.imageUrl (undo of --apply).
 *
 * Needs: macOS with `cwebp` (brew install webp) and FIREBASE_SERVICE_ACCOUNT_KEY; --apply also
 * needs BUNNY_STORAGE_ZONE, BUNNY_STORAGE_ACCESSKEY and BUNNY_STORAGE_PULLZONE (the pull zone
 * host, e.g. appoutimages.b-cdn.net), and optionally BUNNY_STORAGE_HOST (default
 * storage.bunnycdn.com).
 *
 *   npx tsx scripts/content/migrate-exercise-thumbs-to-bunny.ts            (dry run)
 *   npx tsx scripts/content/migrate-exercise-thumbs-to-bunny.ts --apply
 *   npx tsx scripts/content/migrate-exercise-thumbs-to-bunny.ts --rollback
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as admin from 'firebase-admin';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const MAX_PX = 600;
const QUALITY = 75;
const CONCURRENCY = 4;

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
if (!key?.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

interface Ref { exerciseId: string; name: string; method: number; url: string }

const isFirebase = (u: unknown): u is string => typeof u === 'string' && u.includes('firebasestorage.googleapis.com');
const kb = (n: number) => `${Math.round(n / 1024)} KB`;
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

async function collect(): Promise<Ref[]> {
  const snap = await db.collection('exercises').get();
  const refs: Ref[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const name = typeof d.name === 'string' ? d.name : d.name?.he ?? doc.id;
    const methods: Array<{ media?: { imageUrl?: unknown } }> = Array.isArray(d.execution_methods) ? d.execution_methods : [];
    methods.forEach((m, i) => {
      if (isFirebase(m?.media?.imageUrl)) refs.push({ exerciseId: doc.id, name, method: i, url: m.media!.imageUrl as string });
    });
  }
  return refs;
}

/** Downloads one image and makes the small WebP; returns both sizes and the local file. */
async function shrink(url: string, dir: string): Promise<{ before: number; after: number; file: string; hash: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const src = path.join(dir, `${hash}.src`);
  const out = path.join(dir, `${hash}.webp`);
  fs.writeFileSync(src, buf);
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-resize', String(MAX_PX), '0', src, '-o', out]);
  fs.unlinkSync(src);
  return { before: buf.length, after: fs.statSync(out).size, file: out, hash };
}

async function upload(file: string, hash: string): Promise<string> {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const access = process.env.BUNNY_STORAGE_ACCESSKEY;
  const pull = process.env.BUNNY_STORAGE_PULLZONE?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const host = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
  if (!zone || !access || !pull) throw new Error('BUNNY_STORAGE_ZONE / BUNNY_STORAGE_ACCESSKEY / BUNNY_STORAGE_PULLZONE missing');
  const objectPath = `exercises/thumbs/${hash}.webp`;
  const res = await fetch(`https://${host}/${zone}/${objectPath}`, {
    method: 'PUT',
    headers: { AccessKey: access, 'Content-Type': 'image/webp' },
    body: fs.readFileSync(file),
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return `https://${pull}/${objectPath}`;
}

async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<Array<R | Error>> {
  const out: Array<R | Error> = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i]); } catch (e) { out[i] = e instanceof Error ? e : new Error(String(e)); }
    }
  }));
  return out;
}

async function rollback() {
  const snap = await db.collection('exercises').get();
  let n = 0;
  for (const doc of snap.docs) {
    const methods = doc.data().execution_methods;
    if (!Array.isArray(methods)) continue;
    let changed = false;
    const next = methods.map((m: { media?: Record<string, unknown> }) => {
      const orig = m?.media?.imageUrlOriginal;
      if (!isFirebase(orig)) return m;
      changed = true;
      const { imageUrlOriginal: _o, ...media } = m.media!;
      return { ...m, media: { ...media, imageUrl: orig } };
    });
    if (changed) { await doc.ref.update({ execution_methods: next }); n++; }
  }
  console.log(`rollback: ${n} exercises restored`);
}

async function main() {
  if (ROLLBACK) return rollback();
  const refs = await collect();
  const urls = Array.from(new Set(refs.map((r) => r.url)));
  console.log(`${refs.length} execution methods use a Firebase Storage image (${new Set(refs.map((r) => r.exerciseId)).size} exercises, ${urls.length} distinct images).`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-thumbs-'));
  const results = await pool(urls, (u) => shrink(u, dir));
  const ok = new Map<string, { before: number; after: number; file: string; hash: string }>();
  results.forEach((r, i) => { if (!(r instanceof Error)) ok.set(urls[i], r); else console.warn(`skip ${urls[i].slice(0, 90)}…: ${r.message}`); });
  const before = Array.from(ok.values()).reduce((s, r) => s + r.before, 0);
  const after = Array.from(ok.values()).reduce((s, r) => s + r.after, 0);
  console.log(`made ${ok.size} / ${urls.length}: ${mb(before)} -> ${mb(after)} (avg ${kb(before / Math.max(1, ok.size))} -> ${kb(after / Math.max(1, ok.size))})`);
  console.log('sample:');
  for (const r of refs.slice(0, 5)) {
    const s = ok.get(r.url);
    if (s) console.log(`  ${r.name} [method ${r.method}]: ${kb(s.before)} -> ${kb(s.after)}  exercises/thumbs/${s.hash}.webp`);
  }

  if (!APPLY) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('\ndry run: nothing was uploaded or written. Pass --apply (owner OK) to migrate.');
    return;
  }

  const bunnyUrl = new Map<string, string>();
  const up = await pool(Array.from(ok.entries()), async ([u, s]) => { bunnyUrl.set(u, await upload(s.file, s.hash)); });
  up.forEach((r) => { if (r instanceof Error) console.warn(`upload failed: ${r.message}`); });

  const byExercise = new Map<string, Ref[]>();
  for (const r of refs) if (bunnyUrl.has(r.url)) byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), r]);
  let docs = 0;
  for (const [id, list] of Array.from(byExercise.entries())) {
    await db.runTransaction(async (tx) => {
      const ref = db.collection('exercises').doc(id);
      const snap = await tx.get(ref);
      const methods = [...(snap.get('execution_methods') ?? [])];
      for (const r of list) {
        const m = methods[r.method];
        if (!m?.media || m.media.imageUrl !== r.url) continue; // changed since the read: leave it
        methods[r.method] = { ...m, media: { ...m.media, imageUrl: bunnyUrl.get(r.url), imageUrlOriginal: r.url } };
      }
      tx.update(ref, { execution_methods: methods });
    });
    docs++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\napplied: ${bunnyUrl.size} images uploaded, ${docs} exercises updated (old URL kept in media.imageUrlOriginal; --rollback undoes).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
