/**
 * scripts/convert-unit-csv-to-import-json.ts — throwaway, read-only (never
 * writes to Firestore itself; per the `scripts/_*.ts` convention this would
 * normally get the underscore prefix, but it's kept discoverable/named
 * clearly since David hands its INPUT format directly to the officer).
 *
 * Phase 6b blocker א (05.09.2026) — unitDirectory has real brigades but only
 * 2 real sub-units; soldiers arriving next week need real battalions/
 * companies to select in HierarchySearchStep. Converts a flat CSV (one row
 * per battalion or company) the officer can fill in Excel into the exact
 * nested JSON `src/features/admin/services/unit-import.service.ts` already
 * accepts — one blob PER BRIGADE, ready to paste into the EXISTING,
 * already-tested "ייבוא היררכיה מ-JSON" modal at /admin/authority/units.
 * Deliberately does NOT write to Firestore itself: that panel already does
 * validation + batching + unitDirectory sync (via onUnitWrite) correctly;
 * reimplementing that write path here would just be a second, untested copy.
 *
 * CSV format (UTF-8, header row required):
 *   חטיבה,גדוד,פלוגה
 *   חטיבה 810,גדוד 9307,פלוגה א
 *   חטיבה 810,גדוד 9307,פלוגה ב
 *   חטיבה 810,גדוד 512,
 *   חטיבה 11,גדוד 202,
 *
 * - חטיבה: brigade name — must match an existing authorities doc name
 *   EXACTLY (case/whitespace-insensitive), or the row is reported as an
 *   error, never guessed (this project has twice already shipped bugs from
 *   loose/duplicate authority-name matching — see the research doc's §8
 *   debt items #1-#4).
 * - גדוד: battalion name — required on every row.
 * - פלוגה: company name — optional; leave blank for a battalion with no
 *   known companies yet (it still imports as a real, selectable unit).
 *
 * Usage: npx tsx scripts/convert-unit-csv-to-import-json.ts <path-to-csv>
 * Prints one JSON blob per brigade, labeled with the brigade name and its
 * real orgId, to paste into the import modal for that specific brigade.
 */
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// Mirrors functions/src/onAuthorityWrite.ts's isMilitaryAuthority() exactly
// (same copy already duplicated in scripts/backfill-unit-directory.ts —
// functions/ is a separate compilation unit, can't be imported here).
function isMilitaryAuthority(data: FirebaseFirestore.DocumentData): boolean {
  const tenantType = typeof data.tenantType === 'string' ? data.tenantType : null;
  if (tenantType) return tenantType === 'military';
  const vertical = typeof data.vertical === 'string' ? data.vertical : null;
  if (vertical) return vertical === 'military';
  const type = typeof data.type === 'string' ? data.type.toLowerCase() : '';
  return (
    type === 'military' ||
    type === 'military_unit' ||
    type.includes('military') ||
    type.includes('army') ||
    type.includes('צבא')
  );
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseCsvLine(line: string): string[] {
  // No quoted-field/embedded-comma support — deliberately simple, matches
  // the 3-plain-column format documented above. A stray comma inside a
  // name would misparse; the officer's names are short unit designations,
  // not free text, so this is an acceptable simplification.
  return line.split(',').map((cell) => cell.trim());
}

interface ImportUnitNode {
  name: string;
  type?: string;
  subUnits?: ImportUnitNode[];
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/convert-unit-csv-to-import-json.ts <path-to-csv>');
    process.exit(1);
  }

  init();
  const db = admin.firestore();

  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) {
    console.error('CSV must have a header row plus at least one data row.');
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]);
  const brigadeCol = header.indexOf('חטיבה');
  const battalionCol = header.indexOf('גדוד');
  const companyCol = header.indexOf('פלוגה');
  if (brigadeCol === -1 || battalionCol === -1) {
    console.error(`Header must include "חטיבה" and "גדוד" columns. Found: ${header.join(', ')}`);
    process.exit(1);
  }

  // Resolve every real military authority once, by normalized name.
  const authoritiesSnap = await db.collection('authorities').get();
  const byName = new Map<string, { id: string; name: string }>();
  const dupes = new Map<string, string[]>();
  authoritiesSnap.docs.forEach((d) => {
    const data = d.data();
    if (!isMilitaryAuthority(data) || typeof data.name !== 'string') return;
    const key = normalizeName(data.name);
    if (byName.has(key)) {
      dupes.set(key, [...(dupes.get(key) ?? [byName.get(key)!.id]), d.id]);
    }
    byName.set(key, { id: d.id, name: data.name });
  });

  type Row = { brigade: string; battalion: string; company: string };
  const rows: Row[] = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      brigade: cells[brigadeCol] ?? '',
      battalion: cells[battalionCol] ?? '',
      company: companyCol >= 0 ? (cells[companyCol] ?? '') : '',
    };
  });

  const errors: string[] = [];
  const byBrigade = new Map<string, { orgId: string; battalions: Map<string, ImportUnitNode> }>();

  rows.forEach((row, i) => {
    const lineNo = i + 2; // +1 for header, +1 for 1-indexing
    if (!row.brigade || !row.battalion) {
      errors.push(`Line ${lineNo}: missing חטיבה or גדוד — skipped.`);
      return;
    }
    const key = normalizeName(row.brigade);
    if (dupes.has(key)) {
      errors.push(`Line ${lineNo}: "${row.brigade}" matches ${dupes.get(key)!.length} different authorities docs (${dupes.get(key)!.join(', ')}) — resolve the duplicate before importing, not guessed here.`);
      return;
    }
    const authority = byName.get(key);
    if (!authority) {
      errors.push(`Line ${lineNo}: "${row.brigade}" doesn't match any existing military authority by name — check spelling, or create the brigade first.`);
      return;
    }

    if (!byBrigade.has(authority.id)) {
      byBrigade.set(authority.id, { orgId: authority.id, battalions: new Map() });
    }
    const brigadeEntry = byBrigade.get(authority.id)!;

    if (!brigadeEntry.battalions.has(row.battalion)) {
      brigadeEntry.battalions.set(row.battalion, { name: row.battalion, type: 'battalion', subUnits: [] });
    }
    if (row.company) {
      const battalionNode = brigadeEntry.battalions.get(row.battalion)!;
      const existing = battalionNode.subUnits!.some((s) => s.name === row.company);
      if (!existing) {
        battalionNode.subUnits!.push({ name: row.company, type: 'company' });
      }
    }
  });

  if (errors.length > 0) {
    console.log('⚠️  Errors (these rows were NOT included below):');
    errors.forEach((e) => console.log(`  - ${e}`));
    console.log('');
  }

  if (byBrigade.size === 0) {
    console.log('No valid rows to import.');
    return;
  }

  for (const [orgId, { battalions }] of byBrigade) {
    const authorityName = [...byName.values()].find((a) => a.id === orgId)?.name ?? orgId;
    const units: ImportUnitNode[] = [...battalions.values()].map((b) => ({
      ...b,
      subUnits: b.subUnits && b.subUnits.length > 0 ? b.subUnits : undefined,
    }));
    console.log(`\n=== ${authorityName} (orgId: ${orgId}) — paste into /admin/authority/units, this brigade selected ===`);
    console.log(JSON.stringify({ units }, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
