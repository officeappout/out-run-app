/**
 * The write allowlist (design L5): the Admin SDK bypasses firestore.rules, so the demo
 * world checks EVERY document before writing anything. A path outside the demo world, or
 * a demo doc that points at a real user / real authority, aborts the run (nothing is
 * written — the list is checked up front, not batch by batch).
 *
 * One allowlist for both writers: the seed scripts (scripts/demo/lib/guard.ts re-exports
 * this file) and the live engine demoSimulatorTick (functions/src/demo-life/tick.ts).
 * functions/ cannot import src/, so it uses functions/src/lib/demo.ts (the mirror of
 * src/lib/demo.ts, same behaviour, both unit-tested).
 */
import { isDemoTenantId, isDemoUid } from '../lib/demo';
import { DEMO_REGISTRY_COLLECTION as REGISTRY_COLLECTION } from '../lib/demo-world';

type Rule = { re: RegExp; note: string };

const D_UID = 'demo_[A-Za-z0-9_-]+';
const D_TEN = 'demo-[A-Za-z0-9_-]+';

/** Path shapes the demo world may write. `{viewer}` segments are checked against the viewer set. */
const PATH_RULES: Rule[] = [
  { re: new RegExp(`^(users|streaks|military_declarations|connections|user_memberships)/${D_UID}$`), note: 'per-user doc' },
  { re: new RegExp(`^(workouts|feed_posts|sessions|userSchedule|dailyActivity|dailyActivityPublic)/${D_UID}$`), note: 'per-user record (id starts with the demo uid)' },
  { re: new RegExp(`^authorities/${D_TEN}$`), note: 'demo authority' },
  { re: new RegExp(`^tenants/${D_TEN}(/units/${D_TEN})?$`), note: 'demo tenant / unit' },
  { re: new RegExp(`^community_groups/${D_TEN}(/members/[^/]+)?$`), note: 'demo group' },
  { re: new RegExp(`^chats/(group_${D_TEN}|${D_UID}_${D_UID})(/messages/[^/]+)?$`), note: 'demo chat' },
  // registry docs + their subcollections (usage/days/{date}, life/feedback/{id}).
  { re: new RegExp(`^${REGISTRY_COLLECTION}/[^/]+(/[^/]+/[^/]+)?$`), note: 'registry' },
  // Live engine (demoSimulatorTick): presence pings and kudos inside the demo world.
  { re: new RegExp(`^presence/${D_UID}$`), note: 'demo presence (group mode, demo groups only)' },
  { re: new RegExp(`^kudos/[^/]+/inbox/[^/]+$`), note: 'kudos (recipient checked below)' },
];

/** Fields that name a user — must be demo (or a registered viewer). */
const UID_FIELDS = ['userId', 'uid', 'authorUid', 'createdBy', 'senderUid', 'lastSenderId', 'fromUid'] as const;
/** Fields that name an authority / tenant / scope — must be demo when present. */
const SCOPE_FIELDS = ['authorityId', 'tenantId', 'neighborhoodId', 'parentAuthorityId', 'orgId', 'scopeId', 'groupId'] as const;

export class DemoGuardError extends Error {}

function fail(path: string, why: string): never {
  throw new DemoGuardError(`[demo guard] refusing to write ${path}: ${why}`);
}

const okUid = (v: unknown, viewers: ReadonlySet<string>) => isDemoUid(v) || (typeof v === 'string' && viewers.has(v));

export interface GuardOptions {
  /** A partial update (merge / update) of an existing doc: users/{uid} need not carry the full core. */
  partial?: boolean;
}

