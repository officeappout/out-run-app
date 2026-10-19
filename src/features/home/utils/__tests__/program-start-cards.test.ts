import { describe, it, expect } from 'vitest';
import {
  ADD_TRACK_DISMISS_DAYS,
  hasRunningIntent,
  isAddDismissActive,
  placeProgramSlide,
  resolveProgramSlide,
  resolveProgramSlideSurface,
} from '../program-start-cards';

const base = { enabled: true, hasStrength: false, hasRunning: false, runningIntent: false };

describe('resolveProgramSlide', () => {
  it('is none with the flag off, whatever the tracks', () => {
    expect(resolveProgramSlide({ ...base, enabled: false })).toEqual({ mode: 'none' });
    expect(resolveProgramSlide({ ...base, enabled: false, hasStrength: true })).toEqual({ mode: 'none' });
  });

  it('new user → two start cards, strength first by default', () => {
    expect(resolveProgramSlide(base)).toEqual({ mode: 'start', order: ['strength', 'running'] });
  });

  it('new user with a running intent → running first', () => {
    expect(resolveProgramSlide({ ...base, runningIntent: true })).toEqual({ mode: 'start', order: ['running', 'strength'] });
  });

  it('start pair ignores add dismissals', () => {
    expect(resolveProgramSlide({ ...base, addDismissed: { strength: true, running: true } }).mode).toBe('start');
  });

  it('strength only → add running', () => {
    expect(resolveProgramSlide({ ...base, hasStrength: true })).toEqual({ mode: 'add', track: 'running' });
  });

  it('running only → add strength', () => {
    expect(resolveProgramSlide({ ...base, hasRunning: true })).toEqual({ mode: 'add', track: 'strength' });
  });

  it('a dismissed add card hides only that track', () => {
    expect(resolveProgramSlide({ ...base, hasStrength: true, addDismissed: { running: true } })).toEqual({ mode: 'none' });
    expect(resolveProgramSlide({ ...base, hasStrength: true, addDismissed: { strength: true } })).toEqual({ mode: 'add', track: 'running' });
  });

  it('both tracks → none', () => {
    expect(resolveProgramSlide({ ...base, hasStrength: true, hasRunning: true })).toEqual({ mode: 'none' });
  });
});

describe('hasRunningIntent', () => {
  it('false with no signal', () => {
    expect(hasRunningIntent(null)).toBe(false);
    expect(hasRunningIntent({ lifestyle: { primaryTrack: 'strength', dashboardMode: 'DEFAULT' } }, 'STRENGTH')).toBe(false);
  });
  it('primaryTrack run', () => expect(hasRunningIntent({ lifestyle: { primaryTrack: 'run' } })).toBe(true));
  it('dashboardMode RUNNING', () => expect(hasRunningIntent({ lifestyle: { dashboardMode: 'RUNNING' } })).toBe(true));
  it('gateway_track RUNNING', () => expect(hasRunningIntent({}, 'RUNNING')).toBe(true));
});

describe('isAddDismissActive', () => {
  const now = Date.UTC(2026, 9, 19);
  const day = 24 * 60 * 60 * 1000;
  it('inactive without a stamp', () => {
    expect(isAddDismissActive(null, now)).toBe(false);
    expect(isAddDismissActive(undefined, now)).toBe(false);
    expect(isAddDismissActive(Number.NaN, now)).toBe(false);
  });
  it('active within 14 days', () => {
    expect(isAddDismissActive(now, now)).toBe(true);
    expect(isAddDismissActive(now - (ADD_TRACK_DISMISS_DAYS * day - 1), now)).toBe(true);
  });
  it('expires at 14 days', () => {
    expect(isAddDismissActive(now - ADD_TRACK_DISMISS_DAYS * day, now)).toBe(false);
  });
  it('a future stamp (clock skew) does not hide the card', () => {
    expect(isAddDismissActive(now + day, now)).toBe(false);
  });
});

describe('placeProgramSlide', () => {
  const S = 'slide';
  it('none → items unchanged', () => {
    expect(placeProgramSlide(['a', 'b'], S, { mode: 'none' })).toEqual(['a', 'b']);
  });
  it('start → first', () => {
    expect(placeProgramSlide(['a', 'b'], S, { mode: 'start', order: ['strength', 'running'] })).toEqual([S, 'a', 'b']);
  });
  it('add → second, after the day\'s first card', () => {
    expect(placeProgramSlide(['a', 'b'], S, { mode: 'add', track: 'running' })).toEqual(['a', S, 'b']);
  });
  it('add with no other card → alone', () => {
    expect(placeProgramSlide([], S, { mode: 'add', track: 'strength' })).toEqual([S]);
  });
});

describe('resolveProgramSlideSurface', () => {
  const start = { mode: 'start', order: ['strength', 'running'] } as const;
  const add = { mode: 'add', track: 'running' } as const;
  const s = (over: Partial<Parameters<typeof resolveProgramSlideSurface>[0]>) =>
    resolveProgramSlideSurface({ plan: start, isViewingToday: true, preCarousel: 'none', postCarousel: 'none', ...over });

  it('plan none → null, whatever the carousels', () => {
    expect(s({ plan: { mode: 'none' }, preCarousel: 'ready' })).toBeNull();
    expect(s({ plan: { mode: 'none' } })).toBeNull();
  });
  it('a showing carousel hosts it (pre or post)', () => {
    expect(s({ preCarousel: 'ready' })).toBe('carousel');
    expect(s({ postCarousel: 'ready' })).toBe('carousel');
    expect(s({ plan: add, postCarousel: 'ready' })).toBe('carousel');
  });
  it('a loading carousel → pending (its skeleton stands in)', () => {
    expect(s({ preCarousel: 'loading' })).toBe('pending');
    expect(s({ postCarousel: 'loading' })).toBe('pending');
  });
  it('ready wins over loading', () => {
    expect(s({ preCarousel: 'ready', postCarousel: 'loading' })).toBe('carousel');
  });
  it('no carousel → standalone (start pair on any day, add card today only)', () => {
    expect(s({})).toBe('standalone');
    expect(s({ isViewingToday: false })).toBe('standalone');
    expect(s({ plan: add })).toBe('standalone');
    expect(s({ plan: add, isViewingToday: false })).toBeNull();
  });
});
