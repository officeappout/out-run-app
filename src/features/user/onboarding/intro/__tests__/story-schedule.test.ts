import { describe, it, expect } from 'vitest';
import { BARRIER_STORIES } from '../intro-copy';
import { BEAT, READ_MIN_MS, readMs, storySchedule, storyTracks } from '../story-schedule';

/** The value of `prop` at absolute second `t` (keyframes are step-sampled at their times). */
function valueAt(track: { times: readonly number[]; values: Readonly<Record<string, readonly (number | string)[]>> }, total: number, prop: string, t: number) {
  const f = t / total;
  let i = 0;
  while (i < track.times.length - 1 && track.times[i + 1] <= f) i++;
  return track.values[prop][i];
}

describe('reading time', () => {
  it('60 ms per character, never under 1.2 s', () => {
    expect(readMs('קצר')).toBe(READ_MIN_MS);
    expect(readMs('א'.repeat(50))).toBe(3000);
  });
  it('quotes and repeated spaces do not count', () => {
    expect(readMs('„' + 'א'.repeat(40) + '”')).toBe(readMs('א'.repeat(40)));
    expect(readMs('א  ב')).toBe(readMs('א ב'));
  });
});

describe('story beats run in sequence (owner notes 21.10 #2, #3)', () => {
  it.each(BARRIER_STORIES.map((s) => [s.id, s] as const))('%s: each beat finishes before the next', (_id, story) => {
    const s = storySchedule(story);
    const order = [s.bubbleIn, s.bubbleHoldEnd, s.bubbleGone, s.phoneIn, s.pushIn, s.growStart, s.growEnd, s.tapStart, s.lockOut, s.happyIn, s.total];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]);
    // The thought is fully gone before the phone shows up.
    expect(s.phoneIn).toBeGreaterThanOrEqual(s.bubbleGone);
  });

  it.each(BARRIER_STORIES.map((s) => [s.id, s] as const))('%s: the thought holds long enough to read', (_id, story) => {
    const s = storySchedule(story);
    const held = s.bubbleHoldEnd - (s.bubbleIn + BEAT.bubbleIn);
    expect(held * 1000 + 1e-6).toBeGreaterThanOrEqual(readMs(story.thought));
    expect(held * 1000).toBeGreaterThanOrEqual(1200);
  });

  it.each(BARRIER_STORIES.map((s) => [s.id, s] as const))('%s: the push is read at FULL size before the tap', (_id, story) => {
    const s = storySchedule(story);
    const t = storyTracks(story);
    // The push has landed before the phone starts growing…
    expect(s.pushIn + BEAT.pushIn).toBeLessThanOrEqual(s.growStart);
    // …the phone is full size and the lock screen (with the push) still fully up…
    expect(valueAt(t.phone, t.total, 'scale', s.growEnd)).toBe(1);
    expect(valueAt(t.lock, t.total, 'opacity', s.growEnd)).toBe(1);
    expect(valueAt(t.push, t.total, 'opacity', s.growEnd)).toBe(1);
    // …for at least the push's reading time before the finger arrives.
    expect((s.tapStart - s.growEnd) * 1000 + 1e-6).toBeGreaterThanOrEqual(readMs(story.push));
    // The lock screen only fades after the tap.
    expect(s.lockOut).toBeGreaterThan(s.tapStart);
  });

  it('the phone is visible from its beat on, and never before the thought ends', () => {
    const story = BARRIER_STORIES[0];
    const s = storySchedule(story);
    const t = storyTracks(story);
    expect(valueAt(t.phone, t.total, 'opacity', s.bubbleHoldEnd)).toBe(0);
    expect(valueAt(t.phone, t.total, 'opacity', s.phoneIn + BEAT.phoneIn)).toBe(1);
    expect(valueAt(t.phone, t.total, 'opacity', t.total)).toBe(1);
  });

  it('UI enters and exits stay within 300 ms; no scale from 0', () => {
    for (const k of ['bubbleIn', 'bubbleOut', 'phoneIn', 'pushIn', 'sadOut', 'tapIn', 'happyIn'] as const) {
      expect(BEAT[k]).toBeLessThanOrEqual(0.3);
    }
    const t = storyTracks(BARRIER_STORIES[2]);
    for (const tr of [t.think, t.phone, t.happy, t.tap]) {
      for (const v of tr.values.scale ?? []) expect(v as number).toBeGreaterThanOrEqual(0.42);
    }
    expect(t.think.values.scale[0]).toBeGreaterThanOrEqual(0.9);
  });

  it('the happy person arrives only after the app opened', () => {
    const s = storySchedule(BARRIER_STORIES[4]);
    expect(s.happyIn).toBeGreaterThanOrEqual(s.lockOut + BEAT.lockOut);
  });
});
