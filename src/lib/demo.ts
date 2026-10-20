/**
 * Demo world — identity helpers (PR 1 of agent-briefs/demo-users-design.md,
 * owner-approved 20.10.2026). Pure, no Firebase import.
 *
 * MIRROR of functions/src/lib/demo.ts (functions/ cannot import from src/) — keep the
 * two files identical in behaviour; both have their own unit tests.
 *
 * The demo world is closed: demo users, demo cities (authorities), demo units
 * and demo orgs (tenants) only ever see and count each other. Every trigger
 * that fans activity OUT of a user's own docs uses these to stay inside it.
 *
 * Markers (approved additive fields):
 *   users/{uid}            uid starts with `demo_`, and/or core.demo = { tenantId, personaId, v }
 *   authorities/{id}       isDemo: true (id starts with `demo-`)
 *   tenants/{id}           isDemo: true (id starts with `demo-`)
 *
 * Exclusion checks are OR-ed (any marker ⇒ demo): a guard that keeps demo out
 * of a real surface must fail closed. Nothing destructive keys off these —
 * the purge script (PR 3) requires BOTH markers.
 */

export const DEMO_UID_PREFIX = 'demo_';
export const DEMO_TENANT_PREFIX = 'demo-';

/** uid of a simulated demo user (no Firestore read needed). */
export function isDemoUid(uid: unknown): boolean {
  return typeof uid === 'string' && uid.startsWith(DEMO_UID_PREFIX);
}

/** id of a demo authority / tenant / neighborhood / group. */
export function isDemoTenantId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(DEMO_TENANT_PREFIX);
}

/** users/{uid}.core carries the demo stamp. */
export function isDemoCore(core: unknown): boolean {
  if (!core || typeof core !== 'object') return false;
  const demo = (core as { demo?: unknown }).demo;
  return !!demo && typeof demo === 'object';
}

/** A user is demo by uid prefix OR by the core.demo stamp. */
export function isDemoUser(uid: unknown, core?: unknown): boolean {
  return isDemoUid(uid) || isDemoCore(core);
}

/** An authority / tenant doc is demo by isDemo:true OR by the `demo-` id prefix. */
export function isDemoTenant(doc: { isDemo?: unknown } | null | undefined, id?: unknown): boolean {
  return doc?.isDemo === true || isDemoTenantId(id);
}

/** Drops every demo uid — for audiences of real users (push, public mirrors). */
export function withoutDemoUids<T extends string>(uids: readonly T[]): T[] {
  return uids.filter((u) => !isDemoUid(u));
}

/**
 * Audience of an action whose ACTOR is a demo user: only other demo users and
 * the owner's registered viewer accounts (demo_registry/viewers.uids). A real
 * user can never be notified by a demo actor.
 */
export function restrictToDemoWorld<T extends string>(uids: readonly T[], viewerUids: ReadonlySet<string>): T[] {
  return uids.filter((u) => isDemoUid(u) || viewerUids.has(u));
}

/**
 * League scopes a demo user's activity may count toward: demo scopes only
 * (city / neighborhood / group ids with the `demo-` prefix). A real user's
 * targets are returned untouched.
 */
export function demoSafeScopeTargets<T extends { scopeId: string }>(uid: unknown, core: unknown, targets: T[]): T[] {
  if (!isDemoUser(uid, core)) return targets;
  return targets.filter((t) => isDemoTenantId(t.scopeId));
}

// ── Client / API-route only (no functions/ counterpart needed) ────────────────

/**
 * A league scope (city / neighborhood authority) belongs to the demo world:
 * its own doc says isDemo, its id has the `demo-` prefix, or its parent
 * authority does. National boards drop these; a demo city's own
 * neighborhood board (explicit demo parent) keeps them.
 */
export function isDemoScope(id: string, meta?: { isDemo?: unknown; parentId?: string | null } | null): boolean {
  return isDemoTenant(meta ?? null, id) || isDemoTenantId(meta?.parentId);
}

/** Owner / scope fields a demo-world doc can be recognised by. */
const DEMO_OWNER_FIELDS = ['userId', 'uid', 'createdBy', 'ownerId', 'leaderUserId', 'organizerId'] as const;
const DEMO_SCOPE_FIELDS = ['authorityId', 'tenantId', 'scopeId', 'groupId', 'orgId'] as const;

/**
 * A client-read doc (group, planned session, event, presence…) belongs to the
 * demo world: isDemo:true, a demo id, a demo owner uid, or a demo scope id.
 * Real-user surfaces drop these (belt and braces — demo docs are written so
 * the public queries don't return them in the first place, design L2).
 */
export function isDemoDoc(data: Record<string, unknown> | null | undefined, id?: unknown): boolean {
  if (isDemoUid(id) || isDemoTenantId(id)) return true;
  if (!data) return false;
  if (data.isDemo === true) return true;
  if (DEMO_OWNER_FIELDS.some((f) => isDemoUid(data[f]))) return true;
  return DEMO_SCOPE_FIELDS.some((f) => isDemoTenantId(data[f]));
}

/** Drops demo-world docs from a list of `{ id, ...data }` items. */
export function withoutDemoDocs<T extends { id?: unknown }>(items: readonly T[]): T[] {
  return items.filter((item) => !isDemoDoc(item as unknown as Record<string, unknown>, item.id));
}
