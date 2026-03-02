/**
 * Firestore CRUD + runtime mapper for `program_thresholds` collection.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  ProgramThreshold,
  AssessmentLevels,
  LevelMode,
} from '../types/visual-assessment.types';
import type { MultilingualText } from '@/types/onboarding-questionnaire';

const COLLECTION = 'program_thresholds';

// ── Helpers ────────────────────────────────────────────────────────

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === undefined) delete cleaned[key];
  }
  return cleaned;
}

function toDate(ts: Timestamp | Date | undefined | null): Date | undefined {
  if (!ts) return undefined;
  if (ts instanceof Date) return ts;
  if (typeof (ts as Timestamp).toDate === 'function') {
    try { return (ts as Timestamp).toDate(); } catch { /* fall through */ }
  }
  if (typeof ts === 'object' && 'seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  return undefined;
}

function docToThreshold(id: string, data: Record<string, unknown>): ProgramThreshold {
  return {
    id,
    name: (data.name as string) ?? '',
    description: (data.description as string) ?? '',
    isActive: (data.isActive as boolean) ?? true,
    priority: (data.priority as number) ?? 100,
    averageRange: (data.averageRange as ProgramThreshold['averageRange']) ?? undefined,
    conditions: (data.conditions as ProgramThreshold['conditions']) ?? undefined,
    programId: (data.programId as string) ?? '',
    levelMode: (data.levelMode as LevelMode) ?? 'manual',
    levelId: (data.levelId as string) ?? '',
    displayName: (data.displayName as MultilingualText) ?? {},
    displayDescription: (data.displayDescription as MultilingualText) ?? undefined,
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
  };
}

// ── CRUD ───────────────────────────────────────────────────────────

export async function getAllThresholds(): Promise<ProgramThreshold[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy('priority', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => docToThreshold(d.id, d.data()));
  } catch (error) {
    console.error('[ThresholdMapper] getAllThresholds error:', error);
    throw error;
  }
}

export async function getActiveThresholds(): Promise<ProgramThreshold[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('isActive', '==', true),
      orderBy('priority', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => docToThreshold(d.id, d.data()));
  } catch (error) {
    console.error('[ThresholdMapper] getActiveThresholds error:', error);
    throw error;
  }
}

export async function getThreshold(id: string): Promise<ProgramThreshold | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return docToThreshold(snap.id, snap.data());
  } catch (error) {
    console.error('[ThresholdMapper] getThreshold error:', error);
    throw error;
  }
}

export async function createThreshold(
  data: Omit<ProgramThreshold, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return ref.id;
  } catch (error) {
    console.error('[ThresholdMapper] createThreshold error:', error);
    throw error;
  }
}

export async function updateThreshold(
  id: string,
  data: Partial<Omit<ProgramThreshold, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      ...data,
      updatedAt: serverTimestamp(),
    }));
  } catch (error) {
    console.error('[ThresholdMapper] updateThreshold error:', error);
    throw error;
  }
}

export async function deleteThreshold(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (error) {
    console.error('[ThresholdMapper] deleteThreshold error:', error);
    throw error;
  }
}

// ── Runtime Mapper ─────────────────────────────────────────────────

export interface ProgramMappingResult {
  programId: string;
  levelMode: LevelMode;
  levelId: string;
  displayName: MultilingualText;
}

/**
 * Map assessment levels to a program using active thresholds.
 * Returns the first match by priority, or a fallback.
 */
export async function mapLevelsToProgram(
  levels: AssessmentLevels,
): Promise<ProgramMappingResult> {
  const thresholds = await getActiveThresholds();
  return mapLevelsToProgramSync(thresholds, levels);
}

/**
 * Synchronous mapper for admin test tool / pre-fetched thresholds.
 */
