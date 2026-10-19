/**
 * Kelly phase 3 — the memory extraction prompt and the parser of its answer. Pure.
 */
import { z } from 'zod';
import { MEMORY_CATEGORIES, type MemoryFact } from './types';
import type { ExtractionOps } from './merge';

export const MEMORY_EXTRACT_SYSTEM = [
  'You maintain a short memory of DURABLE facts a user told their fitness coach (Kelly, in the OUT app), so the coach can use them in later conversations.',
  'Keep only facts the USER stated about themselves that will still matter in weeks, in four categories:',
  '- injury: a pain, injury or body sensitivity that limits training, in the user\'s own words (e.g. "כואבת לו הברך בריצה"). Never a diagnosis or a disease name, never anything you infer.',
  '- schedule: a lasting constraint on when they can train (shifts, kids, travel days, only mornings).',
  '- goal: a goal or upcoming event (e.g. "גיבוש בחודש הבא", "רוצה לרוץ 5 קילומטר").',
  '- preference: what they like or dislike in training (e.g. "לא אוהב ריצה", "מעדיף אימונים קצרים").',
  'NEVER store: religion or beliefs, politics, ethnicity, sexuality, mental health, medication, pregnancy, chronic or named diseases, money, legal matters, other people\'s details, contact details, addresses, ids. Never store one-off moods or today-only plans ("עייף היום").',
  'Write each fact as one short Hebrew line (under 15 words) about the user in the third person, without their name.',
  'You get the current memory (with ids) and new user messages (with ids). Answer ONLY with JSON:',
  '{"add":[{"category":"injury|schedule|goal|preference","text":"...","confidence":0.0-1.0,"sourceMsgIds":["..."]}],"update":[{"id":"m_...","text":"...","confidence":0.0-1.0,"sourceMsgIds":["..."]}],"remove":["m_..."]}',
  'update = the user corrected or refined a stored fact; remove = the user said a stored fact is no longer true. Confidence below 0.6 = do not add. Nothing new → {"add":[],"update":[],"remove":[]}.',
].join('\n');

export interface ExtractMessage {
  id: string;
  text: string;
}

export function buildExtractUserContent(current: readonly Pick<MemoryFact, 'id' | 'category' | 'text'>[], messages: readonly ExtractMessage[]): string {
  const mem = current.length ? current.map((f) => `${f.id} [${f.category}] ${f.text}`).join('\n') : '(empty)';
  const msgs = messages.map((m) => `${m.id}: ${m.text.replace(/\s+/g, ' ').slice(0, 500)}`).join('\n');
  return `Current memory:\n${mem}\n\nNew user messages:\n${msgs}`;
}

const OpsSchema = z.object({
  add: z.array(z.object({ category: z.enum(MEMORY_CATEGORIES as unknown as [string, ...string[]]), text: z.string().max(400), confidence: z.number().min(0).max(1), sourceMsgIds: z.array(z.string().max(80)).max(10).default([]) })).max(10).default([]),
  update: z.array(z.object({ id: z.string().max(40), text: z.string().max(400), confidence: z.number().min(0).max(1), sourceMsgIds: z.array(z.string().max(80)).max(10).default([]) })).max(10).default([]),
  remove: z.array(z.string().max(40)).max(20).default([]),
});

/**
 * The model's answer → operations, or null when it is not valid JSON of that shape.
 * Source ids the model cites that were not in this batch are dropped (it can't invent them).
 */
export function parseExtraction(raw: string, batchIds: readonly string[]): ExtractionOps | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let json: unknown;
  try {
    json = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const r = OpsSchema.safeParse(json);
  if (!r.success) return null;
  const known = new Set(batchIds);
  const src = (ids: string[]) => ids.filter((id) => known.has(id));
  return {
    add: r.data.add.map((a) => ({ ...a, category: a.category as ExtractionOps['add'][number]['category'], sourceMsgIds: src(a.sourceMsgIds) })),
    update: r.data.update.map((u) => ({ ...u, sourceMsgIds: src(u.sourceMsgIds) })),
    remove: r.data.remove,
  };
}
