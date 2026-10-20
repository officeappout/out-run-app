import { describe, expect, it } from 'vitest';
import {
  addTrackTitleHe,
  buildAddTrackWeek,
  presetPriority,
  priorityFromShare,
  priorityLineHe,
  shareOfPriority,
  weekDates,
  type AddTrackInput,
} from '../addTrackWeek';

// Board S-6b: push Sun, pull Tue, legs Thu; the new plan has 3 runs.
const J3: AddTrackInput = {
  added: 'running',
  existingStrength: [
    { dow: 0, slug: 'push', ids: ['push'] },
    { dow: 2, slug: 'pull', ids: ['pull'] },
    { dow: 4, slug: 'legs', ids: ['legs'] },
  ],
  existingRuns: [],
  newRunSlots: ['quality_primary', 'easy_run', 'long_run'],
  runLevel: 'beginner',
  targetDistance: '10k',
};

// Board S-6c: runs Sun (quality), Tue (easy), Fri (long); add full body × 2.
const J4: AddTrackInput = {
  added: 'strength',
  existingStrength: [],
  existingRuns: [
    { dow: 0, slot: 'quality_primary' },
    { dow: 2, slot: 'easy_run' },
    { dow: 5, slot: 'long_run' },
  ],
  newStrength: { slug: 'full_body', sessionsPerWeek: 2 },
  runLevel: 'intermediate',
  targetDistance: '10k',
};

const all = (w: ReturnType<typeof buildAddTrackWeek>) => w.days.flatMap((d) => d.sessions.map((s) => ({ ...s, dow: d.dow })));

describe('add track · priority preset to the first track', () => {
  it('a strength user adding running starts on "כוח קודם", a runner on "ריצה קודם"', () => {
    expect(presetPriority('running')).toBe('strength_first');
    expect(presetPriority('strength')).toBe('run_first');
    expect(priorityLineHe('strength_first', 'running')).toBe('כוח קודם (התחלת בכוח) · אפשר לשנות במחוון');
    expect(priorityLineHe('balanced', 'running')).toBe('מאוזן · אפשר לשנות במחוון');
  });
  it('the builder slider maps onto the engine priority and back', () => {
    expect(priorityFromShare(shareOfPriority('strength_first'))).toBe('strength_first');
    expect(priorityFromShare(shareOfPriority('balanced'))).toBe('balanced');
    expect(priorityFromShare(shareOfPriority('run_first'))).toBe('run_first');
    expect(priorityFromShare(0.45)).toBe('balanced');
  });
});

describe('add track · J3 strength user adds running (S-6b)', () => {
  const w = buildAddTrackWeek(J3, 'strength_first', false);

  it('adds 3 runs and keeps push + pull on their days', () => {
    const s = all(w);
    expect(s.filter((x) => x.kind === 'run' && x.status === 'new')).toHaveLength(3);
    expect(s.filter((x) => x.slug === 'push' || x.slug === 'pull').map((x) => [x.dow, x.slug, x.status])).toEqual([
      [0, 'push', 'kept'],
      [2, 'pull', 'kept'],
    ]);
    expect(w.titleHe).toBe(addTrackTitleHe('running', 3, w.movedCount));
  });

  it('a session a hard rule pushes out is reported "הוזז: … · כי …" and counted in the title', () => {
    // Legs on Friday + a long run that wants Saturday (the last free day): something must give.
    const forced = buildAddTrackWeek(
      { ...J3, existingStrength: [J3.existingStrength[0], J3.existingStrength[1], { dow: 5, slug: 'legs', ids: ['legs'] }] },
      'strength_first',
      false,
    );
    const s = all(forced);
    const legs = s.find((x) => x.slug === 'legs')!;
    const long = s.find((x) => x.slot === 'long_run')!;
    expect(legs.dow + 1 === long.dow).toBe(false);
    const moved = s.filter((x) => x.status === 'moved');
    expect(forced.movedCount).toBe(moved.length);
    for (const m of moved) {
      expect(m.noteHe).toMatch(/^הוזז: .+ · כי .+/);
      expect(typeof m.fromDow).toBe('number');
    }
    expect(forced.titleHe).toBe(addTrackTitleHe('running', 3, forced.movedCount));
  });

  it('kept sessions say so; new ones carry the engine reason', () => {
    const s = all(w);
    expect(s.filter((x) => x.status === 'kept').every((x) => x.noteHe === 'נשאר כמו שהיה')).toBe(true);
    expect(s.filter((x) => x.status === 'new').every((x) => typeof x.noteHe === 'string' && x.noteHe.length > 0)).toBe(true);
  });

  it('"keep it as it was": nothing moves, runs only on free days', () => {
    const k = buildAddTrackWeek(J3, 'strength_first', true);
    const s = all(k);
    expect(k.movedCount).toBe(0);
    expect(s.filter((x) => x.kind === 'strength').map((x) => [x.dow, x.status])).toEqual([[0, 'kept'], [2, 'kept'], [4, 'kept']]);
    for (const r of s.filter((x) => x.kind === 'run')) expect([0, 2, 4]).not.toContain(r.dow);
  });
});

describe('add track · J4 runner adds strength (S-6c)', () => {
  const w = buildAddTrackWeek(J4, 'run_first', false);
  it('runs never move; two new strength sessions land around them, not on the long run', () => {
    const s = all(w);
    expect(s.filter((x) => x.kind === 'run').every((x) => x.status === 'kept')).toBe(true);
    const strength = s.filter((x) => x.kind === 'strength');
    expect(strength).toHaveLength(2);
    expect(strength.every((x) => x.status === 'new')).toBe(true);
    expect(strength.some((x) => x.dow === 5)).toBe(false);
    expect(w.titleHe).toBe('נוסיף 2 אימוני כוח סביב הריצות');
  });
});

describe('add track · copy', () => {
  it('titles', () => {
    expect(addTrackTitleHe('running', 1, 0)).toBe('נוסיף ריצה אחת סביב השבוע שלך');
    expect(addTrackTitleHe('running', 3, 2)).toBe('נוסיף 3 ריצות ונזיז 2 אימונים');
    expect(addTrackTitleHe('strength', 2, 1)).toBe('נוסיף 2 אימוני כוח ונזיז ריצה אחת');
    expect(addTrackTitleHe('strength', 1, 0)).toBe('נוסיף אימון כוח אחד סביב הריצות');
  });
  it('week dates run Sunday..Saturday', () => {
    expect(weekDates(new Date(2026, 9, 21))).toEqual([18, 19, 20, 21, 22, 23, 24]);
  });
});
