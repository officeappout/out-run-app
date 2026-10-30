import { describe, expect, it } from 'vitest';
import type { ShareImageInput } from '../../services/share-image';
import { buildShareModel } from '../model';
import { templatesFor } from '../templates/registry';

const run: ShareImageInput = { kind: 'cardio', durationMinutes: 30, distanceKm: 2.8, paceSecPerKm: 640, paceSplits: [650, 630, 640], parkName: 'Park' };
const strength: ShareImageInput = {
  kind: 'strength',
  durationMinutes: 18,
  topExercises: [{ name: 'a', sets: 2, setsDone: 2, value: 10, unit: 'reps' }],
};

describe('share model, post family (enable_workout_post_v1)', () => {
  it('flag off: identical to today (no walk / combined, no postV1)', () => {
    const m = buildShareModel({ ...run, activity: 'walking' });
    expect(m.postV1).toBeUndefined();
    expect(m.pace).toBeTruthy();
  });
  it('walk: steps are the hero, km + time beside it, no pace / splits', () => {
    const m = buildShareModel({ ...run, activity: 'walking' }, { postV1: true });
    expect(m.hero.value).toBe('3,640');
    expect(m.pace).toBeUndefined();
    expect(m.splits).toBeUndefined();
    expect(m.stats).toHaveLength(2);
    expect(m.chip).toContain('Park');
  });
  it('combined: total time hero, km + sets beside it', () => {
    const m = buildShareModel({ ...run, hybrid: { walkKm: 2.2, runKm: 0, strengthSets: 8 } }, { postV1: true });
    expect(m.combined).toBe(true);
    expect(m.hero.value).toBe('30');
    expect(m.stats.map((s) => s.value)).toEqual(['2.2', '8']);
  });
  it('no place: the chip drops the park', () => {
    expect(buildShareModel({ ...run, parkName: undefined }, { postV1: true }).chip).not.toContain('Park');
  });
  it('the new stickers show only with the flag and the data they need', () => {
    const ids = (k: 'strength' | 'cardio', m: ReturnType<typeof buildShareModel>) => templatesFor(k, 'sticker', m).map((t) => t.id);
    expect(ids('strength', buildShareModel(strength))).not.toContain('strength-sticker-table');
    expect(ids('strength', buildShareModel(strength, { postV1: true }))).toContain('strength-sticker-table');
    expect(ids('cardio', buildShareModel(run, { postV1: true }))).toContain('run-sticker-splits');
    expect(ids('cardio', buildShareModel({ ...run, activity: 'walking' }, { postV1: true }))).not.toContain('run-sticker-splits');
  });
});
