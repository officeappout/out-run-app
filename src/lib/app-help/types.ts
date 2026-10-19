/**
 * App help — the ONE entry shape for "how do I use the app" answers. Pure.
 *
 * Shared by the in-app help hub (/help), Kelly's get_app_help, and (later) the website FAQ +
 * articles, which are planned to become one synced source (likely Firestore, edited in the
 * admin panel). Everything reads entries through loadHelpEntries() / getHelpEntries()
 * (loader.ts), so swapping the source is a one-file change.
 */
export type HelpAudience = 'users' | 'authorities';

export interface HelpQA {
  id: string;
  /** The question, as a user would ask it (Hebrew). */
  q: string;
  /** The answer, one paragraph per item. */
  a: string[];
  /** Words and phrases a user might use (search + Kelly retrieval). */
  tags: string[];
  audience: HelpAudience;
  /** The help-hub chapter it belongs to (chapters.ts). */
  topic: string;
  locale: 'he';
}
