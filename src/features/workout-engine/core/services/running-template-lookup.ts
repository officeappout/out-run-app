import { collection, getDocs, query, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * runWorkoutTemplates docs whose Hebrew name is `name`, for BOTH shapes (plain string, or {he,en} once English is
 * imported). The admin import pages use it for idempotency, so a re-run never duplicates a template.
 */
export async function findRunWorkoutTemplatesByName(name: string): Promise<{ size: number; docs: QueryDocumentSnapshot[] }> {
  const col = collection(db, 'runWorkoutTemplates');
  const [plain, localized] = await Promise.all([
    getDocs(query(col, where('name', '==', name))),
    getDocs(query(col, where('name.he', '==', name))),
  ]);
  const docs = [...plain.docs, ...localized.docs];
  return { size: docs.length, docs };
}
