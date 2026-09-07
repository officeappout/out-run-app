import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Admin-simulator support: workout-metadata.service.ts's time-gated scoring
 * bonuses (Parent Time-Window Boost, Desk Reset Boost) used to read the real
 * wall clock (`new Date()`) directly inside scoreContentRow, making them
 * impossible to preview outside their real-world window. Fix: an additive
 * `WorkoutMetadataContext.previewNow` override — `ctx.previewNow ?? new
 * Date()` — that production never sets (so behavior there is unchanged) but
 * the admin simulator can, to dial into a specific hour on demand.
 *
 * Also covers resolveWorkoutMetadataWithCandidates — the exported function
 * the admin simulator's "why was this chosen" score-transparency table
 * calls, proving it returns every scored candidate (not just the winner)
 * with real scoreContentRow scores.
 */

const state = vi.hoisted(() => ({
  ROWS: {} as Record<string, any[]>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, _base: string, parentDoc: string, _subCol: string) => ({ __parentDoc: parentDoc }),
  getDocs: async (ref: { __parentDoc: string }) => {
    const rows = state.ROWS[ref.__parentDoc] ?? [];
    return { empty: rows.length === 0, docs: rows.map(r => ({ data: () => r })) };
  },
  query: vi.fn(),
  where: vi.fn(),
}));

import {
  resolveWorkoutMetadataWithCandidates,
  type WorkoutMetadataContext,
} from '../workout-metadata.service';

function setTitles(rows: any[]) {
  state.ROWS.workoutTitles = rows;
}
function setDescriptions(rows: any[]) {
  state.ROWS.smartDescriptions = rows;
}

const baseCtx: WorkoutMetadataContext = {
  persona: 'office_worker',
  location: 'home',
  timeOfDay: 'afternoon',
};

beforeEach(() => {
  state.ROWS = {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('previewNow override — Desk Reset Boost (12:00-14:00, +30)', () => {
  it('inside the window (13:00): desk-keyword content outscores generic content', async () => {
    setTitles([
      { text: 'אימון כוח מלא', persona: 'office_worker' },
      { text: 'מתיחות קלות ליד השולחן', persona: 'office_worker' },
    ]);
    setDescriptions([]);

    const previewNow = new Date();
    previewNow.setHours(13, 0, 0, 0);

    const result = await resolveWorkoutMetadataWithCandidates({ ...baseCtx, previewNow });

    const desk = result.titleCandidates.find(c => c.text.includes('שולחן'));
    const generic = result.titleCandidates.find(c => c.text === 'אימון כוח מלא');
    expect(desk!.score).toBeGreaterThan(generic!.score);
    expect(desk!.reasons.join(' ')).toContain('deskReset_boost');
    expect(result.title).toContain('שולחן'); // the actual winner, real scoring
  });

  it('outside the window (15:00): the SAME desk-keyword content gets no boost — ' +
     'proves previewNow, not just persona, gates the bonus', async () => {
    setTitles([
      { text: 'אימון כוח מלא', persona: 'office_worker' },
      { text: 'מתיחות קלות ליד השולחן', persona: 'office_worker' },
    ]);
    setDescriptions([]);

    const previewNow = new Date();
    previewNow.setHours(15, 0, 0, 0);

    const result = await resolveWorkoutMetadataWithCandidates({ ...baseCtx, previewNow });

    const desk = result.titleCandidates.find(c => c.text.includes('שולחן'));
    expect(desk!.reasons.join(' ')).not.toContain('deskReset_boost');
    expect(desk!.score).toBe(1); // persona match only, no time bonus
  });
});

describe('previewNow override — Parent Time-Window Boost (08:00-09:00 / 16:00-17:30, +20)', () => {
  it('16:30 (park window): afternoon-tagged content is boosted for a parent persona', async () => {
    // location: 'park' (not the baseCtx default 'home') — matches the real
    // scenario this window models (parent at pickup), and avoids workout-
    // metadata.service.ts's own (correct, pre-existing) LOCATION CONTEXT
    // GUARD, which hard-excludes any row mentioning "בפארק" when
    // ctx.location === 'home' (found via this test failing initially —
    // the guard is real production behavior, not a bug in this fix).
    setTitles([
      { text: 'אימון בוקר', persona: 'parent', timeOfDay: 'morning' },
      { text: 'אימון בפארק עם הילדים', persona: 'parent', timeOfDay: 'afternoon' },
    ]);
    setDescriptions([]);

    const previewNow = new Date();
    previewNow.setHours(16, 30, 0, 0);

    const result = await resolveWorkoutMetadataWithCandidates({
      ...baseCtx, persona: 'parent', location: 'park', previewNow,
    });

    const parkRow = result.titleCandidates.find(c => c.text.includes('בפארק'));
    const morningRow = result.titleCandidates.find(c => c.text.includes('בוקר'));
    expect(parkRow!.reasons.join(' ')).toContain('parentPark');
    expect(parkRow!.score).toBeGreaterThan(morningRow!.score);
    expect(result.title).toContain('בפארק');
  });
});

describe('resolveWorkoutMetadataWithCandidates — transparency table data', () => {
  it('returns every candidate (not just the winner), each with a real score, ' +
     'and marks exactly the winner as isPicked', async () => {
    setTitles([
      { text: 'אופציה א', persona: 'generic' },
      { text: 'אופציה ב', persona: 'office_worker' },
    ]);
    setDescriptions([]);

    const result = await resolveWorkoutMetadataWithCandidates({
      ...baseCtx,
      previewNow: (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; })(),
    });

    expect(result.titleCandidates).toHaveLength(2);
    expect(result.titleCandidates.filter(c => c.isPicked)).toHaveLength(1);
    const picked = result.titleCandidates.find(c => c.isPicked)!;
    expect(picked.text).toBe('אופציה ב'); // office_worker persona match (+1) beats generic (+0)
    expect(result.title).toBe('אופציה ב');
  });

  it('an empty subcollection yields an empty candidate list, not a crash', async () => {
    setTitles([]);
    setDescriptions([]);
    const result = await resolveWorkoutMetadataWithCandidates(baseCtx);
    expect(result.titleCandidates).toEqual([]);
    expect(result.title).toBeNull();
  });
});
