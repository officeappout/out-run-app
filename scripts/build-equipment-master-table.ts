/**
 * scripts/build-equipment-master-table.ts
 *
 * Builds a master asset table for gym equipment by listing files directly
 * from the Ludos and Urbanics brand folders in Google Drive.
 *
 * For each brand folder:
 *   - Lists all files recursively (video + image)
 *   - Pairs video↔image by normalised filename stem
 *   - Matches each pair to a gym_equipment doc by Hebrew name or UBX code
 *
 * NO uploads — all output is for David's review.
 *
 * Reads:
 *   scripts/corpus/gym-equipment-export.json   (run export-gym-equipment-for-video.ts first)
 *
 * Outputs:
 *   scripts/corpus/equipment-master-table.csv
 *     equipment_id, equipment_name, current_brand,
 *     ludos_video_id, ludos_video_name, ludos_img_id, ludos_img_name,
 *     urbanics_video_id, urbanics_video_name, urbanics_img_id, urbanics_img_name,
 *     has_existing_video, match_method, match_confidence
 *
 *   scripts/corpus/equipment-unidentified-codes.csv
 *     brand, type (video|image), drive_file_id, filename, stem,
 *     reason, best_match_equipment, best_match_score
 *
 * Usage: npx tsx scripts/build-equipment-master-table.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as fs   from 'fs';
import * as path from 'path';

// ── Brand folder IDs ──────────────────────────────────────────────────────────

const LUDOS_FOLDER_ID    = '15YCaG1qODmUuxBVmZ2exUagatHAxX9Dj';
const URBANICS_FOLDER_ID = '1NNL0-qzpE6SD4d0hOWA2HkcAbFRCmTB_';
const CORPUS             = path.join(process.cwd(), 'scripts/corpus');

// ── Supported file extensions ─────────────────────────────────────────────────

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// ── UBX code → Hebrew equipment name ─────────────────────────────────────────
// Named codes (letter-based) can be resolved automatically.
// Pure-number codes (UBX-14, UBX-17, …) have no entry — they go to unidentified.
const UBX_CODE_MAP: Record<string, string> = {
  'CR':     'חבל טיפוס',
  'DIP':    'מקבילים',
  'LAT':    'פולי עליון',
  'RING':   'טבעות אימון',
  'O-RING': 'טבעות אולימפיות',
  'KTB':    'קטלבל',
  'RPB':    'מתח',
  'BOSU':   'בוסו',
  'SKI':    'סקי רחיפה',
  'STEP':   'סטפר',
  'SS':     'סולם שוודי',
  'LW':     'סולם הליכות ידיים',
  'BUT':    'פרפר',
  'LEP':    'פשיטת ברך',
  'LEC':    'לחיצת רגליים במכונה',
  'CHP':    'לחיצת חזה',
  'SHP':    'לחיצת כתפיים',
  'PUL':    'פולי עליון',
  'ROW':    'חתירה במכונה',
  'HER':    'הרקולס דחיפה/משיכה',
  'ABB':    'מאמן שרירי בטן ואגן',
  'SIT':    'מיטת עליית בטן',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface GymEquipment {
  id:        string;
  name:      string;
  brands:    Array<{ brand_index: number; brandName: string; videoUrl?: string }>;
  hasVideo:  boolean;
}

interface DriveFile {
  id:         string;
  name:       string;
  mimeType:   string;
  ext:        string;   // lowercase, including dot
  stem:       string;   // normalised, no extension
  folderPath: string;   // path within brand folder
}

type BrandLabel = 'Ludos' | 'Urbanics';

interface FilePair {
  stem:   string;
  brand:  BrandLabel;
  video?: DriveFile;
  image?: DriveFile;
}

interface MasterRow {
  equipment_id:          string;
  equipment_name:        string;
  current_brand:         string;
  ludos_video_id:        string;
  ludos_video_name:      string;
  ludos_img_id:          string;
  ludos_img_name:        string;
  urbanics_video_id:     string;
  urbanics_video_name:   string;
  urbanics_img_id:       string;
  urbanics_img_name:     string;
  has_existing_video:    string;
  match_method:          string;
  match_confidence:      string;
}

interface UnidentifiedRow {
  brand:                string;
  type:                 string;
  drive_file_id:        string;
  filename:             string;
  stem:                 string;
  reason:               string;
  best_match_equipment: string;
  best_match_score:     string;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function makeDriveClient() {
  const { google } = await import('googleapis');
  const { JWT }    = await import('google-auth-library');
  const creds      = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!creds) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const auth = new JWT({
    email:  creds.client_email,
    key:    creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/** Recursively list all non-folder files under folderId. */
