/**
 * Kelly phase 3 — what Kelly may remember. Pure. The extraction prompt says the same in
 * words; this is the deterministic filter after it (a fact that fails any rule is dropped).
 *
 *   1. Only four categories: injury or sensitivity, schedule constraints, goals or events,
 *      training preferences. Nothing else is stored.
 *   2. Health: only what the USER said about their own body that matters for training (a
 *      sore knee, a back that hurts in sit-ups), in their words. Never a diagnosis the model
 *      infers, never a condition that is not about training load.
 *   3. Never sensitive categories: religion or religious practice beyond a stated schedule
 *      limit, politics, ethnicity, sexual life or orientation, mental-health or chronic
 *      diagnoses and medication, pregnancy, money, legal matters, other people's details,
 *      contact details or addresses, ids, passwords.
 *   4. Short (MEMORY_FACT_MAX_CHARS), Hebrew, confidence ≥ MEMORY_MIN_CONFIDENCE.
 * The user sees every fact ("מה קלי זוכר") and can delete one or all.
 */
import { MEMORY_FACT_MAX_CHARS, MEMORY_MIN_CONFIDENCE, isMemoryCategory, type MemoryCategory } from './types';

/** Sensitive topics (rule 3). Substring match on the normalized Hebrew / Latin text. */
const SENSITIVE = [
  // diagnoses, mental health, medication, pregnancy
  'דיכאון', 'חרדה', 'הפרעת', 'פסיכיאטר', 'פסיכולוג', 'תרופ', 'סוכרת', 'סרטן', 'כימותרפ', 'איידס', 'hiv', 'אפילפס', 'הריון', 'הפלה', 'פוריות', 'adhd', 'ריטלין', 'אוטיזם',
  // religion, politics, ethnicity, sexuality (Shabbat as a schedule limit is phrased as a day, not a belief)
  'דתי', 'חילוני', 'חרדי', 'מתפלל', 'תפילה', 'בית כנסת', 'מסגד', 'כנסייה', 'פוליטי', 'מפלגה', 'בחירות', 'הצבעתי', 'הומו', 'לסבית', 'נטייה מינית',
  // money, legal, contact, ids
  'משכורת', 'חובות', 'הלוואה', 'משכנתא', 'עורך דין', 'תביעה', 'כלא', 'משטרה', 'טלפון', 'מייל', '@', 'כתובת', 'תעודת זהות', 'סיסמ',
];

/** A diagnosis-style phrasing (rule 2): "יש לי X" is fine for a body part, not for a named disease. */
const DIAGNOSIS = /(?:אובח[ןנ]|מאובח[ןנ]|חולה\s+ב|סובל(?:ת)?\s+מ(?:מחלת|הפרעת)|תסמונת|מחלת\s)/;

export function normalizeFactText(t: string): string {
  return t.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export type FactRejection = 'category' | 'empty' | 'too_long' | 'not_hebrew' | 'low_confidence' | 'sensitive' | 'diagnosis';

export function factRejection(f: { category: unknown; text: unknown; confidence: unknown }): FactRejection | null {
  if (!isMemoryCategory(f.category)) return 'category';
  if (typeof f.text !== 'string') return 'empty';
  const t = normalizeFactText(f.text);
  if (!t) return 'empty';
  if (t.length > MEMORY_FACT_MAX_CHARS) return 'too_long';
  if (!/[א-ת]/.test(t)) return 'not_hebrew';
  if (typeof f.confidence !== 'number' || !(f.confidence >= MEMORY_MIN_CONFIDENCE)) return 'low_confidence';
  const lower = t.toLowerCase();
  if (SENSITIVE.some((w) => lower.includes(w))) return 'sensitive';
  if (DIAGNOSIS.test(t)) return 'diagnosis';
  return null;
}

export function isAllowedFact(f: { category: unknown; text: unknown; confidence: unknown }): f is { category: MemoryCategory; text: string; confidence: number } {
  return factRejection(f) === null;
}
