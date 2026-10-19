/**
 * Kelly phase 3 — the "מה אני זוכר עליך" block in the session context (after the cache
 * breakpoint, so flag off = the exact prompt as before). Pure.
 */
import { MEMORY_CATEGORY_HE, type MemoryFact } from './types';

export const MEMORY_BLOCK_MAX_FACTS = 12;

export function renderMemoryBlock(facts: readonly Pick<MemoryFact, 'category' | 'text'>[]): string | null {
  if (!facts.length) return null;
  const order = ['injury', 'schedule', 'goal', 'preference'];
  const list = [...facts].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)).slice(0, MEMORY_BLOCK_MAX_FACTS);
  return [
    'מה אני זוכר עליך (what this user told you in earlier conversations; the user can see and delete these):',
    ...list.map((f) => `- ${MEMORY_CATEGORY_HE[f.category]}: ${f.text}`),
    '- How to use these: when you build or suggest a workout and a remembered injury or sensitivity touches it, take it into account and say so in one short clause (for example that you kept it gentle on the knee). When the user is low on motivation or asks why to train, tie it to a remembered goal or event in one short sentence. When you plan days, respect a remembered schedule limit. When you suggest activities, respect a remembered preference.',
    '- Otherwise do not bring them up: never list what you remember unless asked, and never mention a fact that has nothing to do with this answer. If the user says something changed, believe the user. If they ask what you remember, say it and that they can delete it in "מה קלי זוכר".',
  ].join('\n');
}
