// @ts-nocheck -- standalone tsx script
/**
 * Local files only. export/<c>.json + translations/<c>.json (Hebrew -> English, null = skip junk) -> <c>-import.json
 *
 *   npx tsx scripts/i18n/content/build-collection-import.ts --collection programs --dir <work dir>
 *
 * Fields the app reads as { he, en } (READY_PATHS) become writes; every other field is listed under needsCode and is never
 * written. site_content also reads <dir>/translations/site_content.creates.json (new locale "en" documents).
 */
import fs from 'fs';
import path from 'path';
import { argOf } from './admin';
import { buildImport, collectionFileKey, verifyImport, verifyCreates, wordCount } from './collection-bulk';

const col = argOf('--collection');
const dir = argOf('--dir');
if (!col || !dir) { console.error('usage: build-collection-import.ts --collection <c> --dir <work dir>'); process.exit(2); }
const key = collectionFileKey(col); // subcollection paths: a/b/c -> a__b__c
const exp = JSON.parse(fs.readFileSync(path.join(dir, 'export', `${key}.json`), 'utf8'));
const tr = JSON.parse(fs.readFileSync(path.join(dir, 'translations', `${key}.json`), 'utf8'));
let fields = exp.fields;
let excluded = 0;
if (col === 'site_content') { // FAQ docs already have English twins (faq-*-en-*); only help + article docs are translated
  fields = fields.filter((f) => !f.id.startsWith('faq-'));
  excluded = exp.fields.length - fields.length;
}
const { file, missing, skipped } = buildImport({ ...exp, fields }, tr);
const createsPath = path.join(dir, 'translations', `${key}.creates.json`);
if (fs.existsSync(createsPath) && !process.argv.includes('--no-creates')) { // --no-creates: the docs already exist in Firestore
  const c = JSON.parse(fs.readFileSync(createsPath, 'utf8'));
  file.creates = Object.entries(c).map(([docId, data]) => ({ docId, data }));
  // site_content English lives in new docs, not in field writes
  file.needsCode = [];
}
if (col === 'push_messages') file.notes = 'needsCode: after functions deploy (the push sender reads {he,en} only once the functions are deployed); then add push_messages to READY_PATHS and rebuild.';
fs.writeFileSync(path.join(dir, `${key}-import.json`), JSON.stringify(file, null, 2));
const unique = (a) => new Set(a.map((x) => x.he.trim()));
const issues = [...verifyImport({ ...exp, fields }, file), ...verifyCreates(col, file.creates ?? [], new Set())];
const summary = {
  collection: col, docs: exp.docCount, fieldsInExport: exp.fields.length, fieldsExcluded: excluded,
  writeReady: file.writes.length, needsCode: file.needsCode.length, creates: file.creates?.length ?? 0,
  uniqueStringsTranslated: new Set([...unique(file.writes), ...unique(file.needsCode)]).size,
  words: [...new Set([...file.writes, ...file.needsCode].map((x) => x.he.trim()))].reduce((n, s) => n + wordCount(s), 0),
  skippedJunkStrings: skipped.length, missingTranslations: missing.length, alreadyTranslated: file.alreadyTranslated, issues: issues.length,
};
fs.writeFileSync(path.join(dir, `${key}-summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
for (const m of missing.slice(0, 10)) console.log('MISSING', m);
for (const i of issues.slice(0, 20)) console.log(`${i.check} ${i.docId} ${i.path}: ${i.message}`);
process.exit(issues.length || missing.length ? 1 : 0);
