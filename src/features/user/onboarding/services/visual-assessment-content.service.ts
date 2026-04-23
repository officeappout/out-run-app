/**
 * Firestore CRUD service for `visual_assessment_content` collection.
 *
 * Document ID convention: `{category}_{level}` (e.g. "push_5").
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  VisualAssessmentContent,
  VideoVariant,
} from '../types/visual-assessment.types';

const COLLECTION = 'visual_assessment_content';

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Deep-clean an object for Firestore:
 *  - Recursively walks objects and arrays
 *  - Converts `undefined` values to `null` (Firestore rejects `undefined`)
 *  - Preserves all other types as-is
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepCleanForFirestore(value: any): any {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  // Firestore Timestamp / ServerTimestamp sentinel — pass through as-is
  if (typeof value.toDate === 'function' || typeof value._methodName === 'string') return value;
  if (Array.isArray(value)) return value.map(deepCleanForFirestore);
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    cleaned[k] = deepCleanForFirestore(v);
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

function docToContent(id: string, data: Record<string, unknown>): VisualAssessmentContent {
  // Accept both "videoVariants" (canonical) and "variants" (fallback) field names
  const rawVariants = data.videoVariants ?? data.variants;
  const variants = (Array.isArray(rawVariants) ? rawVariants : []) as VideoVariant[];

  console.log(`[VisualContentService] docToContent "${id}":`, {
    hasVideoVariantsField: data.videoVariants !== undefined,
    hasVariantsField: data.variants !== undefined,
    rawType: rawVariants === undefined ? 'undefined' : rawVariants === null ? 'null' : Array.isArray(rawVariants) ? `array[${(rawVariants as unknown[]).length}]` : typeof rawVariants,
    parsedVariantsCount: variants.length,
    allTopLevelKeys: Object.keys(data),
  });

  return {
    id,
    category: (data.category as string) ?? '',
    level: (data.level as number) ?? 0,
    videoVariants: variants,
    boldTitle: (data.boldTitle as VisualAssessmentContent['boldTitle']) ?? {},
    detailedDescription: (data.detailedDescription as VisualAssessmentContent['detailedDescription']) ?? {},
    linkedProgramId: (data.linkedProgramId as string) ?? undefined,
    linkedLevelId: (data.linkedLevelId as string) ?? undefined,
    exerciseId: (data.exerciseId as string) ?? undefined,
    showInOnboarding: data.showInOnboarding === true,
    onboardingBubbleText: (data.onboardingBubbleText as string) ?? undefined,
    targetReps: (data.targetReps as string) ?? undefined,
    unitType: (data.unitType as 'reps' | 'seconds') ?? undefined,
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
  };
}

/** Build the deterministic document ID. */
export function contentDocId(category: string, level: number): string {
  return `${category}_${level}`;
}

// ── Read ───────────────────────────────────────────────────────────

/** Fetch all documents, sorted by category then level. */
export async function getAllVisualContent(): Promise<VisualAssessmentContent[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy('category', 'asc'),
      orderBy('level', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => docToContent(d.id, d.data()));
  } catch (error) {
    console.error('[VisualContentService] getAllVisualContent error:', error);
    throw error;
  }
}

/** Fetch documents filtered by category. */
export async function getVisualContentByCategory(
  category: string,
): Promise<VisualAssessmentContent[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('category', '==', category),
      orderBy('level', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => docToContent(d.id, d.data()));
  } catch (error) {
    console.error('[VisualContentService] getByCategory error:', error);
    throw error;
  }
}

/**
 * Fetch the level numbers that have showInOnboarding === true for a category.
 * Returns a sorted array of level numbers. Used to build dynamic simple-mode steps.
 *
 * Important: Fetches ALL docs for the category and filters client-side,
 * because Firestore excludes documents that are missing the field entirely
 * from `where('showInOnboarding', '==', true)` queries.
 */
export async function getOnboardingLevels(category: string): Promise<number[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('category', '==', category),
      orderBy('level', 'asc'),
    );
    const snap = await getDocs(q);
    const levels = snap.docs
      .filter(d => d.data().showInOnboarding === true)
      .map(d => (d.data().level as number) ?? 0)
      .filter(l => l > 0);

    console.log(`[VisualContentService] getOnboardingLevels("${category}"): ${snap.docs.length} total docs, ${levels.length} with showInOnboarding=true → [${levels.join(', ')}]`);
    return levels;
  } catch (error) {
    console.error('[VisualContentService] getOnboardingLevels error:', error);
    return [];
  }
}

/** Fetch a single document by category+level. */
export async function getVisualContentItem(
  category: string,
  level: number,
): Promise<VisualAssessmentContent | null> {
  try {
    const docRef = doc(db, COLLECTION, contentDocId(category, level));
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return docToContent(snap.id, snap.data());
  } catch (error) {
    console.error('[VisualContentService] getItem error:', error);
    throw error;
  }
}

// ── Create / Update ────────────────────────────────────────────────

/**
 * Save (create or overwrite) a content document.
 * Uses `setDoc` with `merge: false` since the doc ID is deterministic.
 */