/** The path alone (deletes): inside the demo world, member / kudos recipient demo or viewer. */
export function assertDemoPath(path: string, viewers: ReadonlySet<string> = new Set()): void {
  if (!PATH_RULES.some((r) => r.re.test(path))) fail(path, 'path is outside the demo world');
  const segs = path.split('/');
  if (segs[0] === 'community_groups' && segs[2] === 'members' && !okUid(segs[3], viewers)) fail(path, 'member is not demo / viewer');
  // kudos/{to}/inbox/{id}: the recipient is demo or a viewer.
  if (segs[0] === 'kudos' && !okUid(segs[1], viewers)) fail(path, 'kudos recipient is not demo / viewer');
}

export function assertDemoDoc(path: string, data: Record<string, unknown>, viewers: ReadonlySet<string> = new Set(), opts: GuardOptions = {}): void {
  assertDemoPath(path, viewers);
  const segs = path.split('/');
  if (segs[0] === 'presence') {
    const ids = data.audienceGroupIds;
    if (data.mode !== 'group' || !Array.isArray(ids) || !ids.length || ids.some((g) => !isDemoTenantId(g))) {
      fail(path, "demo presence is mode 'group' with demo audienceGroupIds only (never verified_global)");
    }
  }

  for (const f of UID_FIELDS) {
    const v = data[f];
    if (v !== undefined && v !== null && !okUid(v, viewers)) fail(path, `${f}=${String(v)} is not a demo user`);
  }
  for (const f of SCOPE_FIELDS) {
    const v = data[f];
    if (v !== undefined && v !== null && !isDemoTenantId(v)) fail(path, `${f}=${String(v)} is not a demo scope`);
  }
  for (const f of ['participants', 'following', 'followers'] as const) {
    const v = data[f];
    if (Array.isArray(v) && v.some((u) => !okUid(u, viewers))) fail(path, `${f} contains a non-demo user`);
  }
  const groupIds = data.groupIds;
  if (Array.isArray(groupIds) && groupIds.some((g) => !isDemoTenantId(g))) fail(path, 'groupIds contains a non-demo group');
  const social = data.social as { groupIds?: unknown } | undefined;
  if (social && Array.isArray(social.groupIds) && social.groupIds.some((g) => !isDemoTenantId(g))) fail(path, 'social.groupIds contains a non-demo group');
  const core = data.core as Record<string, unknown> | undefined;
  if (segs[0] === 'users' && opts.partial) {
    for (const f of ['authorityId', 'tenantId', 'neighborhoodId'] as const) {
      if (core && core[f] !== undefined && !isDemoTenantId(core[f])) fail(path, `core.${f} is not a demo scope`);
    }
  } else if (segs[0] === 'users') {
    if (!core || typeof core.demo !== 'object' || core.isMockData !== true || core.discoverable !== false) fail(path, 'a demo user needs core.demo, core.isMockData:true and core.discoverable:false');
    for (const f of ['authorityId', 'tenantId', 'neighborhoodId'] as const) {
      if (core[f] !== undefined && !isDemoTenantId(core[f])) fail(path, `core.${f} is not a demo scope`);
    }
    if (!isDemoTenantId(core.tenantId)) fail(path, 'a demo user always has a demo core.tenantId (else the leaderboard shard is _global)');
  }
  if ((segs[0] === 'authorities' || (segs[0] === 'tenants' && segs.length === 2)) && data.isDemo !== true) fail(path, 'a demo tenant needs isDemo:true');
  if ((segs[0] === 'feed_posts' || segs[0] === 'dailyActivityPublic' || segs[0] === 'streaks') && data.ageGroup !== 'demo') fail(path, "ageGroup must be 'demo'");
  if (segs[0] === 'community_groups' && segs.length === 2 && (data.isPublic !== false || data.isDemo !== true)) fail(path, 'a demo group is isPublic:false + isDemo:true');
}

/** Checks the whole list first; throws on the first bad doc (nothing has been written yet). */
export function assertDemoDocs(docs: ReadonlyArray<{ path: string; data: Record<string, unknown> }>, viewers: ReadonlySet<string> = new Set(), opts: GuardOptions = {}): void {
  for (const d of docs) assertDemoDoc(d.path, d.data, viewers, opts);
}
