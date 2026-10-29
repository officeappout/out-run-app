// @ts-nocheck -- standalone tsx script
/**
 * READ-ONLY. Exports every exercise to the admin bulk-translation v1 format plus de-duplicated chunk files.
 *
 *   npx tsx scripts/i18n/content/export-exercises.ts --target es --out work/es-exercises [--source he] [--chunk-size 150]
 *
 * Writes <out>/export.json (all exercises, slots { he, es }) and <out>/chunks/chunk-NNN.json (unique source strings that
 * still need the target: empty or corrupt targets only, each with up to 3 usage contexts). Never writes Firestore.
 */
import fs from 'fs';
import path from 'path';
import { adminDb, argOf } from './admin';
import { buildBulkFile, chunkStrings, uniqueStrings } from './exercise-bulk';

async function main() {
  const target = argOf('--target');
  const source = argOf('--source') ?? 'he';
  const out = argOf('--out');
  const size = Number(argOf('--chunk-size') ?? 150);
  if (!target || !out) { console.error('usage: export-exercises.ts --target <xx> --out <dir> [--source he] [--chunk-size 150]'); process.exit(2); }

  const snap = await adminDb().collection('exercises').get(); // read only
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const file = buildBulkFile(docs, { source, target });
  const entries = uniqueStrings(file);
  const chunks = chunkStrings(entries, { size, sourceLang: source, targetLang: target });

  fs.mkdirSync(path.join(out, 'chunks'), { recursive: true });
  fs.writeFileSync(path.join(out, 'export.json'), JSON.stringify(file, null, 2));
  for (const c of chunks) fs.writeFileSync(path.join(out, 'chunks', `chunk-${String(c.chunk).padStart(3, '0')}.json`), JSON.stringify(c, null, 2));
  console.log(`${file.exerciseCount} exercises, ${entries.length} unique strings to translate, ${chunks.length} chunks -> ${out}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
