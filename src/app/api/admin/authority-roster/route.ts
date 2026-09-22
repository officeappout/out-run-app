/**
 * GET /api/admin/authority-roster?authorityId=...
 *
 * super_admin / system_admin ONLY. Returns the FULL per-resident roster for
 * one authority — privacy-safe name (first name + last-name initial, the
 * same split this screen has always used), age, gender, neighborhood, XP,
 * level, last-active. This restores exactly what /admin/authority/users
 * showed before the 22.09.2026 city-summary change, per the product
 * owner's decision: super_admin keeps full cross-city visibility here;
 * authority managers lose this screen/tab entirely and get aggregate-only
 * numbers from the separate /api/authority-manager/city-summary endpoint.
 *
 * Deliberately a SEPARATE file with NO shared query code with
 * city-summary/route.ts — so a bug or future change in one can never leak
 * into the other's very different data-shape guarantee (full roster here,
 * strictly aggregate-only there).
 *
 * Authorization mirrors admin/users/all/page.tsx's client-side gate
 * (`roleInfo.isSuperAdmin || roleInfo.isSystemAdmin`) EXACTLY — same
 * isRootAdmin/isAdminEmailAllowed helpers, same core.isSuperAdmin/
 * core.isSystemAdmin/core.role checks — but re-verified server-side from
 * the caller's own stored doc and the verified ID token's email, never
 * from anything the client claims about itself.
 *
 * authorityId comes from the query string here (super_admin picks a city
 * from a dropdown) — unlike city-summary, which forbids that on purpose.
 * This is safe only because the caller must independently prove
 * isSuperAdmin || isSystemAdmin server-side first; a role that can see
 * every city has no per-city scoping to bypass.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin, isAdminEmailAllowed } from '@/config/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RosterEntry {
  firstName: string;
  lastInitial: string;
  gender: string | null;
  age: number | null;
  neighborhood: string | null;
  daysActive: number;
  globalXP: number;
  globalLevel: number;
  lastActiveRaw: number | null;
  photoURL: string | null;
}

function getPrivacyName(fullName: string): { firstName: string; lastInitial: string } {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'ללא שם';
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] + '׳' : '';
  return { firstName, lastInitial };
}

function calculateAge(birthDate: any): number | null {
  if (!birthDate) return null;
  let date: Date | null = null;
  if (birthDate instanceof Date) date = birthDate;
  else if (typeof birthDate?.toDate === 'function') date = birthDate.toDate();
  else if (typeof birthDate?.seconds === 'number') date = new Date(birthDate.seconds * 1000);
  else if (typeof birthDate?._seconds === 'number') date = new Date(birthDate._seconds * 1000);
  if (!date || isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
  return age;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    let tokenEmail: string | null;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
      tokenEmail = (decoded.email as string | undefined) ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();

    // Same super_admin/system_admin resolution as checkUserRole() — re-verified
    // here from the caller's own stored doc + verified token email, never from
    // anything the client claims about itself.
    const callerSnap = await db.collection('users').doc(uid).get();
    const callerCore = callerSnap.data()?.core ?? {};

    let isSuperAdmin = callerCore.isSuperAdmin === true;
    const isSystemAdmin = callerCore.isSystemAdmin === true || callerCore.role === 'system_admin';

    const emailToCheck = tokenEmail || callerCore.email || null;
    if (isAdminEmailAllowed(emailToCheck) && !isSuperAdmin) isSuperAdmin = true;
    if (isRootAdmin(emailToCheck)) isSuperAdmin = true;

    if (!isSuperAdmin && !isSystemAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const authorityId = request.nextUrl.searchParams.get('authorityId');
    if (!authorityId) {
      return NextResponse.json({ error: 'authorityId required' }, { status: 400 });
    }

    const snapshot = await db.collection('users').where('core.authorityId', '==', authorityId).get();

    const roster: RosterEntry[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const core = data?.core ?? {};
      const progression = data?.progression ?? {};
      const { firstName, lastInitial } = getPrivacyName(core.name || '');

      let lastActiveRaw: number | null = null;
      if (typeof data?.lastActive?.toDate === 'function') lastActiveRaw = data.lastActive.toDate().getTime();
      else if (typeof data?.lastActive?.seconds === 'number') lastActiveRaw = data.lastActive.seconds * 1000;
      else if (data?.lastActive instanceof Date) lastActiveRaw = data.lastActive.getTime();

      return {
        firstName,
        lastInitial,
        gender: core.gender ?? null,
        age: calculateAge(core.birthDate),
        neighborhood: data?.neighborhood ?? null,
        daysActive: progression.daysActive ?? 0,
        globalXP: progression.globalXP ?? 0,
        globalLevel: progression.globalLevel ?? 1,
        lastActiveRaw,
        photoURL: core.photoURL ?? null,
      };
    });

    return NextResponse.json({ authorityId, roster });
  } catch (err: any) {
    console.error('[/api/admin/authority-roster] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
