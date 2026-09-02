'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { PersonaId } from '@/types/persona.types';
import { PERSONA_QUESTIONS } from '@/types/persona-question.types';
import { savePersonaAnswers } from '@/features/user/identity/services/persona-answers.service';
import { useResolvedMilitaryDeclaration } from '@/features/user/identity/hooks/useResolvedMilitaryDeclaration';
import ChoiceStep from './persona-questions-drawer/ChoiceStep';
import HierarchySearchStep, { type HierarchySearchValue } from './persona-questions-drawer/HierarchySearchStep';

interface PersonaQuestionsDrawerProps {
  personaId: PersonaId;
  isOpen: boolean;
  /** Fires after the answers (partial or complete) are saved — on finishing
   *  the last question, on skip-to-end, or on closing mid-sequence. The
   *  drawer owns the write; hosts never need the answers payload itself. */
  onComplete: () => void;
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

/**
 * Generic, config-driven persona follow-up-question drawer (Phase 3b —
 * see docs/research/military-persona-unified-architecture.md §3ב). ONE
 * component for every persona; `PERSONA_QUESTIONS[personaId]` supplies the
 * question sequence. Adding a persona that reuses an existing question type
 * ('choice' | 'hierarchy_search') never touches this file.
 *
 * Self-contained by design: no dependency on either host's (OnboardingWizard
 * or LifestyleWizard — see the entry-point map in the research doc §10)
 * internal wizard-step state. Mount it from wherever the persona card is
 * tapped with just {personaId, isOpen, onComplete}; it reads the current
 * uid itself (auth.currentUser, matching LifestyleWizard.tsx's own
 * convention) and calls savePersonaAnswers() itself.
 *
 * Shell (backdrop, spring sheet, step-dots, slide transition) is styled
 * after ContributionWizard's JSX (src/features/parks/client/components/
 * contribution-wizard/index.tsx) — visually consistent, but a fresh
 * component: ContributionWizard has a closed step union, an if-chain
 * render (not config-driven), and no skip mechanism to reuse.
 */
export default function PersonaQuestionsDrawer({ personaId, isOpen, onComplete }: PersonaQuestionsDrawerProps) {
  const questions = useMemo(() => PERSONA_QUESTIONS[personaId] ?? [], [personaId]);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const savedRef = useRef(false);

  // Re-opening the drawer for a persona already declared (deselect+reselect,
  // or a future re-edit entry point) should show what was already answered,
  // not start blank. Only military has a resolvable declaration today
  // (military_declarations/{uid}) — the hook itself is a no-op when uid is
  // undefined. `orgId`/`unitId` are resolved LIVE against unitDirectory
  // (never cached at write time) so a deleted/restructured unit surfaces as
  // "no longer exists" instead of silently pre-selecting a dead reference.
  const uid = auth.currentUser?.uid;
  const resolvedDeclaration = useResolvedMilitaryDeclaration(personaId === 'military' ? uid : undefined);
  const prefilledRef = useRef(false);
  if (isOpen && !prefilledRef.current && !resolvedDeclaration.loading) {
    prefilledRef.current = true;
    if (resolvedDeclaration.raw) {
      setAnswers((prev) => ({
        ...prev,
        ...(resolvedDeclaration.raw!.status ? { status: resolvedDeclaration.raw!.status } : {}),
        // Only carry the unit/org selection forward if it still resolves —
        // pre-filling a stale orgId/unitId would silently point the next
        // save at a unit that no longer exists.
        ...(resolvedDeclaration.resolved
          ? {
              orgId: resolvedDeclaration.raw!.orgId,
              unitId: resolvedDeclaration.raw!.unitId,
              unitPathIds: resolvedDeclaration.raw!.unitPathIds,
            }
          : {}),
      }));
    }
  }
  if (!isOpen && prefilledRef.current) {
    prefilledRef.current = false;
  }
  const showStaleUnitNotice = !resolvedDeclaration.loading
    && !!resolvedDeclaration.raw?.orgId
    && !resolvedDeclaration.resolved;

  const currentQuestion = questions[step];

  const finishAndSave = useCallback(async (finalAnswers: Record<string, unknown>) => {
    if (savedRef.current) return; // closing (X/backdrop) after an explicit finish must not double-save
    savedRef.current = true;
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        await savePersonaAnswers(uid, personaId, finalAnswers as never);
      } catch (error) {
        console.error('[PersonaQuestionsDrawer] savePersonaAnswers failed:', error);
      }
    }
    onComplete();
  }, [personaId, onComplete]);

  // Closing mid-sequence (X, backdrop tap) is deliberately the SAME outcome
  // as "skip" on every remaining question: save whatever was answered so
  // far, don't discard it. Losing answers the user already gave is worse
  // than a partial record, and a partial record is already a legitimate
  // state everywhere else in this model (answers:{} is valid).
  const handleCloseOrSkipToEnd = useCallback(() => {
    finishAndSave(answers);
  }, [answers, finishAndSave]);

  const goToNextOrFinish = useCallback((nextAnswers: Record<string, unknown>) => {
    setAnswers(nextAnswers);
    if (step + 1 >= questions.length) {
      finishAndSave(nextAnswers);
    } else {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }, [step, questions.length, finishAndSave]);

  // A persona with no configured questions completes immediately with
  // empty answers — e.g. parent/student/pupil/vatikim/pro_athlete today.
  // (Runs once per open via the isOpen-gated effect below, not inline —
  // avoids calling setState during render.)
  const noQuestionsRef = useRef(false);
  if (isOpen && questions.length === 0 && !noQuestionsRef.current) {
    noQuestionsRef.current = true;
    finishAndSave({});
  }
  if (!isOpen && noQuestionsRef.current) {
    noQuestionsRef.current = false;
    savedRef.current = false;
  }

  if (!isOpen || questions.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={handleCloseOrSkipToEnd}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">עוד קצת עלייך</h2>
          <button
            onClick={handleCloseOrSkipToEnd}
            className="p-2 rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 pb-4">
          {questions.map((q, i) => (
            <div key={q.key} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i === step ? 'bg-[#00E5FF] scale-125' : i < step ? 'bg-emerald-400' : 'bg-slate-200'
              }`} />
              {i < questions.length - 1 && <div className="w-6 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {showStaleUnitNotice && (
          <div className="mx-5 mb-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200" dir="rtl">
            <p className="text-xs font-semibold text-amber-700">היחידה שבחרת בעבר כבר לא קיימת — בחר מחדש</p>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative min-h-[420px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="absolute inset-0 flex flex-col"
            >
              {currentQuestion?.type === 'choice' && (
                <ChoiceStep
                  config={currentQuestion}
                  value={answers[currentQuestion.key] as string | undefined}
                  onSelect={(v) => goToNextOrFinish({ ...answers, [currentQuestion.key]: v })}
                />
              )}
              {currentQuestion?.type === 'hierarchy_search' && (
                <HierarchySearchStep
                  config={currentQuestion}
                  softFilterValue={currentQuestion.softFilterFromKey ? (answers[currentQuestion.softFilterFromKey] as string | undefined) : undefined}
                  value={{
                    orgId: answers.orgId as string | undefined,
                    unitId: answers.unitId as string | undefined,
                    unitPathIds: answers.unitPathIds as string[] | undefined,
                  }}
                  onChange={(v: HierarchySearchValue) => setAnswers((prev) => ({ ...prev, ...v }))}
                />
              )}

              {currentQuestion?.skippable && (
                <div className="px-5 pb-5 mt-auto">
                  <button
                    type="button"
                    onClick={() => goToNextOrFinish(answers)}
                    className="w-full text-center text-sm font-semibold text-slate-400 py-2"
                  >
                    דלג
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