async function listAllFiles(
  drive:      any,
  folderId:   string,
  folderPath: string = '/',
): Promise<DriveFile[]> {
  const result: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res: any = await drive.files.list({
      q:                         `'${folderId}' in parents and trashed = false`,
      fields:                    'nextPageToken, files(id, name, mimeType)',
      supportsAllDrives:         true,
      includeItemsFromAllDrives: true,
      pageSize:                  200,
      pageToken,
    });

    for (const f of (res.data.files ?? [])) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        const sub = await listAllFiles(drive, f.id, `${folderPath}${f.name}/`);
        result.push(...sub);
      } else {
        const ext  = path.extname(f.name).toLowerCase();
        const stem = normStem(f.name);
        result.push({
          id: f.id, name: f.name, mimeType: f.mimeType,
          ext, stem, folderPath,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return result;
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/** Stem = filename with extension removed, lowercased, whitespace collapsed. */
function normStem(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip brand/code prefixes from a stem to get the bare Hebrew label. */
function stripPrefixes(stem: string): string {
  return stem
    .replace(/^ubx-[\w-]+\s*/i, '')
    .replace(/^la-\d+\s*[-–]?\s*/i, '')
    .replace(/^מתקן\s+/, '')
    .trim();
}

function normHeb(s: string): string {
  return s.toLowerCase().replace(/[-–\s]+/g, ' ').trim();
}

/** 0–1 similarity between a Drive stem and a Firestore equipment name. */
function matchScore(stem: string, equipName: string): number {
  const d = normHeb(stripPrefixes(stem));
  const e = normHeb(equipName);
  if (!d) return 0;
  if (d === e) return 1.0;
  if (e.includes(d) || d.includes(e)) return 0.85;
  const dW = d.split(' ').filter(w => w.length > 1);
  const eW = e.split(' ').filter(w => w.length > 1);
  if (!dW.length) return 0;
  const overlap = dW.filter(w => eW.includes(w)).length;
  return overlap ? (overlap / Math.max(dW.length, eW.length)) * 0.7 : 0;
}

/** Extract UBX letter code from a stem, e.g. "ubx-ring" → "RING". */
function extractUbxCode(stem: string): string | null {
  const m = stem.match(/^ubx-([\w-]+)$/i);
  if (!m) return null;
  return m[1].toUpperCase().replace(/-\d+$/, ''); // strip trailing number suffix
}

/** Returns best equipment match or null if nothing scores ≥ 0.5. */
function bestMatch(
  stem:       string,
  equipment:  GymEquipment[],
): { equip: GymEquipment; score: number; method: string } | null {
  // 1. UBX dictionary lookup (takes priority)
  const ubxCode = extractUbxCode(stem);
  if (ubxCode && UBX_CODE_MAP[ubxCode]) {
    const target = UBX_CODE_MAP[ubxCode];
    const eq = equipment.find(e =>
      normHeb(e.name).includes(normHeb(target)) ||
      normHeb(target).includes(normHeb(e.name))
    );
    if (eq) return { equip: eq, score: 0.75, method: `dict:UBX-${ubxCode}` };
  }

  // 2. Hebrew name scoring
  const scored = equipment
    .map(e => ({ e, s: matchScore(stem, e.name) }))
    .sort((a, b) => b.s - a.s);

  if (scored[0].s >= 0.5) {
    return { equip: scored[0].e, score: scored[0].s, method: 'name-match' };
  }
  return null;
}

// ── CSV helper ────────────────────────────────────────────────────────────────

function toCsvRow(values: (string | number)[]): string {
  return values.map(v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Load equipment export ───────────────────────────────────────────────────
  const exportPath = path.join(CORPUS, 'gym-equipment-export.json');
  if (!fs.existsSync(exportPath)) {
    console.error('❌  gym-equipment-export.json not found.');
    console.error('    Run: npx tsx scripts/export-gym-equipment-for-video.ts');
    process.exit(1);
  }
  const equipment: GymEquipment[] = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  console.log(`Loaded ${equipment.length} gym_equipment docs\n`);

  // ── List Drive folders ──────────────────────────────────────────────────────
  const drive = await makeDriveClient();

  process.stdout.write('Listing Ludos folder…    ');
  const ludosFiles    = await listAllFiles(drive, LUDOS_FOLDER_ID);
  console.log(`${ludosFiles.length} files`);

  process.stdout.write('Listing Urbanics folder… ');
  const urbanicsFiles = await listAllFiles(drive, URBANICS_FOLDER_ID);
  console.log(`${urbanicsFiles.length} files`);

  // ── Pair video + image within each brand by normalised stem ────────────────
  function buildPairs(files: DriveFile[], brand: BrandLabel): FilePair[] {
    const byStem = new Map<string, FilePair>();

    for (const f of files) {
      const isVid = VIDEO_EXTS.has(f.ext);
      const isImg = IMAGE_EXTS.has(f.ext);
      if (!isVid && !isImg) continue;

      if (!byStem.has(f.stem)) byStem.set(f.stem, { stem: f.stem, brand });
      const pair = byStem.get(f.stem)!;

      if (isVid) {
        if (pair.video) {
          console.warn(`  dup video "${f.stem}" in ${brand} — keeping first (${pair.video.name})`);
        } else {
          pair.video = f;
        }
      } else {
        if (pair.image) {
          console.warn(`  dup image "${f.stem}" in ${brand} — keeping first (${pair.image.name})`);
        } else {
          pair.image = f;
        }
      }
    }
    return Array.from(byStem.values());
  }

  const ludosPairs    = buildPairs(ludosFiles,    'Ludos');
  const urbanicsPairs = buildPairs(urbanicsFiles, 'Urbanics');

  const ludosVids   = ludosPairs.filter(p => p.video).length;
  const ludosImgs   = ludosPairs.filter(p => p.image).length;
  const urbanicsVids = urbanicsPairs.filter(p => p.video).length;
  const urbanicsImgs = urbanicsPairs.filter(p => p.image).length;
  console.log(`\nLudos stems:    ${ludosPairs.length}  (${ludosVids} with video, ${ludosImgs} with image)`);
  console.log(`Urbanics stems: ${urbanicsPairs.length}  (${urbanicsVids} with video, ${urbanicsImgs} with image)`);

  // ── Build master table ────────────────────────────────────────────────────
  const master = new Map<string, MasterRow>();
  for (const eq of equipment) {
    master.set(eq.id, {
      equipment_id:          eq.id,
      equipment_name:        eq.name,
      current_brand:         eq.brands[0]?.brandName ?? '',
      ludos_video_id:        '',
      ludos_video_name:      '',
      ludos_img_id:          '',
      ludos_img_name:        '',
      urbanics_video_id:     '',
      urbanics_video_name:   '',
      urbanics_img_id:       '',
      urbanics_img_name:     '',
      has_existing_video:    eq.hasVideo ? 'yes' : '',
      match_method:          '',
      match_confidence:      '',
    });
  }

  const unidentified: UnidentifiedRow[] = [];

  function processPairs(pairs: FilePair[], brandLabel: BrandLabel) {
    for (const pair of pairs) {
      const match = bestMatch(pair.stem, equipment);

      if (!match) {
        const ubxCode = extractUbxCode(pair.stem);
        const isPureNumber = /^\d+[abc]?$/.test(pair.stem.replace(/^ubx-/i, ''));

        const reason = ubxCode
          ? isPureNumber
            ? `UBX-number-only — no catalog entry, manual mapping needed`
            : `UBX-${ubxCode} — code not in dictionary, manual mapping needed`
          : `no equipment name match (score < 0.5)`;

        const scored = equipment
          .map(e => ({ e, s: matchScore(pair.stem, e.name) }))
          .sort((a, b) => b.s - a.s);

        for (const f of [pair.video, pair.image].filter((x): x is DriveFile => !!x)) {
          unidentified.push({
            brand:                brandLabel,
            type:                 VIDEO_EXTS.has(f.ext) ? 'video' : 'image',
            drive_file_id:        f.id,
            filename:             f.name,
            stem:                 pair.stem,
            reason,
            best_match_equipment: scored[0]?.e.name ?? '',
            best_match_score:     (scored[0]?.s ?? 0).toFixed(3),
          });
        }
        continue;
      }

      const row = master.get(match.equip.id)!;

      if (brandLabel === 'Ludos') {
        if (pair.video && !row.ludos_video_id) {
          row.ludos_video_id   = pair.video.id;
          row.ludos_video_name = pair.video.name;
        }
        if (pair.image && !row.ludos_img_id) {
          row.ludos_img_id   = pair.image.id;
          row.ludos_img_name = pair.image.name;
        }
      } else {
        if (pair.video && !row.urbanics_video_id) {
          row.urbanics_video_id   = pair.video.id;
          row.urbanics_video_name = pair.video.name;
        }
        if (pair.image && !row.urbanics_img_id) {
          row.urbanics_img_id   = pair.image.id;
          row.urbanics_img_name = pair.image.name;
        }
      }

      if (!row.match_method) {
        row.match_method     = match.method;
        row.match_confidence = match.score.toFixed(3);
      }
    }
  }

  processPairs(ludosPairs,    'Ludos');
  processPairs(urbanicsPairs, 'Urbanics');

  // ── Write equipment-master-table.csv ─────────────────────────────────────
  const MASTER_COLS = [
    'equipment_id', 'equipment_name', 'current_brand',
    'ludos_video_id', 'ludos_video_name', 'ludos_img_id', 'ludos_img_name',
    'urbanics_video_id', 'urbanics_video_name', 'urbanics_img_id', 'urbanics_img_name',
    'has_existing_video', 'match_method', 'match_confidence',
  ];
  const masterRows = Array.from(master.values())
    .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));

  const masterCsv = [
    MASTER_COLS.join(','),
    ...masterRows.map(r => toCsvRow([
      r.equipment_id,      r.equipment_name,      r.current_brand,
      r.ludos_video_id,    r.ludos_video_name,    r.ludos_img_id,    r.ludos_img_name,
      r.urbanics_video_id, r.urbanics_video_name, r.urbanics_img_id, r.urbanics_img_name,
      r.has_existing_video, r.match_method,        r.match_confidence,
    ])),
  ].join('\n') + '\n';

  const masterPath = path.join(CORPUS, 'equipment-master-table.csv');
  fs.writeFileSync(masterPath, masterCsv);

  // ── Write equipment-unidentified-codes.csv ────────────────────────────────
  const UNID_COLS = [
    'brand', 'type', 'drive_file_id', 'filename', 'stem',
    'reason', 'best_match_equipment', 'best_match_score',
  ];
  const unidCsv = [
    UNID_COLS.join(','),
    ...unidentified
      .sort((a, b) => a.brand.localeCompare(b.brand) || a.stem.localeCompare(b.stem))
      .map(r => toCsvRow([
        r.brand, r.type, r.drive_file_id, r.filename, r.stem,
        r.reason, r.best_match_equipment, r.best_match_score,
      ])),
  ].join('\n') + '\n';

  const unidPath = path.join(CORPUS, 'equipment-unidentified-codes.csv');
  fs.writeFileSync(unidPath, unidCsv);

  // ── Terminal summary ──────────────────────────────────────────────────────
  const withLudosVid    = masterRows.filter(r => r.ludos_video_id).length;
  const withLudosImg    = masterRows.filter(r => r.ludos_img_id).length;
  const withUrbanicsVid = masterRows.filter(r => r.urbanics_video_id).length;
  const withUrbanicsImg = masterRows.filter(r => r.urbanics_img_id).length;
  const noVideoAtAll    = masterRows.filter(r => !r.ludos_video_id && !r.urbanics_video_id).length;

  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(`  Equipment rows:        ${masterRows.length}`);
  console.log(`  Ludos   video matched: ${withLudosVid}`);
  console.log(`  Ludos   image matched: ${withLudosImg}`);
  console.log(`  Urbanics video matched: ${withUrbanicsVid}`);
  console.log(`  Urbanics image matched: ${withUrbanicsImg}`);
  console.log(`  No video (any brand):  ${noVideoAtAll}`);
  console.log(`  Unidentified files:    ${unidentified.length}  (UBX-numbers etc.)`);
  console.log(`\n  ✅  ${masterPath}`);
  console.log(`  ✅  ${unidPath}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
