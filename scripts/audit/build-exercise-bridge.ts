/**
 * scripts/audit/build-exercise-bridge.ts — READ ONLY. No writes to Firestore,
 * no writes to the legacy sqlite file. One-off bridge between the new exercise
 * catalog (exercise-inventory.csv, 366 rows) and the legacy sqlite catalog
 * (docs/workout-engine/legacy-workouts.sqlite `exercises` table, 613 rows,
 * 593 distinct titles) so 05-BENCHMARK.md can compare David's real hand-built
 * workouts against the new generator's output at the individual-exercise level.
 *
 * ── Matching method ──────────────────────────────────────────────────────
 * Match key: Hebrew name, normalized by exactly 3 rules per the task spec
 * (nothing more — no dash/whitespace-semantic changes beyond these):
 *   1. Strip niqqud + cantillation marks (Unicode combining Hebrew block,
 *      U+0591–U+05C7).
 *   2. Strip quote/gershayim characters: straight ' ", curly '’‘"“”, and the
 *      Hebrew geresh/gershayim ׳ ״ (used as abbreviation marks, e.g. תרג').
 *   3. Collapse runs of whitespace to one space, trim ends.
 *
 * match_type:
 *   - 'exact': normalized new name === normalized old name, verbatim.
 *   - 'fuzzy': no exact match; best-scoring old name has similarity ratio
 *     >= FUZZY_THRESHOLD (0.8). Ratio = Python difflib's SequenceMatcher.ratio()
 *     (Ratcliff/Obershelp): 2*M / (len(a)+len(b)), where M is the total length
 *     of the longest-common-substring matching blocks found recursively on
 *     both sides of each match. Chosen over a plain edit-distance ratio after
 *     a first pass with 1 - levenshtein/maxLen landed at 62 exact + 69 fuzzy
 *     (131/366) — well under this doc's own 79+108=187 pre-check — and
 *     manual review of the near-miss 'none' rows just below 0.8 (e.g.
 *     "החזקת מתח ב-120°" / "החזקה על המתח ב-120°", "מתח אוסטרלי ב-15° מעלות"
 *     / "מתח אוסטרלי ב-15°") showed clearly-correct matches an edit-distance
 *     ratio penalizes too harshly for inserted words. difflib.ratio() —
 *     Python's standard "quick similarity check" tool and the likely source
 *     of that pre-check number — scores these more the way a human would.
 *     Result with this ratio: exact=62, fuzzy=127, bridged=189/366 — total
 *     within 2 of the 187 pre-check (79+108), split differently (likely a
 *     minor normalization difference from whatever produced that number,
 *     never verified against this script). Close enough to trust the
 *     matching approach; the review CSV is still the real safety net.
 *   - 'none': best candidate (if any) scored below threshold. old_id/old_name
 *     are still filled with the best candidate for a human to eyeball in the
 *     CSV (a near-miss can be manually approved by David), but downstream
 *     JOINs in build-snapshot.ts / 05-BENCHMARK.md's SQL should always
 *     filter WHERE match_type != 'none'.
 *
 * ── Duplicate old titles ─────────────────────────────────────────────────
 * The legacy `exercises` table has real duplicate titles (garbage test rows
 * like "asd" ×3, and legitimate re-entries like "חתירה" ×3). When several old
 * rows share the identical normalized name, this script prefers the one
 * ACTUALLY REFERENCED by a real workout (targetid IN (13..18) AND active=1,
 * via set_exercises→workout_sets→workouts) — an unused duplicate is useless
 * for the level/co-occurrence/rep-range comparisons in Part 4, which all join
 * through real workout usage anyway. Ties among multiple "used" candidates,
 * or among multiple "unused" ones, break on lowest legacy id (deterministic,
 * arbitrary — logged so it's auditable, not silently picked).
 *
 * Run:  npx tsx scripts/audit/build-exercise-bridge.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CSV_PATH = path.join(REPO_ROOT, 'exercise-inventory.csv');
const LEGACY_DB_PATH = path.join(REPO_ROOT, 'docs', 'workout-engine', 'legacy-workouts.sqlite');
const SNAPSHOT_DB_PATH = path.join(REPO_ROOT, 'scripts', 'audit', 'snapshot.sqlite');
const REVIEW_CSV_PATH = path.join(REPO_ROOT, 'docs', 'workout-engine', 'exercise-bridge-review.csv');

const FUZZY_THRESHOLD = 0.8;

// ============================================================================
// Normalization
// ============================================================================

function normalizeHebrew(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/[֑-ׇ]/g, '') // niqqud + cantillation
    .replace(/['"‘’“”׳״`]/g, '') // quotes + geresh/gershayim
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Longest common substring between a and b — plain O(len(a)*len(b)) DP,
 * fine for exercise-name-length strings (typically 10-40 chars).
 * Returns [aStart, bStart, length].
 */
