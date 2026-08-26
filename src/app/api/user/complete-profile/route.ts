/**
 * /api/user/complete-profile
 *
 * POST { name, gender, birthDay, birthMonth, birthYear }
 *
 * Server-side handler for the onboarding identity step.
 * Computes ageGroup from DOB so it can never be spoofed by the client,
 * then writes two documents atomically:
 *   1. users/{uid} — core identity fields including the derived ageGroup
 *   2. userAge/{uid} — tiny read-doc consumed by Firestore presence rules
 *      (avoids the 1 MiB get() limit on large user profiles).
 *
 * Every field in the users/{uid} write is decided independently — either
 * "always overwrite with what was just submitted" or "fill in only if
 * missing, never overwrite" — instead of one binary new-vs-returning branch.
 * See the inline comments below for why: a single field's presence (or
 * absence) is never a reliable signal for a whole document's state, because
 * other writers (e.g. the challenge-booth join flow) can legitimately create
 * a partial profile this endpoint later has to complete correctly.
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
import { hasKnownIdentity } from '@/lib/identity';

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
    const { name, gender, birthDay, birthMonth, birthYear } = body as {
      name: string;
      gender: 'male' | 'female' | 'other';
      birthDay: number;
      birthMonth: number;
      birthYear: number;
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

    // ── Read existing state ─────────────────────────────────────────────────
    // Every decision below is field-by-field, not one "new vs returning"
    // branch gated by a single field's presence — that pattern (first
    // core.name alone, and a since-rejected proposal to check
    // onboardingStatus alone instead) is exactly how this bug class keeps
    // recurring: whichever single field is checked, some other writer
    // eventually sets THAT field without the rest, and the same class of bug
    // reappears under a different name. If this read fails there is no safe
    // fallback — without knowing what already exists we can't tell a missing
    // field from a real value — so it propagates to the outer catch (500)
    // rather than risk silently overwriting real data with defaults.
    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    const existingSnap = await userRef.get();
    const existingCore = existingSnap.data()?.core;

    // ── Atomic write ──────────────────────────────────────────────────────
    const batch = db.batch();

    // Question A — do we know who this is? "Identity" is one atomic bundle
    // collected together on one screen (name + gender + birthDate) — missing
    // any of the three means we don't actually know this user yet. This is
    // the only signal that gates the onboarding-progress scaffold below.
    const isFirstIdentitySubmission = !hasKnownIdentity(existingCore);

    // Question B — which fields need initializing? Answered per field.
    //
    // Always overwritten with what was just submitted in this request:
    const coreUpdate: Record<string, unknown> = {
      name: name.trim(),
      gender,
      birthDate,
      ageGroup,
    };

    // Onboarding-progress scaffold — set together, only on a genuinely first
    // identity submission. Never regress a user who's already further along
    // (or already COMPLETED) back to the identity step — onboardingStatus
    // being silently reset to IN_PROGRESS for a returning user was part of
    // the original bug this endpoint had.
    const scaffoldUpdate: Record<string, unknown> = {};
    if (isFirstIdentitySubmission) {
      scaffoldUpdate.onboardingPath = 'FULL_PROGRAM';
      scaffoldUpdate.onboardingStatus = 'IN_PROGRESS';
      scaffoldUpdate.onboardingStep = 'IDENTITY';
      scaffoldUpdate.onboardingProgress = 0;
    }

    // Access-control / personalization defaults — filled in only when
    // actually missing from the existing doc, independently per field, never
    // overwritten. This is exactly what silently reset core.affiliations/
    // accessLevel for a returning user before this fix, and exactly what a
    // minimal-profile writer elsewhere (e.g. the challenge-booth join flow,
    // which sets core.name/gender but not birthDate or any of these) needs
    // filled in rather than left permanently missing.
    if (existingCore?.initialFitnessTier === undefined) coreUpdate.initialFitnessTier = 1;
    if (existingCore?.trackingMode === undefined) coreUpdate.trackingMode = 'wellness';
    if (existingCore?.mainGoal === undefined) coreUpdate.mainGoal = 'healthy_lifestyle';
    if (existingCore?.weight === undefined) coreUpdate.weight = 0;
    if (existingCore?.accessLevel === undefined) coreUpdate.accessLevel = 1;
    if (existingCore?.affiliations === undefined) coreUpdate.affiliations = [];
    if (existingCore?.unlockedProgramIds === undefined) coreUpdate.unlockedProgramIds = [];
    if (existingCore?.isVerified === undefined) coreUpdate.isVerified = false;

    // merge:true instead of mergeFields: the Firestore Admin SDK's applyTo()
    // compares mask paths (2-segment FieldPath('core','name')) against data keys
    // as single-segment FieldPath('core.name') — they never match, triggering
    // "Input data is missing for field 'core.name'." with flat dot-notation keys.
    // Using a nested object + merge:true avoids the mismatch entirely.
    // Only fields present in this object are touched; everything else is preserved.
    batch.set(userRef, {
      id: uid,
      ...scaffoldUpdate,
      core: coreUpdate,
      // createdAt must never be overwritten on an existing doc — only set it
      // the first time this uid's doc is created.
      ...(existingSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

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