export function mapLevelsToProgramSync(
  thresholds: ProgramThreshold[],
  levels: AssessmentLevels,
): ProgramMappingResult {
  const average = Math.round(
    (levels.push + levels.pull + levels.legs) / 3,
  );

  const active = thresholds
    .filter(t => t.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const t of active) {
    if (t.averageRange) {
      if (average >= t.averageRange.min && average <= t.averageRange.max) {
        return {
          programId: t.programId,
          levelMode: t.levelMode ?? 'manual',
          levelId: t.levelId,
          displayName: t.displayName,
        };
      }
    }
  }

  // Fallback
  return {
    programId: 'full_body',
    levelMode: 'auto' as LevelMode,
    levelId: 'level_1',
    displayName: { he: { neutral: 'תוכנית גוף מלא — ברירת מחדל' }, en: { neutral: 'Full Body — Default' } },
  };
}

// ── Gap Detection ──────────────────────────────────────────────────

export interface CoverageGap {
  from: number;
  to: number;
}

/**
 * Detect gaps in the 1-25 average range not covered by any active threshold.
 */
export function detectCoverageGaps(thresholds: ProgramThreshold[]): CoverageGap[] {
  const active = thresholds.filter(t => t.isActive && t.averageRange);

  // Build a coverage bitmap for 1-25
  const covered = new Array(26).fill(false); // index 0 unused

  for (const t of active) {
    if (!t.averageRange) continue;
    const lo = Math.max(1, t.averageRange.min);
    const hi = Math.min(25, t.averageRange.max);
    for (let i = lo; i <= hi; i++) {
      covered[i] = true;
    }
  }

  // Collect contiguous gaps
  const gaps: CoverageGap[] = [];
  let gapStart: number | null = null;

  for (let i = 1; i <= 25; i++) {
    if (!covered[i]) {
      if (gapStart === null) gapStart = i;
    } else {
      if (gapStart !== null) {
        gaps.push({ from: gapStart, to: i - 1 });
        gapStart = null;
      }
    }
  }
  if (gapStart !== null) {
    gaps.push({ from: gapStart, to: 25 });
  }

  return gaps;
}

// ── Seed example thresholds ────────────────────────────────────────

export async function seedExampleThresholds(): Promise<number> {
  const existing = await getAllThresholds();
  if (existing.length > 0) return 0;

  const examples: Omit<ProgramThreshold, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'Beginner — Full Body',
      description: 'Average 1-5 maps to Full Body beginner program.',
      isActive: true,
      priority: 1,
      averageRange: { min: 1, max: 5 },
      programId: 'full_body',
      levelMode: 'auto',
      levelId: '',
      displayName: { he: { neutral: 'גוף מלא — מתחילים' }, en: { neutral: 'Full Body — Beginner' } },
    },
    {
      name: 'Intermediate — Full Body',
      description: 'Average 6-12 maps to Full Body intermediate.',
      isActive: true,
      priority: 2,
      averageRange: { min: 6, max: 12 },
      programId: 'full_body',
      levelMode: 'auto',
      levelId: '',
      displayName: { he: { neutral: 'גוף מלא — בינוני' }, en: { neutral: 'Full Body — Intermediate' } },
    },
    {
      name: 'Advanced — Upper Body Split',
      description: 'Average 13-18 maps to Upper Body split program.',
      isActive: true,
      priority: 3,
      averageRange: { min: 13, max: 18 },
      programId: 'upper_body',
      levelMode: 'auto',
      levelId: '',
      displayName: { he: { neutral: 'פלג גוף עליון — מתקדמים' }, en: { neutral: 'Upper Body — Advanced' } },
    },
    {
      name: 'Elite — Calisthenics',
      description: 'Average 19-25 maps to Advanced Calisthenics.',
      isActive: true,
      priority: 4,
      averageRange: { min: 19, max: 25 },
      programId: 'calisthenics',
      levelMode: 'manual',
      levelId: 'level_5',
      displayName: { he: { neutral: 'קליסתניקס מתקדמים' }, en: { neutral: 'Advanced Calisthenics' } },
    },
  ];

  let created = 0;
  for (const t of examples) {
    await createThreshold(t);
    created++;
  }
  return created;
}
