'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { PersonaId } from '@/types/persona.types';
import { PERSONA_QUESTIONS } from '@/types/persona-question.types';
import { savePersonaAnswers } from '@/features/user/identity/services/persona-answers.service';
import { useResolvedPersonaSummary } from '@/features/user/identity/hooks/useResolvedPersonaSummary';
import { Analytics } from '@/features/analytics/AnalyticsService';
import ChoiceStep from './persona-questions-drawer/ChoiceStep';
import HierarchySearchStep, { type HierarchySearchValue } from './persona-questions-drawer/HierarchySearchStep';

// 08.09.2026 — real incident: a full military-persona declaration (status +
// brigade/battalion/company, several screens) silently failed to save.
// Root cause was twofold, not one bug:
//   1. finishAndSave's catch only console.error'd, then called onComplete()
//      unconditionally — the user saw zero indication anything went wrong.
//   2. Every answer across every screen lived ONLY in this component's
//      React state until the single save at the very end — so when that
//      save failed, there was nothing left to retry FROM; the entire
//      multi-screen input was gone.
// The fix mirrors assessment-visual/page.tsx's handleAcceptResult fix from
// earlier today: persist to sessionStorage BEFORE the risky write, so a
// retry (this session, or a later reopen of the same persona) resumes from
// the preserved answers instead of restarting the whole flow.
function pendingSaveKey(personaId: PersonaId): string {
  return `persona_pending_save_${personaId}`;
}

interface PersonaQuestionsDrawerProps {
  personaId: PersonaId;
  isOpen: boolean;
  /** Fires after the answers (partial or complete) are saved — on finishing
   *  the last question, on skip-to-end, or on closing mid-sequence. The
   *  drawer owns the write; hosts never need the answers payload itself.
   *  Callers displaying a summary elsewhere (Phase 5's "הפרסונות שלי") must
   *  bump their OWN refresh trigger here — this drawer resolves once per
   *  open, it doesn't push updates back out. */
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
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const savedRef = useRef(false);
  // Forces the sheet to ~80% viewport height while a text field inside a
  // step is focused (06.09.2026, third round on this bug — real-device
  // test: HierarchySearchStep's own content, one input + a short list, is
  // too short to push the sheet anywhere near its max-height cap on its
  // own, unlike a content-heavy step like a map or an equipment grid where
  // that happens for free). The per-step wrapper below is absolutely
  // positioned, so a taller child can't grow it or the sheet by itself —
  // this has to be a signal FROM the step TO the sheet, not something the
  // step can do on its own.
  const [needsExpandedHeight, setNeedsExpandedHeight] = useState(false);

  // Re-opening the drawer for a persona already answered (deselect+
  // reselect, or Phase 5's "הפרסונות שלי" edit action) should show what
  // was already answered and jump straight to the first gap — not restart
  // from question 0 (Phase 5 review, 03.09.2026: this is what makes the
  // "config only" promise hold when a persona's question LIST grows later
  // too, not just when it's first added). Generic across every persona and
  // question type — see useResolvedPersonaSummary's own header comment.
  const uid = auth.currentUser?.uid;
  const { profile } = useUserStore();
  const personaEntry = profile?.personas?.find((p) => p.id === personaId);
  const resolvedSummary = useResolvedPersonaSummary(uid, personaEntry);

  const [step, setStep] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const prefilledRef = useRef(false);
  if (isOpen && !prefilledRef.current && !resolvedSummary.loading) {
    prefilledRef.current = true;
    // A pending local save (this persona's last attempt never reached the
    // server — see finishAndSave below) is MORE current than the server's
    // rawAnswers, precisely because the server write is what failed. Prefer
    // it when present; otherwise fall back to the normal resolved summary.
    let pending: Record<string, unknown> | null = null;
    try {
      const raw = sessionStorage.getItem(pendingSaveKey(personaId));
      if (raw) pending = JSON.parse(raw);
    } catch { /* sessionStorage unavailable or corrupt entry — ignore, fall through */ }
    setAnswers((prev) => ({ ...prev, ...resolvedSummary.rawAnswers, ...(pending ?? {}) }));
    setStep(Math.max(0, resolvedSummary.firstUnansweredIndex));
  }
  if (!isOpen && prefilledRef.current) {
    prefilledRef.current = false;
  }
  // Closing after a failure must not carry saveFailed into the NEXT open —
  // a fresh open should re-attempt via the normal flow (which itself
  // re-prefills from the sessionStorage backup above), not immediately
  // show yesterday's error screen again.
  if (!isOpen && saveFailed) {
    setSaveFailed(false);
  }
  // resolved starts true and only flips false when a real prior org/unit
  // reference existed but no longer resolves — distinct from "never answered".
  const showStaleUnitNotice = !resolvedSummary.loading && !resolvedSummary.resolved;

  const currentQuestion = questions[step];

