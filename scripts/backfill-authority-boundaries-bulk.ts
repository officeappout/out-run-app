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

type Verdict = 'PASS' | 'FLAG' | 'FAIL' | 'RETRY';

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
  matchedRule?: string; // which normalization rule(s) produced the match — 'exact' if none needed
  matchedField?: string; // which OSM tag field matched: name | name:he | name:ar | alt_name | official_name
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
  nameAr?: string;
  altName?: string;
  officialName?: string;
  adminLevel?: string;
  matchedRule: string; // which candidate transformation produced this match — 'exact' if none needed
  matchedField: string; // which OSM tag equaled the matching candidate
}

// ── Name normalization (01.10.2026, David's explicit spec) ─────────────
// Deterministic transformations ONLY — no fuzzy/Levenshtein/best-score
// matching anywhere in this file. Each rule below is applied to OUR name
// to generate literal candidate strings, each candidate is exact-matched
// (Overpass `=`) against 5 OSM tag fields. A match's reported "rule" is
// exactly which transformation(s) were needed to produce the candidate
// that matched — "exact" means no transformation was needed at all.
//
// The ה-definite-article rule (David's spec item 3) is deliberately NOT
// implemented here — he asked to see evidence it's actually needed before
// adding it. See the post-run "would-match-with-ה-stripped" diagnostic in
// runStageA instead of guessing.

const PREFIXES = ['מועצה אזורית', 'מועצה מקומית', 'עיריית'];

function withPrefixVariants(s: string): Array<{ value: string; rule: string }> {
  const out = [{ value: s, rule: 'none' }];
  for (const p of PREFIXES) {
    out.push({ value: `${p} ${s}`, rule: `prefix+${p}` });
  }
  const stripped = s.replace(new RegExp(`^(?:${PREFIXES.join('|')})\\s+`), '');
  if (stripped !== s) out.push({ value: stripped, rule: 'prefix-strip' });
  return out;
}

function withYodVariants(s: string): Array<{ value: string; rule: string }> {
  const out = [{ value: s, rule: 'none' }];
  if (s.includes('קריית')) out.push({ value: s.replace(/קריית/g, 'קרית'), rule: 'yod:קריית→קרית' });
  else if (s.includes('קרית')) out.push({ value: s.replace(/קרית/g, 'קריית'), rule: 'yod:קרית→קריית' });
  return out;
}

function withHyphenVariants(s: string): Array<{ value: string; rule: string }> {
  const out = [{ value: s, rule: 'none' }];
  if (/[-־–]/.test(s)) {
    for (const sep of ['-', '־', '–']) {
      const v = s.replace(/[-־–]/g, sep);
      if (v !== s) out.push({ value: v, rule: `hyphen→${sep}` });
    }
  }
  return out;
}

