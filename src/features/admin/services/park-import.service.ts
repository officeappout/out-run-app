/**
 * Park Bulk Import Service
 *
 * Parses parks.csv, equipment.csv, park_equipment.csv (junction), and
 * files.csv (media), matches against Firestore authorities / gym_equipment,
 * auto-creates brands, migrates media to Firebase Storage, and
 * batch-writes new equipment + parks (idempotent create-or-update).
 */
import * as XLSX from 'xlsx';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  writeBatch,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import type { Authority } from '@/types/admin-types';
import type { GymEquipment, EquipmentBrand } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { ParkGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OLD_FILES_HOST = 'https://files.appout.co.il';
const OLD_PATH_PREFIX = '/home/backend/out-local-files/upload-files/';
const OUTDOOR_BRANDS_COLLECTION = 'outdoorBrands';

const BRAND_MAP: Record<string, string> = {
  '8': 'Ludos',
  '9': 'Urbanics',
};

// ---------------------------------------------------------------------------
// CSV Row Shapes
// ---------------------------------------------------------------------------

export interface CsvParkRow {
  id: string;
  title: string;
  latitude: string;
  longitude: string;
  muniid: string;
  [key: string]: string;
}

export interface CsvEquipmentRow {
  id: string;
  title: string;
  image: string;
  functional: string;
  summaryremarks: string;
  companyid: string;
  [key: string]: string;
}

export interface CsvJunctionRow {
  parkid: string;
  equipmentid: string;
  [key: string]: string;
}

export interface CsvFileRow {
  id: string;
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Preview Types
// ---------------------------------------------------------------------------

export type MatchStatus = 'matched' | 'new' | 'error';
export type RowStatus = 'ready' | 'warning' | 'error';

export interface EquipmentPreview {
  csvId: string;
  name: string;
  image: string;
  video: string;
  description: string;
  brandName: string;
  companyId: string;
  isFunctional: boolean;
  matchedFirestoreId: string | null;
  status: MatchStatus;
}

export interface ParkPreview {
  csvId: string;
  name: string;
  description: string;
  location: { lat: number; lng: number };
  csvMuniId: string;
  matchedAuthorityId: string | null;
  matchedAuthorityName: string | null;
  equipment: EquipmentPreview[];
  images: string[];
  parkOwnImageCount: number;
  videos: string[];
  featureTags: ParkFeatureTag[];
  isShaded: boolean;
  hasWaterFountain: boolean;
  hasBenches: boolean;
  hasNaturalShade: boolean;
  hasBikeRacks: boolean;
  hasNearbyShelter: boolean;
  status: RowStatus;
  warnings: string[];
}

export interface ImportPreview {
  parks: ParkPreview[];
  equipment: EquipmentPreview[];
  filenameIndex: Record<string, string>;
  stats: {
    totalParks: number;
    readyParks: number;
    warningParks: number;
    errorParks: number;
    totalEquipment: number;
    matchedEquipment: number;
    newEquipment: number;
    totalVideos: number;
  };
}

export interface ImportProgress {
  phase: string;
  current: number;
  total: number;
  detail: string;
}

export interface ImportResult {
  success: boolean;
  createdEquipment: number;
  updatedEquipment: number;
  createdParks: number;
  updatedParks: number;
  migratedMedia: number;
  migratedVideos: number;
  skippedMedia: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// CSV Parsing — with Hebrew codepage support
// ---------------------------------------------------------------------------

/** Strip undefined values from an object — Firestore rejects undefined fields */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const clean = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof (v as any).toDate !== 'function') {
        clean[k] = stripUndefined(v as Record<string, unknown>);
      } else if (Array.isArray(v)) {
        clean[k] = v.map((item) =>
          item && typeof item === 'object' && !(item instanceof Date) ? stripUndefined(item as Record<string, unknown>) : item,
        );
      } else {
        clean[k] = v;
      }
    }
  }
  return clean as T;
}

const CSV_NULL_VALUES = new Set(['NULL', 'null', 'undefined', 'nil', '']);

/** Case-insensitive column value lookup — treats CSV NULL/null/undefined as empty */
function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && !CSV_NULL_VALUES.has(v.trim())) return String(v).trim();
  }
  const lowerCandidates = candidates.map((c) => c.toLowerCase().trim());
  for (const key of Object.keys(row)) {
    const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase();
    if (lowerCandidates.includes(cleanKey)) {
      const v = row[key];
      if (v !== undefined && !CSV_NULL_VALUES.has(v.trim())) return String(v).trim();
    }
  }
  return '';
}

export function parseCSVFile<T extends Record<string, string>>(
  file: File,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const readerUtf8 = new FileReader();
    readerUtf8.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const sample = text.slice(0, 500);
        const looksCorrupt =
          sample.includes('\uFFFD') || /×[×\u0080-\u00FF]{2,}/.test(sample);

        if (looksCorrupt) {
          readWithCodepage(file, resolve, reject);
          return;
        }

        const wb = XLSX.read(text, { type: 'string' });
        resolve(XLSX.utils.sheet_to_json<T>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false }));
      } catch {
        readWithCodepage(file, resolve, reject);
      }
    };
    readerUtf8.onerror = () => reject(readerUtf8.error);
    readerUtf8.readAsText(file, 'UTF-8');
  });
}

function readWithCodepage<T extends Record<string, string>>(
  file: File,
  resolve: (rows: T[]) => void,
  reject: (err: unknown) => void,
) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', codepage: 1255 });
      resolve(XLSX.utils.sheet_to_json<T>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false }));
    } catch (err) {
      reject(err);
    }
  };
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(file);
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

function buildPublicUrl(rawPath: string): string {
  const p = rawPath.trim();
  if (!p || CSV_NULL_VALUES.has(p)) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (p.startsWith(OLD_PATH_PREFIX)) return `${OLD_FILES_HOST}/${p.slice(OLD_PATH_PREFIX.length)}`;
  if (p.startsWith('/')) return `${OLD_FILES_HOST}${p}`;
  return `${OLD_FILES_HOST}/${p}`;
}

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'mp4', 'mov', 'm4v', 'webm'].includes(ext)) {
      return ext;
    }
  } catch { /* ignore */ }
  return 'jpg';
}

function guessMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', mp4: 'video/mp4', m4v: 'video/mp4',
    mov: 'video/quicktime', webm: 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

function isAlreadyMigrated(url: string): boolean {
  return url.includes('firebasestorage.googleapis.com') || url.includes('storage.googleapis.com');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const MIGRATE_MAX_RETRIES = 3;
const MIGRATE_THROTTLE_MS = 500;
const MIGRATE_RETRY_DELAYS = [1000, 2000, 4000];

const MIGRATE_FETCH_TIMEOUT_MS = 15_000;
const MIGRATE_VIDEO_TIMEOUT_MS = 60_000;

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi']);

function isVideoUrl(url: string): boolean {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
  return VIDEO_EXTENSIONS.has(ext);
}

async function tryFetchAndUpload(
  sourceUrl: string,
  storagePath: string,
): Promise<string | null> {
  const timeoutMs = isVideoUrl(sourceUrl) ? MIGRATE_VIDEO_TIMEOUT_MS : MIGRATE_FETCH_TIMEOUT_MS;

  for (let attempt = 0; attempt < MIGRATE_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(sourceUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        const wait = MIGRATE_RETRY_DELAYS[attempt] ?? 4000;
        console.warn(`[migrate] 429 rate-limited, retry ${attempt + 1}/${MIGRATE_MAX_RETRIES} in ${wait}ms — ${sourceUrl}`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        console.warn(`[migrate] HTTP ${res.status} for ${sourceUrl} (attempt ${attempt + 1})`);
        if (attempt < MIGRATE_MAX_RETRIES - 1) { await sleep(MIGRATE_RETRY_DELAYS[attempt] ?? 2000); continue; }
        return null;
      }

      const blob = await res.blob();
      const ext = getExtFromUrl(sourceUrl);
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: guessMimeType(ext) });
      const url = await getDownloadURL(storageRef);

      await sleep(MIGRATE_THROTTLE_MS);
      return url;
    } catch (err) {
      console.warn(`[migrate] error attempt ${attempt + 1}/${MIGRATE_MAX_RETRIES}: ${err instanceof Error ? err.message : err}`);
      if (attempt < MIGRATE_MAX_RETRIES - 1) { await sleep(MIGRATE_RETRY_DELAYS[attempt] ?? 2000); }
    }
  }
  return null;
}

