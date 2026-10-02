/**
 * scripts/backfill-authority-boundaries-by-id.ts — 02.10.2026.
 *
 * Sibling of backfill-authority-boundaries-bulk.ts for the 27 authorities
 * whose OSM admin relation is already known (found via the Nominatim scan
 * in docs/audit-2026-09/authority-boundary-backfill-report.md) — no name
 * search needed, so none of that script's matching logic runs here. Reuses
 * fetchCityBoundary (unchanged) and classify/featureAreaKm2/featureRingCount
 * (newly exported from the bulk script, logic unchanged) rather than
 * reimplementing the sanity checks — same thresholds, same rules.
 *
 * David's explicit anti-mixup requirements, after the Arava/Yarden ID mixup
 * during live verification:
 *   1. Snapshot each authority doc's field count BEFORE the fetch, not after.
 *   2. Record the expected authority name BEFORE the fetch, so the feature's
 *      own OSM name tags (returned IN the fetch) can be checked against it
 *      immediately — not relying on noticing a mismatch by chance.
 *
 * Stage A (default): dry-run, zero writes, builds the report. Stage B
 * (--apply): writes only entries explicitly approved via --approve-flags
 * (FLAG) plus all PASS — same shape as the bulk script.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { fetchCityBoundary } from './lib/osm-boundary-fetch.node';
import { classify, featureAreaKm2, featureRingCount, type ProgressEntry, type RelationMatch, type Verdict } from './backfill-authority-boundaries-bulk';

const PROGRESS_FILE = path.join(__dirname, '.authority-boundary-by-id-progress.json');
const REPORT_FILE = path.join(__dirname, '..', 'docs', 'audit-2026-09', 'authority-boundary-by-id-report.md');
const SLEEP_MS = 3000;

interface TargetInput { name: string; authorityId: string; type: ProgressEntry['type']; relationId: number }

// From the Nominatim scan (docs/audit-2026-09/authority-boundary-backfill-report.md,
// "27/47 have a real admin relation") — 27 distinct authorities, Jerusalem
// among them, not a 28th addition to the 27 (flagged and corrected,
// 02.10.2026 — the original ask said "28 = 27 + Jerusalem" but Jerusalem
// was already row 27 of the scan's own 27).
const TARGETS: TargetInput[] = [
  { name: 'מגאר', authorityId: '3ME4OXweQHvgrzrcyjdU', type: 'city', relationId: 1387400 },
  { name: 'באקה אל-גרביה', authorityId: '6pmGh2kqYOE2xHZKfkis', type: 'city', relationId: 1398019 },
  { name: 'יהוד-מונוסון', authorityId: '9624tLbpZsNwRIkfaZX5', type: 'city', relationId: 1382466 },
  { name: 'אל קסום', authorityId: 'BH5UV7YK0vyq36KmyEcp', type: 'regional_council', relationId: 10052487 },
  { name: "מג'דל שמס", authorityId: 'BdYwBXly8hJfU2myZuSG', type: 'local_council', relationId: 1375242 },
  { name: 'אל-בטוף', authorityId: 'D9HJQHNitVw1bM2I685t', type: 'regional_council', relationId: 1386838 },
  { name: "בוסתן אל-מרג'", authorityId: 'Eea1FXz6FQ7y7mOCPDSV', type: 'regional_council', relationId: 1380227 },
  { name: "כאוכב אבו אל-היג'א", authorityId: 'JJyAE4dTijGCtaLlUOWv', type: 'local_council', relationId: 1386843 },
  { name: 'שוהם', authorityId: 'KWDyl0t92XfhB1xosFiQ', type: 'local_council', relationId: 1406086 },
  { name: 'מעלות-תרשיחא', authorityId: 'N6ROBWos0ibBwQ2Jsbo1', type: 'city', relationId: 1404529 },
  { name: "סח'נין", authorityId: 'NbM6XnnDazHDVYvHo1Ex', type: 'city', relationId: 1392988 },
  { name: 'שגב-שלום', authorityId: 'O6hiBx1Kcli4J7W878X7', type: 'local_council', relationId: 1377266 },
  { name: "מג'ד אל-כרום", authorityId: 'PhLXNSwBvbSE02Ck5g4c', type: 'local_council', relationId: 1387992 },
  { name: 'קדימה-צורן', authorityId: 'RkgWJytadaKzC7KoQv6n', type: 'local_council', relationId: 1395617 },
  { name: "ביר אל-מכסור", authorityId: 'SA2b9HdOHRCcEIuKHTHK', type: 'local_council', relationId: 1386839 },
  { name: "יאנוח-ג'ת", authorityId: 'UaV4LKFY4j2Nvgq9XIcp', type: 'local_council', relationId: 1401793 },
  { name: 'דאלית אל-כרמל', authorityId: 'Voc8l1b5KpvhYj1lgHIl', type: 'local_council', relationId: 1403095 },
  { name: "סאג'ור", authorityId: 'awb0k097CH3mg7EijKrk', type: 'local_council', relationId: 1388015 },
  { name: 'עספיא', authorityId: 'aztMKJLYXXVBiuDtQHwT', type: 'local_council', relationId: 1403485 },
  { name: 'בית אריה-עופרים', authorityId: 'emk5immqkk8wWjBgvsKB', type: 'local_council', relationId: 11993994 },
  { name: 'טובא-זנגרייה', authorityId: 'hAcw3fDNjbPMkTCLy5jm', type: 'local_council', relationId: 1379262 },
  { name: 'כסיפה', authorityId: 'plCyVY89F45TelALgekp', type: 'local_council', relationId: 1376911 },
  { name: 'בנימינה-גבעת עדה', authorityId: 'qPotp8zhBzvO33AgLn8n', type: 'local_council', relationId: 1392847 },
  { name: 'ערערה-בנגב', authorityId: 'rNjxnKMBxWaL3lYoOht3', type: 'local_council', relationId: 1376931 },
  { name: "כעביה-טבאש-חג'אג'רה", authorityId: 'tGjJRGa8PnxvlGFlEpbw', type: 'local_council', relationId: 1933846 },
  { name: 'פרדס חנה-כרכור', authorityId: 'u0qHVCGC0k9zWyHJKDVG', type: 'local_council', relationId: 1392849 },
  { name: 'ירושלים', authorityId: 'vxYpJ9HKm4fot5y1ahDA', type: 'city', relationId: 1381350 },
];

interface ByIdEntry extends ProgressEntry {
  relationId: number;
  preWriteFieldCount?: number; // snapshot taken BEFORE the fetch
  preWriteFields?: string[];
  nameConsistencyOk?: boolean; // feature's OSM name vs our expected name, checked right after fetch
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function loadProgress(): ByIdEntry[] | null { return fs.existsSync(PROGRESS_FILE) ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) : null; }
function saveProgress(entries: ByIdEntry[]) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(entries, null, 2)); }

async function runStageA(db: admin.firestore.Firestore) {
  let entries = loadProgress();
  if (!entries) {
    entries = TARGETS.map((t) => ({ authorityId: t.authorityId, name: t.name, type: t.type, status: 'pending', relationId: t.relationId }));
    saveProgress(entries);
    console.log(`📋 Built target list: ${entries.length} authorities with known relation IDs.`);
  } else {
    console.log(`📋 Resuming: ${entries.length} total, ${entries.filter((e) => e.status === 'pending').length} pending.`);
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.status === 'done') continue;
    console.log(`\n[${i + 1}/${entries.length}] ${entry.name} (${entry.type}, relation/${entry.relationId})`);

    // ── Required BEFORE the fetch, not after ──
    const docBefore = await db.collection('authorities').doc(entry.authorityId).get();
    const fieldsBefore = Object.keys(docBefore.data() || {}).sort();
    entry.preWriteFieldCount = fieldsBefore.length;
    entry.preWriteFields = fieldsBefore;
    const expectedName = entry.name; // recorded before the fetch, for the post-fetch consistency check below
    console.log(`   pre-write snapshot: ${fieldsBefore.length} fields`);
    console.log(`   expected name (recorded before fetch): "${expectedName}"`);

    try {
      const feature = await fetchCityBoundary(entry.relationId, entry.name);
      const props: any = feature.properties || {};
      const osmName = props.name as string | undefined;
      const osmNameHe = props['name:he'] as string | undefined;

      // Record the comparison for the report (David reviews it) — do NOT
      // auto-decide a match/mismatch verdict here. An earlier version of
      // this script did exactly that with a crude substring check and
      // produced false positives (e.g. באקה אל-גרביה vs OSM's באקה
      // אל-גרבייה — one extra letter, almost certainly the same place) —
      // caught before any write happened, removed. classify()'s own
      // existing name-check below already does this correctly: it FLAGs a
      // difference for human review instead of silently passing OR
      // silently killing a real match, exactly like it did for the 43.
      entry.nameConsistencyOk = osmNameHe === expectedName || osmName === expectedName;

      const synthMatch: RelationMatch = {
        id: entry.relationId, name: osmName, nameHe: osmNameHe,
        nameAr: props['name:ar'], altName: props.alt_name, officialName: props.official_name,
        adminLevel: props.admin_level, matchedRule: 'id-provided', matchedField: 'id-provided',
      };
      const { verdict, reasons } = classify(entry, [synthMatch], feature);
      entry.status = 'done';
      entry.verdict = verdict;
      entry.reasons = reasons;
      entry.osmName = osmName;
      entry.osmNameHe = osmNameHe;
      entry.matchedRule = 'id-provided';
      entry.matchedField = 'id-provided';
      entry.areaKm2 = featureAreaKm2(feature);
      entry.ringCount = featureRingCount(feature);
      entry.geometryType = feature.geometry.type;
      entry.featureJson = JSON.stringify(feature);
      console.log(`   → ${entry.verdict}${entry.reasons?.length ? ' (' + entry.reasons.join('; ') + ')' : ''}`);
      console.log(`   geometry: ${entry.geometryType}, ${entry.ringCount} rings, ${entry.areaKm2?.toFixed(1)}km²`);
    } catch (err) {
      entry.status = 'pending';
      entry.verdict = 'RETRY';
      entry.error = err instanceof Error ? err.message : String(err);
      entry.reasons = [`fetchCityBoundary threw (network/transient — will retry): ${entry.error}`];
      console.log(`   → RETRY (error: ${entry.error})`);
    }
    saveProgress(entries);
    if (i < entries.length - 1) await sleep(SLEEP_MS);
  }

  writeReport(entries);
  const pass = entries.filter((e) => e.verdict === 'PASS').length;
  const flag = entries.filter((e) => e.verdict === 'FLAG').length;
  const fail = entries.filter((e) => e.verdict === 'FAIL').length;
  const retry = entries.filter((e) => e.verdict === 'RETRY').length;
  console.log(`\n=== STAGE A COMPLETE ===`);
  console.log(`PASS: ${pass}  FLAG: ${flag}  FAIL: ${fail}  RETRY: ${retry}  (total ${entries.length})`);
  if (retry > 0) console.log(`⚠️  ${retry} RETRY — re-run to resolve.`);
  console.log(`Report: ${REPORT_FILE}`);
}

function writeReport(entries: ByIdEntry[]) {
  const order: Record<string, number> = { FAIL: 0, RETRY: 1, FLAG: 2, PASS: 3 };
  const sorted = [...entries].sort((a, b) => (order[a.verdict!] ?? 4) - (order[b.verdict!] ?? 4) || a.name.localeCompare(b.name, 'he'));
  const lines: string[] = [];
  lines.push('# Authority Boundaries by known relation ID — Stage A Report');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()}. Dry-run only — zero Firestore writes. Relation IDs from the Nominatim scan (not name search) — no normalization logic runs in this path.`);
  lines.push('');
  const pass = entries.filter((e) => e.verdict === 'PASS').length;
  const flag = entries.filter((e) => e.verdict === 'FLAG').length;
  const fail = entries.filter((e) => e.verdict === 'FAIL').length;
  const retry = entries.filter((e) => e.verdict === 'RETRY').length;
  lines.push(`PASS: ${pass} · FLAG: ${flag} · FAIL: ${fail} · RETRY: ${retry} · total ${entries.length}`);
  lines.push('');
  lines.push('| שם רשות | סוג | relation id | שדות לפני | שם ב-OSM | התאמת שם | גאומטריה | שטח קמ"ר | טבעות | verdict | reasons |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const e of sorted) {
    lines.push(`| ${e.name} | ${e.type} | ${e.relationId} | ${e.preWriteFieldCount ?? ''} | ${e.osmNameHe || e.osmName || ''} | ${e.nameConsistencyOk === false ? '🔴 MISMATCH' : (e.nameConsistencyOk === true ? 'ok' : '')} | ${e.geometryType ?? ''} | ${e.areaKm2?.toFixed(1) ?? ''} | ${e.ringCount ?? ''} | ${e.verdict} | ${(e.reasons || []).join('; ')} |`);
  }
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, lines.join('\n') + '\n');
}

async function runStageB(db: admin.firestore.Firestore, approveFlags: Set<string>) {
  const entries = loadProgress();
  if (!entries) throw new Error('No progress file — run Stage A first.');
  let written = 0;
  for (const entry of entries) {
    if (entry.status !== 'done') continue;
    const shouldWrite = entry.verdict === 'PASS' || (entry.verdict === 'FLAG' && approveFlags.has(entry.authorityId));
    if (!shouldWrite || !entry.featureJson) continue;
    const ref = db.collection('authorities').doc(entry.authorityId);
    const existing = await ref.get();
    if (existing.data()?.boundaryGeoJSON) { console.log(`⏭️  ${entry.name} already has a boundaryGeoJSON — skipping.`); continue; }
    await ref.update({ boundaryGeoJSON: entry.featureJson, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    written++;
    console.log(`💾 ${entry.name} (${entry.authorityId}) — written.`);
  }
  const allSnap = await db.collection('authorities').get();
  const totalNow = allSnap.docs.filter((d) => !!d.data().boundaryGeoJSON).length;
  console.log(`\n=== STAGE B COMPLETE ===`);
  console.log(`Written: ${written}. Authorities now carrying a boundary: ${totalNow}.`);
}

if (require.main === module) {
  const isApply = process.argv.includes('--apply');
  const approveFlagsArg = process.argv.find((a) => a.startsWith('--approve-flags='));
  const approveFlags = new Set((approveFlagsArg ? approveFlagsArg.slice('--approve-flags='.length) : '').split(',').filter(Boolean));
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not set.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();
  (isApply ? runStageB(db, approveFlags) : runStageA(db)).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
