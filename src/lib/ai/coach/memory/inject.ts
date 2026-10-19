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
    '- Use a remembered fact only when it matters for the answer (an injury when building a workout, a schedule limit when planning, a goal when encouraging), naturally and in a few words. Do not list what you remember unless asked. If the user says something changed, believe the user. If they ask what you remember, say it and that they can delete it in "מה קלי זוכר".',
  ].join('\n');
}
