/**
 * Client helpers for /admin/content — authed fetch + Hebrew labels + new-item ids.
 */
import { auth } from '@/lib/firebase';
import type { ContentInput } from '@/lib/content-items/schema';
import type { ContentItem, ContentType } from '@/lib/content-items/types';

export async function contentFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
}

const ERRORS: Record<string, string> = {
  load_failed: 'הטעינה נכשלה',
  save_failed: 'השמירה נכשלה',
  bad_request: 'יש שדות לא תקינים',
  bad_id: 'מזהה לא תקין',
  not_found: 'הפריט לא נמצא',
  Unauthorized: 'צריך להתחבר מחדש',
  Forbidden: 'אין הרשאה',
};

export async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown; issues?: Array<{ path?: unknown[]; message?: string }> };
  const base = typeof body.error === 'string' ? (ERRORS[body.error] ?? body.error) : `שגיאה ${res.status}`;
  const issue = body.issues?.[0];
  return issue ? `${base}: ${(issue.path ?? []).join('.')} ${issue.message ?? ''}` : base;
}

export const TYPE_LABEL: Record<ContentType, string> = { faq: 'שאלה נפוצה (אתר)', help: 'עזרה באפליקציה', article: 'מאמר' };
export const AUDIENCE_LABEL = { users: 'מתאמנים', authorities: 'רשויות' } as const;
export const STATUS_LABEL = { draft: 'טיוטה', published: 'מפורסם' } as const;

/** The editable fields of an item (drop the server bookkeeping). */
export function toInput(item: ContentItem): ContentInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, updatedAt, updatedBy, seedHash, ...rest } = item;
  return rest as ContentInput;
}

/** A fresh item of `type` with a unique id + slug (ids are lowercase, Firestore-safe). */
export function newItem(type: ContentType): { id: string; input: ContentInput } {
  const stamp = Date.now().toString(36);
  if (type === 'article') {
    const slug = `article-${stamp}`;
    return {
      id: `article-${slug}-he`,
      input: {
        type: 'article', slug, locale: 'he', audience: 'users', topic: 'strength', tags: [], status: 'draft', order: 0,
        title: '', excerpt: '', body: [{ type: 'p', text: '' }], category: 'strength', cover: { illustration: 'map' },
        readMin: 3, date: new Date().toISOString().slice(0, 10), author: 'צוות OUT',
      },
    };
  }
  const slug = `${type}-${stamp}`;
  return {
    id: type === 'help' ? `help-${slug}` : `faq-users-he-${stamp}`,
    input: { type, slug, locale: 'he', audience: 'users', topic: type === 'help' ? 'settings' : 'users', tags: [], status: 'draft', order: 0, q: '', a: [''] },
  };
}
