/**
 * /api/user/complete-profile
 *
 * POST { name, gender, birthDay, birthMonth, birthYear, isNewUser? }
 *
 * Server-side handler for the onboarding identity step.
 * Computes ageGroup from DOB so it can never be spoofed by the client,
 * then writes two documents atomically:
 *   1. users/{uid} — core identity fields including the derived ageGroup
 *   2. userAge/{uid} — tiny read-doc consumed by Firestore presence rules
 *      (avoids the 1 MiB get() limit on large user profiles).
 *
 * core.ageGroup and core.birthDate are locked from direct client writes in
 * firestore.rules (noLockedCoreFieldsChanged). All mutations MUST flow here.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * The caller may only update their own doc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { computeAgeGroup } from '@/lib/age';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────────
    const body = await request.json();
    const { name, gender, birthDay, birthMonth, birthYear, isNewUser } = body as {
      name: string;
      gender: 'male' | 'female' | 'other';
      birthDay: number;
      birthMonth: number;
      birthYear: number;
      isNewUser?: boolean;
    };

    if (!name?.trim() || !gender || !birthDay || !birthMonth || !birthYear) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Compute age server-side ───────────────────────────────────────────
    const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
    if (isNaN(birthDate.getTime())) {
      return NextResponse.json({ error: 'Invalid birth date' }, { status: 400 });
    }

    const ageGroup = computeAgeGroup(birthDate);

    // Minimum age enforcement — mirrors the UI block but holds server-side.
    // Anonymous auth lowers account-creation friction; this is the safety floor.
    const ageYears = (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 14) {
      return NextResponse.json({ error: 'under-minimum-age' }, { status: 403 });
    }

    // ── Atomic write ──────────────────────────────────────────────────────
    const db = getAdminDb();
    const batch = db.batch();

    const userRef = db.collection('users').doc(uid);

    // `isNewUser` is client-supplied and must not be trusted for a branch that
    // resets access-control fields (core.affiliations, core.accessLevel,
    // core.unlockedProgramIds) — a returning user who lands back on this screen
    // (e.g. adding a second onboarding track) sends isNewUser:true today with
    // no server-side check, silently wiping their city affiliation and access
    // level. core.name is the exact field this endpoint itself writes, so its
    // presence on the existing doc is ground truth over the client's claim.
    const existingSnap = await userRef.get();
    const alreadyIdentified = !!existingSnap.data()?.core?.name;
    const treatAsNewUser = isNewUser && !alreadyIdentified;

    if (treatAsNewUser) {
      // Full onboarding create — set the onboarding scaffolding too.
      // merge:true preserves any fields set earlier (e.g. by gateway).
      batch.set(userRef, {
        id:                 uid,
        onboardingPath:     'FULL_PROGRAM',
        onboardingStatus:   'IN_PROGRESS',
        onboardingStep:     'IDENTITY',
        onboardingProgress: 0,
        core: {
          name:               name.trim(),
          gender,
          birthDate,
          ageGroup,
          initialFitnessTier: 1,
          trackingMode:       'wellness',
          mainGoal:           'healthy_lifestyle',
          weight:             0,
          accessLevel:        1,
          affiliations:       [],
          unlockedProgramIds: [],
          isVerified:         false,
        },
        createdAt:  FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      // merge:true instead of mergeFields: the Firestore Admin SDK's applyTo()
      // compares mask paths (2-segment FieldPath('core','name')) against data keys
      // as single-segment FieldPath('core.name') — they never match, triggering
      // "Input data is missing for field 'core.name'." with flat dot-notation keys.
      // Using a nested object + merge:true avoids the mismatch entirely.
      // Only fields present in this object are touched; everything else is preserved.
      batch.set(userRef, {
        id:       uid,
        core:     { name: name.trim(), gender, birthDate, ageGroup },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // userAge/{uid} — tiny doc for Firestore Rules evaluation.
    // Written/overwritten every time identity is updated so it stays in sync.
    const userAgeRef = db.collection('userAge').doc(uid);
    batch.set(userAgeRef, {
      ageGroup,
      computedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({ ok: true, ageGroup });
  } catch (err) {
    console.error('[complete-profile] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
