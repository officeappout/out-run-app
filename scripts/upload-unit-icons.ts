/**
 * scripts/upload-unit-icons.ts
 *
 * Uploads real unit insignia (scripts/data/unit-icons/, 74 PNGs + manifest,
 * officer-approved 05.09.2026) to Firebase Storage and writes the resulting
 * URL onto the matching real production unit — `logoUrl` on `authorities`
 * for a brigade (the EXISTING field city logos already use — reused as-is,
 * not a new field), `iconUrl` on `tenants/{orgId}/units/{unitId}` for a
 * battalion (new field, propagated into unitDirectory by onUnitWrite/
 * onAuthorityWrite, exactly like armType/serviceType already are).
 *
 * MATCHING — the single most dangerous step in this whole pipeline. The
 * manifest's own identifiers (`bde_810`, `bde_5__8110`) are NOT production
 * IDs (`_810____cjo3`, `bn_8110`) — exact-string matching fails completely.
 * A naive substring/includes match is actively dangerous: "810" is a
 * substring of "8110". The approach here avoids the whole class of risk by
 * using STRUCTURED FIELDS already on every real doc (Task 1's
 * buildUnitDoc always writes a numeric `displayNumber`; every brigade name
 * is a recognizable "חטיבה N" / nameless string) rather than parsing
 * digits out of opaque ID strings — brigades resolve by NAME (reusing
 * import-military-units.ts's exact, already-proven stripTrailingParenthetical
 * + normalizeOrgName logic verbatim), battalions resolve by real parent +
 * exact numeric `displayNumber` equality, and the 7 nameless rows (6
 * חטמ״רים + סיירת גולני — not 6, a real discrepancy the officer caught in
 * an earlier draft) resolve by normalized name within their real parent.
 * A separate numToken cross-check (regex-extracted digit run from the real
 * ID string, per the officer's own matching note) runs alongside as
 * independent corroboration — any disagreement between the two methods is
 * treated as a hard stop, not resolved by trusting either one.
 *
 * MANDATORY SANITY GATE: every one of the 74 rows must resolve to EXACTLY
 * one real unit. Zero or 2+ candidates stops the entire script before any
 * write — never guessed, never silently skipped.
 *
 * Safe by default: dry-run only, zero writes, unless --confirm is passed.
 * Backs up every doc about to be touched first. Idempotent (re-running
 * after a successful upload overwrites the same fields with the same
 * values — no duplication possible, there's nothing to duplicate).
 *
 * Usage:
 *   npx tsx scripts/upload-unit-icons.ts
 *   npx tsx scripts/upload-unit-icons.ts --confirm
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
import { normalizeOrgName } from '../src/lib/org-name';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id, storageBucket: `${c.project_id}.appspot.com` });
}

const DATA_DIR = path.join(__dirname, 'data', 'unit-icons');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.csv');
const ICONS_DIR = path.join(DATA_DIR, 'icons');

// Same isMilitaryAuthority duplication established across scripts/ and
// functions/ (separate compilation units) — see import-military-units.ts's
// own copy for the precedent.
function isMilitaryAuthority(data: FirebaseFirestore.DocumentData): boolean {
  const tenantType = typeof data.tenantType === 'string' ? data.tenantType : null;
  if (tenantType) return tenantType === 'military';
  const vertical = typeof data.vertical === 'string' ? data.vertical : null;
  if (vertical) return vertical === 'military';
  const type = typeof data.type === 'string' ? data.type.toLowerCase() : '';
  return type === 'military' || type === 'military_unit' || type.includes('military') || type.includes('army') || type.includes('צבא');
}

function stripTrailingParenthetical(name: string): string {
  return name.trim().replace(/\s*\([^()]+\)\s*$/, '').trim();
}

// The officer's own numToken rule, verbatim — used only as an independent
// cross-check alongside the structured-field match, never as the primary
// method (a regex over an opaque id string is inherently riskier than
// comparing a real numeric field this project already writes).
function numToken(id: string): string | null {
  const m = id.match(/(?:^|[^0-9])(\d{1,4})(?:[^0-9]|$)/);
  return m ? m[1] : null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
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

interface ManifestRow {
  displayNumber: number | null;
  level: 'brigade' | 'battalion';
  name: string;
  nickname: string | null;
  parentId: string | null;
  filename: string;
  lineNo: number;
}

function loadManifest(): ManifestRow[] {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  const idx = (col: string) => {
    const i = header.indexOf(col);
    if (i === -1) throw new Error(`manifest missing column "${col}"`);
    return i;
  };
  const cDisplayNumber = idx('displayNumber');
  const cLevel = idx('level');
  const cName = idx('name');
  const cNickname = idx('nickname');
  const cParentId = idx('parentId');
  const cFilename = idx('filename');

  return lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    const level = cells[cLevel]?.trim();
    if (level !== 'brigade' && level !== 'battalion') {
      throw new Error(`Line ${i + 2}: unexpected level "${level}"`);
    }
    const rawNum = cells[cDisplayNumber]?.trim();
    return {
      displayNumber: rawNum ? Number(rawNum) : null,
      level,
      name: cells[cName]?.trim() ?? '',
      nickname: cells[cNickname]?.trim() || null,
      parentId: cells[cParentId]?.trim() || null,
      filename: cells[cFilename]?.trim() ?? '',
      lineNo: i + 2,
    };
  });
}

type BrigadeMatch =
  | { row: ManifestRow; status: 'ok'; realOrgId: string; realName: string; crossCheckOk: boolean }
  | { row: ManifestRow; status: 'blocked'; reason: string };

async function resolveBrigade(db: admin.firestore.Firestore, row: ManifestRow, authorities: { id: string; name: string }[]): Promise<BrigadeMatch> {
  const expectedName = row.displayNumber != null ? `חטיבה ${row.displayNumber}` : row.name;
  const matches = authorities.filter((a) => normalizeOrgName(stripTrailingParenthetical(a.name)) === normalizeOrgName(expectedName));

  if (matches.length === 0) {
    return { row, status: 'blocked', reason: `no real brigade named "${expectedName}" found` };
  }
  if (matches.length > 1) {
    return { row, status: 'blocked', reason: `${matches.length} real brigades match "${expectedName}" (${matches.map((m) => m.id).join(', ')})` };
  }

  const realOrgId = matches[0].id;
  let crossCheckOk = true;
  if (row.displayNumber != null) {
    const realToken = numToken(realOrgId);
    crossCheckOk = realToken === String(row.displayNumber);
  }
  return { row, status: 'ok', realOrgId, realName: matches[0].name, crossCheckOk };
}

type BattalionMatch =
  | { row: ManifestRow; status: 'ok'; realOrgId: string; realUnitId: string; realName: string; crossCheckOk: boolean }
  | { row: ManifestRow; status: 'blocked'; reason: string };

async function resolveBattalion(
  db: admin.firestore.Firestore,
  row: ManifestRow,
  brigadeByManifestId: Map<string, BrigadeMatch>,
): Promise<BattalionMatch> {
  if (!row.parentId) return { row, status: 'blocked', reason: 'no parentId in manifest row' };
  const brigade = brigadeByManifestId.get(row.parentId);
  if (!brigade || brigade.status !== 'ok') {
    return { row, status: 'blocked', reason: `parent brigade "${row.parentId}" is not resolved` };
  }

  const unitsSnap = await db.collection('tenants').doc(brigade.realOrgId).collection('units').get();

  let matches: FirebaseFirestore.QueryDocumentSnapshot[];
  if (row.displayNumber != null) {
    matches = unitsSnap.docs.filter((d) => d.data().displayNumber === row.displayNumber);
    // Fallback for a real unit predating buildUnitDoc's displayNumber field
    // (e.g. 810's legacy "9307" doc) — extract a leading number from its name.
    if (matches.length === 0) {
      matches = unitsSnap.docs.filter((d) => {
        const m = String(d.data().name ?? '').match(/\d+/);
        return m ? Number(m[0]) === row.displayNumber : false;
      });
    }
  } else {
    matches = unitsSnap.docs.filter((d) => normalizeOrgName(String(d.data().name ?? '')) === normalizeOrgName(row.name));
  }

  if (matches.length === 0) {
    return { row, status: 'blocked', reason: `no real unit found under ${brigade.realOrgId} matching ${row.displayNumber ?? row.name}` };
  }
  if (matches.length > 1) {
    return { row, status: 'blocked', reason: `${matches.length} real units under ${brigade.realOrgId} match ${row.displayNumber ?? row.name} (${matches.map((m) => m.id).join(', ')})` };
  }

  const realUnitId = matches[0].id;
  let crossCheckOk = true;
  if (row.displayNumber != null) {
    const realToken = numToken(realUnitId);
    // Legacy bare-number docs (e.g. "9307_nhcj") DO carry the token; hash-
    // based ids from the ASCII-id fix (05.09.2026) never will — that's
    // expected, not a disagreement, since those never existed with a
    // number-bearing id in the first place.
    crossCheckOk = realToken == null || realToken === String(row.displayNumber);
  }
  return { row, status: 'ok', realOrgId: brigade.realOrgId, realUnitId, realName: String(matches[0].data().name ?? ''), crossCheckOk };
}

function uploadToken(): string {
  return crypto.randomUUID();
}

function firebaseDownloadUrl(bucket: string, storagePath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const rows = loadManifest();
  const brigadeRows = rows.filter((r) => r.level === 'brigade');
  const battalionRows = rows.filter((r) => r.level === 'battalion');
  console.log(`Loaded ${rows.length} rows: ${brigadeRows.length} brigades, ${battalionRows.length} battalions.\n`);

  const nameless = rows.filter((r) => r.displayNumber == null);
  console.log(`Nameless rows (matched by name, not number): ${nameless.length}`);
  nameless.forEach((r) => console.log(`  - ${r.level}: "${r.name}"`));
  if (nameless.length !== 7) {
    console.log(`\n🛑 Expected exactly 7 nameless rows (6 חטמ"רים + סיירת גולני) — found ${nameless.length}. Stopping.`);
    process.exit(1);
  }
  console.log('');

  init();
  const db = admin.firestore();

  const authoritiesSnap = await db.collection('authorities').get();
  const authorities = authoritiesSnap.docs
    .filter((d) => isMilitaryAuthority(d.data()))
    .map((d) => ({ id: d.id, name: String(d.data().name ?? '') }));

  const brigadeResults: BrigadeMatch[] = [];
  for (const row of brigadeRows) {
    brigadeResults.push(await resolveBrigade(db, row, authorities));
  }
  const brigadeByManifestId = new Map<string, BrigadeMatch>();
  // Manifest brigades have no own "manifest id" column other than filename-
  // derived — but battalions reference parentId values like "bde_1", which
  // match the STEM of the brigade row's own filename (bde_1.png -> bde_1).
  brigadeRows.forEach((row, i) => {
    const manifestId = path.basename(row.filename, '.png');
    brigadeByManifestId.set(manifestId, brigadeResults[i]);
  });

  const battalionResults: BattalionMatch[] = [];
  for (const row of battalionRows) {
    battalionResults.push(await resolveBattalion(db, row, brigadeByManifestId));
  }

  console.log('── BRIGADES ──────────────────────────────────────────────');
  let crossCheckMismatches = 0;
  brigadeResults.forEach((r) => {
    if (r.status === 'ok') {
      const flag = r.crossCheckOk ? '' : '  ⚠️  NUMTOKEN CROSS-CHECK MISMATCH';
      if (!r.crossCheckOk) crossCheckMismatches++;
      console.log(`  OK       ${r.row.filename.padEnd(30)} "${r.row.name}" → ${r.realOrgId} ("${r.realName}")${flag}`);
    } else {
      console.log(`  🛑 BLOCKED ${r.row.filename.padEnd(30)} "${r.row.name}" — ${r.reason}`);
    }
  });

  console.log('\n── BATTALIONS ────────────────────────────────────────────');
  battalionResults.forEach((r) => {
    if (r.status === 'ok') {
      const flag = r.crossCheckOk ? '' : '  ⚠️  NUMTOKEN CROSS-CHECK MISMATCH';
      if (!r.crossCheckOk) crossCheckMismatches++;
      console.log(`  OK       ${r.row.filename.padEnd(30)} "${r.row.name}" → ${r.realOrgId}/units/${r.realUnitId} ("${r.realName}")${flag}`);
    } else {
      console.log(`  🛑 BLOCKED ${r.row.filename.padEnd(30)} "${r.row.name}" — ${r.reason}`);
    }
  });

  const blocked = [...brigadeResults, ...battalionResults].filter((r) => r.status === 'blocked');
  const ok = [...brigadeResults, ...battalionResults].filter((r) => r.status === 'ok');

  console.log('\n── SUMMARY ───────────────────────────────────────────────');
  console.log(`  Resolved:              ${ok.length} / ${rows.length}`);
  console.log(`  Blocked:               ${blocked.length}`);
  console.log(`  Cross-check mismatches: ${crossCheckMismatches}`);

  if (blocked.length > 0 || crossCheckMismatches > 0) {
    console.log('\n🛑 Not every row resolved to exactly one real unit with a clean cross-check — refusing to write even with --confirm.');
    process.exit(1);
  }

  if (!confirm) {
    console.log('\nDry run only — no writes performed, no files uploaded. Re-run with --confirm to upload and write.');
    return;
  }

  console.log('\n--confirm passed. Backing up before any write...');
  const backupDir = path.join(__dirname, '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup: any[] = [];
  for (const r of brigadeResults) {
    if (r.status !== 'ok') continue;
    const snap = await db.collection('authorities').doc(r.realOrgId).get();
    backup.push({ path: snap.ref.path, data: snap.data() });
  }
  for (const r of battalionResults) {
    if (r.status !== 'ok') continue;
    const snap = await db.collection('tenants').doc(r.realOrgId).collection('units').doc(r.realUnitId).get();
    backup.push({ path: snap.ref.path, data: snap.data() });
  }
  const backupFile = path.join(backupDir, `unit-icons-upload-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf-8');
  console.log(`Backup written to ${backupFile}\n`);

  const bucket = admin.storage().bucket();
  const bucketName = bucket.name;

  let uploaded = 0;
  for (const r of brigadeResults) {
    if (r.status !== 'ok') continue;
    const localPath = path.join(ICONS_DIR, r.row.filename);
    const storagePath = `unit-icons/${r.row.filename}`;
    const token = uploadToken();
    await bucket.upload(localPath, { destination: storagePath, metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } } });
    const url = firebaseDownloadUrl(bucketName, storagePath, token);
    await db.collection('authorities').doc(r.realOrgId).update({ logoUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`Uploaded + wrote logoUrl: ${r.realOrgId} (${r.row.filename})`);
    uploaded++;
  }

  for (const r of battalionResults) {
    if (r.status !== 'ok') continue;
    const localPath = path.join(ICONS_DIR, r.row.filename);
    const storagePath = `unit-icons/${r.row.filename}`;
    const token = uploadToken();
    await bucket.upload(localPath, { destination: storagePath, metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } } });
    const url = firebaseDownloadUrl(bucketName, storagePath, token);
    const unitRef = db.collection('tenants').doc(r.realOrgId).collection('units').doc(r.realUnitId);
    await unitRef.update({ iconUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`Uploaded + wrote iconUrl: ${r.realOrgId}/units/${r.realUnitId} (${r.row.filename})`);
    uploaded++;

    // Defensive mirror for a real unit whose id is non-ASCII (05.09.2026
    // incident) — onUnitWrite's Eventarc trigger is already proven not to
    // fire reliably for such an id, so this write can't rely on it to
    // propagate. ASCII-id units are unaffected and rely on the (working)
    // trigger normally, matching every other field.
    if (!/^[a-zA-Z0-9_-]+$/.test(r.realUnitId)) {
      const directoryId = `${r.realOrgId}__${r.realUnitId}`;
      await db.collection('unitDirectory').doc(directoryId).set({ iconUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      console.log(`  (non-ASCII unit id — mirrored iconUrl into unitDirectory/${directoryId} directly, not relying on onUnitWrite)`);
    }
  }

  console.log(`\nDone. ${uploaded} icons uploaded and written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