  const finishAndSave = useCallback(async (finalAnswers: Record<string, unknown>) => {
    if (savedRef.current) return; // closing (X/backdrop) after an explicit finish must not double-save
    savedRef.current = true;
    setSaveFailed(false);
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      // No signed-in uid at all — nothing to save to, nothing to retry.
      // Unchanged from the prior behavior; the auth-timing case this was
      // guarding against surfaces as a savePersonaAnswers() throw below,
      // not as a missing uid here (auth.currentUser is a separate, earlier
      // check that has never itself been the observed failure point).
      onComplete();
      return;
    }

    // Persist BEFORE the risky write — see this file's top-of-file comment.
    try {
      sessionStorage.setItem(pendingSaveKey(personaId), JSON.stringify(finalAnswers));
    } catch { /* sessionStorage unavailable — proceed anyway; no worse than before this fix */ }

    const attemptSave = async (): Promise<string | null> => {
      try {
        await savePersonaAnswers(currentUid, personaId, finalAnswers as never);
        return null;
      } catch (error) {
        return String((error as any)?.message ?? error ?? 'unknown error');
      }
    };

    let failureMessage = await attemptSave();
    if (failureMessage) {
      // One silent automatic retry — a transient network blip or an
      // auth-not-ready-yet race (this app's own documented recurring
      // pattern elsewhere) usually resolves within a second. Only bother
      // the user if it fails TWICE.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      failureMessage = await attemptSave();
    }

    if (failureMessage) {
      console.error('[PersonaQuestionsDrawer] savePersonaAnswers failed twice:', failureMessage);
      // Queryable later, not just console — this is the whole point: next
      // time this happens to someone, there's a record of why.
      Analytics.logError('persona_save_failed', 'PersonaQuestionsDrawer', `${personaId}: ${failureMessage}`);
      savedRef.current = false; // allow the user's own "try again" tap to re-enter this function
      setSaveFailed(true);
      return; // do NOT call onComplete() — the answers are safe in sessionStorage either way
    }

    try { sessionStorage.removeItem(pendingSaveKey(personaId)); } catch { /* best-effort cleanup */ }
    onComplete();
  }, [personaId, onComplete]);

  const handleRetryAfterFailure = useCallback(() => {
    finishAndSave(answers);
  }, [answers, finishAndSave]);

  // Closing after a failed save must not silently retry on the user's
  // behalf — sessionStorage already preserves the answers for next time;
  // forcing another network attempt on a plain close would risk a loop.
  const handleCloseAfterFailure = useCallback(() => {
    onComplete();
  }, [onComplete]);

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

  // saveFailed can only become true after finishAndSave ran (which requires
  // questions.length > 0 OR the no-questions auto-finish path) — don't let
  // the questions.length===0 early-return hide a real failure on that path.
  if (!isOpen || (questions.length === 0 && !saveFailed)) return null;

  const handleDismiss = saveFailed ? handleCloseAfterFailure : handleCloseOrSkipToEnd;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        // max-h-[92vh], not a JS-computed height — matches
        // contribution-wizard/index.tsx's sheet exactly (06.09.2026: the
        // prior visualViewport-based approach here was LESS reliable than
        // this, not more — trusting capacitor.config.ts's native
        // Keyboard:{resize:'body'} (which shrinks the WebView body itself
        // when the keyboard opens, so vh already resolves correctly) is
        // what every OTHER working drawer in this app already does, with
        // zero JS keyboard-handling of its own). min-h-[80vh] is added ONLY
        // while a text field inside the step is focused (needsExpandedHeight)
        // — real-device test showed this step's own content is too short to
        // reach anywhere near the max-height cap on its own; see that
        // state's own comment above for why.
        className={`relative bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden ${needsExpandedHeight ? 'min-h-[80vh]' : ''}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">עוד קצת עלייך</h2>
          <button
            onClick={handleDismiss}
            className="p-2 rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        {saveFailed ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 pb-8 text-center" dir="rtl">
            <p className="text-sm font-bold text-slate-800">
              לא הצלחנו לשמור את התשובות שלך כרגע.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              מה שכבר מילאת נשמר אצלך — אפשר לנסות שוב, או לסגור ולנסות מאוחר יותר; שום דבר לא הולך לאיבוד.
            </p>
            <button
              onClick={handleRetryAfterFailure}
              className="w-full max-w-xs text-white font-black text-base py-3.5 rounded-2xl bg-[#00BAF7] shadow-lg active:scale-[0.97] transition-transform"
            >
              נסה שוב
            </button>
          </div>
        ) : (
          <>
            <p className="px-5 pb-3 text-xs text-slate-400" dir="rtl">הפרטים כאן פרטיים ולא מופיעים בפרופיל הציבורי שלך.</p>

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
                  onDone={() => goToNextOrFinish(answers)}
                  onNeedsExpandedHeight={setNeedsExpandedHeight}
                />
              )}

              {/* The production bug this fixes: hierarchy_search has its own
                  prominent "סיום" button once a selection exists (rendered
                  inside HierarchySearchStep) -- showing this generic "דלג"
                  underneath it too would be two competing ways to move on.
                  Only shown here before any selection is made (a true skip:
                  "I don't want to answer this at all") or for any other
                  question type, which has no equivalent built-in button. */}
              {currentQuestion?.skippable && !(currentQuestion.type === 'hierarchy_search' && answers.orgId) && (
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
          </>
        )}
      </motion.div>
    </div>
  );
}
