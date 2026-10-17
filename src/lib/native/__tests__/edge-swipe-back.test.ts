import { describe, expect, it } from 'vitest';
import {
  EDGE_START_PX,
  isSwipeBackRoute,
  nextNavStack,
  shouldCommitSwipe,
  startsAtBackEdge,
} from '../edge-swipe-back';

describe('isSwipeBackRoute', () => {
  it('no back on tab roots and the landing page', () => {
    for (const p of ['/', '/home', '/map', '/progression', '/community', '/profile', '/home/']) {
      expect(isSwipeBackRoute(p)).toBe(false);
    }
  });

  it('blocked where horizontal drags or flows matter', () => {
    for (const p of ['/map/route', '/run', '/workouts/abc/active', '/onboarding-new/setup', '/gateway', '/workout-builder', '/admin/users']) {
      expect(isSwipeBackRoute(p)).toBe(false);
    }
  });

  it('allowed on pushed screens', () => {
    for (const p of ['/profile/u123', '/community/g1', '/workouts/abc/history', '/activity/steps', '/search', '/settings', '/progress']) {
      expect(isSwipeBackRoute(p)).toBe(true);
    }
  });

  it('a prefix must match a whole segment', () => {
    expect(isSwipeBackRoute('/mapping-notes')).toBe(true);
    expect(isSwipeBackRoute('/running-tips')).toBe(true);
  });
});

describe('startsAtBackEdge (RTL → right edge)', () => {
  it('only the right edge strip', () => {
    expect(startsAtBackEdge(390 - 5, 390)).toBe(true);
    expect(startsAtBackEdge(390 - EDGE_START_PX, 390)).toBe(true);
    expect(startsAtBackEdge(390 - EDGE_START_PX - 1, 390)).toBe(false);
    expect(startsAtBackEdge(5, 390)).toBe(false);
  });
});

describe('shouldCommitSwipe', () => {
  const w = 390;
  it('far enough → back', () => expect(shouldCommitSwipe(-0.4 * w, 0, w)).toBe(true));
  it('short and slow → spring back', () => expect(shouldCommitSwipe(-60, -0.1, w)).toBe(false));
  it('short but a quick flick → back', () => expect(shouldCommitSwipe(-60, -0.8, w)).toBe(true));
  it('a flick under the minimum distance → spring back', () => expect(shouldCommitSwipe(-20, -2, w)).toBe(false));
  it('never for the wrong direction', () => expect(shouldCommitSwipe(200, 2, w)).toBe(false));
});

describe('nextNavStack', () => {
  it('push, pop on back, ignore repeats', () => {
    let s: string[] = [];
    s = nextNavStack(s, '/home');
    expect(s).toEqual(['/home']);
    s = nextNavStack(s, '/profile/u1');
    s = nextNavStack(s, '/profile/u1');
    expect(s).toEqual(['/home', '/profile/u1']);
    s = nextNavStack(s, '/home');
    expect(s).toEqual(['/home']);
  });

  it('a cold start on a deep link has nothing to go back to', () => {
    expect(nextNavStack([], '/community/g1')).toHaveLength(1);
  });

  it('is capped', () => {
    let s: string[] = [];
    for (let i = 0; i < 80; i++) s = nextNavStack(s, `/p/${i}`);
    expect(s).toHaveLength(50);
  });
});
