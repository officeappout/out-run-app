import { describe, expect, it } from 'vitest';
import { tutorialPhase, type LaunchInput } from '../model/launch';

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
