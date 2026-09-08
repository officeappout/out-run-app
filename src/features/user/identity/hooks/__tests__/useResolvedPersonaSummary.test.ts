import { describe, it, expect } from 'vitest';
import { hasAnswer, computeCompleteness } from '../useResolvedPersonaSummary';
import type { PersonaQuestionConfig } from '@/types/persona-question.types';

// Pins the critical requirement from Phase 5 review (03.09.2026): "isComplete"
// must be computed live from the CURRENT question config every time, never
// a stored flag. The concrete failure mode this guards against: military
// has 2 questions today; a 3rd is added to PERSONA_QUESTIONS.military two
// months from now. With a stored flag, every existing user who'd already
// answered both original questions would stay "complete" forever and never
// see the new question — a feature that's silently dead on arrival for
// everyone who onboarded before the config changed. With live computation
// (this test), the exact same stored answers automatically become
// incomplete the moment the config grows, no migration involved.

const STATUS_QUESTION: PersonaQuestionConfig = {
  type: 'choice',
  key: 'status',
  label: 'status?',
  skippable: true,
  options: [{ value: 'reserve', label: 'מילואים' }],
};

const UNIT_QUESTION: PersonaQuestionConfig = {
  type: 'hierarchy_search',
  key: 'unit',
  label: 'unit?',
  directoryCollection: 'unitDirectory',
  skippable: true,
};

const FUTURE_QUESTION: PersonaQuestionConfig = {
  type: 'choice',
  key: 'yearsOfService',
  label: 'years?',
  skippable: true,
  options: [{ value: '1-3', label: '1-3' }],
};

describe('hasAnswer', () => {
  it('choice: true only when the key has a non-null/undefined value', () => {
    expect(hasAnswer(STATUS_QUESTION, {})).toBe(false);
    expect(hasAnswer(STATUS_QUESTION, { status: null })).toBe(false);
    expect(hasAnswer(STATUS_QUESTION, { status: 'reserve' })).toBe(true);
  });

  it('hierarchy_search: true when orgId is set, regardless of depth reached', () => {
    expect(hasAnswer(UNIT_QUESTION, {})).toBe(false);
    expect(hasAnswer(UNIT_QUESTION, { orgId: 'brigade_1' })).toBe(true);
    expect(hasAnswer(UNIT_QUESTION, { orgId: 'brigade_1', unitId: 'battalion_1' })).toBe(true);
  });

  // 07.09.2026 — a fresh top-level unit proposal ("unit isn't in the list")
  // has NO orgId at all while pending (nothing real exists yet to
  // reference). Without this, that question stayed permanently
  // "unanswered" even though the user did submit something.
  it('hierarchy_search: true when only pendingUnitId is set (a fresh top-level pending submission)', () => {
    expect(hasAnswer(UNIT_QUESTION, { pendingUnitId: 'bde_u_abc123' })).toBe(true);
    expect(hasAnswer(UNIT_QUESTION, { pendingUnitId: null })).toBe(false);
  });
});

describe('computeCompleteness — the live-computation guarantee', () => {
  it('with today\'s 2-question config: a user who answered both is complete', () => {
    const questions = [STATUS_QUESTION, UNIT_QUESTION];
    const answers = { status: 'reserve', orgId: 'brigade_1' };
    expect(computeCompleteness(questions, answers)).toEqual({ isComplete: true, firstUnansweredIndex: -1 });
  });

  it('the SAME stored answers become incomplete the moment a 3rd question is added to the config — no stored flag, no migration', () => {
    const questionsAfterConfigGrows = [STATUS_QUESTION, UNIT_QUESTION, FUTURE_QUESTION];
    const sameOldAnswers = { status: 'reserve', orgId: 'brigade_1' }; // unchanged in Firestore, nothing migrated
    const result = computeCompleteness(questionsAfterConfigGrows, sameOldAnswers);
    expect(result.isComplete).toBe(false);
    expect(result.firstUnansweredIndex).toBe(2); // the new question, not re-flagging the 2 already answered
  });

  it('firstUnansweredIndex points at the first gap, not the last', () => {
    const questions = [STATUS_QUESTION, UNIT_QUESTION, FUTURE_QUESTION];
    const partiallyAnswered = { status: 'reserve' }; // unit and the future question both missing
    expect(computeCompleteness(questions, partiallyAnswered).firstUnansweredIndex).toBe(1);
  });

  it('a persona with zero configured questions is always complete', () => {
    expect(computeCompleteness([], {})).toEqual({ isComplete: true, firstUnansweredIndex: -1 });
  });
});
