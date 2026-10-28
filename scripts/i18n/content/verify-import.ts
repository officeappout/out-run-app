// @ts-nocheck -- standalone tsx script
/**
 * Local files only. Export vs import: same ids/order, source text identical, structure counts identical,
 * no source-language characters or "Copy of" in the target, good existing targets untouched.
 *
 *   npx tsx scripts/i18n/content/verify-import.ts --export work/es/export.json --import work/es/import.json [--require-complete]
 */
import fs from 'fs';
import { argOf } from './admin';
import { validateBulkFile, verifyImport } from './exercise-bulk';

const exp = argOf('--export');
const imp = argOf('--import');
if (!exp || !imp) { console.error('usage: verify-import.ts --export <f> --import <f> [--require-complete]'); process.exit(2); }
const issues = verifyImport(validateBulkFile(JSON.parse(fs.readFileSync(exp, 'utf8'))), validateBulkFile(JSON.parse(fs.readFileSync(imp, 'utf8'))), { requireComplete: process.argv.includes('--require-complete') });
for (const i of issues.slice(0, 200)) console.log(`${i.check} ${i.exerciseId} ${i.path}: ${i.message}`);
console.log(issues.length ? `${issues.length} issues` : 'OK: import matches export');
process.exit(issues.length ? 1 : 0);
