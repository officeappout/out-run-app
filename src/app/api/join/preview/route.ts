/**
 * GET /api/join/preview?code=<inviteCode>
 *
 * Public (no auth required) — reads community_groups via Admin SDK so an
 * unauthenticated user can see group details before being prompted to sign in.
 *
 * Security constraints:
 *  1. Whitelist — only non-sensitive display fields are returned. Member
 *     identities, createdBy uid, and any minor-related data are never exposed.
 *  2. Rate limit — SPEC-02 SEC-15: shared Firestore-backed limiter
 *     (rateLimit.ts), replacing the per-instance in-memory Map this used
 *     to have — that reset on every serverless cold start (Vercel
 *     recycles instances routinely), so it never actually bounded a
 *     determined enumeration attempt in production.
 *  3. Read-only — this endpoint never writes. Joining (member write) happens
 *     via a separate authenticated endpoint after sign-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { resolveGroupIdByInviteCode } from '@/lib/joinEngine';
import { isRateLimited } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

// ── Field whitelist ───────────────────────────────────────────────────────────
// Explicit opt-in — adding a new sensitive field to community_groups will NOT
// accidentally leak it here. Never add: createdBy, members, inviteCode, or
// any uid / personal-data field.

const SAFE_FIELDS = [
  'name',
  'category',
  'description',
  'images',
  'scheduleSlots',
  'schedule',
  'meetingLocation',
  'rules',
  'isPublic',
  'memberCount',
  'currentParticipants',
] as const;

type SafeField = (typeof SAFE_FIELDS)[number];

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Rate limit by client IP.
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = (forwarded ? forwarded.split(',')[0] : null)?.trim() ?? 'unknown';
  const db = getAdminDb();
  if (await isRateLimited(db, `join-preview:${ip}`, { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS_PER_WINDOW })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // 2. Validate code format — alphanumeric + hyphen/underscore, 4–16 chars.
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  if (!code || !/^[A-Za-z0-9_-]{4,16}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
  }

  try {
    // SPEC-01 task 2b: same resolution helper as joinEngine — the code
    // lives in community_groups/{id}/private/invite (migration complete,
    // no legacy-field fallback — SPEC-02 Wave 0).
    const groupId = await resolveGroupIdByInviteCode(db, code);
    if (!groupId) {
      // Generic message — don't reveal whether the code format was valid.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const doc = await db.collection('community_groups').doc(groupId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const raw = doc.data() ?? {};

    // 3. Apply whitelist — copy only allowed fields.
    const preview: Partial<Record<SafeField, unknown>> & { id: string } = {
      id: doc.id,
    };
    for (const field of SAFE_FIELDS) {
      if (field in raw) preview[field] = raw[field];
    }

    // images: return at most the first (cover) image — no full gallery.
    if (Array.isArray(preview.images)) {
      preview.images = (preview.images as string[]).slice(0, 1);
    }

    return NextResponse.json({ group: preview });
  } catch (err) {
    console.error('[join/preview] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