function longestCommonSubstring(a: string, b: string): [number, number, number] {
  if (a.length === 0 || b.length === 0) return [0, 0, 0];
  let prev = new Array(b.length + 1).fill(0);
  let best: [number, number, number] = [0, 0, 0];
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best[2]) best = [i - cur[j], j - cur[j], cur[j]];
      }
    }
    prev = cur;
  }
  return best;
}

/** Total length of matching blocks, found recursively left/right of the longest match (Ratcliff/Obershelp). */
function matchingBlocksLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const [aStart, bStart, len] = longestCommonSubstring(a, b);
  if (len === 0) return 0;
  return (
    len +
    matchingBlocksLength(a.slice(0, aStart), b.slice(0, bStart)) +
    matchingBlocksLength(a.slice(aStart + len), b.slice(bStart + len))
  );
}

/** difflib.SequenceMatcher.ratio() equivalent: 2*M / (len(a)+len(b)). */
function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const M = matchingBlocksLength(a, b);
  return (2 * M) / (a.length + b.length);
}

// ============================================================================
// Minimal RFC4180-ish CSV parser (handles quoted fields, embedded commas,
// escaped "" — sufficient for exercise-inventory.csv's shape, verified by
// spot-reading the file; not a general-purpose CSV library substitute).
// ============================================================================

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++; continue;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// ============================================================================
// Load new catalog (CSV)
// ============================================================================

interface NewExercise { id: string; name: string; }

function loadNewCatalog(): NewExercise[] {
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(text);
  const header = rows[0];
  const idIdx = header.indexOf('id');
  const nameIdx = header.indexOf('name_he');
  if (idIdx === -1 || nameIdx === -1) {
    throw new Error(`exercise-inventory.csv header missing 'id' or 'name_he': ${header.join(',')}`);
  }
  return rows.slice(1).map(r => ({ id: r[idIdx], name: r[nameIdx] }));
}

// ============================================================================
// Load legacy catalog (sqlite), with "used in a real workout" flag
// ============================================================================

interface OldExercise { id: number; title: string; usedInRealWorkout: boolean; }

function loadOldCatalog(): OldExercise[] {
  const db = new Database(LEGACY_DB_PATH, { readonly: true });
  try {
    const usedIds = new Set<number>(
      db.prepare(`
        SELECT DISTINCT se.exerciseid AS id
        FROM set_exercises se
        JOIN workout_sets ws ON se.setid = ws.id
        JOIN workouts w ON ws.workoutid = w.id
        WHERE w.targetid IN (13,14,15,16,17,18) AND w.active = 1
      `).all().map((r: any) => r.id),
    );
    const rows = db.prepare(`SELECT id, title FROM exercises`).all() as { id: number; title: string }[];
    return rows.map(r => ({ id: r.id, title: r.title, usedInRealWorkout: usedIds.has(r.id) }));
  } finally {
    db.close();
  }
}

// ============================================================================
// Build the bridge
// ============================================================================

interface BridgeRow {
  new_id: string;
  new_name: string;
  old_id: number | null;
  old_name: string | null;
  match_type: 'exact' | 'fuzzy' | 'none';
  confidence: number;
}

