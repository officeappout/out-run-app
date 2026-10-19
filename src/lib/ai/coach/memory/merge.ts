/**
 * Kelly phase 3 — applying an extraction to the stored facts. Pure.
 *
 * The model answers with operations against the CURRENT list (ids it was shown):
 *   add     new facts            → rules.ts filter, then de-duplicated against the list
 *   update  { id, text, … }      → the fact keeps its id and createdAt, gains the sources
 *   remove  [id]                 → the user said it is no longer true ("הברך כבר בסדר")
 * Unknown ids are ignored. At most MEMORY_MAX_FACTS: when over, the lowest-confidence, least
 * recently updated facts go first.
 */
import { factRejection, normalizeFactText } from './rules';
import { MEMORY_MAX_FACTS, type MemoryCategory, type MemoryFact } from './types';

export interface ExtractionOps {
  add: Array<{ category: MemoryCategory; text: string; confidence: number; sourceMsgIds: string[] }>;
  update: Array<{ id: string; text: string; confidence: number; sourceMsgIds: string[] }>;
  remove: string[];
}

const words = (t: string) => new Set(normalizeFactText(t).replace(/[.,!?״"']/g, '').split(' ').filter((w) => w.length > 1));

/** Same category and ≥ 70% word overlap (or identical text) → the same fact. */
export function sameFact(a: Pick<MemoryFact, 'category' | 'text'>, b: Pick<MemoryFact, 'category' | 'text'>): boolean {
  if (a.category !== b.category) return false;
  if (normalizeFactText(a.text) === normalizeFactText(b.text)) return true;
  const wa = words(a.text);
  const wb = words(b.text);
  if (!wa.size || !wb.size) return false;
  let common = 0;
  wa.forEach((w) => {
    if (wb.has(w)) common++;
  });
  return common / Math.min(wa.size, wb.size) >= 0.7;
}

export function newFactId(seed: string, n: number): string {
  let h = 2166136261;
  for (const ch of `${seed}:${n}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `m_${h.toString(36).padStart(7, '0').slice(0, 8)}`;
}

const uniq = (xs: string[]) => Array.from(new Set(xs)).slice(-10);

export function applyExtraction(current: readonly MemoryFact[], ops: ExtractionOps, nowMs: number): MemoryFact[] {
  const removed = new Set(ops.remove);
  let facts = current.filter((f) => !removed.has(f.id)).map((f) => ({ ...f, sourceMsgIds: [...f.sourceMsgIds] }));

  for (const u of ops.update) {
    const i = facts.findIndex((f) => f.id === u.id);
    if (i < 0) continue;
    const next = { ...facts[i], text: normalizeFactText(u.text), confidence: u.confidence };
    if (factRejection(next) !== null) continue;
    facts[i] = { ...next, sourceMsgIds: uniq([...facts[i].sourceMsgIds, ...u.sourceMsgIds]), updatedAt: nowMs };
  }

  ops.add.forEach((a, k) => {
    if (factRejection(a) !== null) return;
    const text = normalizeFactText(a.text);
    const dup = facts.findIndex((f) => sameFact(f, { category: a.category, text }));
    if (dup >= 0) {
      const f = facts[dup];
      facts[dup] = { ...f, text, confidence: Math.max(f.confidence, a.confidence), sourceMsgIds: uniq([...f.sourceMsgIds, ...a.sourceMsgIds]), updatedAt: nowMs };
      return;
    }
    facts.push({ id: newFactId(`${text}|${nowMs}`, k), category: a.category, text, sourceMsgIds: uniq(a.sourceMsgIds), confidence: a.confidence, createdAt: nowMs, updatedAt: nowMs });
  });

  if (facts.length > MEMORY_MAX_FACTS) {
    const keep = [...facts].sort((x, y) => y.confidence - x.confidence || y.updatedAt - x.updatedAt).slice(0, MEMORY_MAX_FACTS);
    const ids = new Set(keep.map((f) => f.id));
    facts = facts.filter((f) => ids.has(f.id));
  }
  return facts;
}

/** Stored doc → facts, field-guarded (never trust stored shapes). */
export function parseStoredFacts(raw: unknown): MemoryFact[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryFact[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.text !== 'string' || typeof r.category !== 'string') continue;
    if (factRejection({ category: r.category, text: r.text, confidence: typeof r.confidence === 'number' ? r.confidence : 1 }) !== null) continue;
    out.push({
      id: r.id,
      category: r.category as MemoryCategory,
      text: r.text,
      sourceMsgIds: Array.isArray(r.sourceMsgIds) ? r.sourceMsgIds.filter((s): s is string => typeof s === 'string') : [],
      confidence: typeof r.confidence === 'number' ? r.confidence : 1,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
    });
  }
  return out.slice(0, MEMORY_MAX_FACTS);
}
