'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AnyPersonaEntry, PersonaId } from '@/types/persona.types';
import {
  PERSONA_QUESTIONS,
  PERSONA_SENSITIVE_STORAGE,
  type PersonaQuestionConfig,
} from '@/types/persona-question.types';

export interface ResolvedPersonaSummary {
  loading: boolean;
  /** The real answer values (from personas[].answers or the sensitive
   *  collection, whichever applies) — for pre-filling an edit flow. Only
   *  orgId/unitId/unitPathIds are carried forward if `resolved` is false
   *  (see below); a stale reference is dropped, not silently reused. */
  rawAnswers: Record<string, unknown>;
  /** One display string per answered question, in config order. */
  parts: string[];
  /** true when there are no configured questions at all, or every one has
   *  an answer. Computed live from the CURRENT config every render — never
   *  a stored flag (see PERSONA_QUESTIONS' own growth: adding a question
   *  must retroactively mark existing users incomplete, not silently keep
   *  them "done" forever). */
  isComplete: boolean;
  /** false when a hierarchy_search answer's org/unit no longer resolves in
   *  unitDirectory (deleted/restructured after the user declared it). */
  resolved: boolean;
  /** Index of the first configured question with no answer yet. -1 when
   *  none (isComplete === true). Drives the drawer's reopen behavior:
   *  jump straight to the first gap, don't replay already-answered steps. */
  firstUnansweredIndex: number;
}

const EMPTY: ResolvedPersonaSummary = {
  loading: false,
  rawAnswers: {},
  parts: [],
  isComplete: true,
  resolved: true,
  firstUnansweredIndex: -1,
};

export function hasAnswer(question: PersonaQuestionConfig, answers: Record<string, unknown>): boolean {
  if (question.type === 'choice') {
    return answers[question.key] !== undefined && answers[question.key] !== null;
  }
  // hierarchy_search: any selection at any depth is a real answer.
  return answers.orgId !== undefined && answers.orgId !== null;
}

/**
 * Pure, exported separately from the async resolution below so the "live,
 * never a stored flag" completeness rule (Phase 5 review, 03.09.2026 —
 * critical) can be unit-tested directly: computed fresh from whatever
 * PERSONA_QUESTIONS[personaId] holds RIGHT NOW against the user's actual
 * answers, every call. A question added to the config later makes an
 * existing "2/2 answered" user incomplete automatically, with no migration
 * and no completed:boolean anywhere to go stale.
 */
export function computeCompleteness(
  questions: PersonaQuestionConfig[],
  answers: Record<string, unknown>,
): { isComplete: boolean; firstUnansweredIndex: number } {
  const firstUnansweredIndex = questions.findIndex((q) => !hasAnswer(q, answers));
  return { isComplete: firstUnansweredIndex === -1, firstUnansweredIndex };
}

/**
 * Resolves a persona entry into a human summary for display (Phase 5 —
 * "הפרסונות שלי" in SettingsModal). Replaces useResolvedMilitaryDeclaration
 * (deleted, not kept as a compat alias) — that hook read
 * `military_declarations/{uid}` directly by name; this one is generic,
 * dispatching by QUESTION TYPE and by `PERSONA_SENSITIVE_STORAGE[personaId]`
 * for where to read from, never by checking `personaId === 'military'`.
 * A future persona with its own `hierarchy_search`/`choice` questions gets
 * a correct summary here via config alone — the same "config only" promise
 * PersonaQuestionsDrawer already holds.
 */
export function useResolvedPersonaSummary(
  uid: string | undefined,
  personaEntry: AnyPersonaEntry | undefined,
  /**
   * Bump this (e.g. a counter incremented in the drawer's onComplete) to
   * force a refetch after an edit. uid/personaId alone don't change when
   * the same user edits the same persona and closes the drawer — without
   * an explicit trigger, the summary would keep showing pre-edit data
   * until some unrelated re-render happened to remount this hook.
   */
  refreshKey: number = 0,
): ResolvedPersonaSummary {
  const [state, setState] = useState<ResolvedPersonaSummary>({ ...EMPTY, loading: true });

  const personaId = personaEntry?.id as PersonaId | undefined;

  useEffect(() => {
    if (!uid || !personaId) {
      setState({ ...EMPTY, loading: false });
      return;
    }

    const questions = PERSONA_QUESTIONS[personaId] ?? [];
    if (questions.length === 0) {
      // No follow-up questions configured for this persona — name-only
      // display, nothing to resolve, always "complete" (nothing to finish).
      setState({ ...EMPTY, loading: false });
      return;
    }

    let cancelled = false;
    (async () => {
      const sensitiveCollection = PERSONA_SENSITIVE_STORAGE[personaId];
      const answers = sensitiveCollection
        ? ((await getDoc(doc(db, sensitiveCollection, uid))).data() ?? {})
        : (personaEntry?.answers as Record<string, unknown> ?? {});
      if (cancelled) return;

      const parts: string[] = [];
      const rawAnswers: Record<string, unknown> = {};
      let resolved = true;

      for (const question of questions) {
        if (!hasAnswer(question, answers)) continue;

        if (question.type === 'choice') {
          const value = answers[question.key];
          const label = question.options.find((o) => o.value === value)?.label;
          if (label) {
            parts.push(label);
            rawAnswers[question.key] = value;
          }
          continue;
        }

        // hierarchy_search — resolve live names from the directory
        // collection named in config, never hardcoded to 'unitDirectory'
        // by string literal here (config already carries that name).
        const orgId = answers.orgId as string | undefined;
        const unitId = answers.unitId as string | undefined;
        if (!orgId) continue;

        const orgSnap = await getDoc(doc(db, question.directoryCollection, orgId));
        if (cancelled) return;
        if (orgSnap.exists()) {
          parts.push(orgSnap.data().name as string);
        } else {
          resolved = false;
        }

        let unitResolved = true;
        if (unitId) {
          const unitSnap = await getDoc(doc(db, question.directoryCollection, `${orgId}__${unitId}`));
          if (cancelled) return;
          if (unitSnap.exists()) {
            parts.push(unitSnap.data().name as string);
          } else {
            resolved = false;
            unitResolved = false;
          }
        }

        // Only carry the org/unit selection forward into rawAnswers if it
        // still resolves — pre-filling the drawer with a stale orgId/unitId
        // would silently point the next save at a unit that no longer
        // exists (this is the same rule the old useResolvedMilitaryDeclaration
        // enforced, generalized here).
        if (orgSnap.exists() && (!unitId || unitResolved)) {
          rawAnswers.orgId = orgId;
          if (unitId) {
            rawAnswers.unitId = unitId;
            rawAnswers.unitPathIds = answers.unitPathIds;
          }
        }
      }

      const { isComplete, firstUnansweredIndex } = computeCompleteness(questions, answers);

      setState({
        loading: false,
        rawAnswers,
        parts,
        isComplete,
        resolved,
        firstUnansweredIndex,
      });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- personaEntry.answers intentionally excluded; refetch is keyed on uid/personaId/refreshKey, not object identity.
  }, [uid, personaId, refreshKey]);

  return state;
}