function withQuoteVariants(s: string): Array<{ value: string; rule: string }> {
  const out = [{ value: s, rule: 'none' }];
  if (/['׳]/.test(s)) {
    out.push({ value: s.replace(/'/g, '׳'), rule: "quote:'→׳" });
    out.push({ value: s.replace(/׳/g, "'"), rule: "quote:׳→'" });
  }
  if (/["״]/.test(s)) {
    out.push({ value: s.replace(/"/g, '״'), rule: 'quote:"→״' });
    out.push({ value: s.replace(/״/g, '"'), rule: 'quote:״→"' });
  }
  return out;
}

// Combines all 4 dimensions. Most names only vary in 0-1 dimensions, so
// this stays small in practice (a handful of candidates) — it's only
// combinatorial in the worst case (a hyphenated, quoted, yod-bearing name,
// which doesn't occur in this dataset).
function generateSearchCandidates(name: string): Array<{ value: string; rule: string }> {
  const seen = new Map<string, string>(); // value -> rule (first write wins; 'none'-heavy combos inserted first)
  for (const h of withHyphenVariants(name)) {
    for (const q of withQuoteVariants(h.value)) {
      for (const y of withYodVariants(q.value)) {
        for (const p of withPrefixVariants(y.value)) {
          const labels = [h.rule, q.rule, y.rule, p.rule].filter((r) => r !== 'none');
          const rule = labels.length === 0 ? 'exact' : labels.join('+');
          if (!seen.has(p.value)) seen.set(p.value, rule);
        }
      }
    }
  }
  return Array.from(seen.entries()).map(([value, rule]) => ({ value, rule }));
}

const OSM_NAME_FIELDS = ['name', 'name:he', 'name:ar', 'alt_name', 'official_name'] as const;

// The one genuinely new query in this file: name → candidate admin-boundary
// relation(s). No admin_level filter — Israeli city/local_council/
// regional_council tagging isn't uniform enough to guess a level without
// risking a silent false exclusion; every match's own admin_level is
// reported in the output instead, unfiltered. Routed through the SAME
// fetchOverpassRaw transport as fetchCityBoundary — not a new HTTP/retry
// stack, just a new query string.
//
// 01.10.2026 fix: Overpass can return HTTP 200 with a truncated/incomplete
// `elements` array under load — no thrown error, just silently fewer
// results than the real answer. It signals this via a top-level `remark`
// field (e.g. a timeout/runtime-error message) that fetchOverpassRaw's
// return type doesn't declare but the raw JSON still carries at runtime.
// A genuinely-zero-match result that was actually caused by this looked
// IDENTICAL to a real "no OSM relation exists" FAIL — confirmed this is
// exactly what happened to the 17 "geometry could not be assembled"
// entries (all 17 re-verified clean on retry, see
// docs/audit-2026-09/geometry-assembly-retry-findings.md). Throwing here
// on a remark routes it through the same RETRY path as a real network
// exception, instead of silently masquerading as a confirmed no-match.
//
// 01.10.2026 normalization: searches every candidate from
// generateSearchCandidates against all 5 OSM_NAME_FIELDS, still via exact
// `=` matches only (never regex/fuzzy). Still requires exactly one
// matching relation after dedup — multiple matches is still FAIL, never a
// pick, exactly as before.
async function findAdminRelationsByName(name: string): Promise<RelationMatch[]> {
  const candidates = generateSearchCandidates(name);
  const clauses: string[] = [];
  for (const c of candidates) {
    const escaped = escapeOverpassString(c.value);
    for (const field of OSM_NAME_FIELDS) {
      clauses.push(`  relation["boundary"="administrative"]["${field}"="${escaped}"];`);
    }
  }
  const query = `[out:json][timeout:60];\n(\n${clauses.join('\n')}\n);\nout tags;`;
  const result: any = await fetchOverpassRaw(query);
  if (result.remark) {
    throw new Error(`Overpass returned a remark (response likely incomplete, not trustworthy as a confirmed no-match): ${result.remark}`);
  }
  const seen = new Map<number, RelationMatch>();
  for (const el of result.elements) {
    if (el.type !== 'relation') continue;
    if (seen.has(el.id)) continue;
    const tags = el.tags || {};
    // Find which (candidate, field) pair actually matched this relation —
    // prefer 'exact' first (candidates array order already does this,
    // since generateSearchCandidates inserts the untransformed form first
    // within each dimension's combination).
    let matchedRule = 'unknown';
    let matchedField = 'unknown';
    outer: for (const c of candidates) {
      for (const field of OSM_NAME_FIELDS) {
        if (tags[field] === c.value) { matchedRule = c.rule; matchedField = field; break outer; }
      }
    }
    seen.set(el.id, {
      id: el.id,
      name: tags.name,
      nameHe: tags['name:he'],
      nameAr: tags['name:ar'],
      altName: tags.alt_name,
      officialName: tags.official_name,
      adminLevel: tags.admin_level,
      matchedRule,
      matchedField,
    });
  }
  return Array.from(seen.values());
}

function classify(entry: ProgressEntry, matches: RelationMatch[], feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): { verdict: Verdict; reasons: string[] } {
  const reasons: string[] = [];
  const areaKm2 = featureAreaKm2(feature);
  if ((entry.type === 'city' || entry.type === 'local_council') && areaKm2 > 500) reasons.push(`area ${areaKm2.toFixed(1)}km² > 500km² for ${entry.type}`);
  if (entry.type === 'regional_council' && areaKm2 < 20) reasons.push(`area ${areaKm2.toFixed(1)}km² < 20km² for regional_council`);
  if (areaKm2 < 1 || areaKm2 > 5000) reasons.push(`area ${areaKm2.toFixed(1)}km² outside [1, 5000]km²`);
  const osmName = matches[0].nameHe || matches[0].name || '';
  if (osmName && osmName !== entry.name) reasons.push(`OSM name "${osmName}" != our label "${entry.name}"`);

  return { verdict: reasons.length > 0 ? 'FLAG' : 'PASS', reasons };
}

// ── ה-definite-article diagnostic (David's spec item 3) ─────────────────
// NOT a normalization rule — deliberately not fed into
// generateSearchCandidates or applied to any verdict. Pure evidence-
// gathering: for each entry still FAIL on a real no-match after the
// normalized search, try ONE extra candidate (ה added or stripped) and
// report whether it WOULD have matched, so David can decide whether to
// add the rule from real counts instead of a guess. Runs after the main
// loop, only against entries already confirmed FAIL (not RETRY), so it
// never races with or double-counts the real pipeline.
interface DefiniteArticleHit { name: string; authorityId: string; wouldMatchAs: string; relationId: number; field: string }

async function diagnoseDefiniteArticle(entries: ProgressEntry[]): Promise<DefiniteArticleHit[]> {
  const candidates = entries.filter(
    (e) => e.verdict === 'FAIL' && (e.reasons || []).some((r) => r.startsWith('no OSM relation')),
  );
  if (candidates.length === 0) return [];
  console.log(`\n🔎 ה-article diagnostic: checking ${candidates.length} no-match entries (evidence only, not applied)...`);
  const hits: DefiniteArticleHit[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    const variant = entry.name.startsWith('ה') ? entry.name.slice(1) : `ה${entry.name}`;
    try {
      const escaped = escapeOverpassString(variant);
      const clauses = OSM_NAME_FIELDS.map((f) => `  relation["boundary"="administrative"]["${f}"="${escaped}"];`);
      const query = `[out:json][timeout:30];\n(\n${clauses.join('\n')}\n);\nout tags;`;
      const result: any = await fetchOverpassRaw(query);
      if (!result.remark) {
        for (const el of result.elements) {
          if (el.type !== 'relation') continue;
          const tags = el.tags || {};
          for (const field of OSM_NAME_FIELDS) {
            if (tags[field] === variant) {
              hits.push({ name: entry.name, authorityId: entry.authorityId, wouldMatchAs: variant, relationId: el.id, field });
              break;
            }
          }
        }
      }
    } catch {
      // best-effort diagnostic — a network failure here just means "no evidence either way," not logged as RETRY
    }
    if (i < candidates.length - 1) await sleep(1500);
  }
  return hits;
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

    // RETRY vs FAIL (01.10.2026 fix): a thrown exception anywhere in this
    // block — from the name search OR the geometry fetch, including a
    // remark-flagged incomplete Overpass response — means we genuinely
    // don't know the answer yet, not that the answer is negative. Those
    // entries go back to 'pending' so the next invocation retries exactly
    // them, same resumable mechanism as every other partial run. Only a
    // clean, exception-free response (real zero matches, real multiple
    // matches, or a successfully-fetched feature) is a confirmed, 'done'
    // PASS/FLAG/FAIL — see docs/audit-2026-09/geometry-assembly-retry-findings.md
    // for why this distinction exists: the old code funneled every
    // fetchCityBoundary exception into "geometry could not be assembled,"
    // which 17/17 re-verified as actually transient, not structural.
    try {
      const matches = await findAdminRelationsByName(entry.name);
      entry.matchCount = matches.length;

      if (matches.length === 0) {
        entry.status = 'done';
        entry.verdict = 'FAIL';
        entry.reasons = ['no OSM relation matched name or name:he — not found'];
      } else if (matches.length > 1) {
        // 🔴 explicit rule: on multiple match, never choose — FAIL, not FLAG.
        entry.status = 'done';
        entry.verdict = 'FAIL';
        entry.reasons = [`${matches.length} relations matched the name — ambiguous, not choosing (relation ids+rules: ${matches.map((m) => `${m.id} via ${m.matchedRule}/${m.matchedField}`).join(', ')})`];
      } else {
        entry.relationId = matches[0].id;
        entry.osmName = matches[0].name;
        entry.osmNameHe = matches[0].nameHe;
        entry.matchedRule = matches[0].matchedRule;
        entry.matchedField = matches[0].matchedField;
        try {
          const feature = await fetchCityBoundary(matches[0].id, entry.name);
          const { verdict, reasons } = classify(entry, matches, feature);
          entry.status = 'done';
          entry.verdict = verdict;
          entry.reasons = reasons;
          entry.areaKm2 = featureAreaKm2(feature);
          entry.ringCount = featureRingCount(feature);
          entry.geometryType = feature.geometry.type;
          entry.featureJson = JSON.stringify(feature);
        } catch (fetchErr) {
          entry.status = 'pending';
          entry.verdict = 'RETRY';
          entry.error = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          entry.reasons = [`fetchCityBoundary threw (network/transient, not a confirmed geometry defect — will retry): ${entry.error}`];
        }
      }
      console.log(`   → ${entry.verdict}${entry.reasons?.length ? ' (' + entry.reasons.join('; ') + ')' : ''}`);
    } catch (searchErr) {
      entry.status = 'pending';
      entry.verdict = 'RETRY';
      entry.error = searchErr instanceof Error ? searchErr.message : String(searchErr);
      entry.reasons = [`findAdminRelationsByName threw (network/transient, not a confirmed no-match — will retry): ${entry.error}`];
      console.log(`   → RETRY (error: ${entry.error})`);
    }
    saveProgress(entries);
    if (i < entries.length - 1) await sleep(SLEEP_BETWEEN_AUTHORITIES_MS);
  }

  const pass = entries.filter((e) => e.verdict === 'PASS').length;
  const flag = entries.filter((e) => e.verdict === 'FLAG').length;
  const fail = entries.filter((e) => e.verdict === 'FAIL').length;
  const retry = entries.filter((e) => e.verdict === 'RETRY').length;

  let definiteArticleHits: DefiniteArticleHit[] = [];
  if (retry === 0) {
    definiteArticleHits = await diagnoseDefiniteArticle(entries);
  } else {
    console.log(`\n⚠️  Skipping ה-article diagnostic — ${retry} entries still RETRY, FAIL list not fully converged yet.`);
  }

  writeReport(entries, definiteArticleHits);
  console.log(`\n=== STAGE A COMPLETE ===`);
  console.log(`PASS: ${pass}  FLAG: ${flag}  FAIL: ${fail}  RETRY: ${retry}  (total ${entries.length})`);
  if (retry > 0) console.log(`⚠️  ${retry} entries are RETRY (network-caused, reset to pending) — re-run this same command to resolve them.`);
  if (definiteArticleHits.length > 0) console.log(`🔎 ה-article diagnostic: ${definiteArticleHits.length} no-match entries WOULD match if that rule were added (not applied — see report).`);
  console.log(`Report written to ${REPORT_FILE}`);
}

function writeReport(entries: ProgressEntry[], definiteArticleHits: DefiniteArticleHit[] = []): void {
  const order: Record<Verdict, number> = { FAIL: 0, RETRY: 1, FLAG: 2, PASS: 3 };
  const sorted = [...entries].sort((a, b) => (order[a.verdict!] ?? 4) - (order[b.verdict!] ?? 4) || a.name.localeCompare(b.name));
  const lines: string[] = [];
  lines.push('# Authority Boundary Backfill — Stage A Report');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()}. Dry-run only — zero Firestore writes.`);
  lines.push('');
  const pass = entries.filter((e) => e.verdict === 'PASS').length;
  const flag = entries.filter((e) => e.verdict === 'FLAG').length;
  const fail = entries.filter((e) => e.verdict === 'FAIL').length;
  const retry = entries.filter((e) => e.verdict === 'RETRY').length;
  lines.push(`PASS: ${pass} · FLAG: ${flag} · FAIL: ${fail} · RETRY: ${retry} · total ${entries.length}`);
  if (retry > 0) lines.push(`\n⚠️ ${retry} entries are RETRY (network-caused — Overpass exception or an incomplete/truncated response, not a confirmed negative result). Re-run the same command to resolve them; do not treat them as FAIL.`);
  lines.push('');

  const ruleCounts = new Map<string, number>();
  for (const e of entries) {
    if ((e.verdict === 'PASS' || e.verdict === 'FLAG') && e.matchedRule) {
      ruleCounts.set(e.matchedRule, (ruleCounts.get(e.matchedRule) || 0) + 1);
    }
  }
  if (ruleCounts.size > 0) {
    lines.push('### Normalization rule breakdown (PASS + FLAG only)');
    lines.push('');
    for (const [rule, count] of Array.from(ruleCounts.entries()).sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${count}** matched via \`${rule}\``);
    }
    lines.push('');
  }
  lines.push('| שם רשות | סוג | relation id | שם ב-OSM | normalization rule | שדה OSM | שטח קמ"ר | טבעות | verdict | reasons |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const e of sorted) {
    lines.push(`| ${e.name} | ${e.type} | ${e.relationId ?? ''} | ${e.osmNameHe || e.osmName || ''} | ${e.matchedRule ?? ''} | ${e.matchedField ?? ''} | ${e.areaKm2?.toFixed(1) ?? ''} | ${e.ringCount ?? ''} | ${e.verdict} | ${(e.reasons || []).join('; ')} |`);
  }

  lines.push('');
  lines.push('### ה-definite-article diagnostic (NOT applied — evidence only)');
  lines.push('');
  if (definiteArticleHits.length > 0) {
    lines.push(`${definiteArticleHits.length} no-match entries WOULD have matched if a ה-add/strip rule were added. Not fed into any verdict above — David asked to see real counts before deciding whether to add this rule.`);
    lines.push('');
    lines.push('| שם רשות | היה תואם כ | relation id | שדה |');
    lines.push('|---|---|---|---|');
    for (const h of definiteArticleHits) {
      lines.push(`| ${h.name} | ${h.wouldMatchAs} | ${h.relationId} | ${h.field} |`);
    }
  } else {
    lines.push('Checked all remaining no-match entries (ה added or stripped, same 5 OSM fields) — **zero hits**. Not a guess: every one of them, including the ones that initially errored and were retried individually rather than silently counted as "no hit," came back as a clean, confirmed no-match. This rule would not help any of the remaining FAILs — not added.');
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
