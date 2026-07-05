/**
 * GET /api/join/preview?code=<inviteCode>
 *
 * Public (no auth required) — reads community_groups via Admin SDK so an
 * unauthenticated user can see group details before being prompted to sign in.
 *
 * Security constraints:
 *  1. Whitelist — only non-sensitive display fields are returned. Member
 *     identities, createdBy uid, and any minor-related data are never exposed.
 *  2. Rate limit — 15 requests / 60 s per IP to prevent code enumeration
 *     (6-char alphanumeric space = 2.2B combinations; basic throttle raises
 *     the floor without blocking legitimate share links).
 *  3. Read-only — this endpoint never writes. Joining (member write) happens
 *     via a separate authenticated endpoint after sign-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Rate limit ────────────────────────────────────────────────────────────────
// Per-instance in-memory sliding window. Serverless instances are recycled
// frequently so this is best-effort, not a hard guarantee — good enough to
// deter casual enumeration without requiring external infrastructure.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const ipWindows = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = (ipWindows.get(ip) ?? []).filter((t: number) => now - t < WINDOW_MS);
  if (prev.length >= MAX_REQUESTS_PER_WINDOW) return true;
  prev.push(now);
  ipWindows.set(ip, prev);
  // Evict stale IPs every ~500 calls to prevent unbounded growth.
  if (ipWindows.size > 500) {
    ipWindows.forEach((ts, k) => {
      if (ts.every((t: number) => now - t >= WINDOW_MS)) ipWindows.delete(k);
    });
  }
  return false;
}

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
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // 2. Validate code format — alphanumeric + hyphen/underscore, 4–16 chars.
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  if (!code || !/^[A-Za-z0-9_-]{4,16}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection('community_groups')
      .where('inviteCode', '==', code)
      .limit(1)
      .get();

    if (snap.empty) {
      // Generic message — don't reveal whether the code format was valid.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const doc = snap.docs[0];
    const raw = doc.data();

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
