import { describe, it, expect } from 'vitest';
import { buildCandidateFilter, pickReplacement, isPinnedSlot, type SlotRules } from '../replacement-rules.util';

const video = { media: { mainVideoUrl: 'https://cdn/x.mp4' } } as any;
const image = { media: { imageUrl: 'https://cdn/x.jpg' } } as any;
const empty = { media: {} } as any;

const ex = (over: Record<string, unknown> = {}): any => ({
  id: 'o', primaryMuscle: 'chest', base_movement_id: 'push_family', type: 'reps', ...over,
});
const rules = (over: Partial<SlotRules> = {}): SlotRules => ({
  original: ex(), level: 5, pinned: false, isTimeBased: false, ...over,
});

describe('buildCandidateFilter', () => {
  it('requires media on the method (video OR image both count)', () => {
    const f = buildCandidateFilter(rules());
    expect(f({ exercise: ex({ id: 'a' }), method: video, level: 5 })).toBe(true);
    expect(f({ exercise: ex({ id: 'a' }), method: image, level: 5 })).toBe(true);
    expect(f({ exercise: ex({ id: 'a' }), method: empty, level: 5 })).toBe(false);
  });

  it('requires the same primary muscle', () => {
    const f = buildCandidateFilter(rules());
    expect(f({ exercise: ex({ primaryMuscle: 'back' }), method: video, level: 5 })).toBe(false);
  });

  it('does not constrain the muscle when the original has none', () => {
    const f = buildCandidateFilter(rules({ original: ex({ primaryMuscle: null }) }));
    expect(f({ exercise: ex({ primaryMuscle: 'back' }), method: video, level: 5 })).toBe(true);
  });

  it('keeps reps vs hold: a timed candidate cannot replace a reps slot and vice versa', () => {
    const reps = buildCandidateFilter(rules({ isTimeBased: false }));
    const hold = buildCandidateFilter(rules({ isTimeBased: true }));
    expect(reps({ exercise: ex({ type: 'time' }), method: video, level: 5 })).toBe(false);
    expect(hold({ exercise: ex({ type: 'time' }), method: video, level: 5 })).toBe(true);
    expect(hold({ exercise: ex({ type: 'reps' }), method: video, level: 5 })).toBe(false);
  });

  it('non-pinned: same level or exactly one easier; never harder, never two easier', () => {
    const f = buildCandidateFilter(rules());
    expect(f({ exercise: ex(), method: video, level: 5 })).toBe(true);
    expect(f({ exercise: ex(), method: video, level: 4 })).toBe(true);
    expect(f({ exercise: ex(), method: video, level: 3 })).toBe(false);
    expect(f({ exercise: ex(), method: video, level: 6 })).toBe(false);
  });

  it('pinned: same level only and only inside the own base_movement_id family', () => {
    const f = buildCandidateFilter(rules({ pinned: true }));
    expect(f({ exercise: ex(), method: video, level: 5 })).toBe(true);
    expect(f({ exercise: ex(), method: video, level: 4 })).toBe(false);
    expect(f({ exercise: ex({ base_movement_id: 'other' }), method: video, level: 5 })).toBe(false);
  });

  it('pinned with no family id on the original has no valid replacement', () => {
    const f = buildCandidateFilter(rules({ pinned: true, original: ex({ base_movement_id: null }) }));
    expect(f({ exercise: ex({ base_movement_id: null }), method: video, level: 5 })).toBe(false);
  });
});

describe('pickReplacement', () => {
  const opt = (id: string, resolvedLevel: number): any => ({
    exercise: ex({ id }), selectedExecutionMethod: video, levelComparison: 'same', resolvedLevel,
  });

  it('prefers a same-level candidate over an easier one regardless of order', () => {
    expect(pickReplacement([opt('easy', 4), opt('same', 5)], rules())?.exercise.id).toBe('same');
  });

  it('goes one level easier only when no same-level candidate exists', () => {
    expect(pickReplacement([opt('easy', 4)], rules())?.exercise.id).toBe('easy');
  });

  it('never goes easier for a pinned slot', () => {
    expect(pickReplacement([opt('easy', 4)], rules({ pinned: true }))).toBeNull();
  });

  it('returns null with nothing to offer', () => {
    expect(pickReplacement([], rules())).toBeNull();
  });
});

describe('isPinnedSlot', () => {
  it('goal exercises and skill-priority exercises are pinned', () => {
    expect(isPinnedSlot({ isGoalExercise: true, priority: 'accessory' } as any)).toBe(true);
    expect(isPinnedSlot({ isGoalExercise: false, priority: 'skill' } as any)).toBe(true);
    expect(isPinnedSlot({ isGoalExercise: false, priority: 'compound' } as any)).toBe(false);
  });
});