async function migrateFileToStorage(
  sourceUrl: string,
  storagePath: string,
  fallbackUrls?: string[],
): Promise<string | null> {
  if (!sourceUrl || CSV_NULL_VALUES.has(sourceUrl.trim())) {
    console.log(`[migrate] Skipping null/empty source URL`);
    return null;
  }

  const result = await tryFetchAndUpload(sourceUrl, storagePath);
  if (result) return result;

  if (fallbackUrls && fallbackUrls.length > 0) {
    for (const fallback of fallbackUrls) {
      if (fallback === sourceUrl) continue;
      console.log(`[migrate] Primary failed, trying fallback: ${fallback}`);
      const fbResult = await tryFetchAndUpload(fallback, storagePath);
      if (fbResult) return fbResult;
    }
  }

  console.warn(`[migrate] gave up on all URLs — primary: ${sourceUrl}`);
  await sleep(MIGRATE_THROTTLE_MS);
  return null;
}

// ---------------------------------------------------------------------------
// Idempotency — load previously imported records
// ---------------------------------------------------------------------------

interface ExistingRecord {
  docId: string;
  images?: string[];
}

async function loadExistingImported(collectionName: string): Promise<Map<string, ExistingRecord>> {
  const map = new Map<string, ExistingRecord>();
  try {
    const q = query(collection(db, collectionName), where('importedFrom', '==', 'csv_bulk_import'));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      const extId = String(data.externalSourceId ?? '').trim();
      if (extId) {
        map.set(extId, { docId: d.id, images: Array.isArray(data.images) ? data.images : [] });
      }
    }
  } catch { /* first run */ }
  return map;
}

// ---------------------------------------------------------------------------
// Brand helpers — load / auto-create in outdoorBrands
// ---------------------------------------------------------------------------

interface BrandInfo {
  id: string;
  name: string;
}

