import { describe, expect, it } from 'vitest';
import { replacesBridge, tutorialPhase, type LaunchInput } from '../model/launch';

const base: LaunchInput = { candidate: true, isNew: true, seen: false, stage: 'idle', calm: true, targetPresent: true };

describe('schedule tutorial launch', () => {
  it('shows ל1 to a new user without a schedule on a calm home with the strip on screen', () => {
    expect(tutorialPhase(base)).toEqual({ show: 'coach', busy: true });
  });

  it('waits (busy, nothing shown) while home is busy, the strip is missing, or checks still load', () => {
    expect(tutorialPhase({ ...base, calm: false })).toEqual({ show: 'none', busy: true });
    expect(tutorialPhase({ ...base, targetPresent: false })).toEqual({ show: 'none', busy: true });
    expect(tutorialPhase({ ...base, isNew: null })).toEqual({ show: 'none', busy: true });
    expect(tutorialPhase({ ...base, seen: null })).toEqual({ show: 'none', busy: true });
  });

  it('never shows (and never blocks) when off, seen, not new or done', () => {
    for (const over of [{ candidate: false }, { seen: true }, { isNew: false }, { stage: 'done' as const }]) {
      expect(tutorialPhase({ ...base, ...over })).toEqual({ show: 'none', busy: false });
    }
  });

  it('the flow stays open even if home becomes busy', () => {
    expect(tutorialPhase({ ...base, stage: 'flow', calm: false, candidate: false })).toEqual({ show: 'flow', busy: true });
  });
});

describe('the tutorial replaces the old lifestyle bridge (Part C)', () => {
  it('for new candidates (and while that is still loading), never for old users or non-candidates', () => {
    expect(replacesBridge({ candidate: true, isNew: true })).toBe(true);
    expect(replacesBridge({ candidate: true, isNew: null })).toBe(true);
    expect(replacesBridge({ candidate: true, isNew: false })).toBe(false);
    expect(replacesBridge({ candidate: false, isNew: true })).toBe(false);
  });
});
