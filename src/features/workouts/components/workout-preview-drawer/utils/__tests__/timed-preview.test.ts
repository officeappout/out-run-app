import { describe, it, expect } from 'vitest';
import { groupExercisesIntoSections } from '../section-grouping.utils';
import { blockHeaderModel, blockItemLine, previewJourney, previewMeta, previewProfile, previewTimedModel } from '../timed-preview.utils';
import { makeT } from '@/lib/i18n/t';
import { library } from '@/messages/ns/library';

// i18n batch aa: the line helpers take the caller's library translator.
const t = makeT('he', library);

const ex = (id: string, role: string, extra: Record<string, unknown> = {}) =>
  ({ exercise: { id, name: id }, sets: 3, reps: 12, isTimeBased: false, exerciseRole: role, ...extra }) as never;
const gw = (over: Record<string, unknown> = {}) =>
  ({
    structure: 'standard',
    estimatedDuration: 14,
    exercises: [ex('w1', 'warmup', { sets: 1 }), ex('w2', 'warmup', { sets: 1 }), ex('a', 'main'), ex('b', 'main', { reps: 10 }), ex('c1', 'cooldown', { sets: 1 })],
    ...over,
  }) as never;

describe('timed preview (A-1a / A-2a / A-4a / A-5a)', () => {
  it('no timed block → null (drawer unchanged)', () => {
    expect(previewTimedModel(gw())).toBeNull();
  });

  it('AMRAP main: journey, profile, meta, header, item lines', () => {
    const m = previewTimedModel(gw({ structure: 'amrap' }))!;
    expect(m.mainSpec?.format).toBe('amrap');
    const j = previewJourney(gw({ structure: 'amrap' }), m);
    expect(j.map((i) => [i.key, i.kind, i.label ?? null])).toEqual([
      ['warmup', 'strength', null],
      ['main', 'strength', 'AMRAP 6′'],
      ['cooldown', 'strength', null],
    ]);
    const p = previewProfile(gw({ structure: 'amrap' }), m);
    expect(p.map((s) => s.key)).toEqual(['warmup', 'main-amrap', 'cooldown']);
    expect(p[1].height).toBeGreaterThan(p[0].height);
    expect(previewMeta(gw(), new Date(2026, 9, 19, 9, 41), t)).toEqual([
      { key: 'dur', text: '14 דק׳' },
      { key: 'count', text: '5 תרגילים' },
      { key: 'end', text: 'מסיים ~9:55' },
    ]);
    expect(blockHeaderModel(m.mainSpec!, t)).toMatchObject({ name: 'AMRAP', pill: '6′', line: 'כמה שיותר סבבים' });
    expect(blockItemLine(m.mainSpec!, 1, t)).toBe('10 חזרות · בכל סבב');
  });

  it('EMOM lines alternate odd / even minutes', () => {
    const m = previewTimedModel(gw({ structure: 'emom' }))!;
    expect(blockHeaderModel(m.mainSpec!, t).line).toBe('כל דקה · 2 תרגילים');
    expect(blockItemLine(m.mainSpec!, 0, t)).toBe('דקות אי-זוגיות · 12 חזרות');
    expect(blockItemLine(m.mainSpec!, 1, t)).toBe('דקות זוגיות · 10 חזרות');
  });

  it('tabata finisher + classic main (mixed)', () => {
    const w = gw({
      tabataBlock: { config: { workSec: 20, restSec: 10, rounds: 8 }, exerciseIds: ['t'] },
      exercises: [ex('a', 'main'), ex('t', 'main', { protocolBlock: 'tabata', isTimeBased: true, reps: 20 })],
    });
    const m = previewTimedModel(w)!;
    expect(m.main).toBeNull();
    expect(previewJourney(w, m).map((i) => [i.key, i.label ?? null])).toEqual([['main', null], ['tabata', 'טבטה 4′']]);
    expect(blockItemLine(m.tabataSpec!, 0, t)).toBe('20 שנ׳');
  });

  it('grouping: the main part becomes ONE timed section in plan order', () => {
    const exs = [ex('w1', 'warmup'), ex('a', 'main', { pairedWith: 'b' }), ex('b', 'main', { pairedWith: 'a' }), ex('c1', 'cooldown')];
    const plain = groupExercisesIntoSections(exs as never);
    expect(plain.map((s) => s.id)).toEqual(['warmup', 'superset-0', 'cooldown']);
    const timed = groupExercisesIntoSections(exs as never, { timedMainTitle: 'AMRAP 6′' });
    expect(timed.map((s) => [s.id, s.exercises.length])).toEqual([['warmup', 1], ['timed-main', 2], ['cooldown', 1]]);
  });
});
