/**
 * scripts/build-equipment-video-matches.ts
 *
 * Cross-references Drive video filenames against gym_equipment Firestore docs.
 * Outputs:
 *   scripts/corpus/video-equipment-overrides.csv       — high-confidence matches, ready for upload
 *   scripts/corpus/equipment-video-unmatched-drive.json — Drive files that need manual mapping
 *   scripts/corpus/equipment-video-unmatched-equip.json — equipment with no Drive video found
 *
 * Run order:
 *   1. npx tsx scripts/export-gym-equipment-for-video.ts
 *   2. npx tsx scripts/build-equipment-video-matches.ts   ← this script
 *   3. Review + edit video-equipment-overrides.csv
 *   4. npx tsx scripts/bulk-upload-equipment-videos.ts --limit=1
 *
 * Usage: npx tsx scripts/build-equipment-video-matches.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as csvParse } from 'csv-parse/sync';

const CORPUS = path.join(process.cwd(), 'scripts/corpus');

// ── Types ─────────────────────────────────────────────────────────────────────

interface EquipmentBrand {
  brandName: string;
  videoUrl?: string;
}

interface GymEquipmentExport {
  id: string;
  name: string;
  brands: EquipmentBrand[];
  hasVideo: boolean;
}

interface DriveRow {
  filename: string;
  fileId: string;
}

interface MatchResult {
  drive_file_id: string;
  equipment_id: string;
  brand_index: number;
  equipment_name: string;
  brand_name: string;
  drive_filename: string;
  confidence: number;
  has_existing_video: boolean;
}

// ── UBX letter-code → equipment name lookup ───────────────────────────────────
// UBX codes from the product catalog that don't contain a Hebrew label.
// Key = UBX code (uppercase), Value = Hebrew equipment name to match against.
// Pure-number UBX files (UBX-14, UBX-17, …) are NOT in this map and will
// remain unmatched — they need manual mapping by David.
const UBX_CODE_MAP: Record<string, string> = {
  'CR':     'חבל טיפוס',        // Climbing Rope
  'DIP':    'מקבילים',          // Dip bars
  'LAT':    'פולי עליון',       // Lat Pulldown
  'RING':   'טבעות אימון',      // Training Rings
  'O-RING': 'טבעות אולימפיות', // Olympic Rings
  'KTB':    'קטלבל',            // Kettlebell (KTB-2 etc.)
  'RPB':    'מתח',              // Row/Pull Bar  (best guess)
};

// ── Normalisation helpers ─────────────────────────────────────────────────────

/**
 * If the filename is a UBX-code-only file (no Hebrew text after the code),
 * return the mapped Hebrew equipment name, or null if not in the map.
 */
function resolveUbxCode(filename: string): string | null {
  // Match UBX-<CODE>.mp4 or UBX-<CODE>-<suffix>.mp4 with no Hebrew after
  const m = filename.match(/^UBX-([\w-]+)\.mp4$/i);
  if (!m) return null;
  const code = m[1].toUpperCase();
  // Strip trailing numeric suffix: KTB-2 → KTB
  const baseCode = code.replace(/-\d+$/, '');
  return UBX_CODE_MAP[code] ?? UBX_CODE_MAP[baseCode] ?? null;
}

/** Strip filename noise to get the bare Hebrew equipment label */
function stripNoise(filename: string): string {
  return filename
    .replace(/\.mp4$/i, '')                       // .mp4 extension
    .replace(/^UBX-[\w-]+\s*/i, '')               // UBX-XX or UBX-KTB-2 prefix
    .replace(/^LA-\d+\s*[-–]?\s*/i, '')           // LA-14415 prefix
    .replace(/^מתקן\s+/, '')                      // "מתקן " prefix
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[-–\s]+/g, ' ').trim();
}

/** Returns 0–1 similarity score between a Drive filename and an equipment name */
function matchScore(driveFilename: string, equipName: string): number {
  const d = norm(stripNoise(driveFilename));
  const e = norm(equipName);
  if (!d) return 0;
  if (d === e) return 1.0;
  if (e.includes(d) || d.includes(e)) return 0.85;
  const dWords = d.split(' ').filter(w => w.length > 1);
  const eWords = e.split(' ').filter(w => w.length > 1);
  if (dWords.length === 0) return 0;
  const overlap = dWords.filter(w => eWords.includes(w)).length;
  return overlap > 0 ? (overlap / Math.max(dWords.length, eWords.length)) * 0.7 : 0;
}

