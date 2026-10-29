// @ts-nocheck -- standalone tsx script
/**
 * Local files only (plus an optional fresh export): saved export vs import, and saved export vs a fresh export.
 *
 *   npx tsx scripts/i18n/content/verify-collection-import.ts --export <export.json> --import <import.json> [--fresh <fresh-export.json>]
 */
import fs from 'fs';
import { argOf } from './admin';
import { sourceDriftBetween, verifyCreates, verifyImport } from './collection-bulk';

const e = argOf('--export'), i = argOf('--import'), f = argOf('--fresh');
if (!e || !i) { console.error('usage: verify-collection-import.ts --export <f> --import <f> [--fresh <f>]'); process.exit(2); }
const exp = JSON.parse(fs.readFileSync(e, 'utf8'));
const imp = JSON.parse(fs.readFileSync(i, 'utf8'));
const scoped = imp.collection === 'site_content' ? { ...exp, fields: exp.fields.filter((x) => !x.id.startsWith('faq-')) } : exp;
const issues = [...verifyImport(scoped, imp), ...verifyCreates(imp.collection, imp.creates ?? [], new Set())];
if (f) issues.push(...sourceDriftBetween(exp, JSON.parse(fs.readFileSync(f, 'utf8'))));
for (const x of issues.slice(0, 100)) console.log(`${x.check} ${x.docId} ${x.path}: ${x.message}`);
console.log(issues.length ? `${issues.length} issues` : `OK: ${imp.collection}: ${imp.writes.length} writes, ${imp.needsCode.length} needs-code, ${(imp.creates ?? []).length} creates; source text ${f ? 'identical to the fresh export' : 'matches the saved export'}`);
process.exit(issues.length ? 1 : 0);
