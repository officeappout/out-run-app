import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorkoutGrid from '../WorkoutGrid';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

const today = new Date();
const w = (over: Partial<WorkoutHistoryEntry>) =>
  ({ id: 'w1', date: today, duration: 35 * 60, distance: 0, workoutType: 'strength', ...over }) as WorkoutHistoryEntry;

describe('WorkoutGrid v2 tiles', () => {
  it('strength: minutes, brand cyan wash, "today" caption', () => {
    const html = renderToStaticMarkup(createElement(WorkoutGrid, { workouts: [w({})], isLoading: false, onOpen: () => {}, v2: true }));
    expect(html).toContain('35');
    expect(html).toContain('0,186,247');
    expect(html).toContain('אימון כוח · היום');
  });

  it('running: kilometres and the lime wash', () => {
    const html = renderToStaticMarkup(
      createElement(WorkoutGrid, { workouts: [w({ workoutType: 'running', distance: 5.24 })], isLoading: false, onOpen: () => {}, v2: true }),
    );
    expect(html).toContain('5.2');
    expect(html).toContain('132,204,22');
  });

  it('classic grid unchanged without v2', () => {
    const html = renderToStaticMarkup(createElement(WorkoutGrid, { workouts: [w({})], isLoading: false, onOpen: () => {} }));
    expect(html).toContain('bg-gradient-to-br');
    expect(html).not.toContain('0,186,247');
  });
});
