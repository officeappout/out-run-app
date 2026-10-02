import 'server-only';
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-session';

/**
 * True when the request carries valid admin credentials, via either:
 *   1. `X-Agent-Key` header matching AGENT_API_KEY env var (machine-to-machine), or
 *   2. `Authorization: Bearer <Firebase ID token>` (verified by the Admin SDK), or
 *   3. the `out_admin_session` HMAC cookie (same credential the middleware checks).
 *
 * To rotate the agent key: change AGENT_API_KEY in .env.local (and Vercel env vars)
 * and restart the server — no code change required.
 */
export async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  // 1. Agent API key — constant-time compare to prevent timing attacks
  const agentKey = process.env.AGENT_API_KEY;
  if (agentKey) {
    const presented = request.headers.get('x-agent-key') ?? '';
    if (presented.length === agentKey.length) {
      const a = Buffer.from(presented);
      const b = Buffer.from(agentKey);
      if (timingSafeEqual(a, b)) return true;
    }
  }

  // 2. Firebase Bearer token
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) {
    try {
      const identity = await resolveIdentity(bearer);
      if (identity.admin) return true;
    } catch (err) {
      console.warn('[api-auth] Bearer verification failed:', err);
    }
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    const session = await verifyAdminSession(cookie);
    if (session?.admin === true) return true;
  }

  return false;
}

/**
 * Route guard for admin API endpoints.
 * Returns `null` when authorized; otherwise a 401 NextResponse to return early.
 *
 *   const denied = await requireAdminApi(request);
 *   if (denied) return denied;
 */
export async function requireAdminApi(request: NextRequest): Promise<NextResponse | null> {
  if (await isAuthorizedAdmin(request)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Section-level guard for sensitive API routes.
 * Returns `null` when access is granted; otherwise a 401/403 NextResponse.
 *
 * Access rules (in order):
 *   1. Machine-to-machine (AGENT_API_KEY) — always allowed.
 *   2. Super admins (`core.isSuperAdmin === true`) — always allowed.
 *   3. Users with `sectionKey` in their `core.allowedSections[]` — allowed.
 *   4. Everyone else — 403 Forbidden.
 *
 *   const denied = await requireSection(request, 'municipal');
 *   if (denied) return denied;
 */
export async function requireSection(
  request: NextRequest,
  sectionKey: string,
): Promise<NextResponse | null> {
  // 1. Agent API key — machine-to-machine, always allow
  const agentKey = process.env.AGENT_API_KEY;
  if (agentKey) {
    const presented = request.headers.get('x-agent-key') ?? '';
    if (presented.length === agentKey.length) {
      const a = Buffer.from(presented);
      const b = Buffer.from(agentKey);
      if (timingSafeEqual(a, b)) return null;
    }
  }

  // Resolve uid from Bearer token or session cookie
  let uid: string | null = null;

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) {
    try {
      const identity = await resolveIdentity(bearer);
      if (identity.admin) uid = identity.uid;
    } catch { /* fall through to cookie */ }
  }

  if (!uid) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (cookie) {
      const session = await verifyAdminSession(cookie);
      if (session?.admin === true) uid = session.uid;
    }
  }

  if (!uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2+3. Read user core from Firestore
  const { getAdminDb } = await import('@/lib/firebase-admin');
  const db = getAdminDb();
  const userSnap = await db.collection('users').doc(uid).get();
  const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;

  if (core.isSuperAdmin === true) return null;

  // Vertical admin implicitly has their managed vertical's section
  if (core.isVerticalAdmin === true) {
    const VERTICAL_SECTION: Record<string, string> = {
      municipal: 'municipal',
      military: 'military',
      educational: 'educational',
    };
    const implied = VERTICAL_SECTION[core.managedVertical as string ?? ''];
    if (implied === sectionKey) return null;
  }

  const allowedSections = Array.isArray(core.allowedSections)
    ? (core.allowedSections as string[])
    : [];

  if (allowedSections.includes(sectionKey)) return null;

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function checkAgentKey(request: NextRequest): boolean {
  const agentKey = process.env.AGENT_API_KEY;
  if (!agentKey) return false;
  const presented = request.headers.get('x-agent-key') ?? '';
  if (presented.length !== agentKey.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(agentKey));
}

/** Resolves the calling admin's uid from a Bearer ID token or session cookie (agent-key is checked separately by callers). Null when neither resolves to an admin. */
async function resolveAdminUid(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) {
    try {
      const identity = await resolveIdentity(bearer);
      if (identity.admin) return identity.uid;
    } catch { /* fall through to cookie */ }
  }
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    const session = await verifyAdminSession(cookie);
    if (session?.admin === true) return session.uid;
  }
  return null;
}

/**
 * Agent key OR a superAdmin OR authorityManager session/Bearer token.
 * Extracted (31.08.2026) from dem-recompute/route.ts, which originally built
 * this inline. Deliberately NOT requireSection() — that helper's role check
 * never recognizes isAuthorityManager. Must keep matching the canonical
 * route editor's own gate (`!role.isSuperAdmin && !role.isAuthorityManager`)
 * exactly, or authority managers who can fully edit/save a route would
 * silently lose access to any route guarded by this function.
 *
 *   const denied = await requireRouteEditAccess(request);
 *   if (denied) return denied;
 */
export async function requireRouteEditAccess(request: NextRequest): Promise<NextResponse | null> {
  if (checkAgentKey(request)) return null;
  const uid = await resolveAdminUid(request);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getAdminDb } = await import('@/lib/firebase-admin');
  const db = getAdminDb();
  const userSnap = await db.collection('users').doc(uid).get();
  const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;
  if (core.isSuperAdmin === true) return null;

  const managedSnap = await db.collection('authorities').where('managerIds', 'array-contains', uid).limit(1).get();
  if (!managedSnap.empty) return null;

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Agent key OR superAdmin only — no authorityManager path. For all-cities
 * triage surfaces (e.g. the route-decisions accuracy queue) that are a
 * super-admin operation by design: reviewing every city at once doesn't fit
 * a single authority manager's normal single-city scope.
 *
 *   const denied = await requireSuperAdminApi(request);
 *   if (denied) return denied;
 */
export async function requireSuperAdminApi(request: NextRequest): Promise<NextResponse | null> {
  if (checkAgentKey(request)) return null;
  const uid = await resolveAdminUid(request);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getAdminDb } = await import('@/lib/firebase-admin');
  const db = getAdminDb();
  const userSnap = await db.collection('users').doc(uid).get();
  const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;
  if (core.isSuperAdmin === true) return null;

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
