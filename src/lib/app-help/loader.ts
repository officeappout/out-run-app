/**
 * The ONE loader for help entries (help hub + Kelly). Today the source is the code files
 * (Kelly's curated app-help entries + the round 4 additions); the planned synced source
 * (Firestore, edited in the admin panel, shared with the website FAQ) replaces only this file.
 */
import { APP_HELP_ENTRIES, type AppHelpEntry } from '@/lib/ai/coach/app-help/entries';
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

/** All app-help entries, in the shape Kelly's retrieval scores (id, title, keywords, answer). */
export function getAppHelpEntries(opts: { round4?: boolean } = {}): readonly AppHelpEntry[] {
  return opts.round4 ? [...APP_HELP_ENTRIES, ...ROUND4_HELP_ENTRIES] : APP_HELP_ENTRIES;
}

/** Every entry for the help hub, synchronously (the code source). */
export function getHelpEntries(): HelpQA[] {
  return getAppHelpEntries({ round4: true }).map(toHelpQA);
}

/** Async on purpose: the future synced source will be a read. */
export async function loadHelpEntries(): Promise<HelpQA[]> {
  return getHelpEntries();
}
