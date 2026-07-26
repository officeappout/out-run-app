/**
 * Firestore Service for Managing Program Level Settings
 * 
 * This service manages the metadata configuration for each level within a program.
 * It does NOT handle exercise assignment - that remains in the Exercise Management page.
 */
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ProgramLevelSettings, ProgramLevelSettingsWithProgram } from './program.types';
import { getAllPrograms } from './program.service';
import { genPerfRead, isGenVerboseEnabled } from '@/lib/gen-perf';
import { PLS_CACHE_ENABLED } from '@/config/feature-flags';

const PROGRAM_LEVEL_SETTINGS_COLLECTION = 'programLevelSettings';

// ─────────────────────────────────────────────────────────────────────────────
// #1 — Short-lived read cache + dedup for getProgramLevelSetting
// ─────────────────────────────────────────────────────────────────────────────
// Keyed by the composite doc id (`{programId}_level_{N}`) which is USER-INDEPENDENT,
// so there is no cross-user contamination (the same program+level always resolves
// to the same settings regardless of who is generating). Caches BOTH hits and
// misses (null), so the many "no document" reads stop round-tripping too.
//
// Freshness (admin edits MUST reflect):
//   (1) invalidate-on-write — save/delete evict the doc's entry in the SAME process
//       immediately (see saveProgramLevelSettings / delete* below).
//   (2) short TTL — bounds cross-process staleness (panel edits vs mobile-app reads).
//
// Output-parity: within one generation the cache is populated by fresh reads, so
// every consumer sees current data — identical to the no-cache path. Gated by
// PLS_CACHE_ENABLED (+ runtime A/B override) so flag-OFF is byte-identical to today.
const PLS_CACHE_TTL_MS = 30_000;
const _plsCache = new Map<string, { value: ProgramLevelSettings | null; ts: number }>();

/** Compile-time flag with an optional runtime A/B override (device-friendly). */
export function isPlsCacheEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('OUT_PLS_CACHE');
      if (ls === '0' || ls === 'false') return false;
      if (ls === '1' || ls === 'true') return true;
    } catch {
      /* private mode — ignore */
    }
  }
  return PLS_CACHE_ENABLED;
}

/** Returns a wrapped entry when a fresh cache hit exists; undefined otherwise. */
function plsCacheGet(key: string): { value: ProgramLevelSettings | null } | undefined {
  if (!isPlsCacheEnabled()) return undefined;
  const hit = _plsCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > PLS_CACHE_TTL_MS) {
    _plsCache.delete(key);
    return undefined;
  }
  return { value: hit.value };
}

function plsCacheSet(key: string, value: ProgramLevelSettings | null): void {
  if (!isPlsCacheEnabled()) return;
  _plsCache.set(key, { value, ts: Date.now() });
}

/** Evict a single doc from the read cache. Always runs (write path), flag-independent. */
export function invalidateProgramLevelSetting(programId: string, levelNumber: number): void {
  _plsCache.delete(generateSettingsId(programId, levelNumber));
}

/** Test-only: clear the entire read cache between unit tests. */
export function __clearPlsCacheForTests(): void {
  _plsCache.clear();
}

/**
 * Strip undefined values from an object before writing to Firestore.
 * Firebase throws if any field value is `undefined`.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

/**
 * Convert Firestore timestamp, Unix epoch, or date string to Date.
 */
function toDate(timestamp: unknown): Date | undefined {
  if (timestamp == null) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
    return (timestamp as Timestamp).toDate();
  }
  return undefined;
}

/**
 * Generate a composite ID for program level settings
 * Format: {programId}_level_{levelNumber}
 */
function generateSettingsId(programId: string, levelNumber: number): string {
  return `${programId}_level_${levelNumber}`;
}

/**
 * Get all program level settings
 */
