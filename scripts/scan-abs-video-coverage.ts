/**
 * scripts/scan-abs-video-coverage.ts — READ ONLY. Phase 0.5.
 *
 * For a fixed list of abs/core exercise IDs, emit one row PER execution_method
 * showing which video slot/language is actually populated vs merely declared.
 *
 *   abs-video-coverage.csv  (repo root) — row-per-method
 *   + console summary: declared methods, methods with no video, list to upload
 *
 * NO writes. Usage: npx tsx scripts/scan-abs-video-coverage.ts
 * Needs: .env.local with FIREBASE_SERVICE_ACCOUNT_KEY
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) { const c = JSON.parse(raw); admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return; }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? 'appout-1' });
}

const IDS = [
  '5LGfy2EB72CeLhQDcnY6', 'qnSex7AN2TXhTiytUXX8', 'LxyBLJUs5ryW7fgrDPba',
  'PMZewv23o1W4ZP01jo95', 'mMW69g4YfMnlNGuLQgne', 'Ma6QH3kwbEZoIiME7r0K',
  'Ao3amXO9YEBEOSE48RRi', 'XWL3TUAVmN0Dmp2btFgN', 'PBpgwYAqyAPwGd276lny',
  'IEoGYRVKRxjaA0fQZNDw', 'ggzAxOz0vT3SOObT3Y7q', 'FHh3m3suMMtoLk1PrxYv',
  'mIEhyPgMAxSryv46CZ2f', 'iEZGhtBNV7Tv5iNuT70E', 'BcsFnuiLx1fZY2SIVhoC',
  '3sR44gVtDlzdot9Yq7MQ', 'iuwmGaZnuvhZ1mZFXJyt', 'BLbgAyNJSZCc4YsoOxtP',
  'wDUc5pDs5ufm3B5a0MqY', 'nNc7TeLC8LtaVQJeK4Tf', '1OEFeykCym2378rgD4QK',
  'OSXBFYoP1sWt4P05isJw', '5cdQOV3Kl5EpnyUt1JuG', 'qhIpGmdbCe3uv5bKRPQK',
  'ovwmeDEgpucFfaVQGpR7', 'tWZ1PnXwUFZKOZFqvyp9', '6OPvBxXMTy0mHYNra4Wc',
  'wBv3BWfJD0S9sSUnI1Ay', 'bRUKaSg9p9Tl1rCzEiV4', 'zOl1jxCkmI36QwSzMDKF',
  'DU3SwZWr6uy75WI7T4jB', 'Z3DNlwJAulyI28a8Kji7', 'tXXikNYiAIcK3yPgybF1',
  'qRoLtKTPXF3CJsQ9hMTg', '8YpK2KnydcB6Oz1zTMSh', 'lGZxrjALhrrGWxnwNOTW',
  'uRelXXhk4iDsccOxuTsj', 'CVMlbYHJTiJKSPYkZ9Lk', 'wv8E2f5tcgx3A5nHaUbg',
];

const toArr = (v: any): any[] => (Array.isArray(v) ? v : []);
/** which locales of a Localized video slot carry a videoId (e.g. "he|en"); '' if none */
function langsWithVideo(slot: any): string {
  if (!slot || typeof slot !== 'object') return '';
  return Object.keys(slot).filter((k) => slot[k]?.videoId).join('|');
}
/** provider host of a raw mainVideoUrl string */
function urlProvider(url: string): string {
  if (!url) return '';
  if (url.includes('b-cdn.net') || url.includes('bunnycdn.com')) return 'bunny';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('firebasestorage.googleapis.com')) return 'firebase';
  return 'other';
}
function cell(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
}

interface Row {
  exercise_id: string;
  name_he: string;
  method_index: number | string;
  location: string;
  previewVideo_langs: string;
  fullTutorial_langs: string;
  mainVideoUrl_present: string;   // full / empty
  mainVideoUrl_provider: string;
  has_any_real_video_for_method: boolean | string;
  gap_method_declared_no_video: boolean | string;
  root_media_fallback_langs: string; // supplementary: exercise-root preview/fullTutorial that would serve as fallback
}
const COLS: (keyof Row)[] = [
  'exercise_id', 'name_he', 'method_index', 'location',
  'previewVideo_langs', 'fullTutorial_langs', 'mainVideoUrl_present', 'mainVideoUrl_provider',
  'has_any_real_video_for_method', 'gap_method_declared_no_video', 'root_media_fallback_langs',
];

