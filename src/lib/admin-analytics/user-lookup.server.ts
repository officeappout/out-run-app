/**
 * user-lookup.server — find ONE user for the get_user_lookup admin-assistant tool. READ-ONLY.
 *
 * HARD RULE (this repo has a history of health-data exposure): the output is built field by
 * field from a WHITELIST. Nothing is spread from the user doc, so health / biometric / medical
 * data, birth date, phone, location, weight, gender and push tokens can never appear — and
 * user-lookup.test.ts asserts it. Email is always masked.
 *
 * Resolution (no collection scan):
 *   uid-shaped query            → users/{uid} get
 *   contains "@"                → where core.email == query (as typed, then lower-cased)
 *   otherwise                   → name PREFIX range on core.name (exact-name hits preferred)
 * More than one hit → up to 5 candidates (uid, name, masked email, city), never a guess.
 */
import 'server-only';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { isExcludedFromGlobalKpis } from '@/lib/testAccountFilter';
import { authorityNames } from './authority-names.server';
import { toDateSafe } from './dates';
import { metaOf, type MetricResult } from './meta';

export const USER_CANDIDATES_MAX = 5;
const UID_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;
/** the only core.* booleans reported, as "role flags" */
const ROLE_FLAGS = ['isSuperAdmin', 'isSystemAdmin', 'isRootAdmin', 'isTenantOwner', 'isVerticalAdmin', 'isApproved', 'isVerified'] as const;

export function maskEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim();
  const at = e.lastIndexOf('@');
  if (at < 1) return null;
  return `${e[0]}***${e.slice(at)}`;
}

export interface UserCandidate {
  uid: string;
  displayName: string | null;
  maskedEmail: string | null;
  authorityId: string | null;
  authorityName: string | null;
}

export interface UserProfile extends UserCandidate {
  accountKind: 'real' | 'test_or_demo';
  roleFlags: string[];
  role: string | null;
  signupDate: string | null;
  signupSource: string;
  signupCampaign: string | null;
  lastActive: string | null;
  /** all saved workouts docs (recovery included); null = could not be counted */
  workoutsCount: number | null;
  currentStreak: number | null;
  onboarding: { status: string | null; step: string | null; complete: boolean | null };
}

export type UserLookup =
  | { kind: 'resolved'; matchedBy: 'uid' | 'email' | 'name'; result: MetricResult<UserProfile> }
  | { kind: 'ambiguous'; candidates: UserCandidate[]; more: boolean }
  | { kind: 'none' }
  | { kind: 'unavailable' };

const str = (v: unknown, max = 120): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function candidateOf(uid: string, data: DocumentData, names: Map<string, string>): UserCandidate {
  const core = (data?.core ?? {}) as Record<string, unknown>;
  const authorityId = str(core.authorityId, 128);
  return {
    uid,
    displayName: str(core.name),
    maskedEmail: maskEmail(core.email),
    authorityId,
    authorityName: authorityId ? names.get(authorityId) ?? authorityId : null,
  };
}

type Hit = { id: string; data: DocumentData };

async function findHits(db: Firestore, query: string): Promise<{ hits: Hit[]; matchedBy: 'uid' | 'email' | 'name' } | null> {
  if (UID_SHAPE.test(query)) {
    const snap = await db.collection('users').doc(query).get();
    if (snap.exists) return { hits: [{ id: snap.id, data: snap.data() ?? {} }], matchedBy: 'uid' };
  }
  if (query.includes('@')) {
    for (const e of Array.from(new Set([query, query.toLowerCase()]))) {
      const s = await db.collection('users').where('core.email', '==', e).limit(USER_CANDIDATES_MAX + 1).get();
      if (s.docs.length) return { hits: s.docs.map((d) => ({ id: d.id, data: d.data() ?? {} })), matchedBy: 'email' };
    }
    return null;
  }
  const s = await db
    .collection('users')
    .where('core.name', '>=', query)
    .where('core.name', '<', `${query}`)
    .limit(USER_CANDIDATES_MAX + 1)
    .get();
  if (!s.docs.length) return null;
  const hits = s.docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
  const exact = hits.filter((h) => str((h.data.core as Record<string, unknown> | undefined)?.name) === query);
  return { hits: exact.length >= 1 ? exact : hits, matchedBy: 'name' };
}

