/**
 * API Route: Fix iconKey on a gym_equipment document.
 *
 * POST /api/admin/equipment/fix-iconkey
 * Body: { documentName: string, correctIconKey: string }
 *
 * Finds the gym_equipment document by its `name` field (Hebrew),
 * then updates its `iconKey` to the correct canonical value.
 *
 * Example — fix the "אגן ואלכסוני" pelvis document:
 *   fetch('/api/admin/equipment/fix-iconkey', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       documentName: 'אגן ואלכסוני',
 *       correctIconKey: ''        // empty = remove the iconKey entirely
 *     })
 *   })
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const dynamic = 'force-dynamic';

const GYM_EQUIPMENT_COLLECTION = 'gym_equipment';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentName, correctIconKey } = body;

    if (!documentName || typeof documentName !== 'string') {
      return NextResponse.json(
        { error: 'documentName is required (Hebrew name of the gym_equipment doc)' },
        { status: 400 },
      );
    }

    const q = query(
      collection(db, GYM_EQUIPMENT_COLLECTION),
      where('name', '==', documentName),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return NextResponse.json(
        { error: `No gym_equipment document found with name "${documentName}"` },
        { status: 404 },
      );
    }

    const results: { id: string; oldIconKey: string | null; newIconKey: string | null }[] = [];

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const oldIconKey = data.iconKey ?? null;

      if (correctIconKey === '' || correctIconKey === null || correctIconKey === undefined) {
        await updateDoc(docSnap.ref, { iconKey: deleteField() });
        results.push({ id: docSnap.id, oldIconKey, newIconKey: null });
      } else {
        await updateDoc(docSnap.ref, { iconKey: correctIconKey });
        results.push({ id: docSnap.id, oldIconKey, newIconKey: correctIconKey });
      }
    }

    return NextResponse.json({
      status: 'fixed',
      documentsUpdated: results.length,
      results,
      message: `Updated ${results.length} document(s) matching "${documentName}".`,
    });
  } catch (error: any) {
    console.error('[fix-iconkey]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
