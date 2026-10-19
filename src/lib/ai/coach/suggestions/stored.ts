/**
 * Kelly phase 2 — quick replies as stored on an assistant message (`suggestions`) and sent
 * on the stream. Pure. The server writes them; the app re-validates the shape (never trust
 * the wire): short strings only, no links, at most MAX_SUGGESTIONS.
 */
import { MAX_SUGGESTIONS, SUGGESTION_LABEL_MAX, SUGGESTION_MESSAGE_MAX, type SuggestionChip } from './types';

export function parseStoredSuggestions(raw: unknown): SuggestionChip[] {
  if (!Array.isArray(raw)) return [];
  const out: SuggestionChip[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.label !== 'string') continue;
    const label = r.label.trim().slice(0, SUGGESTION_LABEL_MAX);
    if (!label) continue;
    const chip: SuggestionChip = { id: r.id.slice(0, 40), label };
    if (typeof r.message === 'string' && r.message.trim()) chip.message = r.message.trim().slice(0, SUGGESTION_MESSAGE_MAX);
    if (r.openCard === true) chip.openCard = true;
    out.push(chip);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
