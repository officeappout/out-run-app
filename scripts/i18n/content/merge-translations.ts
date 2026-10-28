// @ts-nocheck -- standalone tsx script
/**
 * Local files only. Chunks (translated) + export.json -> import.json, filling ONLY empty or corrupt target slots
 * (empty, Hebrew characters, "Copy of", "(Copy)"). A good existing target is never overwritten.
 *
 *   npx tsx scripts/i18n/content/merge-translations.ts --export work/es/export.json --chunks work/es/chunks --out work/es/import.json
 */
import fs from 'fs';
import path from 'path';
import { argOf } from './admin';
import { mergeTranslations, validateBulkFile } from './exercise-bulk';

const exp = argOf('--export');
const dir = argOf('--chunks');
const out = argOf('--out');
if (!exp || !dir || !out) { console.error('usage: merge-translations.ts --export <export.json> --chunks <dir> --out <import.json>'); process.exit(2); }

const file = validateBulkFile(JSON.parse(fs.readFileSync(exp, 'utf8')));
const chunks = fs.readdirSync(dir).filter((f) => /\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const { file: merged, report } = mergeTranslations(file, chunks);
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
fs.writeFileSync(out.replace(/\.json$/, '') + '.merge-report.json', JSON.stringify(report, null, 2));
console.log(`filled ${report.filled}, kept ${report.keptExisting}, still missing ${report.stillMissing}, rejected ${report.rejected.length}, stale ${report.unknownSources.length}`);
for (const r of report.rejected.slice(0, 20)) console.log(`REJECTED (${r.reason}): ${r.source} -> ${r.target}`);
process.exit(report.rejected.length || report.unknownSources.length ? 1 : 0);