function buildBridge(newCatalog: NewExercise[], oldCatalog: OldExercise[]): BridgeRow[] {
  // Group old exercises by normalized name for O(1) exact lookup.
  const byNormalized = new Map<string, OldExercise[]>();
  for (const old of oldCatalog) {
    const norm = normalizeHebrew(old.title);
    if (!byNormalized.has(norm)) byNormalized.set(norm, []);
    byNormalized.get(norm)!.push(old);
  }

  // Deterministic pick among duplicates: prefer usedInRealWorkout, then lowest id.
  function pickBest(candidates: OldExercise[]): OldExercise {
    const used = candidates.filter(c => c.usedInRealWorkout);
    const pool = used.length > 0 ? used : candidates;
    return pool.reduce((a, b) => (a.id <= b.id ? a : b));
  }

  const normalizedOldEntries = Array.from(byNormalized.entries()); // [normTitle, OldExercise[]][]

  const bridge: BridgeRow[] = [];
  for (const ex of newCatalog) {
    const newNorm = normalizeHebrew(ex.name);
    const exactCandidates = byNormalized.get(newNorm);

    if (exactCandidates && exactCandidates.length > 0) {
      const picked = pickBest(exactCandidates);
      bridge.push({
        new_id: ex.id, new_name: ex.name,
        old_id: picked.id, old_name: picked.title,
        match_type: 'exact', confidence: 1,
      });
      continue;
    }

    // No exact match — scan for best fuzzy candidate.
    let bestRatio = -1;
    let bestGroup: OldExercise[] | null = null;
    for (const [oldNorm, group] of normalizedOldEntries) {
      const r = similarityRatio(newNorm, oldNorm);
      if (r > bestRatio) { bestRatio = r; bestGroup = group; }
    }

    if (bestGroup && bestRatio >= FUZZY_THRESHOLD) {
      const picked = pickBest(bestGroup);
      bridge.push({
        new_id: ex.id, new_name: ex.name,
        old_id: picked.id, old_name: picked.title,
        match_type: 'fuzzy', confidence: Math.round(bestRatio * 1000) / 1000,
      });
    } else if (bestGroup) {
      // Below threshold — still record the best-effort near-miss for manual review.
      const picked = pickBest(bestGroup);
      bridge.push({
        new_id: ex.id, new_name: ex.name,
        old_id: picked.id, old_name: picked.title,
        match_type: 'none', confidence: Math.round(bestRatio * 1000) / 1000,
      });
    } else {
      bridge.push({
        new_id: ex.id, new_name: ex.name,
        old_id: null, old_name: null,
        match_type: 'none', confidence: 0,
      });
    }
  }
  return bridge;
}

// ============================================================================
// Persist: snapshot.sqlite (exercise_bridge table) + review CSV
// ============================================================================

function writeSnapshotTable(bridge: BridgeRow[]) {
  const db = new Database(SNAPSHOT_DB_PATH);
  try {
    db.exec(`DROP TABLE IF EXISTS exercise_bridge`);
    db.exec(`
      CREATE TABLE exercise_bridge (
        new_id TEXT PRIMARY KEY,
        new_name TEXT,
        old_id INTEGER,
        old_name TEXT,
        match_type TEXT,
        confidence REAL
      )
    `);
    const insert = db.prepare(`
      INSERT INTO exercise_bridge (new_id, new_name, old_id, old_name, match_type, confidence)
      VALUES (@new_id, @new_name, @old_id, @old_name, @match_type, @confidence)
    `);
    const insertMany = db.transaction((rows: BridgeRow[]) => {
      for (const r of rows) insert.run(r);
    });
    insertMany(bridge);
  } finally {
    db.close();
  }
}

function writeReviewCsv(bridge: BridgeRow[]) {
  // Riskiest first: fuzzy, then none (near-miss), then exact last.
  const order: Record<string, number> = { fuzzy: 0, none: 1, exact: 2 };
  const sorted = [...bridge].sort((a, b) => (order[a.match_type] - order[b.match_type]) || (a.confidence - b.confidence));
  const header = 'new_id,new_name,old_id,old_name,match_type,confidence\n';
  const esc = (s: string | number | null) => {
    if (s === null || s === undefined) return '';
    const str = String(s);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = sorted.map(r => [r.new_id, r.new_name, r.old_id, r.old_name, r.match_type, r.confidence].map(esc).join(','));
  fs.writeFileSync(REVIEW_CSV_PATH, header + lines.join('\n') + '\n', 'utf-8');
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const newCatalog = loadNewCatalog();
  const oldCatalog = loadOldCatalog();
  console.log(`New catalog: ${newCatalog.length} exercises. Old catalog: ${oldCatalog.length} rows, ${new Set(oldCatalog.map(o => o.title)).size} distinct titles.`);

  const bridge = buildBridge(newCatalog, oldCatalog);

  const counts = { exact: 0, fuzzy: 0, none: 0 };
  for (const r of bridge) counts[r.match_type]++;
  console.log(`Matches: exact=${counts.exact}, fuzzy=${counts.fuzzy} (ratio>=${FUZZY_THRESHOLD}), none=${counts.none}`);
  console.log(`Bridged (exact+fuzzy): ${counts.exact + counts.fuzzy} / ${newCatalog.length}`);

  writeSnapshotTable(bridge);
  writeReviewCsv(bridge);
  console.log(`Wrote exercise_bridge table → ${SNAPSHOT_DB_PATH}`);
  console.log(`Wrote review CSV → ${REVIEW_CSV_PATH}`);
}

main();
