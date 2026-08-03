import { describe, it, expect } from 'vitest';
import { resolveExerciseImage } from '../exercise-display.utils';

// Bug fix regression test — exercise-display.utils.ts resolveExerciseImage()
// (preview-drawer per-exercise card thumbnail)
//
// Before the fix, resolveExerciseImage(ex) called resolveExerciseMedia(ex.exercise,
// ex.method) directly. resolveExerciseMedia's own fallback chain deep-searches
// EVERY execution_method (any location) once the assigned `ex.method` has no
// media of its own — silently substituting a different-location image (e.g. a
// park photo shown for a 'home' pick whose home method has no photo/video).

const parkOnlyWithImageExercise = (): any => ({
  id: 'ex1',
  name: { he: 'תרגיל' },
  execution_methods: [
    { location: 'home', media: {} }, // the assigned method — genuinely empty
    { location: 'park', media: { imageUrl: 'https://cdn.example/park.jpg' } },
  ],
});

describe('resolveExerciseImage — no cross-location leak', () => {
  it('assigned home method has NO media, but a park method has an image: does NOT leak the park photo', () => {
    const exercise = parkOnlyWithImageExercise();
    const ex = {
      exercise,
      method: exercise.execution_methods[0], // the resolved 'home' method — empty
    } as any;

    const result = resolveExerciseImage(ex);
    expect(result).not.toBe('https://cdn.example/park.jpg'); // BEFORE the fix: leaked
    expect(result).toBe('/images/park-placeholder.svg'); // safe existing substitute
  });

  it('assigned method DOES have its own image: used as-is (no false positive)', () => {
    const exercise = {
      id: 'ex2',
      name: { he: 'תרגיל' },
      execution_methods: [
        { location: 'home', media: { imageUrl: 'https://cdn.example/home.jpg' } },
      ],
    };
    const ex = { exercise, method: exercise.execution_methods[0] } as any;

    expect(resolveExerciseImage(ex)).toBe('https://cdn.example/home.jpg');
  });

  it('no method assigned at all and nothing resolvable: falls back to the placeholder (unchanged legacy behavior)', () => {
    const exercise = { id: 'ex3', name: { he: 'תרגיל' }, execution_methods: [] };
    const ex = { exercise, method: undefined } as any;
    expect(resolveExerciseImage(ex)).toBe('/images/park-placeholder.svg');
  });
});
