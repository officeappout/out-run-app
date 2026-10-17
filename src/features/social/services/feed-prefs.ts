/**
 * Feed publishing preferences (David, 17.10.2026 — design lab "privacy"):
 * nothing is published without the user choosing it. Each finished workout
 * either auto-publishes (the user turned that on for its activity) or waits
 * as a "share your workout?" prompt in the feed.
 *
 * Stored on users/{uid}.social.feedPrefs (owner-writable). Pure helpers here
 * except saveFeedPrefs; the pending share lives in localStorage (one device,
 * the last workout only — it's a prompt, not a queue).
 */
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type FeedActivity = 'strength' | 'cardio' | 'maintenance';
export type FeedPrefsAudience = 'partners' | 'public' | 'private';

export interface FeedPrefs {
  autoPublish: Record<FeedActivity, boolean>;
  audience: FeedPrefsAudience;
  /** Show the park's name on the post (never a map or an address). */
  showPark: boolean;
}

export const DEFAULT_FEED_PREFS: FeedPrefs = {
  autoPublish: { strength: false, cardio: false, maintenance: false },
  audience: 'partners',
  showPark: true,
};

const AUDIENCES: FeedPrefsAudience[] = ['partners', 'public', 'private'];

/** Whatever is on the user doc → a complete, valid FeedPrefs. */
export function feedPrefsFrom(raw: unknown): FeedPrefs {
  const r = (raw ?? {}) as Partial<FeedPrefs> & { autoPublish?: Partial<Record<FeedActivity, unknown>> };
  const ap: Partial<Record<FeedActivity, unknown>> = r.autoPublish ?? {};
  return {
    autoPublish: {
      strength: ap.strength === true,
      cardio: ap.cardio === true,
      maintenance: ap.maintenance === true,
    },
    audience: AUDIENCES.includes(r.audience as FeedPrefsAudience) ? (r.audience as FeedPrefsAudience) : DEFAULT_FEED_PREFS.audience,
    showPark: r.showPark !== false,
  };
}

/**
 * Publish now, or hold as a pending share? A manual share always publishes
 * (with the audience the user just picked, if any); otherwise only when
 * auto-publish is on for this activity. The audience defaults to the user's
 * own choice, and the park is dropped when they hid it.
 */
export function applyFeedPrefs<P extends { activityCategory: FeedActivity; audience?: string; parkId?: string; parkName?: string }>(
  params: P,
  prefs: FeedPrefs,
  manual: boolean,
): { publish: boolean; params: P } {
  const publish = manual || prefs.autoPublish[params.activityCategory];
  const audience = manual && params.audience ? params.audience : prefs.audience;
  const out = { ...params, audience } as P;
  if (!prefs.showPark) {
    delete out.parkId;
    delete out.parkName;
  }
  return { publish, params: out };
}

export async function saveFeedPrefs(uid: string, prefs: FeedPrefs): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { 'social.feedPrefs': prefs });
}

// ── Pending share (last unshared workout, this device) ─────────────────────

const PENDING_KEY = 'out-pending-share-v1';
/** A prompt older than this is stale — don't ask about yesterday's workout. */
const PENDING_TTL_MS = 18 * 60 * 60 * 1000;

export interface PendingShare<P = Record<string, unknown>> {
  params: P;
  at: number;
}

export function savePendingShare<P>(params: P, now = Date.now()): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ params, at: now }));
  } catch {
    /* private mode — the prompt is a convenience */
  }
}

export function readPendingShare<P = Record<string, unknown>>(now = Date.now()): PendingShare<P> | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingShare<P>;
    if (!p || typeof p.at !== 'number' || now - p.at > PENDING_TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearPendingShare(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
