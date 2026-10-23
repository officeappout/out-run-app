/**
 * enable_location_gate_v1 — service inputs: candidateFilter runs BEFORE the cap of 3 (a valid fourth
 * candidate is no longer cut ahead of the media check) and `uncapped` returns every passing candidate.
 * No opts → today's capped behaviour.
 */
import { describe, it, expect, vi } from 'vitest';

const VIDEO = { media: { mainVideoUrl: 'https://cdn/v.mp4' } };
const home = (media: object) => ({ location: 'home', ...media });
const ex = (id: string, level: number, media: object) => ({
  id,
  name: { he: id },
  base_movement_id: 'push_family',
  movementGroup: 'push',
  targetPrograms: [{ programId: 'push', level }],
  execution_methods: [home(media)],
});

const CATALOG = [
  ex('current', 5, VIDEO),
  // three no-media candidates that smartSelect3 would keep (one per bucket) ahead of the media-bearing ones
  ex('empty_low', 4, {}),
  ex('empty_same', 5, {}),
  ex('empty_high', 6, {}),
  ex('good_same', 5, VIDEO),
  ex('good_low', 4, VIDEO),
];

vi.mock('@/features/content/exercises', () => ({
  getAllExercisesCached: async () => CATALOG,
}));
vi.mock('../execution-method-selector.service', () => ({
  selectExecutionMethodWithBrand: async (e: { execution_methods: unknown[] }) => e.execution_methods[0],
}));

import { getAlternativeExercises, getExerciseVariations } from '../exercise-replacement.service';

const current = CATALOG[0] as any;
const ids = (list: { exercise: { id: string } }[]) => list.map((o) => o.exercise.id).sort();
const hasVideo = (c: { method: any }) => !!c.method?.media?.mainVideoUrl;

describe('exercise-replacement — location gate inputs', () => {
  it('without opts the cap of 3 can leave out a media-bearing candidate (today)', async () => {
    const out = await getAlternativeExercises(current, 5, 'home', null, {} as any);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('candidateFilter + uncapped: every media-bearing candidate is seen', async () => {
    const opts = { candidateFilter: hasVideo, uncapped: true };
    const a = await getAlternativeExercises(current, 5, 'home', null, {} as any, undefined, new Set(), undefined, opts);
    expect(ids(a)).toEqual(['good_low', 'good_same']);
    const v = await getExerciseVariations(current, 5, 'home', null, {} as any, undefined, opts);
    expect(ids(v)).toEqual(['good_low', 'good_same']);
  });

  it('candidateFilter alone still caps at 3 but only among the passing candidates', async () => {
    const out = await getAlternativeExercises(current, 5, 'home', null, {} as any, undefined, new Set(), undefined, { candidateFilter: hasVideo });
    expect(ids(out)).toEqual(['good_low', 'good_same']);
  });
});
