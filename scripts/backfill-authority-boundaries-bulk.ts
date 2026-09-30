/**
 * scripts/backfill-authority-boundaries-bulk.ts — bulk sibling of
 * scripts/backfill-authority-boundary.ts (30.09.2026).
 *
 * That script always took a HUMAN-SUPPLIED OSM admin relation id per city —
 * fine for the 6 authorities done one at a time (שדרות, אשקלון, חיפה,
 * הרצליה, תל אביב-יפו, זכרון יעקב), not viable for ~250. This script adds
 * the one genuinely new piece — resolving an authority's name to a
 * candidate OSM relation automatically — and then hands the resolved id to
 * the EXACT SAME proven primitives as every other boundary fetch in this
 * codebase:
 *   - fetchOverpassRaw (osm-boundary-fetch.node.ts) — shared retry/mirror
 *     Overpass transport, reused verbatim for the name→relation search too.
 *   - fetchCityBoundary (osm-boundary-fetch.node.ts) — the actual polygon
 *     assembly, completely unchanged, imported not reimplemented.
 *
 * Field contract is identical to backfill-authority-boundary.ts:
 * `authorities/{id}.boundaryGeoJSON` written as `JSON.stringify(feature)`
 * (Firestore rejects nested arrays — a raw Polygon/MultiPolygon's
 * `coordinates` is array-of-arrays) — never a raw object. Parsed back via
 * parseBoundaryGeoJSON (authority-resolution.ts). Not reinvented here.
 *
 * Area/ring-count sanity check reuses the shoelace-on-equirectangular-
 * projection approach already proven at city scale by geo-discovery-
 * routes.ts's `ringAreaM2` (used there for MIN_PARK_AREA_M2 gating) — that
 * function isn't exported, so the same formula is replicated here rather
 * than invented fresh, and a new npm dependency (@turf/area) was
 * deliberately avoided given @turf packages have their own vendor-copy
 * guard in this repo (PR #78) that a casual new sub-package add would need
 * to go through.
 *
 * Two stages, matching the task spec exactly:
 *   Stage A (default, always dry-run, zero Firestore writes ever in this
 *     mode): build target list → resolve each name to a relation (or
 *     FAIL on zero/multiple matches — never guesses) → fetch geometry →
 *     sanity-check → write progress file (resumable) + a git-tracked
 *     Markdown report.
 *   Stage B (--apply, plus an explicit approved-FLAGs list): writes
 *     ONLY authorities/{id}.boundaryGeoJSON, ONLY for PASS + approved
 *     FLAG entries, ONLY when the doc doesn't already have a boundary,
 *     reusing the feature already fetched in Stage A (no Overpass re-fetch).
 *
 * CLI:
 *   npx tsx scripts/backfill-authority-boundaries-bulk.ts --list-only
 *   npx tsx scripts/backfill-authority-boundaries-bulk.ts
 *   npx tsx scripts/backfill-authority-boundaries-bulk.ts --apply --approve-flags=id1,id2
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { fetchCityBoundary, fetchOverpassRaw } from './lib/osm-boundary-fetch.node';

type AuthorityType = 'city' | 'regional_council' | 'local_council' | 'neighborhood' | 'settlement' | 'school' | 'military_unit';
const TARGET_TYPES: AuthorityType[] = ['city', 'local_council', 'regional_council'];

const PROGRESS_FILE = path.join(__dirname, '.authority-boundary-backfill-progress.json');
const REPORT_FILE = path.join(__dirname, '..', 'docs', 'audit-2026-09', 'authority-boundary-backfill-report.md');
const SLEEP_BETWEEN_AUTHORITIES_MS = 3000;

type Verdict = 'PASS' | 'FLAG' | 'FAIL';

interface ProgressEntry {
  authorityId: string;
  name: string;
  type: AuthorityType;
  status: 'pending' | 'done';
  verdict?: Verdict;
  reasons?: string[];
  matchCount?: number;
  relationId?: number;
  osmName?: string;
  osmNameHe?: string;
  areaKm2?: number;
  ringCount?: number;
  geometryType?: 'Polygon' | 'MultiPolygon';
  featureJson?: string; // JSON.stringify'd Feature — reused by Stage B, never refetched
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress(): ProgressEntry[] | null {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return null;
}

function saveProgress(entries: ProgressEntry[]): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(entries, null, 2));
}

async function buildTargetList(db: admin.firestore.Firestore): Promise<ProgressEntry[]> {
  const snap = await db.collection('authorities').where('type', 'in', TARGET_TYPES).get();
  const entries: ProgressEntry[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.boundaryGeoJSON) continue; // never touch an authority that already has one
    const name = (d.label as string) ?? (d.name as string) ?? '';
    entries.push({ authorityId: doc.id, name, type: d.type as AuthorityType, status: 'pending' });
  }
  return entries;
}

// Same shoelace-on-equirectangular-projection formula as geo-discovery-
// routes.ts's ringAreaM2 (not exported there — replicated, not reinvented;
// see file header). "Good enough at city scale," per that function's own
// comment — exactly the precision this sanity check needs.
function ringAreaM2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0][1];
  const mPerDegLat = 111320, mPerDegLng = 111320 * Math.cos(lat0 * Math.PI / 180);
  const xy = ring.map((p) => [p[0] * mPerDegLng, p[1] * mPerDegLat]);
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function polygonParts(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): number[][][][] {
  return feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
}

function featureAreaKm2(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): number {
  let totalM2 = 0;
  for (const poly of polygonParts(feature)) {
    totalM2 += ringAreaM2(poly[0]); // outer ring
    for (let i = 1; i < poly.length; i++) totalM2 -= ringAreaM2(poly[i]); // holes
  }
  return totalM2 / 1_000_000;
}

function featureRingCount(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): number {
  return polygonParts(feature).reduce((sum, poly) => sum + poly.length, 0);
}

function escapeOverpassString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface RelationMatch {
  id: number;
  name?: string;
  nameHe?: string;
  adminLevel?: string;
}

// The one genuinely new query in this file: name → candidate admin-boundary
// relation(s). No admin_level filter — Israeli city/local_council/
// regional_council tagging isn't uniform enough to guess a level without
// risking a silent false exclusion; every match's own admin_level is
// reported in the output instead, unfiltered. Routed through the SAME
// fetchOverpassRaw transport as fetchCityBoundary — not a new HTTP/retry
// stack, just a new query string.
async function findAdminRelationsByName(name: string): Promise<RelationMatch[]> {
  const escaped = escapeOverpassString(name);
  const query = `[out:json][timeout:60];
(
  relation["boundary"="administrative"]["name"="${escaped}"];
  relation["boundary"="administrative"]["name:he"="${escaped}"];
);
out tags;`;
  const result = await fetchOverpassRaw(query);
  const seen = new Map<number, RelationMatch>();
  for (const el of result.elements) {
    if (el.type !== 'relation') continue;
    if (!seen.has(el.id)) {
      seen.set(el.id, { id: el.id, name: el.tags?.name, nameHe: el.tags?.['name:he'], adminLevel: el.tags?.admin_level });
    }
  }
  return Array.from(seen.values());
}

function classify(entry: ProgressEntry, matches: RelationMatch[], feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null): { verdict: Verdict; reasons: string[] } {
  if (matches.length === 0) return { verdict: 'FAIL', reasons: ['no OSM relation matched name or name:he — not found'] };
  // 🔴 explicit rule: on multiple match, never choose — FAIL, not FLAG.
  if (matches.length > 1) return { verdict: 'FAIL', reasons: [`${matches.length} relations matched the name — ambiguous, not choosing (relation ids: ${matches.map((m) => m.id).join(', ')})`] };
  if (!feature) return { verdict: 'FAIL', reasons: ['relation matched but boundary geometry could not be assembled'] };

  const reasons: string[] = [];
  const areaKm2 = featureAreaKm2(feature);
  if ((entry.type === 'city' || entry.type === 'local_council') && areaKm2 > 500) reasons.push(`area ${areaKm2.toFixed(1)}km² > 500km² for ${entry.type}`);
  if (entry.type === 'regional_council' && areaKm2 < 20) reasons.push(`area ${areaKm2.toFixed(1)}km² < 20km² for regional_council`);
  if (areaKm2 < 1 || areaKm2 > 5000) reasons.push(`area ${areaKm2.toFixed(1)}km² outside [1, 5000]km²`);
  const osmName = matches[0].nameHe || matches[0].name || '';
  if (osmName && osmName !== entry.name) reasons.push(`OSM name "${osmName}" != our label "${entry.name}"`);

  return { verdict: reasons.length > 0 ? 'FLAG' : 'PASS', reasons };
}

async function runStageA(db: admin.firestore.Firestore, listOnly: boolean): Promise<void> {
  let entries = loadProgress();
  if (!entries) {
    entries = await buildTargetList(db);
    saveProgress(entries);
    console.log(`📋 Built fresh target list: ${entries.length} authorities (type in [${TARGET_TYPES.join(', ')}], no existing boundaryGeoJSON).`);
  } else {
    const pending = entries.filter((e) => e.status === 'pending').length;
    console.log(`📋 Resuming from progress file: ${entries.length} total, ${pending} pending, ${entries.length - pending} already done.`);
  }

  if (listOnly) {
    console.log(`\n=== LIST-ONLY: ${entries.length} target authorities. No Overpass calls made. ===`);
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.status === 'done') continue;
    console.log(`\n[${i + 1}/${entries.length}] ${entry.name} (${entry.type}, ${entry.authorityId})`);
    try {
      const matches = await findAdminRelationsByName(entry.name);
      let feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;
      if (matches.length === 1) {
        try {
          feature = await fetchCityBoundary(matches[0].id, entry.name);
        } catch (err) {
          entry.error = err instanceof Error ? err.message : String(err);
        }
      }
      const { verdict, reasons } = classify(entry, matches, feature);
      entry.status = 'done';
      entry.verdict = verdict;
      entry.reasons = reasons;
      entry.matchCount = matches.length;
      if (matches.length === 1) {
        entry.relationId = matches[0].id;
        entry.osmName = matches[0].name;
        entry.osmNameHe = matches[0].nameHe;
      }
      if (feature) {
        entry.areaKm2 = featureAreaKm2(feature);
        entry.ringCount = featureRingCount(feature);
        entry.geometryType = feature.geometry.type;
        entry.featureJson = JSON.stringify(feature);
      }
      console.log(`   → ${verdict}${reasons.length ? ' (' + reasons.join('; ') + ')' : ''}`);
    } catch (err) {
      entry.status = 'done';
      entry.verdict = 'FAIL';
      entry.error = err instanceof Error ? err.message : String(err);
      entry.reasons = [`unhandled error: ${entry.error}`];
      console.log(`   → FAIL (error: ${entry.error})`);
    }
    saveProgress(entries);
    if (i < entries.length - 1) await sleep(SLEEP_BETWEEN_AUTHORITIES_MS);
  }

  writeReport(entries);
  const pass = entries.filter((e) => e.verdict === 'PASS').length;
  const flag = entries.filter((e) => e.verdict === 'FLAG').length;
  const fail = entries.filter((e) => e.verdict === 'FAIL').length;
  console.log(`\n=== STAGE A COMPLETE ===`);
  console.log(`PASS: ${pass}  FLAG: ${flag}  FAIL: ${fail}  (total ${entries.length})`);
  console.log(`Report written to ${REPORT_FILE}`);
}

function writeReport(entries: ProgressEntry[]): void {
  const order: Record<Verdict, number> = { FAIL: 0, FLAG: 1, PASS: 2 };
  const sorted = [...entries].sort((a, b) => (order[a.verdict!] ?? 3) - (order[b.verdict!] ?? 3) || a.name.localeCompare(b.name));
  const lines: string[] = [];
  lines.push('# Authority Boundary Backfill — Stage A Report');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()}. Dry-run only — zero Firestore writes.`);
  lines.push('');
  const pass = entries.filter((e) => e.verdict === 'PASS').length;
  const flag = entries.filter((e) => e.verdict === 'FLAG').length;
  const fail = entries.filter((e) => e.verdict === 'FAIL').length;
  lines.push(`PASS: ${pass} · FLAG: ${flag} · FAIL: ${fail} · total ${entries.length}`);
  lines.push('');
  lines.push('| שם רשות | סוג | relation id | שם ב-OSM | שטח קמ"ר | טבעות | verdict | reasons |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const e of sorted) {
    lines.push(`| ${e.name} | ${e.type} | ${e.relationId ?? ''} | ${e.osmNameHe || e.osmName || ''} | ${e.areaKm2?.toFixed(1) ?? ''} | ${e.ringCount ?? ''} | ${e.verdict} | ${(e.reasons || []).join('; ')} |`);
  }
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, lines.join('\n') + '\n');
}

async function runStageB(db: admin.firestore.Firestore, approveFlags: Set<string>): Promise<void> {
  const entries = loadProgress();
  if (!entries) throw new Error('No progress file found — run Stage A first.');
  let written = 0;
  for (const entry of entries) {
    if (entry.status !== 'done') continue;
    const shouldWrite = entry.verdict === 'PASS' || (entry.verdict === 'FLAG' && approveFlags.has(entry.authorityId));
    if (!shouldWrite || !entry.featureJson) continue;
    const ref = db.collection('authorities').doc(entry.authorityId);
    const existing = await ref.get();
    if (existing.data()?.boundaryGeoJSON) {
      console.log(`⏭️  ${entry.name} (${entry.authorityId}) already has a boundaryGeoJSON — skipping, never overwriting.`);
      continue;
    }
    await ref.update({ boundaryGeoJSON: entry.featureJson, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    written++;
    console.log(`💾 ${entry.name} (${entry.authorityId}) — written.`);
  }
  // Full scan + client-side field check, not a `!=` query — avoids needing
  // a composite index for a one-off end-of-run count, and correctly counts
  // ALL authority types (not just city/local_council/regional_council).
  const allSnap = await db.collection('authorities').get();
  const totalNow = allSnap.docs.filter((d) => !!d.data().boundaryGeoJSON).length;
  console.log(`\n=== STAGE B COMPLETE ===`);
  console.log(`Written: ${written}. Authorities now carrying a boundary: ${totalNow}.`);
}

if (require.main === module) {
  const listOnly = process.argv.includes('--list-only');
  const isApply = process.argv.includes('--apply');
  const approveFlagsArg = process.argv.find((a) => a.startsWith('--approve-flags='));
  const approveFlags = new Set((approveFlagsArg ? approveFlagsArg.slice('--approve-flags='.length) : '').split(',').filter(Boolean));

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  (isApply ? runStageB(db, approveFlags) : runStageA(db, listOnly))
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
