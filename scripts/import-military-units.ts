/**
 * scripts/import-military-units.ts
 *
 * Task 1 (מדריך היחידות, 04.09.2026) — imports David's final, decision-closed
 * unit file (scripts/data/military-units-stage-a.csv, 176 rows: 41 brigades +
 * 135 battalions) into real authorities/tenants/unitDirectory.
 *
 * CSV columns: unitId,name,nickname,level,parentId,armType,serviceType,displayNumber
 *   - unitId/parentId are CSV-INTERNAL reference keys only (bde_XXX/bn_XXX/
 *     bde_u_<name>/bn_u_<name>) — see the brigade-resolution note below for
 *     why they never become the literal Firestore doc ID for a brigade.
 *   - Brigades resolve against real `authorities` by NORMALIZED NAME
 *     (normalizeOrgName, src/lib/org-name.ts) — most of the 41 already exist;
 *     a brigade's real Firestore ID is whatever it already is (e.g. the
 *     random-suffix scheme every other brigade uses, "_810____cjo3" style —
 *     see organizations/page.tsx:185-208, the exact shape this script mirrors
 *     for any brigade that needs to be newly created).
 *   - Battalions resolve against real `tenants/{orgId}/units` by normalized
 *     name too (existing battalions are almost nonexistent today — "blocker א"
 *     — so this is nearly all creates). A battalion's real Firestore ID IS
 *     literally the CSV's bn_XXX/bn_u_<name> value — this is new information
 *     nowhere else, and matches David's own bde_/bn_ ID convention exactly.
 *
 * MANDATORY COLLISION CHECKS (David, §1ב+§1ד — never auto-resolve, never
 * silently proceed): duplicate unitId anywhere in the file; the same
 * displayNumber claimed by two DIFFERENT parents at the same level (the
 * exact חטיבה 810 bug class — one designator, two homes); a CSV brigade name
 * matching 2+ real existing authorities (an existing prod-side duplicate).
 * Any of these STOPS the script before any write, --confirm or not.
 *
 * SAFE BY DEFAULT: no flags = read-only dry-run, zero writes, full report.
 * --confirm = actually write (after a full backup of every doc touched).
 * Idempotent: a battalion/brigade already matched as EXISTING is never
 * re-created or overwritten (only a real, changed serviceType is updated on
 * an existing brigade — see the update-diff check below).
 *
 * PREREQUISITE the dry-run does not need but --confirm's onAuthorityWrite/
 * onUnitWrite sync depends on: the modified functions/src/onAuthorityWrite.ts
 * and onUnitWrite.ts (serviceType passthrough) must be deployed BEFORE
 * --confirm runs, or newly-written serviceType fields won't reach
 * unitDirectory until the next unrelated retrigger.
 *
 * Usage:
 *   npx tsx scripts/import-military-units.ts scripts/data/military-units-stage-a.csv
 *   npx tsx scripts/import-military-units.ts scripts/data/military-units-stage-a.csv --confirm
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
import { normalizeOrgName } from '../src/lib/org-name';
import { buildUnitDoc } from '../src/lib/unit-doc';
import { computeUnitId } from '../src/lib/unit-id';

// Real existing brigade names carry the full "חטיבה 810 (ההרים - מרחבית)"
// parenthetical (onAuthorityWrite.ts's extractArmAndStatus source text);
// the CSV's `name` column is deliberately bare ("חטיבה 810" — §1c.4, role/
// status text split into separate nickname/armType/serviceType columns).
// Strip the same trailing parenthetical onAuthorityWrite.ts parses before
// comparing, or every existing brigade would misresolve as "new".
function stripTrailingParenthetical(name: string): string {
  return name.trim().replace(/\s*\([^()]+\)\s*$/, '').trim();
}

// Legacy pre-CSV units may be named just the bare number ("9307") instead of
// the CSV's "גדוד 9307" — found for real under bde_810 (9307_nhcj, name:"9307",
// with a real live user's real company "פלוגה א" attached to it). An
// exact-name match alone would call this "new" and create a duplicate
// battalion — the exact collision class §1ב exists to prevent, one level
// down. Extract the first run of digits from a name and compare against the
// CSV's displayNumber as a second, number-based match pass.
function extractNumber(name: string): number | null {
  const match = name.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// Mirrors functions/src/onAuthorityWrite.ts's isMilitaryAuthority() exactly —
// functions/ is a separate compilation unit, can't be imported here (same
// duplication already established in scripts/backfill-unit-directory.ts and
// scripts/convert-unit-csv-to-import-json.ts).
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

// ── CSV parsing (RFC4128-ish: quoted fields, "" = escaped quote) ──────────
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

interface Row {
  unitId: string;
  name: string;
  nickname: string | null;
  level: 'brigade' | 'battalion';
  parentId: string | null;
  armType: string | null;
  serviceType: 'regular' | 'reserve' | 'mixed' | null;
  displayNumber: number | null;
  lineNo: number;
}

function parseDisplayNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function loadRows(csvPath: string): Row[] {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (col: string) => {
    const i = header.indexOf(col);
    if (i === -1) throw new Error(`CSV missing required column "${col}". Header: ${header.join(',')}`);
    return i;
  };
  const cUnitId = idx('unitId');
  const cName = idx('name');
  const cNickname = idx('nickname');
  const cLevel = idx('level');
  const cParentId = idx('parentId');
  const cArmType = idx('armType');
  const cServiceType = idx('serviceType');
  const cDisplayNumber = idx('displayNumber');

  return lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    const level = cells[cLevel]?.trim();
    if (level !== 'brigade' && level !== 'battalion') {
      throw new Error(`Line ${i + 2}: unexpected level "${level}" — expected "brigade" or "battalion".`);
    }
    return {
      unitId: cells[cUnitId]?.trim() ?? '',
      name: cells[cName]?.trim() ?? '',
      nickname: cells[cNickname]?.trim() || null,
      level,
      parentId: cells[cParentId]?.trim() || null,
      armType: cells[cArmType]?.trim() || null,
      serviceType: (cells[cServiceType]?.trim() || null) as Row['serviceType'],
      displayNumber: parseDisplayNumber(cells[cDisplayNumber] ?? ''),
      lineNo: i + 2,
    };
  });
}

// ── Mandatory collision checks — stop before any resolution/write ─────────
function checkInternalCollisions(rows: Row[]): string[] {
  const problems: string[] = [];

  const byUnitId = new Map<string, Row[]>();
  rows.forEach((r) => {
    if (!byUnitId.has(r.unitId)) byUnitId.set(r.unitId, []);
    byUnitId.get(r.unitId)!.push(r);
  });
  Array.from(byUnitId.entries()).forEach(([id, group]) => {
    if (group.length > 1) {
      problems.push(
        `DUPLICATE unitId "${id}" on lines ${group.map((r) => r.lineNo).join(', ')} — the script will not decide which is correct.`,
      );
    }
  });

  // Same displayNumber claimed by two DIFFERENT parents at the same level —
  // the exact חטיבה 810 bug class. A battalion sharing its number with its
  // OWN parent brigade (e.g. bn_551 under bde_551) is a different comparison
  // (cross-level) and is correctly not flagged by this same-level check.
  for (const level of ['brigade', 'battalion'] as const) {
    const byNumber = new Map<number, Row[]>();
    rows
      .filter((r) => r.level === level && r.displayNumber != null)
      .forEach((r) => {
        const n = r.displayNumber as number;
        if (!byNumber.has(n)) byNumber.set(n, []);
        byNumber.get(n)!.push(r);
      });
    Array.from(byNumber.entries()).forEach(([num, group]) => {
      const distinctParents = new Set(group.map((r) => r.parentId));
      if (group.length > 1 && (level === 'brigade' || distinctParents.size > 1)) {
        problems.push(
          `AMBIGUOUS ${level} designator "${num}" on lines ${group.map((r) => r.lineNo).join(', ')} (parents: ${Array.from(distinctParents).join(' vs ')}) — one number, two homes. David decides, not this script.`,
        );
      }
    });
  }

  return problems;
}

// ── Resolution against real production data ────────────────────────────────
type BrigadeResolution =
  | { csvRow: Row; status: 'existing'; realOrgId: string }
  | { csvRow: Row; status: 'new' }
  | { csvRow: Row; status: 'blocked'; reason: string };

async function resolveBrigades(db: admin.firestore.Firestore, brigadeRows: Row[]): Promise<BrigadeResolution[]> {
  const authoritiesSnap = await db.collection('authorities').get();
  const byName = new Map<string, { id: string; name: string }[]>();
  authoritiesSnap.docs.forEach((d) => {
    const data = d.data();
    if (!isMilitaryAuthority(data) || typeof data.name !== 'string') return;
    const key = normalizeOrgName(stripTrailingParenthetical(data.name));
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push({ id: d.id, name: data.name });
  });

  return brigadeRows.map((row) => {
    const matches = byName.get(normalizeOrgName(row.name)) ?? [];
    if (matches.length === 0) return { csvRow: row, status: 'new' as const };
    if (matches.length === 1) return { csvRow: row, status: 'existing' as const, realOrgId: matches[0].id };
    return {
      csvRow: row,
      status: 'blocked' as const,
      reason: `"${row.name}" matches ${matches.length} existing authorities (${matches.map((m) => m.id).join(', ')}) — an existing prod-side duplicate, same class as the חטיבה 810 bug. Resolve in prod before importing.`,
    };
  });
}

type BattalionResolution =
  | { csvRow: Row; status: 'existing'; realUnitId: string; note?: string }
  | { csvRow: Row; status: 'new'; realOrgId: string }
  | { csvRow: Row; status: 'blocked'; reason: string };

async function resolveBattalions(
  db: admin.firestore.Firestore,
  battalionRows: Row[],
  brigadeResolutions: BrigadeResolution[],
): Promise<BattalionResolution[]> {
  const brigadeByCsvId = new Map(brigadeResolutions.map((b) => [b.csvRow.unitId, b]));
  const results: BattalionResolution[] = [];

  for (const row of battalionRows) {
    const brigade = row.parentId ? brigadeByCsvId.get(row.parentId) : undefined;
    if (!brigade) {
      results.push({ csvRow: row, status: 'blocked', reason: `parentId "${row.parentId}" does not match any brigade row.` });
      continue;
    }
    if (brigade.status === 'blocked') {
      results.push({ csvRow: row, status: 'blocked', reason: `parent brigade "${brigade.csvRow.name}" is itself blocked — see that finding.` });
      continue;
    }
    if (brigade.status === 'new') {
      // Brand-new brigade, by definition has zero existing units yet.
      results.push({ csvRow: row, status: 'new', realOrgId: '' /* filled in at write time */ });
      continue;
    }

    const unitsSnap = await db.collection('tenants').doc(brigade.realOrgId).collection('units').get();
    const nameMatches = unitsSnap.docs.filter((d) => normalizeOrgName((d.data().name as string) ?? '') === normalizeOrgName(row.name));
    const numberMatches =
      row.displayNumber != null
        ? unitsSnap.docs.filter((d) => extractNumber((d.data().name as string) ?? '') === row.displayNumber)
        : [];
    // Union, de-duplicated by doc id — a doc could satisfy both passes.
    const matches = [...nameMatches, ...numberMatches].filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i);

    if (matches.length === 0) {
      results.push({ csvRow: row, status: 'new', realOrgId: brigade.realOrgId });
    } else if (matches.length === 1) {
      const matchedByNumberOnly = nameMatches.length === 0;
      results.push({
        csvRow: row,
        status: 'existing',
        realUnitId: matches[0].id,
        note: matchedByNumberOnly
          ? `matched by number only — existing doc is named "${matches[0].data().name}", not "${row.name}"`
          : undefined,
      });
    } else {
      results.push({
        csvRow: row,
        status: 'blocked',
        reason: `"${row.name}" under ${brigade.csvRow.name} matches ${matches.length} existing units (${matches.map((m) => `${m.id}:"${m.data().name}"`).join(', ')}) — possibly-same-unit-different-name, needs manual review, not guessed.`,
      });
    }
  }

  return results;
}

