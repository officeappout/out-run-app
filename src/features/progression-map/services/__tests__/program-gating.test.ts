/**
 * program-gating.test.ts — Progression System v2, Phase 1.
 *
 * Pure synthetic tests for evaluateProgramGate/getProgramState — no live
 * Firestore data needed, since both functions take plain data as arguments
 * (see program-gating.service.ts's signature-note comment).
 */
import { describe, it, expect } from 'vitest';
import { evaluateProgramGate, getProgramState, type ProgramGateResult } from '../program-gating.service';
import { DOMAIN_PROGRAM_IDS, type DerivedPrerequisite } from '../prerequisite-derivation.service';

const PULL = DOMAIN_PROGRAM_IDS.pull;
const SKILL_ID = 'mFcuYlNgKXLqWVUFo0zt'; // front-lever — used only as a realistic-shaped id, no live read here

describe('evaluateProgramGate', () => {
  const prereqs: DerivedPrerequisite[] = [{ domainProgramId: PULL, minLevel: 10 }];

  it('prerequisite met, no tier requirement → available', () => {
    const result = evaluateProgramGate({ tracks: { [PULL]: 10 }, tier: 1 }, {}, prereqs);
    expect(result).toEqual({ status: 'available' });
  });

  it('prerequisite below required level → locked_prereq with correct have/need', () => {
    const result = evaluateProgramGate({ tracks: { [PULL]: 7 }, tier: 1 }, {}, prereqs);
    expect(result).toEqual({
      status: 'locked_prereq',
      requirements: [{ domainProgramId: PULL, need: 10, have: 7 }],
    });
  });

  it('prerequisite domain never assessed → needs_assessment', () => {
    const result = evaluateProgramGate({ tracks: {}, tier: 1 }, {}, prereqs);
    expect(result).toEqual({
      status: 'needs_assessment',
      requirements: [{ domainProgramId: PULL, need: 10 }],
    });
  });

  it('prerequisite met but requiredTier exceeds user tier → locked_pro', () => {
    const result = evaluateProgramGate({ tracks: { [PULL]: 10 }, tier: 1 }, { requiredTier: 3 }, prereqs);
    expect(result).toEqual({ status: 'locked_pro' });
  });

  it('precedence: an unassessed prerequisite wins over a PRO-tier gate that would also apply', () => {
    const result = evaluateProgramGate({ tracks: {}, tier: 1 }, { requiredTier: 3 }, prereqs);
    expect(result.status).toBe('needs_assessment');
  });

  it('precedence: a below-level prerequisite wins over a PRO-tier gate that would also apply', () => {
    const result = evaluateProgramGate({ tracks: { [PULL]: 5 }, tier: 1 }, { requiredTier: 3 }, prereqs);
    expect(result.status).toBe('locked_prereq');
  });

  it('no prerequisites at all (e.g. a דגל אנושי-shaped gap) does not crash, tier ok → available', () => {
    const result = evaluateProgramGate({ tracks: {}, tier: 1 }, {}, []);
    expect(result).toEqual({ status: 'available' });
  });

  it('requiredTier omitted defaults to 1 — a tier-1 user is never locked_pro on an ungated program', () => {
    const result = evaluateProgramGate({ tracks: { [PULL]: 10 }, tier: 1 }, {}, prereqs);
    expect(result.status).not.toBe('locked_pro');
  });
});

describe('getProgramState', () => {
  const availableGate: ProgramGateResult = { status: 'available' };
  const lockedPrereqGate: ProgramGateResult = {
    status: 'locked_prereq',
    requirements: [{ domainProgramId: PULL, need: 10, have: 5 }],
  };
  const needsAssessmentGate: ProgramGateResult = {
    status: 'needs_assessment',
    requirements: [{ domainProgramId: PULL, need: 10 }],
  };

  it('active — programId is in activeProgramIds, regardless of what the gate says', () => {
    const state = getProgramState(
      { tracks: {}, tier: 1, activeProgramIds: new Set([SKILL_ID]) },
      SKILL_ID,
      lockedPrereqGate,
    );
    expect(state).toBe('active');
  });

  it('tracked — has a tracks entry but is NOT in activePrograms', () => {
    const state = getProgramState(
      { tracks: { [SKILL_ID]: 3 }, tier: 1, activeProgramIds: new Set() },
      SKILL_ID,
      availableGate,
    );
    expect(state).toBe('tracked');
  });

  it('neither active nor tracked → falls through to the gate result (available)', () => {
    const state = getProgramState({ tracks: {}, tier: 1, activeProgramIds: new Set() }, SKILL_ID, availableGate);
    expect(state).toBe('available');
  });

  it('neither active nor tracked → falls through to the gate result (locked_prereq)', () => {
    const state = getProgramState({ tracks: {}, tier: 1, activeProgramIds: new Set() }, SKILL_ID, lockedPrereqGate);
    expect(state).toBe('locked_prereq');
  });

  it('neither active nor tracked → falls through to the gate result (needs_assessment)', () => {
    const state = getProgramState(
      { tracks: {}, tier: 1, activeProgramIds: new Set() },
      SKILL_ID,
      needsAssessmentGate,
    );
    expect(state).toBe('needs_assessment');
  });

  it('active takes precedence over tracked when somehow both would apply', () => {
    const state = getProgramState(
      { tracks: { [SKILL_ID]: 5 }, tier: 1, activeProgramIds: new Set([SKILL_ID]) },
      SKILL_ID,
      availableGate,
    );
    expect(state).toBe('active');
  });
});
