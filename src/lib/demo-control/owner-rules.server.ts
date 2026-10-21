import 'server-only';
/**
 * Owner rules — Admin SDK reads/writes of demo_registry/owner_rules for the "משוב דמו" tab
 * (super admin only; the routes check that). One doc get per read; a note is appended in a
 * transaction so two quick adds never get the same OWN id. See ./owner-rules-model.ts.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { DEMO_REGISTRY } from './paths';
import { OWNER_RULES_DOC, addNote, groupDismissals, parseOwnerRulesDoc, type DismissalGroup, type NoteInput, type OwnerNote } from './owner-rules-model';

export interface OwnerRulesView {
  notes: OwnerNote[];
  /** What the testers learned from "לא רלוונטי" marks (rule + screen groups). */
  learned: DismissalGroup[];
}

const ref = (db: Firestore) => db.collection(DEMO_REGISTRY).doc(OWNER_RULES_DOC);

export async function loadOwnerRules(db: Firestore): Promise<OwnerRulesView> {
  const doc = parseOwnerRulesDoc((await ref(db).get()).data());
  return { notes: [...doc.notes].reverse(), learned: groupDismissals(doc.dismissals) };
}

/** null = no free OWN id left. */
export async function addOwnerNote(db: Firestore, uid: string, input: NoteInput): Promise<OwnerNote | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db));
    const next = addNote(parseOwnerRulesDoc(snap.data()), input, Date.now());
    if (!next) return null;
    const notes = next.doc.notes.map((n) => (n.id === next.note.id ? { ...n, by: uid } : n));
    tx.set(ref(db), { notes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next.note;
  });
}
