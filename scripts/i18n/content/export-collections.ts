// @ts-nocheck -- standalone tsx script
/**
 * READ-ONLY. Exports the Hebrew text fields of content collections (whole-collection get(), nothing else).
 *
 *   npx tsx scripts/i18n/content/export-collections.ts --collections programs,levels --out <dir>
 *
 * Writes <out>/export/<collection>.json (format out-collection-translations-v1) and <out>/sources/<collection>.json
 * (unique Hebrew strings still without English, with usage counts) for translation. Never writes Firestore.
 */
import fs from 'fs';
import path from 'path';
import { adminDb, argOf } from './admin';
import { buildExport, uniqueSources, wordCount } from './collection-bulk';

async function main() {
  const cols = (argOf('--collections') ?? '').split(',').filter(Boolean);
  const out = argOf('--out');
  if (!cols.length || !out) { console.error('usage: export-collections.ts --collections a,b --out <dir>'); process.exit(2); }
  const db = adminDb();
  fs.mkdirSync(path.join(out, 'export'), { recursive: true });
  fs.mkdirSync(path.join(out, 'sources'), { recursive: true });
  for (const c of cols) {
    const snap = await db.collection(c).get(); // read only
    const exp = buildExport(c, snap.docs.map((d) => ({ id: d.id, data: d.data() })));
    fs.writeFileSync(path.join(out, 'export', `${c}.json`), JSON.stringify(exp, null, 2));
    const src = uniqueSources(exp.fields);
    const uses = new Map<string, number>();
    for (const f of exp.fields) if (!f.en.trim()) uses.set(f.he.trim(), (uses.get(f.he.trim()) ?? 0) + 1);
    fs.writeFileSync(path.join(out, 'sources', `${c}.json`), JSON.stringify(src.map((s) => ({ he: s, uses: uses.get(s) })), null, 2));
    console.log(`${c}: ${exp.docCount} docs, ${exp.fields.length} fields, ${src.length} unique strings to translate, ${src.reduce((n, s) => n + wordCount(s), 0)} words`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
