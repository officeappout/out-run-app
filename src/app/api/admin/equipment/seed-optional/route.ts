import { NextResponse } from 'next/server';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const OPTIONAL_NAMES_HE = new Set([
  'מזרן',
  'חבל קפיצה',
  'כיסא',
  'שולחן',
  'ספה',
  'דלת',
  'קיר',
  'מדרגות',
  'שרפרף',
]);

const OPTIONAL_NAMES_EN = new Set([
  'mat',
  'jump rope',
  'chair',
  'table',
  'sofa',
  'door',
  'wall',
  'stairs',
  'stool',
]);

export async function POST() {
  try {
    const snapshot = await getDocs(collection(db, 'gear_definitions'));
    const updated: string[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const nameHe = (data.name?.he || '').trim();
      const nameEn = (data.name?.en || '').trim().toLowerCase();

      if (OPTIONAL_NAMES_HE.has(nameHe) || OPTIONAL_NAMES_EN.has(nameEn)) {
        if (data.isOptional !== true) {
          await updateDoc(doc(db, 'gear_definitions', docSnap.id), {
            isOptional: true,
          });
          updated.push(`${nameHe || nameEn} (${docSnap.id})`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${updated.length} items as isOptional`,
      updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
