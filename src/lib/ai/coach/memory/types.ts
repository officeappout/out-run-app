/**
 * Kelly phase 3 — memory: the shared vocabulary. Pure. Flag ai_coach_memory (default off).
 *
 *   ai_coach_memory/{uid}  { facts: MemoryFact[], extractedUntil: ms, updatedAt }
 *   Admin SDK only (firestore.rules: no client access). The user reads and deletes through
 *   /api/ai-coach/memory; account deletion removes the doc (functions/src/onUserDelete.ts).
 */
export type MemoryCategory = 'injury' | 'schedule' | 'goal' | 'preference';

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = ['injury', 'schedule', 'goal', 'preference'];

export const MEMORY_CATEGORY_HE: Record<MemoryCategory, string> = {
  injury: 'פציעה או רגישות',
  schedule: 'לו״ז',
  goal: 'יעד',
  preference: 'העדפה',
};

export interface MemoryFact {
  /** Stable short id (m_xxxxxxxx). */
  id: string;
  category: MemoryCategory;
  /** One short Hebrew line, in the user's own terms ("כואבת לו הברך השמאלית בריצה"). */
  text: string;
  /** The user messages it came from (ids in ai_coach_threads/{uid}/messages). */
  sourceMsgIds: string[];
  /** 0..1, the extractor's certainty that this is a durable fact the user stated. */
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export const MEMORY_MAX_FACTS = 20;
export const MEMORY_FACT_MAX_CHARS = 120;
export const MEMORY_MIN_CONFIDENCE = 0.6;
export const MEMORY_COLLECTION = 'ai_coach_memory';

export function isMemoryCategory(v: unknown): v is MemoryCategory {
  return typeof v === 'string' && (MEMORY_CATEGORIES as readonly string[]).includes(v);
}
