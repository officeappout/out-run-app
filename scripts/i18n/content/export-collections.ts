// @ts-nocheck -- standalone tsx script
/**
 * READ-ONLY. Exports the Hebrew text fields of content collections (whole-collection get(), nothing else).
 *
 *   npx tsx scripts/i18n/content/export-collections.ts --collections programs,levels --out <dir> [--ready-only]
 *
 * A collection may be a slash path to a subcollection (workoutMetadata/workoutTitles/titles; file name key `a__b__c`).
 * Writes <out>/export/<collection>.json (format out-collection-translations-v1) and <out>/sources/<collection>.json
 * (unique Hebrew strings still without English, with usage counts) for translation. Never writes Firestore.
 */
import fs from 'fs';
import path from 'path';
import { adminDb, argOf } from './admin';
import { buildExport, collectionFileKey, exportableDoc, isReadyPath, isValidCollectionPath, uniqueSources, wordCount } from './collection-bulk';

async function main() {
  const cols = (argOf('--collections') ?? '').split(',').filter(Boolean);
  const out = argOf('--out');
  if (!cols.length || !out) { console.error('usage: export-collections.ts --collections a,b --out <dir>'); process.exit(2); }
  const bad = cols.filter((c) => !isValidCollectionPath(c));
  if (bad.length) { console.error(`invalid collection path: ${bad.join(', ')}`); process.exit(2); }
  const db = adminDb();
  fs.mkdirSync(path.join(out, 'export'), { recursive: true });
  fs.mkdirSync(path.join(out, 'sources'), { recursive: true });
  for (const c of cols) {
    const snap = await db.collection(c).get(); // read only
    // subcollections (workoutMetadata/...): archived rows are not served by the app, so they are not exported
    const full = buildExport(c, snap.docs.filter((d) => exportableDoc(c, d.data())).map((d) => ({ id: d.id, data: d.data() })));
    // --ready-only: keep only the fields the app reads as { he, en } (huge collections such as official_routes)
    const exp = process.argv.includes('--ready-only') ? { ...full, fields: full.fields.filter((f) => isReadyPath(c, f.path)) } : full;
    fs.writeFileSync(path.join(out, 'export', `${collectionFileKey(c)}.json`), JSON.stringify(exp, null, 2));
    const src = uniqueSources(exp.fields);
    const uses = new Map<string, number>();
    for (const f of exp.fields) if (!f.en.trim()) uses.set(f.he.trim(), (uses.get(f.he.trim()) ?? 0) + 1);
    fs.writeFileSync(path.join(out, 'sources', `${collectionFileKey(c)}.json`), JSON.stringify(src.map((s) => ({ he: s, uses: uses.get(s) })), null, 2));
    console.log(`${c}: ${exp.docCount} docs, ${exp.fields.length} fields, ${src.length} unique strings to translate, ${src.reduce((n, s) => n + wordCount(s), 0)} words`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