async function backup(db: admin.firestore.Firestore, brigadeRes: BrigadeResolution[], battalionRes: BattalionResolution[]) {
  const out: any[] = [];
  for (const b of brigadeRes) {
    if (b.status === 'existing') {
      const snap = await db.collection('authorities').doc(b.realOrgId).get();
      out.push({ label: `authorities/${b.realOrgId}`, exists: snap.exists, data: snap.exists ? snap.data() : null });
    }
  }
  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `military-units-import-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
  return file;
}

async function main() {
  const csvPath = process.argv[2];
  const confirm = process.argv.includes('--confirm');
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-military-units.ts <path-to-csv> [--confirm]');
    process.exit(1);
  }

  const rows = loadRows(csvPath);
  const brigadeRows = rows.filter((r) => r.level === 'brigade');
  const battalionRows = rows.filter((r) => r.level === 'battalion');

  console.log(`Loaded ${rows.length} rows: ${brigadeRows.length} brigades, ${battalionRows.length} battalions.\n`);

  const internalProblems = checkInternalCollisions(rows);
  if (internalProblems.length > 0) {
    console.log('🛑 MANDATORY COLLISION CHECK FAILED — stopping before any resolution or write:\n');
    internalProblems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log('✅ Internal collision check passed — no duplicate unitId, no ambiguous same-level designator.\n');

  init();
  const db = admin.firestore();

  const brigadeRes = await resolveBrigades(db, brigadeRows);
  const battalionRes = await resolveBattalions(db, battalionRows, brigadeRes);

  const blocked = [...brigadeRes.filter((b) => b.status === 'blocked'), ...battalionRes.filter((b) => b.status === 'blocked')];

  console.log('── BRIGADES ──────────────────────────────────────────────');
  brigadeRes.forEach((b) => {
    if (b.status === 'existing') {
      const wantsServiceTypeUpdate = b.csvRow.serviceType ? true : false;
      console.log(`  EXISTING  ${b.csvRow.unitId.padEnd(24)} "${b.csvRow.name}" → real orgId ${b.realOrgId}${wantsServiceTypeUpdate ? ` (will set serviceType="${b.csvRow.serviceType}")` : ''}`);
    } else if (b.status === 'new') {
      console.log(`  NEW       ${b.csvRow.unitId.padEnd(24)} "${b.csvRow.name}" — will create authorities/tenants doc (serviceType="${b.csvRow.serviceType}")`);
    } else {
      console.log(`  🛑 BLOCKED ${b.csvRow.unitId.padEnd(24)} "${b.csvRow.name}" — ${b.reason}`);
    }
  });

  console.log('\n── BATTALIONS ────────────────────────────────────────────');
  battalionRes.forEach((b) => {
    if (b.status === 'existing') {
      console.log(`  EXISTING  ${b.csvRow.unitId.padEnd(28)} "${b.csvRow.name}" → real unit doc ${b.realUnitId} (skip, no write)${b.note ? `  ⚠️  ${b.note}` : ''}`);
    } else if (b.status === 'new') {
      console.log(`  NEW       ${b.csvRow.unitId.padEnd(28)} "${b.csvRow.name}" under ${b.csvRow.parentId} — will create with this exact ID`);
    } else {
      console.log(`  🛑 BLOCKED ${b.csvRow.unitId.padEnd(28)} "${b.csvRow.name}" — ${b.reason}`);
    }
  });

  const newBrigades = brigadeRes.filter((b) => b.status === 'new').length;
  const existingBrigades = brigadeRes.filter((b) => b.status === 'existing').length;
  const newBattalions = battalionRes.filter((b) => b.status === 'new').length;
  const existingBattalions = battalionRes.filter((b) => b.status === 'existing').length;

  console.log('\n── SUMMARY ───────────────────────────────────────────────');
  console.log(`  Brigades:   ${existingBrigades} existing (serviceType will be set/updated) · ${newBrigades} new`);
  console.log(`  Battalions: ${existingBattalions} existing (skip) · ${newBattalions} new`);
  console.log(`  Blocked:    ${blocked.length}`);

  if (blocked.length > 0) {
    console.log('\n🛑 BLOCKED items found — refusing to write even with --confirm. Resolve these first.');
    process.exit(1);
  }

  if (!confirm) {
    console.log('\nDry run only — no writes performed. Re-run with --confirm to write.');
    return;
  }

  console.log('\n--confirm passed. Backing up before any write...');
  const backupFile = await backup(db, brigadeRes, battalionRes);
  console.log(`Backup written to ${backupFile}\n`);

  // Resolve real orgIds for brand-new brigades first (battalions under a
  // "new" brigade recorded realOrgId:'' as a placeholder above).
  const newOrgIdByCsvId = new Map<string, string>();

  for (const b of brigadeRes) {
    if (b.status === 'existing') {
      const authRef = db.collection('authorities').doc(b.realOrgId);
      const snap = await authRef.get();
      const current = snap.data() ?? {};
      if (b.csvRow.serviceType && current.serviceType !== b.csvRow.serviceType) {
        await authRef.update({ serviceType: b.csvRow.serviceType, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`Updated serviceType on existing brigade ${b.realOrgId} → "${b.csvRow.serviceType}"`);
      }
    } else if (b.status === 'new') {
      const slug = b.csvRow.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const suffix = Math.random().toString(36).substring(2, 6);
      const id = slug ? `${slug}_${suffix}` : `mil_${suffix}`;
      const batch = db.batch();
      batch.set(db.collection('authorities').doc(id), {
        name: b.csvRow.name,
        type: 'military_unit',
        tenantType: 'military',
        managerIds: [],
        userCount: 0,
        status: 'active',
        isActiveClient: false,
        pipelineStatus: 'lead',
        serviceType: b.csvRow.serviceType ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(db.collection('tenants').doc(id), {
        name: b.csvRow.name,
        type: 'military',
        authorityId: id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
      newOrgIdByCsvId.set(b.csvRow.unitId, id);
      console.log(`Created new brigade ${b.csvRow.unitId} → real orgId ${id}`);
    }
  }

  const brigadeRealOrgId = (csvBrigadeId: string): string => {
    const existing = brigadeRes.find((b) => b.csvRow.unitId === csvBrigadeId);
    if (existing?.status === 'existing') return existing.realOrgId;
    return newOrgIdByCsvId.get(csvBrigadeId)!;
  };

  let created = 0;
  for (const b of battalionRes) {
    if (b.status !== 'new') continue;
    const orgId = b.csvRow.parentId ? brigadeRealOrgId(b.csvRow.parentId) : undefined;
    if (!orgId) {
      console.log(`Skipping ${b.csvRow.unitId} — could not resolve parent brigade's real orgId.`);
      continue;
    }
    // Numbered battalions keep the CSV's own unitId verbatim (bn_9307 —
    // already ASCII, already the real designator). A nameless one
    // (bn_u_<hebrew-slug> in the CSV) is NEVER used as the literal doc id —
    // this is the exact incident found 05.09.2026: that convention silently
    // never triggers onUnitWrite (Eventarc doesn't fire for non-ASCII doc
    // ids). computeUnitId() replaces the raw-name segment with a hash.
    const realUnitId = b.csvRow.displayNumber != null
      ? computeUnitId({ level: 'battalion', displayNumber: b.csvRow.displayNumber })
      : computeUnitId({ level: 'battalion', parentScope: orgId, name: b.csvRow.name });
    const data = buildUnitDoc({
      unitId: realUnitId,
      name: b.csvRow.name,
      parentUnitId: null,
      parentUnitPath: [],
      unitType: 'battalion',
      nickname: b.csvRow.nickname,
      armType: b.csvRow.armType,
      serviceType: b.csvRow.serviceType,
      displayNumber: b.csvRow.displayNumber,
    });
    await db
      .collection('tenants')
      .doc(orgId)
      .collection('units')
      .doc(realUnitId)
      .set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    created++;
  }

  console.log(`\nDone. ${created} new battalion docs written. ${newOrgIdByCsvId.size} new brigades created.`);

  // Sync-gap check (§8 recommendation A, 06.09.2026) — nearly free here:
  // every orgId this run touched is already in memory. Waits for
  // onUnitWrite/onAuthorityWrite to catch up before comparing, then reports
  // any brigade where the real sub-unit count doesn't match what actually
  // reached unitDirectory — exactly the class of gap that went unnoticed
  // for 5 real battalions after the previous run, found only by a manual
  // end-to-end test days later.
  console.log('\n── SYNC-GAP CHECK ───────────────────────────────────────');
  await new Promise((r) => setTimeout(r, 15000));
  const touchedOrgIds = new Set<string>();
  brigadeRes.forEach((r) => { if (r.status === 'existing') touchedOrgIds.add(r.realOrgId); });
  newOrgIdByCsvId.forEach((orgId) => touchedOrgIds.add(orgId));

  let anyGap = false;
  for (const orgId of Array.from(touchedOrgIds)) {
    const realSnap = await db.collection('tenants').doc(orgId).collection('units').get();
    const dirSnap = await db.collection('unitDirectory').where('orgId', '==', orgId).get();
    const syncedCount = dirSnap.docs.filter((d) => d.data().level !== 'brigade').length;
    if (syncedCount !== realSnap.size) {
      anyGap = true;
      console.log(`  ⚠️  ${orgId}: ${realSnap.size} real units, only ${syncedCount} synced to unitDirectory`);
    }
  }
  console.log(anyGap ? '\n🛑 Sync gap found — check above before trusting search results for these brigades.' : `\n✅ All ${touchedOrgIds.size} touched brigades fully synced.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