async function buildProfile(db: Firestore, hit: Hit, names: Map<string, string>, now: Date): Promise<{ profile: UserProfile; failed: string[] }> {
  const d = hit.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const core = (d.core ?? {}) as Record<string, unknown>;
  const failed: string[] = [];
  let workoutsCount: number | null = null;
  try {
    workoutsCount = (await db.collection('workouts').where('userId', '==', hit.id).count().get()).data().count;
  } catch (err) {
    console.error('[admin-analytics/user-lookup] workouts count failed', err);
    failed.push('workoutsCount');
  }
  const created = toDateSafe(d.createdAt);
  const last = toDateSafe(d.lastActive);
  const lastActiveDay = last ? getIsraelDateKey(last) : str(d.progression?.lastActiveDate, 10);
  const src = str(d.marketingAttribution?.source, 80);
  const streak = d.progression?.currentStreak;
  const role = str(core.role, 40);
  return {
    failed,
    profile: {
      ...candidateOf(hit.id, d, names),
      accountKind: isExcludedFromGlobalKpis(core as never, hit.id) ? 'test_or_demo' : 'real',
      roleFlags: ROLE_FLAGS.filter((f) => core[f] === true),
      role: role && /^[A-Za-z_]+$/.test(role) ? role : null,
      signupDate: created ? getIsraelDateKey(created) : null,
      signupSource: src ? src.toLowerCase() : 'unattributed',
      signupCampaign: str(d.marketingAttribution?.campaign, 120),
      lastActive: lastActiveDay,
      workoutsCount,
      currentStreak: typeof streak === 'number' && Number.isFinite(streak) ? streak : null,
      onboarding: {
        status: str(d.onboardingStatus, 40),
        step: str(d.onboardingStep, 60),
        complete: typeof d.onboardingComplete === 'boolean' ? d.onboardingComplete : null,
      },
    },
  };
}

export const USER_LOOKUP_CAVEATS = [
  'operational fields only — no health, birth date, phone or location data is ever returned; email is masked',
  'name search matches the START of the display name (not the middle); email must be the full address',
  'lastActive is often empty in the data — null means not recorded, not "never active"',
];

export async function getUserLookup(db: Firestore, query: string, opts: { now?: Date } = {}): Promise<UserLookup> {
  const now = opts.now ?? new Date();
  const q = query.trim();
  if (!q) return { kind: 'none' };
  try {
    const found = await findHits(db, q);
    if (!found) return { kind: 'none' };
    const shown = found.hits.slice(0, USER_CANDIDATES_MAX);
    const ids = shown.map((h) => str((h.data.core as Record<string, unknown> | undefined)?.authorityId, 128)).filter((x): x is string => !!x);
    const names = await authorityNames(db, ids);
    if (shown.length > 1) {
      return { kind: 'ambiguous', candidates: shown.map((h) => candidateOf(h.id, h.data, names)), more: found.hits.length > USER_CANDIDATES_MAX };
    }
    const { profile, failed } = await buildProfile(db, shown[0], names, now);
    return {
      kind: 'resolved',
      matchedBy: found.matchedBy,
      result: {
        value: profile,
        meta: metaOf('user_lookup', { from: null, to: getIsraelDateKey(now) }, {
          caveats: [...USER_LOOKUP_CAVEATS, ...failed.map((f) => `${f}: could not be counted (not zero)`)],
        }),
      },
    };
  } catch (err) {
    console.error('[admin-analytics/user-lookup] failed', err);
    return { kind: 'unavailable' };
  }
}
