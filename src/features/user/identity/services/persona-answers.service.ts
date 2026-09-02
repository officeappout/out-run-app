/**
 * savePersonaAnswers() — the sole writer of persona follow-up-question
 * answers (Phase 3b, docs/research/military-persona-unified-architecture.md
 * §3ב part ג.3). Every call site (the drawer itself, a future "profile →
 * edit affiliation" screen in Phase 5) must go through this function, not
 * write `personas[]` or `military_declarations` directly.
 *
 * Uses a transaction, not a bare getDoc+update — a prior version of this
 * function read `users/{uid}.personas[]` then replaced the whole array in
 * a separate write. Two near-simultaneous calls (two tabs, a retry after a
 * network failure) would both read the same stale array and the second
 * write would silently clobber the first persona's entry with no error.
 * runTransaction() makes the read+write atomic and Firestore automatically
 * retries on contention, closing that race.
 */
import {
  doc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PersonaId, PersonaAnswersMap, AnyPersonaEntry } from '@/types/persona.types';

export async function savePersonaAnswers<P extends PersonaId>(
  uid: string,
  personaId: P,
  answers: PersonaAnswersMap[P],
): Promise<void> {
  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    // All reads in a transaction must precede all writes — read the user
    // doc once; military_declarations is write-only below (no prior value
    // is needed to compute the next one).
    const userSnap = await tx.get(userRef);
    const personas = ((userSnap.exists() ? userSnap.data().personas : []) ?? []) as AnyPersonaEntry[];

    const idx = personas.findIndex((p) => p.id === personaId);
    const newEntry = {
      id: personaId,
      // Iron rule carried over from Phase 3a: military never writes real
      // content into personas[].answers — that's exactly the field exposed
      // to any authenticated user for any core.discoverable profile (see
      // the military_declarations design in firestore.rules). Real content
      // lives ONLY in military_declarations/{uid} below.
      answers: personaId === 'military' ? {} : answers,
      updatedAt: Timestamp.now(),
    } as AnyPersonaEntry;

    const nextPersonas = idx >= 0
      ? personas.map((p, i) => (i === idx ? newEntry : p))
      : [...personas, newEntry];

    tx.update(userRef, { personas: nextPersonas });

    if (personaId === 'military') {
      const militaryRef = doc(db, 'military_declarations', uid);
      tx.set(militaryRef, {
        ...answers,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    }
  });
}
