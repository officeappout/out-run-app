/**
 * push_messages (admin broadcast queue) copy: `title` / `message` are plain Hebrew strings today, or {he, en}.
 * Hebrew is always the default; English is used ONLY for a recipient whose push locale resolves to 'en'
 * (resolvePushLocale: enable_i18n + push_locale_v1 + the user's core.locale), and only when BOTH title and
 * message carry English. A doc with no English (every doc today) is never split, so the send path is unchanged.
 */
import type * as admin from 'firebase-admin';
import { englishTextOf, hebrewTextOf } from '../lib/stored-text';

/** The #920 gate (push-copy.service effectivePushLocale): enable_i18n + push_locale_v1 + the user's core.locale. */
export type PushLocaleResolver = (ctx: { uid: string; audience: { locale: string | null } }) => Promise<string>;

export interface QueueCopy {
  title: string;
  body: string;
}

export interface QueueCopies {
  he: QueueCopy;
  /** null unless the doc has English for both title and message. */
  en: QueueCopy | null;
}

export function queueCopiesOf(data: { title?: unknown; message?: unknown }): QueueCopies {
  const he = { title: hebrewTextOf(data.title).trim(), body: hebrewTextOf(data.message).trim() };
  const enTitle = englishTextOf(data.title);
  const enBody = englishTextOf(data.message);
  return { he, en: enTitle && enBody ? { title: enTitle, body: enBody } : null };
}

/** uid -> 'he' | 'en' for the recipients; reads users' core.locale (batches of 100) only when English copy exists. */
export async function partitionUidsByQueueLocale(
  db: admin.firestore.Firestore,
  uids: Iterable<string>,
  effective: PushLocaleResolver,
): Promise<Map<string, 'he' | 'en'>> {
  const out = new Map<string, 'he' | 'en'>();
  const all = Array.from(uids);
  for (let i = 0; i < all.length; i += 100) {
    const slice = all.slice(i, i + 100);
    const docs = await db.getAll(...slice.map((uid) => db.collection('users').doc(uid)), { fieldMask: ['core.locale'] });
    for (const d of docs) {
      const raw = (d.exists ? (d.data() as { core?: { locale?: unknown } } | undefined)?.core?.locale : undefined) ?? null;
      const locale = await effective({ uid: d.id, audience: { locale: typeof raw === 'string' ? raw : null } });
      out.set(d.id, locale === 'en' ? 'en' : 'he');
    }
  }
  return out;
}