async function main() {
  initFirebase();
  const db = admin.firestore();

  const rows: Row[] = [];
  const notFound: string[] = [];
  const noMethods: string[] = [];

  // batched getAll for efficiency
  const refs = IDS.map((id) => db.collection('exercises').doc(id));
  const snaps = await db.getAll(...refs);

  for (const snap of snaps) {
    if (!snap.exists) { notFound.push(snap.id); continue; }
    const ex = snap.data() as any;
    const name_he = ex?.name?.he ?? (typeof ex?.name === 'string' ? ex.name : snap.id);
    const methods = toArr(ex.execution_methods).length ? toArr(ex.execution_methods) : toArr(ex.executionMethods);

    // exercise-root media (fallback the app applies when a method lacks its own)
    const rootPreview = langsWithVideo(ex.media?.previewVideo);
    const rootFull = langsWithVideo(ex.media?.fullTutorial);
    const rootFallback = [rootPreview && `preview:${rootPreview}`, rootFull && `full:${rootFull}`].filter(Boolean).join(' ');

    if (methods.length === 0) {
      noMethods.push(snap.id);
      rows.push({
        exercise_id: snap.id, name_he, method_index: '', location: '(no execution_methods)',
        previewVideo_langs: '', fullTutorial_langs: '', mainVideoUrl_present: '', mainVideoUrl_provider: '',
        has_any_real_video_for_method: '', gap_method_declared_no_video: '', root_media_fallback_langs: rootFallback,
      });
      continue;
    }

    methods.forEach((m: any, idx: number) => {
      const location = toArr(m?.locationMapping).join('+') || m?.location || '?';
      const preview = langsWithVideo(m?.media?.previewVideo);
      const full = langsWithVideo(m?.media?.fullTutorial);
      const mainUrl: string = m?.media?.mainVideoUrl ?? '';
      const hasVideo = !!(preview || full || mainUrl);
      rows.push({
        exercise_id: snap.id,
        name_he,
        method_index: idx,
        location,
        previewVideo_langs: preview,
        fullTutorial_langs: full,
        mainVideoUrl_present: mainUrl ? 'full' : 'empty',
        mainVideoUrl_provider: urlProvider(mainUrl),
        has_any_real_video_for_method: hasVideo,
        gap_method_declared_no_video: !hasVideo,
        root_media_fallback_langs: rootFallback,
      });
    });
  }

  // ── CSV ──
  const header = COLS.join(',');
  const body = rows
    .sort((a, b) => a.exercise_id.localeCompare(b.exercise_id) || Number(a.method_index) - Number(b.method_index))
    .map((r) => COLS.map((c) => cell(r[c])).join(','))
    .join('\n');
  const outPath = path.join(process.cwd(), 'abs-video-coverage.csv');
  fs.writeFileSync(outPath, '﻿' + header + '\n' + body + '\n', 'utf8');

  // ── Summary ──
  const methodRows = rows.filter((r) => r.method_index !== '');
  const declared = methodRows.length;
  const gapRows = methodRows.filter((r) => r.gap_method_declared_no_video === true);
  const gapWithNoRootEither = gapRows.filter((r) => !r.root_media_fallback_langs);

  console.log('\n════════ ABS/CORE VIDEO COVERAGE — Phase 0.5 (READ ONLY) ════════');
  console.log(`  CSV written: ${outPath}`);
  console.log(`\n  Input IDs:                         ${IDS.length}`);
  console.log(`  Not found in Firestore:            ${notFound.length}${notFound.length ? '  → ' + notFound.join(', ') : ''}`);
  console.log(`  Exercises with 0 execution_methods:${noMethods.length ? ' ' + noMethods.length + '  → ' + noMethods.join(', ') : ' 0'}`);
  console.log(`\n  Declared execution_methods total:  ${declared}`);
  console.log(`  Methods with a real video:         ${declared - gapRows.length}`);
  console.log(`  ⚠️ Methods DECLARED but NO video:  ${gapRows.length}`);
  console.log(`     …of which no root fallback too: ${gapWithNoRootEither.length}  (true content holes)`);

  // slot coverage tallies among method rows
  const hasPreview = methodRows.filter((r) => r.previewVideo_langs).length;
  const hasFull = methodRows.filter((r) => r.fullTutorial_langs).length;
  const hasMain = methodRows.filter((r) => r.mainVideoUrl_present === 'full').length;
  console.log(`\n  Slot coverage (of ${declared} methods):`);
  console.log(`    previewVideo populated:  ${hasPreview}`);
  console.log(`    fullTutorial populated:  ${hasFull}`);
  console.log(`    mainVideoUrl populated:  ${hasMain}`);

  console.log('\n  ── Methods to upload (declared, no video) ──');
  if (gapRows.length === 0) console.log('    (none 🎉)');
  gapRows
    .sort((a, b) => a.name_he.localeCompare(String(b.name_he)))
    .forEach((r) => console.log(
      `    • ${String(r.name_he).padEnd(26)} [${r.exercise_id.slice(0, 8)}] method#${r.method_index} loc=${r.location}` +
      `${r.root_media_fallback_langs ? `  (root-fallback: ${r.root_media_fallback_langs})` : '  ← NO fallback'}`,
    ));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