/**
 * Detect UBX / LA brand prefix from the raw filename.
 * Returns 'UBX', 'LA', or null.
 */
function detectBrandPrefix(filename: string): string | null {
  const m = filename.match(/^(UBX|LA)\s*[-]?\d*/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Find the first brand index whose brandName contains the prefix.
 * Defaults to 0 (first brand) when no match is found.
 */
function findBrandIndex(brands: EquipmentBrand[], prefix: string | null): number {
  if (!prefix || brands.length === 0) return 0;
  const idx = brands.findIndex(b =>
    b.brandName.toUpperCase().includes(prefix)
  );
  return idx >= 0 ? idx : 0;
}

/** Minimal CSV serialisation — no external dependency */
function toCsvRow(values: (string | number)[]): string {
  return values
    .map(v => {
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(',');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // ── Load equipment export ────────────────────────────────────────────────
  const exportPath = path.join(CORPUS, 'gym-equipment-export.json');
  if (!fs.existsSync(exportPath)) {
    console.error('❌  gym-equipment-export.json not found. Run export-gym-equipment-for-video.ts first.');
    process.exit(1);
  }
  const equipment: GymEquipmentExport[] = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  console.log(`Loaded ${equipment.length} equipment docs`);

  // ── Load Drive CSV ───────────────────────────────────────────────────────
  const driveCsvPath = path.join(CORPUS, 'drive-all-videos.csv');
  if (!fs.existsSync(driveCsvPath)) {
    console.error('❌  drive-all-videos.csv not found.');
    process.exit(1);
  }
  const allDriveRows: DriveRow[] = (csvParse(fs.readFileSync(driveCsvPath, 'utf8'), {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
  }) as any[]).map(r => ({ filename: r.filename as string, fileId: r.fileId as string }));
  console.log(`Loaded ${allDriveRows.length} Drive rows`);

  // ── Filter to equipment-likely files ────────────────────────────────────
  function looksLikeEquipment(filename: string): boolean {
    if (/^(ubx|la[-\s]?\d)/i.test(filename)) return true;
    return equipment.some(e => matchScore(filename, e.name) >= 0.5);
  }
  const equipRows = allDriveRows.filter(r => looksLikeEquipment(r.filename));
  console.log(`Equipment-related Drive files: ${equipRows.length} / ${allDriveRows.length}`);

  // ── Deduplicate filenames (keep first occurrence) ────────────────────────
  const seen = new Map<string, DriveRow>();
  const dupes: string[] = [];
  for (const row of equipRows) {
    if (seen.has(row.filename)) {
      dupes.push(`"${row.filename}" → skipped ${row.fileId} (kept ${seen.get(row.filename)!.fileId})`);
    } else {
      seen.set(row.filename, row);
    }
  }
  const deduped = Array.from(seen.values());
  if (dupes.length) console.log(`Duplicates skipped: ${dupes.length}`);

  // ── Match each Drive file to an equipment doc ────────────────────────────
  const matched: MatchResult[] = [];
  const unmatchedDrive: Array<{ filename: string; fileId: string; bestMatch: string; score: number }> = [];

  for (const row of deduped) {
    const scores = equipment.map(e => ({ e, score: matchScore(row.filename, e.name) }));
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    // For pure UBX-code files, override name-based score with dictionary lookup
    const ubxName = resolveUbxCode(row.filename);
    if (ubxName && best.score < 0.7) {
      const ubxMatch = equipment.find(e => norm(e.name).includes(norm(ubxName)) || norm(ubxName).includes(norm(e.name)));
      if (ubxMatch) {
        const prefix     = detectBrandPrefix(row.filename);
        const brandIndex = findBrandIndex(ubxMatch.brands, prefix);
        matched.push({
          drive_file_id:      row.fileId,
          equipment_id:       ubxMatch.id,
          brand_index:        brandIndex,
          equipment_name:     ubxMatch.name,
          brand_name:         ubxMatch.brands[brandIndex]?.brandName ?? '',
          drive_filename:     row.filename,
          confidence:         0.75,   // dictionary-based match
          has_existing_video: !!(ubxMatch.brands[brandIndex]?.videoUrl),
        });
        continue;
      }
    }

    if (best.score < 0.5) {
      unmatchedDrive.push({
        filename:  row.filename,
        fileId:    row.fileId,
        bestMatch: best.e.name,
        score:     parseFloat(best.score.toFixed(3)),
      });
      continue;
    }

    const prefix     = detectBrandPrefix(row.filename);
    const brandIndex = findBrandIndex(best.e.brands, prefix);
    const brandName  = best.e.brands[brandIndex]?.brandName ?? '';

    matched.push({
      drive_file_id:      row.fileId,
      equipment_id:       best.e.id,
      brand_index:        brandIndex,
      equipment_name:     best.e.name,
      brand_name:         brandName,
      drive_filename:     row.filename,
      confidence:         parseFloat(best.score.toFixed(3)),
      has_existing_video: !!(best.e.brands[brandIndex]?.videoUrl),
    });
  }

  // ── Equipment with no matched Drive file ─────────────────────────────────
  const matchedIds   = new Set(matched.map(m => m.equipment_id));
  const unmatchedEq  = equipment
    .filter(e => !matchedIds.has(e.id) && !e.hasVideo)
    .map(e => ({ id: e.id, name: e.name, brands: e.brands.map(b => b.brandName) }));

  // ── Split matched into ready (≥0.7) and review (0.5–0.69) ──────────────
  matched.sort((a, b) => b.confidence - a.confidence || a.equipment_name.localeCompare(b.equipment_name));
  const ready  = matched.filter(m => m.confidence >= 0.7);
  const review = matched.filter(m => m.confidence < 0.7);

  // ── Write CSV ────────────────────────────────────────────────────────────
  const csvPath = path.join(CORPUS, 'video-equipment-overrides.csv');
  const header  = 'drive_file_id,equipment_id,brand_index,equipment_name,brand_name';
  const csvLines = [
    header,
    ...ready.map(m =>
      toCsvRow([m.drive_file_id, m.equipment_id, m.brand_index, m.equipment_name, m.brand_name])
    ),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n');

  // ── Write unmatched/review JSON ──────────────────────────────────────────
  fs.writeFileSync(
    path.join(CORPUS, 'equipment-video-unmatched-drive.json'),
    JSON.stringify({ dupeFilenames: dupes, unmatchedDrive, reviewNeeded: review }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(CORPUS, 'equipment-video-unmatched-equip.json'),
    JSON.stringify(unmatchedEq, null, 2) + '\n',
  );

  // ── Terminal summary ─────────────────────────────────────────────────────
  console.log('\n── Results ──────────────────────────────────────────────────────');
  console.log(`  ✅  Ready (confidence ≥ 0.7):  ${ready.length}  → ${csvPath}`);
  console.log(`  ⚠️   Review (0.5–0.69):         ${review.length}  → equipment-video-unmatched-drive.json`);
  console.log(`  ❌  Unmatched Drive files:       ${unmatchedDrive.length}  → equipment-video-unmatched-drive.json`);
  console.log(`  📭  Equipment with no video:    ${unmatchedEq.length}  → equipment-video-unmatched-equip.json`);

  if (dupes.length) {
    console.log('\n  🔁 Duplicate filenames (second copy skipped):');
    dupes.forEach(d => console.log(`     ${d}`));
  }

  if (review.length) {
    console.log('\n  ⚠️  Low-confidence matches (add manually to CSV if correct):');
    review.forEach(m =>
      console.log(
        `     [${m.confidence.toFixed(2)}] "${m.drive_filename}"` +
        `\n            → "${m.equipment_name}" brand[${m.brand_index}]=${m.brand_name}` +
        (m.has_existing_video ? '  ⚠️  already has video' : ''),
      )
    );
  }

  if (unmatchedDrive.length) {
    console.log('\n  ❌ Unmatched Drive files (add manually to CSV with correct equipment_id):');
    unmatchedDrive.forEach(u =>
      console.log(`     "${u.filename}" (best: "${u.bestMatch}" score=${u.score})`)
    );
  }

  if (unmatchedEq.length) {
    console.log('\n  📭 Equipment with no Drive video found:');
    unmatchedEq.forEach(e => console.log(`     "${e.name}"  (${e.id})`));
  }

  console.log('\n  Next: review video-equipment-overrides.csv, then run:');
  console.log('  npx tsx scripts/bulk-upload-equipment-videos.ts --limit=1\n');
}

main();