export async function getAllProgramLevelSettings(): Promise<ProgramLevelSettings[]> {
  try {
    const q = query(
      collection(db, PROGRAM_LEVEL_SETTINGS_COLLECTION), 
      orderBy('programId', 'asc'),
      orderBy('levelNumber', 'asc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as ProgramLevelSettings));
  } catch (error) {
    console.error('Error fetching program level settings:', error);
    throw error;
  }
}

/**
 * Get all program level settings with resolved program names
 */
export async function getAllProgramLevelSettingsWithPrograms(): Promise<ProgramLevelSettingsWithProgram[]> {
  try {
    const [settings, programs] = await Promise.all([
      getAllProgramLevelSettings(),
      getAllPrograms()
    ]);
    
    const programMap = new Map(programs.map(p => [p.id, p.name]));
    
    return settings.map(setting => ({
      ...setting,
      programName: programMap.get(setting.programId) || 'Unknown Program'
    }));
  } catch (error) {
    console.error('Error fetching program level settings with programs:', error);
    throw error;
  }
}

/**
 * Get all level settings for a specific program
 */
export async function getProgramLevelSettingsByProgram(programId: string): Promise<ProgramLevelSettings[]> {
  try {
    const q = query(
      collection(db, PROGRAM_LEVEL_SETTINGS_COLLECTION),
      where('programId', '==', programId),
      orderBy('levelNumber', 'asc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as ProgramLevelSettings));
  } catch (error) {
    console.error('Error fetching program level settings by program:', error);
    throw error;
  }
}

/**
 * Get a single program level setting
 */
export async function getProgramLevelSetting(
  programId: string, 
  levelNumber: number
): Promise<ProgramLevelSettings | null> {
  const settingsId = generateSettingsId(programId, levelNumber);

  // #1: serve from the short-lived cache when fresh (hits AND negative-cached misses).
  // The returned object is a SHARED reference — consumers must treat it as read-only
  // (same contract as getCachedPrograms). Current consumers only read it.
  const cached = plsCacheGet(settingsId);
  if (cached) {
    genPerfRead('programLevelSettings:cached'); // #0: cache hit — no round-trip
    return cached.value;
  }

  try {
    const docRef = doc(db, PROGRAM_LEVEL_SETTINGS_COLLECTION, settingsId);
    const docSnap = await getDoc(docRef);
    genPerfRead('programLevelSettings'); // #0: real getDoc (hit OR miss)

    if (!docSnap.exists()) {
      plsCacheSet(settingsId, null); // negative-cache the miss so it stops round-tripping
      return null;
    }

    const rawData = docSnap.data();

    // ── RAW DOC DEBUG — log ALL field keys so we know exactly what Firestore ──
    // stored.  A narrow field-specific log showed "{}" because JSON.stringify
    // omits undefined values; logging every key avoids that blind spot.
    // #6: gated behind GEN_VERBOSE — this fired per-doc (up to ~14×/generation)
    // and built a keys string + a JSON.stringify for EVERY read. Off by default.
    if (isGenVerboseEnabled()) {
      console.log(
        `[ProgramLevelSettings][RAW] "${docSnap.id}" — keys: [${Object.keys(rawData).join(', ')}]`,
      );
      // Also log the full subset of protocol-related fields (using JSON.stringify
      // safe-value so undefined shows as the string "undefined" instead of vanishing).
      const protocolFields: Record<string, unknown> = {};
      for (const k of Object.keys(rawData)) {
        if (
          k.toLowerCase().includes('protocol') ||
          k.toLowerCase().includes('superset') ||
          k.toLowerCase().includes('emom') ||
          k.toLowerCase().includes('pyramid') ||
          k.toLowerCase().includes('allow') ||
          k.toLowerCase().includes('probability')
        ) {
          protocolFields[k] = rawData[k];
        }
      }
      console.log(
        `[ProgramLevelSettings][RAW] "${docSnap.id}" — protocol fields:`,
        Object.keys(protocolFields).length > 0
          ? JSON.stringify(protocolFields, (_k, v) => (v === undefined ? '__undefined__' : v))
          : '(none found — document has no protocol-related fields)',
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Legacy + alias field normalisation ───────────────────────────────
    // Support every field name variant we've ever shipped or might encounter:
    //   preferredProtocols (current canonical)
    //   protocols / enabledProtocols / activeProtocols / allowedProtocols (aliases)
    //   allowSupersets / allowEMOM / allowPyramid (legacy booleans)
    const rawProtocolsArray: unknown =
      rawData['preferredProtocols'] ??
      rawData['protocols'] ??
      rawData['enabledProtocols'] ??
      rawData['activeProtocols'] ??
      rawData['allowedProtocols'];

    let preferredProtocols: ProgramLevelSettings['preferredProtocols'] =
      Array.isArray(rawProtocolsArray) && rawProtocolsArray.length > 0
        ? (rawProtocolsArray as ProgramLevelSettings['preferredProtocols'])
        : undefined;

    if (!preferredProtocols?.length) {
      const built: ProgramLevelSettings['preferredProtocols'] = [];
      if (rawData['allowSupersets'] === true)  built.push('antagonist_pair');
      if (rawData['allowEMOM']      === true)  built.push('emom');
      if (rawData['allowPyramid']   === true)  built.push('pyramid');
      if (built.length) {
        preferredProtocols = built;
        console.log(
          `[ProgramLevelSettings] Legacy→canonical: "${docSnap.id}" ` +
          `allowSupersets=${rawData['allowSupersets']} allowEMOM=${rawData['allowEMOM']} ` +
          `allowPyramid=${rawData['allowPyramid']} → preferredProtocols=[${built.join(', ')}]`,
        );
      }
    }

    let protocolProbability: number | undefined = rawData['protocolProbability'];
    if (protocolProbability == null) {
      const raw = rawData['probability'];
      if (typeof raw === 'number') {
        // Guard: values > 1 were stored as whole-number percentages (e.g. 20 → 0.20).
        protocolProbability = raw > 1 ? raw / 100 : raw;
        console.log(
          `[ProgramLevelSettings] Legacy→canonical: "${docSnap.id}" ` +
          `probability=${raw} → protocolProbability=${protocolProbability}`,
        );
      }
    } else if (protocolProbability > 1) {
      // Stored as integer percentage even in the new field — normalise.
      protocolProbability = protocolProbability / 100;
    }
    // ─────────────────────────────────────────────────────────────────────

    const result = {
      id: docSnap.id,
      ...rawData,
      ...(preferredProtocols  !== undefined ? { preferredProtocols }  : {}),
      ...(protocolProbability !== undefined ? { protocolProbability } : {}),
      createdAt: toDate(rawData['createdAt']),
      updatedAt: toDate(rawData['updatedAt']),
    } as ProgramLevelSettings;
    plsCacheSet(settingsId, result);
    return result;
  } catch (error) {
    console.error('Error fetching program level setting:', error);
    throw error;
  }
}

/**
 * Normalize incoming data from import/sync (JSON/CSV).
 * Maps external field names (e.g. hardCap) to our schema (maxSets).
 * Use before saveProgramLevelSettings when importing from external sources.
 */
export function normalizeImportData<T extends Record<string, unknown>>(
  raw: T & { maxSets?: number; hardCap?: number | string }
): T & { maxSets?: number } {
  const maxSets = raw.maxSets ?? raw.hardCap;
  const numeric =
    typeof maxSets === 'number' ? maxSets : typeof maxSets === 'string' ? parseInt(maxSets, 10) : undefined;
  const resolved = !isNaN(numeric as number) ? numeric : undefined;
  const { hardCap: _drop, ...rest } = raw;
  return { ...rest, maxSets: resolved } as T & { maxSets?: number };
}

/**
 * Create or update program level settings (upsert)
 * Uses setDoc with merge to ensure we can create new or update existing
 */
export async function saveProgramLevelSettings(
  data: Omit<ProgramLevelSettings, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const settingsId = generateSettingsId(data.programId, data.levelNumber);
    const docRef = doc(db, PROGRAM_LEVEL_SETTINGS_COLLECTION, settingsId);
    
    // Check if document exists to determine if this is create or update
    const existingDoc = await getDoc(docRef);
    
    // Ensure targetGoals are plain objects for Firestore
    const payload = {
      ...data,
      targetGoals: (data.targetGoals ?? []).map(g => ({
        exerciseId: g.exerciseId,
        exerciseName: g.exerciseName,
        targetValue: g.targetValue,
        unit: g.unit,
        ...(g.progressBonus != null ? { progressBonus: g.progressBonus } : {}),
      })),
    };

    if (existingDoc.exists()) {
      // Update existing — strip undefined to prevent Firebase errors
      await updateDoc(docRef, stripUndefined({
        ...payload,
        updatedAt: serverTimestamp(),
      }));
    } else {
      // Create new — strip undefined to prevent Firebase errors
      await setDoc(docRef, stripUndefined({
        ...payload,
        progressionWeight: payload.progressionWeight ?? 1.0,
        intensityModifier: payload.intensityModifier ?? 1.0,
        restMultiplier: payload.restMultiplier ?? 1.0,
        volumeAdjustment: payload.volumeAdjustment ?? 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    }
    
    // #1: invalidate-on-write — an admin save must reflect on the next generation
    // in THIS process immediately (TTL bounds staleness in other processes).
    invalidateProgramLevelSetting(data.programId, data.levelNumber);

    return settingsId;
  } catch (error) {
    console.error('Error saving program level settings:', error);
    throw error;
  }
}

/**
 * Delete program level settings
 */
export async function deleteProgramLevelSettings(
  programId: string, 
  levelNumber: number
): Promise<void> {
  try {
    const settingsId = generateSettingsId(programId, levelNumber);
    const docRef = doc(db, PROGRAM_LEVEL_SETTINGS_COLLECTION, settingsId);
    await deleteDoc(docRef);
    invalidateProgramLevelSetting(programId, levelNumber); // #1: evict on delete
  } catch (error) {
    console.error('Error deleting program level settings:', error);
    throw error;
  }
}

/**
 * Delete all level settings for a program
 * Useful when deleting a program
 */
export async function deleteAllProgramLevelSettings(programId: string): Promise<void> {
  try {
    const settings = await getProgramLevelSettingsByProgram(programId);
    
    await Promise.all(
      settings.map(setting => 
        deleteProgramLevelSettings(setting.programId, setting.levelNumber)
      )
    );
  } catch (error) {
    console.error('Error deleting all program level settings:', error);
    throw error;
  }
}

/**
 * Batch create default level settings for a program
 * Creates settings for levels 1 through maxLevels with default values
 */
export async function createDefaultLevelSettings(
  programId: string, 
  maxLevels: number = 5
): Promise<void> {
  try {
    const defaultDescriptions = [
      'שלב היכרות עם התוכנית - התמקדות בביסוס טכניקה נכונה ובניית בסיס',
      'שלב התקדמות ראשון - הגברת עצימות והוספת מורכבות',
      'שלב ביניים - שילוב תרגילים מתקדמים וחיזוק ליבה',
      'שלב מתקדם - אתגרים מוגברים והתמקדות בכוח',
      'שלב שיא - תרגילים מאתגרים ושמירה על רמה גבוהה',
    ];
    
    const defaultMaxSetsByTier = (lvl: number) => (lvl <= 5 ? 20 : lvl <= 12 ? 24 : 28);
    for (let level = 1; level <= maxLevels; level++) {
      await saveProgramLevelSettings({
        programId,
        levelNumber: level,
        levelDescription: defaultDescriptions[level - 1] || `רמה ${level} של התוכנית`,
        progressionWeight: 1.0 / maxLevels, // Equal weight distribution
        intensityModifier: 1.0,
        restMultiplier: 1.0,
        volumeAdjustment: 0,
        maxSets: defaultMaxSetsByTier(level),
      });
    }
  } catch (error) {
    console.error('Error creating default level settings:', error);
    throw error;
  }
}
