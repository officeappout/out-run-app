/**
 * CRUD service for the pressure_messages collection (Dynamic Message Engine).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  MessageTemplate,
  MessageCategory,
} from '@/types/message-template.types';

const COL = 'pressure_messages';

function normalize(id: string, data: any): MessageTemplate {
  return {
    id,
    category: data.category ?? 'city_pressure',
    psychologyTag: data.psychologyTag ?? 'Health',
    textMale: data.textMale ?? '',
    textFemale: data.textFemale ?? '',
    isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt
          ? new Date(data.createdAt)
          : undefined,
    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : data.updatedAt
          ? new Date(data.updatedAt)
          : undefined,
  };
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getAllMessageTemplates(): Promise<MessageTemplate[]> {
  const q = query(collection(db, COL), orderBy('category'), orderBy('psychologyTag'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalize(d.id, d.data()));
}

export async function getTemplatesByCategory(
  category: MessageCategory,
): Promise<MessageTemplate[]> {
  const q = query(
    collection(db, COL),
    where('category', '==', category),
    where('isActive', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalize(d.id, d.data()));
}

/**
 * Pick a random active template for a category, returning the gendered text.
 * Falls back to a hardcoded default if no templates exist.
 */
export async function pickTemplate(
  category: MessageCategory,
  gender: 'male' | 'female' | 'other',
): Promise<string> {
  const templates = await getTemplatesByCategory(category);
  if (templates.length === 0) return '';
  const pick = templates[Math.floor(Math.random() * templates.length)];
  return gender === 'female' ? pick.textFemale : pick.textMale;
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function createMessageTemplate(
  data: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMessageTemplate(
  id: string,
  data: Partial<Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMessageTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
