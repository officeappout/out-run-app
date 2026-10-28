import { describe, it, expect } from 'vitest';
import { withoutSelectLabels } from '../validate-en-catalog';

describe('withoutSelectLabels (V15 helper)', () => {
  it('drops select branch labels so a label is not read as a noun', () => {
    expect(withoutSelectLabels('{kind, select, cycling {Cycling} workout {Workout} other {Run}} today')).not.toMatch(/\} workout/);
  });

  it('keeps a real count noun outside the select visible', () => {
    expect(withoutSelectLabels('{n} workouts {kind, select, a {x} other {y}}')).toMatch(/^\{n\} workouts /);
  });
});