export async function saveVisualContent(
  data: Omit<VisualAssessmentContent, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  try {
    const id = contentDocId(data.category, data.level);
    const docRef = doc(db, COLLECTION, id);

    // Check if doc already exists to preserve createdAt
    const existing = await getDoc(docRef);

    // Ensure videoVariants is always an array (defensive)
    const videoVariants = Array.isArray(data.videoVariants) ? data.videoVariants : [];

    const rawPayload = {
      category: data.category,
      level: data.level,
      videoVariants,
      boldTitle: data.boldTitle ?? {},
      detailedDescription: data.detailedDescription ?? {},
      linkedProgramId: data.linkedProgramId ?? null,
      linkedLevelId: data.linkedLevelId ?? null,
      exerciseId: data.exerciseId ?? null,
      showInOnboarding: data.showInOnboarding ?? false,
      onboardingBubbleText: data.onboardingBubbleText ?? '',
      targetReps: data.targetReps?.trim() ?? '',
      unitType: data.unitType ?? 'reps',
      updatedAt: serverTimestamp(),
      createdAt: existing.exists() ? existing.data()?.createdAt : serverTimestamp(),
    };

    // Deep-clean to convert any nested `undefined` → `null`
    const payload = deepCleanForFirestore(rawPayload);

    console.log(`[VisualContentService] saveVisualContent "${id}" — payload:`, {
      videoVariantsCount: payload.videoVariants?.length ?? 0,
      videoVariantsPreview: (payload.videoVariants ?? []).map((v: Record<string, unknown>) => ({
        id: v.id,
        videoUrl: v.videoUrl ? '✓' : '✗',
        videoUrlMov: v.videoUrlMov ? '✓' : '✗',
        videoUrlWebm: v.videoUrlWebm ? '✓' : '✗',
        isDefault: v.isDefault,
      })),
      allKeys: Object.keys(payload),
    });

    await setDoc(docRef, payload);
    console.log(`[VisualContentService] saveVisualContent "${id}" — SUCCESS`);
  } catch (error) {
    console.error('[VisualContentService] saveVisualContent error:', error);
    throw error;
  }
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteVisualContent(
  category: string,
  level: number,
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION, contentDocId(category, level));
    await deleteDoc(docRef);
  } catch (error) {
    console.error('[VisualContentService] delete error:', error);
    throw error;
  }
}

/**
 * Delete all documents for a given category whose level exceeds `maxLevel`.
 * Used to purge legacy 25-level docs when a program's maxLevels has been reduced.
 */
export async function purgeLevelsAbove(
  category: string,
  maxLevel: number,
): Promise<number> {
  const q = query(
    collection(db, COLLECTION),
    where('category', '==', category),
  );
  const snap = await getDocs(q);
  let deleted = 0;

  const batch = writeBatch(db);
  for (const d of snap.docs) {
    const level = (d.data().level as number) ?? 0;
    if (level > maxLevel) {
      batch.delete(d.ref);
      deleted++;
    }
  }

  if (deleted > 0) await batch.commit();
  return deleted;
}

/**
 * Delete ALL documents whose category matches the given value.
 * Used to purge entire ghost/orphan categories (e.g. legacy "push", "pull").
 */
export async function purgeCategory(category: string): Promise<number> {
  const q = query(
    collection(db, COLLECTION),
    where('category', '==', category),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  for (const d of snap.docs) {
    batch.delete(d.ref);
  }
  await batch.commit();
  return snap.size;
}

// ── Seed ───────────────────────────────────────────────────────────

const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'];
const MAX_LEVEL = 25;

const CATEGORY_LABELS: Record<string, { he: string; en: string }> = {
  push: { he: 'דחיפה', en: 'Push' },
  pull: { he: 'משיכה', en: 'Pull' },
  legs: { he: 'פלג גוף תחתון', en: 'Legs' },
  core: { he: 'ליבה', en: 'Core' },
};

/**
 * Seed placeholder documents for all 4 primary categories × 25 levels.
 * Existing documents are NOT overwritten (merge used on createdAt check).
 */
export async function seedPlaceholderContent(): Promise<number> {
  let created = 0;
  const batchSize = 400; // Firestore batch limit is 500
  let batch = writeBatch(db);
  let opsInBatch = 0;

  for (const category of PRIMARY_CATEGORIES) {
    const labels = CATEGORY_LABELS[category] ?? { he: category, en: category };
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const id = contentDocId(category, level);
      const docRef = doc(db, COLLECTION, id);
      const existing = await getDoc(docRef);

      if (!existing.exists()) {
        batch.set(docRef, {
          category,
          level,
          videoVariants: [],
          boldTitle: {
            he: { neutral: `${labels.he} — רמה ${level}` },
            en: { neutral: `${labels.en} — Level ${level}` },
          },
          detailedDescription: {
            he: { neutral: '' },
            en: { neutral: '' },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        created++;
        opsInBatch++;

        if (opsInBatch >= batchSize) {
          await batch.commit();
          batch = writeBatch(db);
          opsInBatch = 0;
        }
      }
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  return created;
}
