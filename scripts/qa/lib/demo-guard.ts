/**
 * The runner's own fences (design §6) — on top of firestore.rules' demo-actor sandbox (#552) and
 * the minting function. Pure (except the in-page script string). The runner REFUSES TO ACT when:
 *   - the page is not on the app's own host;
 *   - the path is forbidden (admin / authority portal / Kelly chat / the mission's own list);
 *   - the page is about a specific user or group that is not demo (a profile, chat or group of
 *     a real person) — detected from path segments and uid-like query params;
 *   - the signed-in account is not a demo_qa_* tester (read from the page every step).
 * On a refusal the runner navigates back to the mission start and records a 'runner' event —
 * it never clicks, types or reports anything on that page.
 */
import { APP_HOSTS, BLOCKED_REQUEST_HOSTS, QA_UID_PREFIX } from './config';

/** Always off-limits, whatever the mission says. */
export const ALWAYS_FORBIDDEN = ['/admin', '/authority-portal', '/ai-coach', '/settings/account', '/delete-data', '/booth'] as const;

/** Path segments after which the next segment names a user / group / chat. */
const ENTITY_SEGMENTS = new Set(['profile', 'user', 'users', 'u', 'chat', 'chats', 'group', 'groups', 'community', 'arena', 'r']);
/** Query params that name a user / group. */
const ENTITY_PARAMS = ['uid', 'userId', 'user', 'with', 'peer', 'groupId', 'group', 'chatId', 'ownerId', 'authorId'];

export type GuardVerdict = { ok: true } | { ok: false; reason: 'bad_url' | 'foreign_host' | 'forbidden_path' | 'non_demo_entity' };

const isDemoId = (v: string) => v.startsWith('demo_') || v.startsWith('demo-');
/** Looks like a Firestore auto-id / uid (not a word like "new" or "settings"). */
const looksLikeId = (v: string) => /^[A-Za-z0-9_-]{16,}$/.test(v) || /^demo[_-]/.test(v);

export function checkPage(url: string, forbidden: readonly string[], hosts: readonly string[] = APP_HOSTS): GuardVerdict {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: 'bad_url' };
  }
  if (u.protocol !== 'https:' || !hosts.includes(u.hostname)) return { ok: false, reason: 'foreign_host' };
  const path = u.pathname.replace(/\/+$/, '') || '/';
  for (const p of [...ALWAYS_FORBIDDEN, ...forbidden]) {
    if (path === p || path.startsWith(`${p}/`)) return { ok: false, reason: 'forbidden_path' };
  }
  const segs = path.split('/').filter(Boolean);
  for (let i = 0; i < segs.length - 1; i++) {
    if (ENTITY_SEGMENTS.has(segs[i].toLowerCase())) {
      const next = decodeURIComponent(segs[i + 1]);
      if (looksLikeId(next) && !isDemoId(next)) return { ok: false, reason: 'non_demo_entity' };
    }
  }
  for (const k of ENTITY_PARAMS) {
    for (const v of u.searchParams.getAll(k)) {
      if (v && looksLikeId(v) && !isDemoId(v)) return { ok: false, reason: 'non_demo_entity' };
    }
  }
  return { ok: true };
}

export function isTesterUid(uid: unknown): boolean {
  return typeof uid === 'string' && uid.startsWith(QA_UID_PREFIX) && /^demo_qa_[a-z0-9_]{3,40}$/.test(uid);
}

export function isBlockedRequestHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return BLOCKED_REQUEST_HOSTS.some((b) => h === b || h.endsWith(`.${b}`));
  } catch {
    return false;
  }
}

/** Removes a custom token from anything about to be logged (fragment #t=… or a raw JWT). */
export function redactSecrets(s: string): string {
  return s.replace(/#t=[A-Za-z0-9._-]+/g, '#t=[redacted]').replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[jwt]');
}

/**
 * In-page: the uid of the Firebase user persisted in IndexedDB (the app's web persistence),
 * or null. Read every step so a tester never acts as anyone else.
 */
export const SIGNED_IN_UID_JS = String.raw`(async () => {
  try {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    if (!db.objectStoreNames.contains('firebaseLocalStorage')) return null;
    const rows = await new Promise((res, rej) => { const t = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll(); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
    const row = rows.find((r) => typeof r.fbase_key === 'string' && r.fbase_key.startsWith('firebase:authUser:'));
    return row && row.value && typeof row.value.uid === 'string' ? row.value.uid : null;
  } catch (e) { return null; }
})()`;
