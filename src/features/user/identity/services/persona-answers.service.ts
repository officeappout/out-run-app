/**
 * savePersonaAnswers() — the sole writer of persona follow-up-question
 * answers (Phase 3b, docs/research/military-persona-unified-architecture.md
 * §3ב part ג.3). addPersona()/removePersona() are its sibling writers for
 * the "הפרסונות שלי" profile area (Phase 5, §5 part ד) — same file, no new
 * write path. Every call site (the drawer, the profile area) must go
 * through these, not write `personas[]` or a sensitive-storage collection
 * directly.
 *
 * Uses a transaction, not a bare getDoc+update — a prior version of
 * savePersonaAnswers() read `users/{uid}.personas[]` then replaced the
 * whole array in a separate write. Two near-simultaneous calls (two tabs,
 * a retry after a network failure) would both read the same stale array
 * and the second write would silently clobber the first persona's entry
 * with no error. runTransaction() makes the read+write atomic and
 * Firestore automatically retries on contention, closing that race.
 */
import {
  doc,
  deleteDoc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PersonaId, PersonaAnswersMap, AnyPersonaEntry } from '@/types/persona.types';
import { PERSONA_SENSITIVE_STORAGE } from '@/types/persona-question.types';

export async function savePersonaAnswers<P extends PersonaId>(
  uid: string,
  personaId: P,
  answers: PersonaAnswersMap[P],
): Promise<void> {
  // Sensitivity is a property of the PERSONA, not of one question inside
  // it (Phase 5 review, 03.09.2026) — see PERSONA_SENSITIVE_STORAGE's own
  // doc comment. Driven entirely by config: adding the NEXT persona that
  // needs its own protected document is a config-map edit, not a change
  // to this function.
  const sensitiveCollection = PERSONA_SENSITIVE_STORAGE[personaId];

  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    // All reads in a transaction must precede all writes — read the user
    // doc once; the sensitive-storage doc (if any) is write-only below (no
    // prior value is needed to compute the next one).
    const userSnap = await tx.get(userRef);
    const personas = ((userSnap.exists() ? userSnap.data().personas : []) ?? []) as AnyPersonaEntry[];

    const idx = personas.findIndex((p) => p.id === personaId);
    const newEntry = {
      id: personaId,
      // A persona listed in PERSONA_SENSITIVE_STORAGE never writes real
      // content into personas[].answers — that's exactly the field exposed
      // to any authenticated user for any core.discoverable profile (see
      // firestore.rules' military_declarations comment). Real content
      // lives ONLY in the sensitive-storage collection below.
      answers: sensitiveCollection ? {} : answers,
      updatedAt: Timestamp.now(),
    } as AnyPersonaEntry;

    const nextPersonas = idx >= 0
      ? personas.map((p, i) => (i === idx ? newEntry : p))
      : [...personas, newEntry];

    tx.update(userRef, { personas: nextPersonas });

    if (sensitiveCollection) {
      tx.set(doc(db, sensitiveCollection, uid), {
        ...answers,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    }
  });
}

/**
 * Adds a persona with no answers yet (the "+ הוסף פרסונה" action, Phase 5).
 * No-op if the user already has it — never duplicates an entry.
 */
export async function addPersona(uid: string, personaId: PersonaId): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    const personas = ((userSnap.exists() ? userSnap.data().personas : []) ?? []) as AnyPersonaEntry[];
    if (personas.some((p) => p.id === personaId)) return;

    const newEntry = { id: personaId, answers: {}, updatedAt: Timestamp.now() } as AnyPersonaEntry;
    tx.update(userRef, { personas: [...personas, newEntry] });
  });
}

/**
 * Removes a persona AND deletes its answers outright (Phase 5 decision,
 * 03.09.2026 — no soft-delete/retention). Reasoning, for whoever revisits
 * this: (1) consistency with this whole project's "clean redefinition, no
 * zombie state" principle since the Phase 2 persona-model rewrite; (2) for
 * a persona in PERSONA_SENSITIVE_STORAGE specifically, the entire point of
 * its protected document was minimizing exposure of self-declared sensitive
 * data — retaining it indefinitely after the user explicitly said "not me"
 * undermines that same intent; (3) the "oops, I removed it by accident"
 * case is better solved by an explicit confirmation naming the consequence
 * before it happens (the caller's job — see SettingsModal.tsx's remove
 * confirmation copy) than by silently keeping sensitive data around forever
 * "just in case."
 */
export async function removePersona(uid: string, personaId: PersonaId): Promise<void> {
  const sensitiveCollection = PERSONA_SENSITIVE_STORAGE[personaId];
  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    const personas = ((userSnap.exists() ? userSnap.data().personas : []) ?? []) as AnyPersonaEntry[];
    tx.update(userRef, { personas: personas.filter((p) => p.id !== personaId) });
  });

  // Firestore transactions can't delete a doc conditionally on a prior read
  // outside the same doc's own history, but this delete has no ordering
  // dependency on the transaction above (it's a distinct document, and
  // "delete regardless of current content" is exactly what removal means)
  // — a plain deleteDoc is correct and simpler than forcing it into the tx.
  if (sensitiveCollection) {
    await deleteDoc(doc(db, sensitiveCollection, uid)).catch(() => {
      // Already absent — fine, deletes are idempotent here.
    });
  }
}
