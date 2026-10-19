/**
 * The ONE loader for help entries (help hub + Kelly + unified search).
 *
 * Source: site_content (type 'help', published, he) — edited in /admin/content, seeded from the
 * code entries by scripts/seed-content-items.ts. The code entries (Kelly's curated app-help
 * entries + the round 4 additions) stay the FALLBACK whenever the collection is empty or
 * unreachable, so nothing changes before the seed runs or when the network is down.
 *
 *   browser → loadHelpEntries() reads the cached public API (/api/content?type=help)
 *   server  → primeHelpEntries() (content-items/help-prime.server.ts) before Kelly's turn
 * Both land in one module-level copy; the sync getters below read it. Once loaded, the last good
 * copy is kept (a later failed refresh never drops back to stale code text mid-session).
 */
import { APP_HELP_ENTRIES, type AppHelpEntry } from '@/lib/ai/coach/app-help/entries';
import { fetchPublishedContent } from '@/lib/content-items/client';
import { isQaItem } from '@/lib/content-items/types';
import { HELP_CHAPTERS } from './chapters';
import { ROUND4_HELP_ENTRIES } from './round4-entries';
import type { HelpQA } from './types';

function topicOf(id: string): string {
  return HELP_CHAPTERS.find((c) => c.entryIds.includes(id))?.id ?? 'settings';
}

/** An app-help entry in the shared shape. */
export function toHelpQA(e: AppHelpEntry): HelpQA {
  return { id: e.id, q: e.title, a: [e.answer], tags: [...e.keywords], audience: 'users', topic: topicOf(e.id), locale: 'he' };
}

/** A site_content help doc in the shared shape (its slug is the entry id the chapters use). */
export function helpQAFromItem(item: { slug: string; q: string; a: string[]; tags: string[]; audience: 'users' | 'authorities'; topic: string }): HelpQA {
  return { id: item.slug, q: item.q, a: item.a, tags: item.tags, audience: item.audience, topic: item.topic || topicOf(item.slug), locale: 'he' };
}

function toAppHelpEntry(h: HelpQA): AppHelpEntry {
  return { id: h.id, title: h.q, keywords: h.tags, answer: h.a.join('\n\n') };
}

// ── The synced copy (null = use the code entries) ───────────────────────────
let remote: HelpQA[] | null = null;

/** Set from site_content. Empty / null → back to the code entries. */
export function setRemoteHelpEntries(entries: readonly HelpQA[] | null): void {
  remote = entries && entries.length > 0 ? [...entries] : null;
}

/** True while the synced copy (not the code fallback) is in use. */
export function isUsingSyncedHelp(): boolean {
  return remote !== null;
}

/** All app-help entries, in the shape Kelly's retrieval scores (id, title, keywords, answer). */
export function getAppHelpEntries(opts: { round4?: boolean } = {}): readonly AppHelpEntry[] {
  if (!opts.round4) return APP_HELP_ENTRIES;
  if (remote) return remote.map(toAppHelpEntry);
  return [...APP_HELP_ENTRIES, ...ROUND4_HELP_ENTRIES];
}

/** Every entry for the help hub, synchronously (synced copy, else the code source). */
export function getHelpEntries(): HelpQA[] {
  if (remote) return [...remote];
  return [...APP_HELP_ENTRIES, ...ROUND4_HELP_ENTRIES].map(toHelpQA);
}

/** Browser: refresh from the public API (cached 5 min), then return the entries. Never throws. */
export async function loadHelpEntries(): Promise<HelpQA[]> {
  const items = await fetchPublishedContent('help', 'he');
  if (items) {
    // reachable: content → the synced copy, empty → the code fallback
    setRemoteHelpEntries(items.filter(isQaItem).filter((i) => i.type === 'help').map(helpQAFromItem));
  }
  return getHelpEntries();
}
