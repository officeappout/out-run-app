/**
 * API Route: Sanitize legacy equipment field from exercise documents.
 *
 * POST /api/admin/exercises/sanitize-legacy
 * Body: { exerciseId: string }          — clean one exercise
 *   OR: { exerciseId: string, dryRun: true } — preview what would be removed
 *
 * The legacy `equipment` field (EquipmentType[]) pre-dates the
 * executionMethods system. When exercises are duplicated, the old
 * array is copied verbatim — causing "ghost gear" in the app that
 * the Admin UI cannot see or edit.
 *
 * This endpoint deletes the field entirely from the Firestore document
 * using FieldValue.delete().
 */

import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const dynamic = 'force-dynamic';

const EXERCISES_COLLECTION = 'exercises';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { exerciseId, dryRun = false } = body;

    if (!exerciseId || typeof exerciseId !== 'string') {
      return NextResponse.json(
        { error: 'exerciseId is required' },
        { status: 400 },
      );
    }

    const docRef = doc(db, EXERCISES_COLLECTION, exerciseId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return NextResponse.json(
        { error: `Exercise ${exerciseId} not found` },
        { status: 404 },
      );
    }

    const data = snap.data();
    const legacyEquipment: string[] = Array.isArray(data.equipment)
      ? data.equipment
      : [];

    if (legacyEquipment.length === 0) {
      return NextResponse.json({
        exerciseId,
        status: 'clean',
        message: 'No legacy equipment field found — nothing to do.',
      });
    }

    if (dryRun) {
      return NextResponse.json({
        exerciseId,
        status: 'preview',
        legacyEquipment,
        message: `Found ${legacyEquipment.length} legacy entries. Pass dryRun: false to remove them.`,
      });
    }

    await updateDoc(docRef, { equipment: deleteField() });

    return NextResponse.json({
      exerciseId,
      status: 'sanitized',
      removed: legacyEquipment,
      message: `Removed legacy equipment field with ${legacyEquipment.length} entries.`,
    });
  } catch (error: any) {
    console.error('[sanitize-legacy]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