async function loadOrCreateBrands(): Promise<Map<string, BrandInfo>> {
  const brandMap = new Map<string, BrandInfo>();
  const snap = await getDocs(query(collection(db, OUTDOOR_BRANDS_COLLECTION), orderBy('name', 'asc')));

  for (const d of snap.docs) {
    const name = String(d.data().name ?? '').trim();
    if (name) brandMap.set(name.toLowerCase(), { id: d.id, name });
  }

  // Auto-create Ludos / Urbanics if missing
  for (const brandName of Object.values(BRAND_MAP)) {
    const key = brandName.toLowerCase();
    if (!brandMap.has(key)) {
      try {
        const docRef = await addDoc(collection(db, OUTDOOR_BRANDS_COLLECTION), {
          name: brandName,
          description: `${brandName} — outdoor equipment manufacturer`,
          logoUrl: '',
          brandColor: brandName === 'Ludos' ? '#1E40AF' : '#0EA5E9',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        brandMap.set(key, { id: docRef.id, name: brandName });
        console.log(`[brands] Auto-created "${brandName}" (${docRef.id})`);
      } catch (err) {
        console.warn(`[brands] Failed to create "${brandName}":`, err);
      }
    }
  }

  return brandMap;
}

function resolveBrand(rawCompanyId: string | number | undefined, brandMap: Map<string, BrandInfo>): { brandName: string; brandId: string | undefined } {
  const cleaned = String(rawCompanyId ?? '').trim().replace(/\.0$/, '');
  console.log('[resolveBrand] raw:', JSON.stringify(rawCompanyId), '→ cleaned:', JSON.stringify(cleaned));

  const mappedName = BRAND_MAP[cleaned];
  if (mappedName) {
    const info = brandMap.get(mappedName.toLowerCase());
    if (info) {
      console.log(`[resolveBrand] ✓ Matched "${cleaned}" → ${mappedName} (${info.id})`);
      return { brandName: info.name, brandId: info.id };
    }
    console.log(`[resolveBrand] ✓ Matched name "${mappedName}" but brand doc missing from brandMap`);
    return { brandName: mappedName, brandId: undefined };
  }

  console.warn(`[resolveBrand] ✗ No match for "${cleaned}" — falling back to "Imported". BRAND_MAP keys: ${Object.keys(BRAND_MAP).join(', ')}`);
  return { brandName: 'Imported', brandId: undefined };
}

// ---------------------------------------------------------------------------
// Firestore Lookups
// ---------------------------------------------------------------------------

async function loadAuthorities(): Promise<Authority[]> {
  const q = query(collection(db, 'authorities'), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => !d.id.includes('__SCHEMA_INIT__'))
    .map((d) => ({ id: d.id, ...d.data() }) as Authority);
}

async function loadGymEquipment(): Promise<GymEquipment[]> {
  const q = query(collection(db, 'gym_equipment'), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GymEquipment);
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function normalizeHe(s: string): string {
  return s.trim().toLowerCase().replace(/[\s\-_]+/g, ' ').replace(/['"״׳]/g, '');
}

function matchAuthority(
  row: CsvParkRow,
  authorities: Authority[],
): { authorityId: string | null; authorityName: string | null } {
  const muniId = String(row.muniid ?? '').trim();

  if (muniId) {
    const byId = authorities.find((a) => a.id === muniId);
    if (byId) return { authorityId: byId.id, authorityName: byId.name };
  }

  const textsToSearch = [
    row.title, row.city, row.address, row.municipality,
    row.muni_name, row.cityname, row.city_name,
  ].filter(Boolean).map((t) => normalizeHe(String(t)));

  if (textsToSearch.length > 0) {
    const sorted = [...authorities].sort((a, b) => b.name.length - a.name.length);
    for (const auth of sorted) {
      const normAuth = normalizeHe(auth.name);
      if (!normAuth) continue;
      for (const text of textsToSearch) {
        if (text.includes(normAuth) || normAuth.includes(text)) {
          return { authorityId: auth.id, authorityName: auth.name };
        }
      }
    }
  }

  const lat = parseFloat(row.latitude);
  const lng = parseFloat(row.longitude);
  if (!isNaN(lat) && !isNaN(lng)) {
    let bestDist = Infinity;
    let bestAuth: Authority | null = null;
    for (const auth of authorities) {
      if (!auth.coordinates?.lat || !auth.coordinates?.lng) continue;
      const d = haversineKm(lat, lng, auth.coordinates.lat, auth.coordinates.lng);
      if (d < bestDist) { bestDist = d; bestAuth = auth; }
    }
    if (bestAuth && bestDist < 20) {
      return { authorityId: bestAuth.id, authorityName: bestAuth.name };
    }
  }

  return { authorityId: null, authorityName: null };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Dual-brand aware equipment matching.
 * Two CSV rows with the same name but different companyid (e.g. Pull-up Bar
 * from Ludos vs. Urbanics) must resolve to DIFFERENT gym_equipment documents.
 */
function matchEquipment(
  csvId: string,
  csvName: string,
  csvBrandName: string,
  existingByName: GymEquipment[],
  existingByExtId: Map<string, ExistingRecord>,
): string | null {
  // Priority 1: previously imported with same CSV ID (guaranteed unique)
  const byExtId = existingByExtId.get(csvId);
  if (byExtId) return byExtId.docId;

  // Priority 2: name+brand match — ensures Ludos and Urbanics variants stay separate
  const norm = normalizeHe(csvName);
  const normBrand = csvBrandName.toLowerCase();

  if (normBrand && normBrand !== 'imported') {
    const byNameAndBrand = existingByName.find((e) =>
      normalizeHe(e.name) === norm &&
      e.brands?.some((b) => b.brandName?.toLowerCase() === normBrand),
    );
    if (byNameAndBrand) return byNameAndBrand.id;
  }

  // Priority 3: name-only fallback (for equipment without brand distinction)
  const byName = existingByName.find((e) => normalizeHe(e.name) === norm);
  return byName?.id ?? null;
}

// ---------------------------------------------------------------------------
// Authority correction — parse city from park title
// ---------------------------------------------------------------------------

/**
 * Extracts city name from titles like "Park Name - City Name" or "Park Name – City Name".
 * Returns the trimmed city portion, or null if no separator found.
 */
function extractCityFromTitle(title: string): string | null {
  const separators = [' - ', ' – ', ' — ', ' ـ '];
  for (const sep of separators) {
    const idx = title.lastIndexOf(sep);
    if (idx > 0) {
      const after = title.slice(idx + sep.length).trim();
      if (after.length >= 2) return after;
    }
  }
  return null;
}

/**
 * If the park title contains a city name after a hyphen, and that city
 * matches a DIFFERENT authority than the one from muniid, prefer the
 * title-based authority.
 */
function correctAuthorityFromTitle(
  title: string,
  currentMatch: { authorityId: string | null; authorityName: string | null },
  authorities: Authority[],
): { authorityId: string | null; authorityName: string | null } {
  const cityFromTitle = extractCityFromTitle(title);
  if (!cityFromTitle) return currentMatch;

  const normCity = normalizeHe(cityFromTitle);
  const sorted = [...authorities].sort((a, b) => b.name.length - a.name.length);

  for (const auth of sorted) {
    const normAuth = normalizeHe(auth.name);
    if (!normAuth) continue;
    if (normCity === normAuth || normCity.includes(normAuth) || normAuth.includes(normCity)) {
      return { authorityId: auth.id, authorityName: auth.name };
    }
  }

  return currentMatch;
}

// ---------------------------------------------------------------------------
// Automated feature tagging from description text
// ---------------------------------------------------------------------------

interface FeatureTagResult {
  featureTags: ParkFeatureTag[];
  isShaded: boolean;
  hasWaterFountain: boolean;
  hasBenches: boolean;
  hasNaturalShade: boolean;
  hasBikeRacks: boolean;
  hasNearbyShelter: boolean;
}

function extractFeatureTags(description: string, title: string): FeatureTagResult {
  const text = `${title} ${description}`.toLowerCase();
  const tags: ParkFeatureTag[] = [];
  let isShaded = false;
  let hasWaterFountain = false;
  let hasBenches = false;
  let hasNaturalShade = false;
  let hasBikeRacks = false;
  let hasNearbyShelter = false;

  if (/\bצל\b|מוצל|מצלה|סככ/.test(text)) {
    tags.push('shaded');
    isShaded = true;
  }

  if (/עצים|צמרת|חורשה|צל טבעי/.test(text)) {
    hasNaturalShade = true;
    if (!isShaded) { tags.push('shaded'); isShaded = true; }
  }

  if (/ברזי[יה]|מזרק[הת]?\b|\bמים\b|water.?fountain|שתיי?ה/.test(text)) {
    tags.push('water_fountain');
    hasWaterFountain = true;
  }

  if (/ספסל|ישיבה|benches?/.test(text)) {
    tags.push('has_benches');
    hasBenches = true;
  }

  if (/תאורה|תאורת|מואר|פנס/.test(text)) {
    tags.push('night_lighting');
  }

  if (/שירותים|שרותים|toilets?/.test(text)) {
    tags.push('has_toilets');
  }

  if (/כלבים|דוג.?פארק|dog.?park|כלב/.test(text)) {
    tags.push('dog_friendly');
  }

  if (/נגיש|wheelchair|כיסא גלגלים/.test(text)) {
    tags.push('wheelchair_accessible');
  }

  if (/ריצפ[הת] גומי|rubber|משטח גומי/.test(text)) {
    tags.push('rubber_floor');
  }

  if (/אופניים|קשירה|סיבוב אופניים|bike.?rack/.test(text)) {
    hasBikeRacks = true;
  }

  if (/מיגונית|מקלט|מרחב מוגן/.test(text)) {
    hasNearbyShelter = true;
    if (!tags.includes('safe_zone')) tags.push('safe_zone');
  }

  return { featureTags: [...new Set(tags)], isShaded, hasWaterFountain, hasBenches, hasNaturalShade, hasBikeRacks, hasNearbyShelter };
}

// ---------------------------------------------------------------------------
// files.csv helpers
// ---------------------------------------------------------------------------

interface ResolvedFile {
  entityId: string;
  url: string;
  type: 'image' | 'video' | 'other';
  isMain: boolean;
}

function resolveFileRow(row: CsvFileRow): ResolvedFile {
  const entityId = String(
    row.parkid ?? row.park_id ?? row.entityid ?? row.entity_id ??
    row.equipmentid ?? row.equipment_id ?? row.objectid ?? row.object_id ?? '',
  ).trim();

  const rawUrl = String(row.url ?? row.file_url ?? row.fileurl ?? row.path ?? row.image ?? row.file ?? row.link ?? '').trim();
  const url = buildPublicUrl(rawUrl);

  const rawType = String(row.type ?? row.filetype ?? row.file_type ?? '').trim().toLowerCase();

  const isMain = rawType === 'park_main' || rawType === 'main' || rawType === 'cover' || rawType === 'thumbnail';

  let type: 'image' | 'video' | 'other' = 'image';
  if (rawType.includes('video') || url.match(/\.(mp4|mov|m4v|webm|avi)(\?|$)/i)) {
    type = 'video';
  } else if (!rawType && !url.match(/\.(jpe?g|png|gif|webp|svg|bmp)(\?|$)/i)) {
    type = 'other';
  }

  return { entityId, url, type, isMain };
}

interface FilesEntry {
  mainImage: string | null;
  images: string[];
  videos: string[];
}

// ---------------------------------------------------------------------------
// Build Preview
// ---------------------------------------------------------------------------

export async function buildImportPreview(
  parksFile: File,
  equipmentFile: File,
  junctionFile: File,
  filesFile?: File | null,
): Promise<ImportPreview> {
  const parsePromises: Promise<unknown[]>[] = [
    parseCSVFile<CsvParkRow>(parksFile),
    parseCSVFile<CsvEquipmentRow>(equipmentFile),
    parseCSVFile<CsvJunctionRow>(junctionFile),
  ];
  if (filesFile) parsePromises.push(parseCSVFile<CsvFileRow>(filesFile));

  const results = await Promise.all(parsePromises);
  const parkRows = results[0] as CsvParkRow[];
  const equipmentRows = results[1] as CsvEquipmentRow[];
  const junctionRows = results[2] as CsvJunctionRow[];
  const fileRows = (results[3] as CsvFileRow[] | undefined) ?? [];

  // ── Step 1: Build junction index + equipment→companyId from junction rows ──
  const junctionIndex = new Map<string, string[]>();
  const junctionCompanyId = new Map<string, string>();
  for (const row of junctionRows) {
    const pid = String(row.parkid).trim();
    const eid = String(row.equipmentid).trim();
    if (!pid || !eid) continue;
    const list = junctionIndex.get(pid) ?? [];
    list.push(eid);
    junctionIndex.set(pid, list);

    if (!junctionCompanyId.has(eid)) {
      const jcid = col(row, 'companyid', 'CompanyId', 'CompanyID', 'company_id', 'COMPANYID');
      if (jcid) junctionCompanyId.set(eid, jcid.replace(/\.0$/, ''));
    }
  }

  // ── Step 2: Build files index + fileById ──────────────────────────────────
  const filesIndex = new Map<string, FilesEntry>();
  const fileById = new Map<string, ResolvedFile>();
  for (const row of fileRows) {
    const resolved = resolveFileRow(row);
    const { entityId, url, type, isMain } = resolved;

    const fileRowId = String(row.id ?? '').trim();
    if (fileRowId && url && !CSV_NULL_VALUES.has(fileRowId)) {
      fileById.set(fileRowId, resolved);
    }

    if (!entityId || !url) continue;
    if (!filesIndex.has(entityId)) filesIndex.set(entityId, { mainImage: null, images: [], videos: [] });
    const bucket = filesIndex.get(entityId)!;
    if (isMain && type !== 'video') {
      bucket.mainImage = url;
    } else if (type === 'video') {
      bucket.videos.push(url);
    } else {
      bucket.images.push(url);
    }
  }

  // ── Build filename → URL reverse index for 404 fallback ──
  const filenameToUrl: Record<string, string> = {};
  for (const row of fileRows) {
    const resolved = resolveFileRow(row);
    if (!resolved.url) continue;
    const basename = resolved.url.split('/').pop()?.split('?')[0]?.toLowerCase();
    if (basename && !filenameToUrl[basename]) filenameToUrl[basename] = resolved.url;
  }
  for (const row of parkRows) {
    const imgRaw = col(row, 'image', 'Image', 'IMAGE', 'photo', 'Photo');
    if (!imgRaw) continue;
    const url = buildPublicUrl(imgRaw);
    if (!url) continue;
    const basename = url.split('/').pop()?.split('?')[0]?.toLowerCase();
    if (basename && !filenameToUrl[basename]) filenameToUrl[basename] = url;
  }

  // Diagnostic: log actual CSV column names so shifted columns are visible
  if (equipmentRows.length > 0) {
    console.log(`[preview] equipment.csv columns: [${Object.keys(equipmentRows[0]).join(', ')}]`);
    console.log(`[preview] equipment.csv row 0 sample:`, JSON.stringify(equipmentRows[0]).slice(0, 400));
  }
  if (junctionRows.length > 0) {
    console.log(`[preview] park_equipment.csv columns: [${Object.keys(junctionRows[0]).join(', ')}]`);
    console.log(`[preview] junction companyId entries: ${junctionCompanyId.size}`);
  }
  if (fileRows.length > 0) {
    console.log(`[preview] files.csv columns: [${Object.keys(fileRows[0]).join(', ')}]`);
    console.log(`[preview] files.csv total rows: ${fileRows.length}, fileById entries: ${fileById.size}`);
  }

  // ── Step 3: Build equipment previews ──────────────────────────────────────
  const [authorities, existingEquipment, existingEqByExtId] = await Promise.all([
    loadAuthorities(),
    loadGymEquipment(),
    loadExistingImported('gym_equipment'),
  ]);

  const equipmentMap = new Map<string, EquipmentPreview>();
  for (const row of equipmentRows) {
    const csvId = String(row.id).trim();
    if (!csvId) continue;

    const companyIdFromEq = col(row, 'companyid', 'CompanyId', 'CompanyID', 'company_id', 'COMPANYID');
    const companyIdFromJunction = junctionCompanyId.get(csvId) ?? '';
    const companyId = (companyIdFromEq || companyIdFromJunction).replace(/\.0$/, '');
    const mappedBrand = BRAND_MAP[companyId] || 'Imported';
    if (!BRAND_MAP[companyId]) {
      console.warn(`[preview] companyId="${companyId}" (eq="${companyIdFromEq}", junction="${companyIdFromJunction}") not in BRAND_MAP for equipment "${row.title}"`);
    }
    const matchedId = matchEquipment(csvId, row.title, mappedBrand, existingEquipment, existingEqByExtId);
    const functionalRaw = String(row.functional ?? '').trim();
    const imageRaw = String(row.image ?? '').trim();
    const imageClean = CSV_NULL_VALUES.has(imageRaw) ? '' : imageRaw;

    // Resolve video: equipment.media → file ID → files.csv lookup → URL
    // Also check additionalmuscles — some CSVs have shifted columns where the media ID ends up there
    const mediaIdRaw = col(row, 'media', 'Media', 'MEDIA', 'mediaid', 'media_id', 'MediaId')
      || col(row, 'additionalmuscles', 'AdditionalMuscles', 'additional_muscles', 'ADDITIONALMUSCLES');
    let videoUrl = '';
    if (mediaIdRaw) {
      const mediaIds = mediaIdRaw.split(',').map((s) => s.trim()).filter((s) => s && !CSV_NULL_VALUES.has(s));
      if (mediaIds.length > 0) {
        console.log(`[preview] Equipment "${row.title}" (${csvId}): media IDs = [${mediaIds.join(', ')}], fileById has ${fileById.size} entries`);
      }
      for (const mid of mediaIds) {
        const fileEntry = fileById.get(mid);
        if (fileEntry && fileEntry.url && fileEntry.type === 'video') {
          videoUrl = fileEntry.url;
          console.log(`[preview]   → matched video (type=video): ${videoUrl}`);
          break;
        }
        if (fileEntry && fileEntry.url && !videoUrl) {
          const ext = fileEntry.url.split('.').pop()?.toLowerCase() ?? '';
          if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) {
            videoUrl = fileEntry.url;
            console.log(`[preview]   → matched video (ext=${ext}): ${videoUrl}`);
            break;
          }
        }
      }
      if (!videoUrl && mediaIds.length > 0) {
        for (const mid of mediaIds) {
          const fileEntry = fileById.get(mid);
          if (fileEntry && fileEntry.url) {
            videoUrl = fileEntry.url;
            console.log(`[preview]   → fallback media file: ${videoUrl}`);
            break;
          }
          if (!fileEntry) {
            console.log(`[preview]   → ID "${mid}" NOT found in files.csv`);
          }
        }
      }
    }

    equipmentMap.set(csvId, {
      csvId,
      name: row.title?.trim() || '',
      image: imageClean ? buildPublicUrl(imageClean) : '',
      video: videoUrl,
      description: String(row.summaryremarks ?? row.summary_remarks ?? row.description ?? '').trim(),
      brandName: mappedBrand,
      companyId,
      isFunctional: functionalRaw === '1' || functionalRaw.toLowerCase() === 'true',
      matchedFirestoreId: matchedId,
      status: matchedId ? 'matched' : 'new',
    });
  }

  // ── Step 4: Build park previews ───────────────────────────────────────────
  // Park previews
  const parks: ParkPreview[] = [];
  for (const row of parkRows) {
    const csvId = String(row.id).trim();
    if (!csvId) continue;

    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    const warnings: string[] = [];

    if (isNaN(lat) || isNaN(lng)) warnings.push('קואורדינטות חסרות או לא תקינות');

    // Authority matching — then correct using city name from title
    let { authorityId, authorityName } = matchAuthority(row, authorities);
    const titleStr = row.title?.trim() || '';
    const corrected = correctAuthorityFromTitle(titleStr, { authorityId, authorityName }, authorities);
    authorityId = corrected.authorityId;
    authorityName = corrected.authorityName;

    if (!authorityId) warnings.push(`muniid "${row.muniid}" — לא נמצאה רשות תואמת`);

    const eqIds = junctionIndex.get(csvId) ?? [];
    const eqPreviews = eqIds.map((eid) => equipmentMap.get(eid)).filter((e): e is EquipmentPreview => !!e);
    const missingEq = eqIds.filter((eid) => !equipmentMap.has(eid));
    if (missingEq.length > 0) warnings.push(`מתקנים חסרים ב-equipment.csv: ${missingEq.join(', ')}`);

    // Image priority: CSV image column → files.csv → equipment images (last resort)
    const mediaEntry = filesIndex.get(csvId);
    const parkImages: string[] = [];

    const csvImageRaw = col(row, 'image', 'Image', 'IMAGE', 'photo', 'Photo');
    if (csvImageRaw) {
      const csvImageUrl = buildPublicUrl(csvImageRaw);
      if (csvImageUrl) parkImages.push(csvImageUrl);
    }

    if (mediaEntry?.mainImage && !parkImages.includes(mediaEntry.mainImage)) {
      parkImages.push(mediaEntry.mainImage);
    }
    if (mediaEntry?.images) {
      for (const img of mediaEntry.images) {
        if (!parkImages.includes(img)) parkImages.push(img);
      }
    }
    const parkOwnImageCount = parkImages.length;
    if (parkOwnImageCount === 0) {
      for (const eq of eqPreviews) {
        if (eq.image && !parkImages.includes(eq.image)) parkImages.push(eq.image);
      }
    }

    const parkVideos: string[] = mediaEntry?.videos ?? [];

    // Park description from CSV
    const description = String(
      row.content ?? row.description ?? row.desc ?? row.details ?? row.summary ?? '',
    ).trim();

    // Feature tagging from description + title
    const tagResult = extractFeatureTags(description, titleStr);

    // Empty parks (no images, no equipment) are valid — status stays 'ready'/'warning'
    const status: RowStatus = warnings.some((w) => w.includes('קואורדינטות'))
      ? 'error' : warnings.length > 0 ? 'warning' : 'ready';

    parks.push({
      csvId,
      name: titleStr,
      description,
      location: { lat: lat || 0, lng: lng || 0 },
      csvMuniId: String(row.muniid).trim(),
      matchedAuthorityId: authorityId,
      matchedAuthorityName: authorityName,
      equipment: eqPreviews,
      images: parkImages,
      parkOwnImageCount,
      videos: parkVideos,
      featureTags: tagResult.featureTags,
      isShaded: tagResult.isShaded,
      hasWaterFountain: tagResult.hasWaterFountain,
      hasBenches: tagResult.hasBenches,
      hasNaturalShade: tagResult.hasNaturalShade,
      hasBikeRacks: tagResult.hasBikeRacks,
      hasNearbyShelter: tagResult.hasNearbyShelter,
      status,
      warnings,
    });
  }

  const allEquipment = Array.from(equipmentMap.values());

  const totalVideos =
    parks.reduce((sum, p) => sum + p.videos.length, 0) +
    allEquipment.filter((e) => e.video).length;

  return {
    parks,
    equipment: allEquipment,
    filenameIndex: filenameToUrl,
    stats: {
      totalParks: parks.length,
      readyParks: parks.filter((p) => p.status === 'ready').length,
      warningParks: parks.filter((p) => p.status === 'warning').length,
      errorParks: parks.filter((p) => p.status === 'error').length,
      totalEquipment: allEquipment.length,
      matchedEquipment: allEquipment.filter((e) => e.status === 'matched').length,
      newEquipment: allEquipment.filter((e) => e.status === 'new').length,
      totalVideos,
    },
  };
}

// ---------------------------------------------------------------------------
// Execute Import — idempotent with media migration & brand linking
// ---------------------------------------------------------------------------

export async function executeImport(
  preview: ImportPreview,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const errors: string[] = [];
  let createdEquipment = 0;
  let updatedEquipment = 0;
  let createdParks = 0;
  let updatedParks = 0;
  let migratedMedia = 0;
  let migratedVideos = 0;
  let skippedMedia = 0;

  const equipmentIdMap = new Map<string, string>();

  // ── Phase 0: Load existing records + brands ────────────────────────────
  onProgress?.({ phase: 'אתחול', current: 0, total: 3, detail: 'טוען רשומות קיימות...' });

  const [existingEquipment, existingParks, brandMap] = await Promise.all([
    loadExistingImported('gym_equipment'),
    loadExistingImported('parks'),
    loadOrCreateBrands(),
  ]);

  onProgress?.({
    phase: 'אתחול',
    current: 3,
    total: 3,
    detail: `${existingEquipment.size} מתקנים, ${existingParks.size} פארקים, ${brandMap.size} מותגים`,
  });

  const totalEq = preview.equipment.filter((e) => !e.matchedFirestoreId).length;
  const totalParks = preview.parks.filter((p) => p.status !== 'error').length;

  // ── Phase 1: Create or update equipment ────────────────────────────────
  let eqIdx = 0;
  for (const eq of preview.equipment) {
    // If matched by name/externalSourceId from preview, map the ID directly
    if (eq.matchedFirestoreId) {
      equipmentIdMap.set(eq.csvId, eq.matchedFirestoreId);

      const { brandName, brandId } = resolveBrand(eq.companyId, brandMap);
      const resolvedBrandName = brandName || eq.brandName;

      try {
        // Read the existing document to preserve Firebase Storage images
        const existingSnap = await getDoc(doc(db, 'gym_equipment', eq.matchedFirestoreId));
        const existingData = existingSnap.data();
        const existingBrands: EquipmentBrand[] = existingData?.brands ?? [];
        const existingImageUrl = existingBrands[0]?.imageUrl || '';
        const existingVideoUrl = existingBrands[0]?.videoUrl || '';

        const updateData: Record<string, unknown> = {
          description: eq.description || existingData?.description || '',
          isFunctional: eq.isFunctional,
          externalSourceId: eq.csvId,
          importedFrom: 'csv_bulk_import',
          updatedAt: serverTimestamp(),
        };

        // Always set the correct brand — preserve Firebase Storage media if available
        const imageUrl = isAlreadyMigrated(existingImageUrl) ? existingImageUrl : (eq.image || existingImageUrl || '');
        let videoUrl = isAlreadyMigrated(existingVideoUrl) ? existingVideoUrl : (eq.video || existingVideoUrl || '');
        const brand: EquipmentBrand = {
          brandName: resolvedBrandName,
          brandId,
          imageUrl,
          videoUrl,
        };
        updateData.brands = [brand];

        await updateDoc(doc(db, 'gym_equipment', eq.matchedFirestoreId), stripUndefined(updateData));

        if (videoUrl && !isAlreadyMigrated(videoUrl)) {
          const ext = getExtFromUrl(videoUrl);
          const migratedVideoUrl = await migrateFileToStorage(videoUrl, `equipment/${eq.matchedFirestoreId}/video.${ext}`);
          if (migratedVideoUrl) {
            videoUrl = migratedVideoUrl;
            await updateDoc(doc(db, 'gym_equipment', eq.matchedFirestoreId), stripUndefined({
              brands: [{ ...brand, videoUrl: migratedVideoUrl }],
            }));
            migratedMedia++;
            migratedVideos++;
            console.log(`[equipment] Migrated video for matched "${eq.name}"`);
          }
        }

        updatedEquipment++;
        console.log(`[equipment] Updated "${eq.name}" → brand: ${resolvedBrandName}, id: ${eq.matchedFirestoreId}`);
      } catch (err) {
        console.warn(`[equipment] Failed to update matched "${eq.name}":`, err);
      }
      continue;
    }

    eqIdx++;
    const existing = existingEquipment.get(eq.csvId);
    const verb = existing ? 'מעדכן' : 'יוצר';
    onProgress?.({ phase: 'מתקנים', current: eqIdx, total: totalEq, detail: `${verb}: ${eq.name}` });

    try {
      const eqDocId = existing?.docId ?? null;

      // Resolve brand with doc ID
      const { brandName, brandId } = resolveBrand(eq.companyId, brandMap);

      // Migrate equipment image & video — preserve existing Firebase media if available
      let imageUrl = eq.image || '';
      let videoUrl = eq.video || '';
      if (eqDocId) {
        const existingSnap = await getDoc(doc(db, 'gym_equipment', eqDocId));
        const existingBrands: EquipmentBrand[] = existingSnap.data()?.brands ?? [];
        if (existingBrands[0]?.imageUrl && isAlreadyMigrated(existingBrands[0].imageUrl)) {
          imageUrl = existingBrands[0].imageUrl;
          skippedMedia++;
        }
        if (existingBrands[0]?.videoUrl && isAlreadyMigrated(existingBrands[0].videoUrl)) {
          videoUrl = existingBrands[0].videoUrl;
          skippedMedia++;
        }
      }
      if (imageUrl && !isAlreadyMigrated(imageUrl)) {
        const targetId = eqDocId ?? `eq_${eq.csvId}_${Date.now()}`;
        const ext = getExtFromUrl(imageUrl);
        const newUrl = await migrateFileToStorage(imageUrl, `equipment/${targetId}/image.${ext}`);
        if (newUrl) { imageUrl = newUrl; migratedMedia++; }
      } else if (imageUrl && isAlreadyMigrated(imageUrl) && !eqDocId) {
        skippedMedia++;
      }
      if (videoUrl && !isAlreadyMigrated(videoUrl)) {
        const targetId = eqDocId ?? `eq_${eq.csvId}_${Date.now()}`;
        const ext = getExtFromUrl(videoUrl);
        const newUrl = await migrateFileToStorage(videoUrl, `equipment/${targetId}/video.${ext}`);
        if (newUrl) { videoUrl = newUrl; migratedMedia++; migratedVideos++; console.log(`[equipment] Migrated video for "${eq.name}"`); }
      } else if (videoUrl && isAlreadyMigrated(videoUrl) && !eqDocId) {
        skippedMedia++;
      }

      const brand: EquipmentBrand = { brandName, brandId, imageUrl, videoUrl };

      const eqData = {
        name: eq.name,
        type: 'reps' as const,
        recommendedLevel: 1,
        isFunctional: eq.isFunctional,
        muscleGroups: ['full_body'],
        brands: [brand],
        description: eq.description || '',
        availableInLocations: ['park'],
        defaultLocation: 'park',
        externalSourceId: eq.csvId,
        importedFrom: 'csv_bulk_import',
        updatedAt: serverTimestamp(),
      };

      if (eqDocId) {
        await setDoc(doc(db, 'gym_equipment', eqDocId), stripUndefined(eqData), { merge: true });

        if (eq.image && imageUrl !== eq.image && !isAlreadyMigrated(imageUrl)) {
          const ext = getExtFromUrl(eq.image);
          const properUrl = await migrateFileToStorage(eq.image, `equipment/${eqDocId}/image.${ext}`);
          if (properUrl) {
            await updateDoc(doc(db, 'gym_equipment', eqDocId), stripUndefined({
              brands: [{ ...brand, imageUrl: properUrl }],
            }));
          }
        }

        equipmentIdMap.set(eq.csvId, eqDocId);
        updatedEquipment++;
      } else {
        const docRef = await addDoc(collection(db, 'gym_equipment'), stripUndefined({
          ...eqData,
          createdAt: serverTimestamp(),
        }));

        if (eq.image && imageUrl !== eq.image && !isAlreadyMigrated(imageUrl)) {
          const ext = getExtFromUrl(eq.image);
          const properUrl = await migrateFileToStorage(eq.image, `equipment/${docRef.id}/image.${ext}`);
          if (properUrl) {
            await updateDoc(doc(db, 'gym_equipment', docRef.id), stripUndefined({
              brands: [{ ...brand, imageUrl: properUrl }],
            }));
          }
        }

        equipmentIdMap.set(eq.csvId, docRef.id);
        createdEquipment++;
      }
    } catch (err) {
      errors.push(`שגיאה ב${existing ? 'עדכון' : 'יצירת'} מתקן "${eq.name}": ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Phase 2: Create or update parks in batches of 100 ──────────────────
  const eligibleParks = preview.parks.filter((p) => p.status !== 'error');
  const PARK_BATCH = 100;

  for (let batchStart = 0; batchStart < eligibleParks.length; batchStart += PARK_BATCH) {
    const batchSlice = eligibleParks.slice(batchStart, batchStart + PARK_BATCH);
    const batchNum = Math.floor(batchStart / PARK_BATCH) + 1;
    const totalBatches = Math.ceil(eligibleParks.length / PARK_BATCH);

    onProgress?.({
      phase: 'פארקים',
      current: batchStart,
      total: totalParks,
      detail: `אצווה ${batchNum}/${totalBatches}`,
    });

    // Resolve doc IDs: reuse existing or pre-allocate new
    const parkEntries: Array<{
      park: ParkPreview;
      docId: string;
      isUpdate: boolean;
      gymEquipment: ParkGymEquipment[];
      existingImages: string[];
      mainImage?: string | null;
    }> = [];

    for (const park of batchSlice) {
      const existing = existingParks.get(park.csvId);
      const docId = existing?.docId ?? doc(collection(db, 'parks')).id;

      const gymEquipment: ParkGymEquipment[] = [];
      for (const eq of park.equipment) {
        const firestoreId = equipmentIdMap.get(eq.csvId);
        if (firestoreId) {
          const { brandName } = resolveBrand(eq.companyId, brandMap);
          gymEquipment.push({ equipmentId: firestoreId, brandName: brandName || eq.brandName });
        }
      }

      parkEntries.push({
        park,
        docId,
        isUpdate: !!existing,
        gymEquipment,
        existingImages: existing?.images ?? [],
      });
    }

    // Migrate media for this batch (park images only — equipment images handled separately)
    const fnIndex = preview.filenameIndex ?? {};

    for (let i = 0; i < parkEntries.length; i++) {
      const { park, docId, existingImages } = parkEntries[i];
      const globalIdx = batchStart + i + 1;

      const existingFirebaseUrls = existingImages.filter(isAlreadyMigrated);

      // Always attempt to migrate CSV images — even if Firestore already has some
      const uniqueSources = [...new Set(park.images)];
      const parkOwnSources = uniqueSources.slice(0, park.parkOwnImageCount);
      const eqFallbackSources = uniqueSources.slice(park.parkOwnImageCount);

      const parkOwnMigrated: string[] = [...existingFirebaseUrls];
      const eqFallbackMigrated: string[] = [];

      for (let j = 0; j < parkOwnSources.length; j++) {
        const src = parkOwnSources[j];
        if (isAlreadyMigrated(src)) {
          if (!parkOwnMigrated.includes(src)) parkOwnMigrated.push(src);
          skippedMedia++;
          continue;
        }
        onProgress?.({
          phase: 'מדיה',
          current: migratedMedia + 1,
          total: migratedMedia + (parkOwnSources.length - j),
          detail: `פארק ${globalIdx}/${totalParks} — תמונת פארק ${j + 1}/${parkOwnSources.length}`,
        });

        const basename = src.split('/').pop()?.split('?')[0]?.toLowerCase() ?? '';
        const fallbacks: string[] = [];
        if (basename && fnIndex[basename] && fnIndex[basename] !== src) {
          fallbacks.push(fnIndex[basename]);
        }

        const ext = getExtFromUrl(src);
        const newUrl = await migrateFileToStorage(src, `parks/${docId}/images/park_${j}.${ext}`, fallbacks);
        parkOwnMigrated.push(newUrl ?? src);
        if (newUrl) migratedMedia++;
      }

      for (let j = 0; j < eqFallbackSources.length; j++) {
        const src = eqFallbackSources[j];
        if (isAlreadyMigrated(src)) {
          eqFallbackMigrated.push(src);
          skippedMedia++;
          continue;
        }

        const basename = src.split('/').pop()?.split('?')[0]?.toLowerCase() ?? '';
        const fallbacks: string[] = [];
        if (basename && fnIndex[basename] && fnIndex[basename] !== src) {
          fallbacks.push(fnIndex[basename]);
        }

        const ext = getExtFromUrl(src);
        const newUrl = await migrateFileToStorage(src, `parks/${docId}/images/eq_${j}.${ext}`, fallbacks);
        eqFallbackMigrated.push(newUrl ?? src);
        if (newUrl) migratedMedia++;
      }

      // Migrate videos
      const migratedParkVideos: string[] = [];
      for (let v = 0; v < park.videos.length; v++) {
        const src = park.videos[v];
        if (isAlreadyMigrated(src)) {
          migratedParkVideos.push(src);
          skippedMedia++;
          continue;
        }
        const ext = getExtFromUrl(src);
        const newUrl = await migrateFileToStorage(src, `parks/${docId}/videos/${v}.${ext}`);
        migratedParkVideos.push(newUrl ?? src);
        if (newUrl) { migratedMedia++; migratedVideos++; }
      }

      // Compose final images: park-own first, then equipment fallback
      const migratedUrls = [...parkOwnMigrated, ...eqFallbackMigrated];

      let mainImage: string | null = null;
      if (parkOwnMigrated.length > 0) {
        mainImage = parkOwnMigrated.find(isAlreadyMigrated) || parkOwnMigrated[0];
      } else {
        mainImage = migratedUrls.find(isAlreadyMigrated) || migratedUrls[0] || null;
      }

      parkEntries[i] = {
        ...parkEntries[i],
        park: { ...park, images: migratedUrls, videos: migratedParkVideos },
        mainImage,
      };
    }

    // Batch-write parks
    const batch = writeBatch(db);
    let batchCreated = 0;
    let batchUpdated = 0;

    for (const { park, docId, isUpdate, gymEquipment, mainImage } of parkEntries) {
      const parkIsFunctional = park.equipment.length > 0
        ? park.equipment.some((eq) => eq.isFunctional)
        : false;

      const parkData: Record<string, unknown> = {
        name: park.name,
        city: park.matchedAuthorityName || '',
        description: park.description,
        location: park.location,
        facilityType: 'gym_park' as const,
        sportTypes: ['calisthenics', 'functional'],
        featureTags: park.featureTags,
        facilities: [],
        gymEquipment,
        amenities: null,
        authorityId: park.matchedAuthorityId || null,
        isFunctional: parkIsFunctional,
        isShaded: park.isShaded || null,
        hasNaturalShade: park.hasNaturalShade || null,
        hasWaterFountain: park.hasWaterFountain || null,
        hasBikeRacks: park.hasBikeRacks || null,
        hasNearbyShelter: park.hasNearbyShelter || null,
        status: 'open' as const,
        contentStatus: 'published' as const,
        published: true,
        publishedAt: serverTimestamp(),
        images: park.images,
        image: mainImage ?? park.images[0] ?? null,
        videos: park.videos,
        externalSourceId: park.csvId,
        importedFrom: 'csv_bulk_import',
        updatedAt: serverTimestamp(),
      };

      if (!isUpdate) parkData.createdAt = serverTimestamp();

      batch.set(doc(db, 'parks', docId), stripUndefined(parkData), { merge: true });
      if (isUpdate) batchUpdated++; else batchCreated++;
    }

    try {
      await batch.commit();
      createdParks += batchCreated;
      updatedParks += batchUpdated;
    } catch (err) {
      errors.push(`שגיאת batch ${batchNum}: ${err instanceof Error ? err.message : err}`);
    }

    onProgress?.({
      phase: 'פארקים',
      current: batchStart + batchSlice.length,
      total: totalParks,
      detail: `אצווה ${batchNum}/${totalBatches} הושלמה`,
    });
  }

  const skipped = preview.parks.filter((p) => p.status === 'error');
  for (const p of skipped) {
    errors.push(`דילוג על "${p.name}" (שגיאת אימות)`);
  }

  onProgress?.({
    phase: 'הושלם',
    current: totalParks,
    total: totalParks,
    detail: `${createdParks} חדשים, ${updatedParks} עודכנו, ${migratedMedia} מדיה, ${skippedMedia} דולגו`,
  });

  return {
    success: errors.length === 0,
    createdEquipment,
    updatedEquipment,
    createdParks,
    updatedParks,
    migratedMedia,
    migratedVideos,
    skippedMedia,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Manual Authority Override
// ---------------------------------------------------------------------------

export function overrideAuthority(
  preview: ImportPreview,
  parkCsvId: string,
  authorityId: string,
  authorityName: string,
): ImportPreview {
  const updated = {
    ...preview,
    parks: preview.parks.map((p) => {
      if (p.csvId !== parkCsvId) return p;
      const newWarnings = p.warnings.filter((w) => !w.includes('muniid') && !w.includes('רשות'));
      return {
        ...p,
        matchedAuthorityId: authorityId,
        matchedAuthorityName: authorityName,
        warnings: newWarnings,
        status: newWarnings.some((w) => w.includes('קואורדינטות'))
          ? 'error' as const : newWarnings.length > 0 ? 'warning' as const : 'ready' as const,
      };
    }),
  };
  return { ...updated, stats: recalcStats(updated) };
}

function recalcStats(preview: ImportPreview): ImportPreview['stats'] {
  const { parks, equipment: eq } = preview;
  const totalVideos =
    parks.reduce((sum, p) => sum + p.videos.length, 0) +
    eq.filter((e) => e.video).length;
  return {
    totalParks: parks.length,
    readyParks: parks.filter((p) => p.status === 'ready').length,
    warningParks: parks.filter((p) => p.status === 'warning').length,
    errorParks: parks.filter((p) => p.status === 'error').length,
    totalEquipment: eq.length,
    matchedEquipment: eq.filter((e) => e.status === 'matched').length,
    newEquipment: eq.filter((e) => e.status === 'new').length,
    totalVideos,
  };
}

// ---------------------------------------------------------------------------
// Bulk Upload Local Media — browser sends files directly to Firebase Storage
// ---------------------------------------------------------------------------

export interface BulkUploadProgress {
  phase: 'scanning' | 'uploading' | 'done';
  current: number;
  total: number;
  detail: string;
}

export interface BulkUploadResult {
  uploaded: number;
  skipped: number;
  notMatched: number;
  errors: string[];
}

export async function bulkUploadLocalMedia(
  files: FileList,
  onProgress?: (p: BulkUploadProgress) => void,
): Promise<BulkUploadResult> {
  const result: BulkUploadResult = { uploaded: 0, skipped: 0, notMatched: 0, errors: [] };

  onProgress?.({ phase: 'scanning', current: 0, total: 0, detail: 'סורק קבצי מדיה...' });

  const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
  const videoExts = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi']);

  const mediaFiles: File[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (imageExts.has(ext) || videoExts.has(ext)) {
      mediaFiles.push(f);
    }
  }

  onProgress?.({
    phase: 'scanning',
    current: 0,
    total: mediaFiles.length,
    detail: `נמצאו ${mediaFiles.length} קבצי מדיה מתוך ${files.length} קבצים`,
  });

  if (mediaFiles.length === 0) return result;

  const parksByExtId = new Map<string, { docId: string; image?: string; images?: string[] }>();
  const eqByExtId = new Map<string, { docId: string; brands?: Array<{ imageUrl?: string; videoUrl?: string; brandName?: string }> }>();

  const [parkSnap, eqSnap] = await Promise.all([
    getDocs(query(collection(db, 'parks'), where('externalSourceId', '!=', ''))),
    getDocs(query(collection(db, 'gym_equipment'), where('externalSourceId', '!=', ''))),
  ]);

  for (const d of parkSnap.docs) {
    const data = d.data();
    if (data.externalSourceId) {
      parksByExtId.set(String(data.externalSourceId), {
        docId: d.id,
        image: data.image ?? data.imageUrl ?? '',
        images: data.images ?? [],
      });
    }
  }
  for (const d of eqSnap.docs) {
    const data = d.data();
    if (data.externalSourceId) {
      eqByExtId.set(String(data.externalSourceId), {
        docId: d.id,
        brands: data.brands ?? [],
      });
    }
  }

  const filenameToParks = new Map<string, Array<{ docId: string; field: 'image' }>>();
  const filenameToEq = new Map<string, Array<{ docId: string; type: 'image' | 'video' }>>();

  for (const [, park] of parksByExtId) {
    const allUrls = [park.image, ...(park.images ?? [])].filter(Boolean) as string[];
    for (const url of allUrls) {
      if (isAlreadyMigrated(url)) continue;
      const basename = url.split('/').pop()?.split('?')[0]?.toLowerCase();
      if (!basename) continue;
      const list = filenameToParks.get(basename) ?? [];
      list.push({ docId: park.docId, field: 'image' });
      filenameToParks.set(basename, list);
    }
  }

  for (const [, eq] of eqByExtId) {
    for (const brand of eq.brands ?? []) {
      if (brand.imageUrl && !isAlreadyMigrated(brand.imageUrl)) {
        const bn = brand.imageUrl.split('/').pop()?.split('?')[0]?.toLowerCase();
        if (bn) {
          const list = filenameToEq.get(bn) ?? [];
          list.push({ docId: eq.docId, type: 'image' });
          filenameToEq.set(bn, list);
        }
      }
      if (brand.videoUrl && !isAlreadyMigrated(brand.videoUrl)) {
        const bn = brand.videoUrl.split('/').pop()?.split('?')[0]?.toLowerCase();
        if (bn) {
          const list = filenameToEq.get(bn) ?? [];
          list.push({ docId: eq.docId, type: 'video' });
          filenameToEq.set(bn, list);
        }
      }
    }
  }

  onProgress?.({
    phase: 'scanning',
    current: 0,
    total: mediaFiles.length,
    detail: `${filenameToParks.size} שמות תואמים לפארקים, ${filenameToEq.size} למתקנים`,
  });

  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    const basename = file.name.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isImage = imageExts.has(ext);
    const isVideo = videoExts.has(ext);

    onProgress?.({
      phase: 'uploading',
      current: i + 1,
      total: mediaFiles.length,
      detail: file.name,
    });

    const parkMatches = filenameToParks.get(basename);
    const eqMatches = filenameToEq.get(basename);

    if (!parkMatches && !eqMatches) {
      result.notMatched++;
      continue;
    }

    try {
      const arrayBuf = await file.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: guessMimeType(ext) });

      if (parkMatches && isImage) {
        for (const match of parkMatches) {
          const storagePath = `parks/${match.docId}/images/local_${basename}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, blob, { contentType: guessMimeType(ext) });
          const downloadUrl = await getDownloadURL(storageRef);

          const parkDoc = await getDoc(doc(db, 'parks', match.docId));
          const existingImages: string[] = parkDoc.data()?.images ?? [];
          const firebaseImages = existingImages.filter(isAlreadyMigrated);

          await updateDoc(doc(db, 'parks', match.docId), stripUndefined({
            image: downloadUrl,
            images: [downloadUrl, ...firebaseImages],
            updatedAt: serverTimestamp(),
          }));

          result.uploaded++;
          console.log(`[bulk] Uploaded park image: ${file.name} → ${match.docId}`);
        }
      }

      if (eqMatches) {
        for (const match of eqMatches) {
          if ((match.type === 'image' && !isImage) || (match.type === 'video' && !isVideo)) continue;

          const suffix = match.type === 'video' ? 'video' : 'image';
          const storagePath = `equipment/${match.docId}/${suffix}.${ext}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, blob, { contentType: guessMimeType(ext) });
          const downloadUrl = await getDownloadURL(storageRef);

          const eqDoc = await getDoc(doc(db, 'gym_equipment', match.docId));
          const brands: Array<Record<string, unknown>> = eqDoc.data()?.brands ?? [];
          if (brands.length > 0) {
            const field = match.type === 'video' ? 'videoUrl' : 'imageUrl';
            brands[0][field] = downloadUrl;
            await updateDoc(doc(db, 'gym_equipment', match.docId), stripUndefined({
              brands,
              updatedAt: serverTimestamp(),
            }));
          }

          result.uploaded++;
          console.log(`[bulk] Uploaded equipment ${match.type}: ${file.name} → ${match.docId}`);
        }
      }
    } catch (err) {
      result.errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`[bulk] Error uploading ${file.name}:`, err);
    }
  }

  onProgress?.({
    phase: 'done',
    current: mediaFiles.length,
    total: mediaFiles.length,
    detail: `${result.uploaded} הועלו, ${result.skipped} דולגו, ${result.notMatched} ללא התאמה`,
  });

  return result;
}
