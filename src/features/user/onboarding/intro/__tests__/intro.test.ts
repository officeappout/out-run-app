import { describe, it, expect } from 'vitest';
import {
  BARRIER_LABELS, BARRIER_STORIES, BRIDGE_COPY, LANDING_COPY, RING_TONES, storyImages,
} from '../intro-copy';
import {
  EXPLORER_ROUTE, INTRO_ARRIVAL_KEY, INTRO_PREVIEW_ROUTE, INTRO_ROUTE, consumeIntroArrival, isIntroPreview, isIntroSeen,
  markIntroArrival, resolveQuickSignupHref, withIntroRedirect,
} from '../intro-route';
import { arcPath, labelCenter, segmentPath } from '../ring-geometry';
import { trackProps } from '../story-timeline';
import { storyTracks } from '../story-schedule';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('intro story data', () => {
  it('five stories, in ring order (time, community, access, money, know-how)', () => {
    expect(BARRIER_STORIES).toHaveLength(5);
    expect(BARRIER_LABELS).toEqual(['זמן', 'קהילה', 'נגישות', 'כסף', 'ידע']);
    expect(BARRIER_STORIES.map((s) => s.id)).toEqual(['alon', 'michal', 'dani', 'omer', 'ruti']);
    expect(BARRIER_STORIES.map((s) => s.phone)).toEqual(['time', 'community', 'access', 'money', 'knowledge']);
    expect(BARRIER_STORIES.map((s) => s.side)).toEqual(['left', 'right', 'left', 'left', 'right']);
    expect(BARRIER_STORIES.map((s) => s.clock)).toEqual(['07:40', '18:20', '16:40', '17:30', '08:15']);
  });

  it('every story has its copy and assets', () => {
    for (const s of BARRIER_STORIES) {
      expect(s.person.length).toBeGreaterThan(0);
      expect(s.thought.startsWith('„')).toBe(true);
      expect(s.push.length).toBeGreaterThan(10);
      expect(s.titleLines[0].length).toBeGreaterThan(0);
      expect(s.titleLines[1].length).toBeGreaterThan(0);
      expect(s.sub.length).toBeGreaterThan(10);
      expect(storyImages(s)).toEqual([
        `/images/intro/sad-${s.id}.jpg`,
        `/images/intro/happy-${s.id}.png`,
        `/images/intro/phone-${s.phone}.jpg`,
      ]);
    }
  });

  it('verbatim copy spot-checks', () => {
    expect(BARRIER_STORIES[0].titleLines).toEqual(['אין זמן?', 'בדרך לעבודה']);
    expect(BARRIER_STORIES[3].person).toBe('עומר, 22 · סטודנט');
    expect(BARRIER_STORIES[4].titleLines[1]).toBe('שגם ההורים שלך יסתדרו');
    expect(BRIDGE_COPY.titleLines).toEqual(['זו לא אשמתכם', 'שקשה להתמיד.']);
    expect(BRIDGE_COPY.cta).toBe('בואו נראה');
    expect(LANDING_COPY.sub).toBe('יחד הופכים את כל העיר לחדר כושר.');
    expect(LANDING_COPY.cta).toBe('הרשמה מהירה');
    expect(RING_TONES).toEqual(['#4fb3ea', '#52c3e0', '#55cfd9', '#5ddcd4', '#67e6d3']);
  });
});

describe('seen once', () => {
  it('only "1" counts as seen', () => {
    expect(isIntroSeen('1')).toBe(true);
    expect(isIntroSeen(null)).toBe(false);
    expect(isIntroSeen(undefined)).toBe(false);
    expect(isIntroSeen('')).toBe(false);
    expect(isIntroSeen('0')).toBe(false);
  });

  it('the arrival hint fires exactly once', () => {
    const st = new MemStorage();
    expect(consumeIntroArrival(st)).toBe(false);
    markIntroArrival(st);
    expect(st.getItem(INTRO_ARRIVAL_KEY)).toBe('1');
    expect(consumeIntroArrival(st)).toBe(true);
    expect(consumeIntroArrival(st)).toBe(false);
  });

  it('storage failures never throw', () => {
    const broken = {
      getItem: () => { throw new Error('x'); },
      setItem: () => { throw new Error('x'); },
      removeItem: () => { throw new Error('x'); },
    };
    expect(() => markIntroArrival(broken)).not.toThrow();
    expect(consumeIntroArrival(broken)).toBe(false);
    expect(consumeIntroArrival(null)).toBe(false);
  });
});

describe('quick-signup route decision', () => {
  const invites = ['/community?groupId=g1&joined=true', '/community?groupId=g2', '/map?openRun=running', '/map'];

  it('flag off → unchanged, whatever was seen', () => {
    expect(resolveQuickSignupHref(EXPLORER_ROUTE, { introOn: false, introSeen: false })).toBe(EXPLORER_ROUTE);
    expect(resolveQuickSignupHref(EXPLORER_ROUTE, { introOn: false, introSeen: true })).toBe(EXPLORER_ROUTE);
  });

  it('flag on, not seen → /intro; seen → /explorer', () => {
    expect(resolveQuickSignupHref(EXPLORER_ROUTE, { introOn: true, introSeen: false })).toBe(INTRO_ROUTE);
    expect(resolveQuickSignupHref(EXPLORER_ROUTE, { introOn: true, introSeen: true })).toBe(EXPLORER_ROUTE);
  });

  it('pending group / session invite redirects are never touched', () => {
    for (const href of invites) {
      for (const introOn of [true, false]) {
        for (const introSeen of [true, false]) {
          expect(resolveQuickSignupHref(href, { introOn, introSeen })).toBe(href);
        }
      }
    }
  });

  it('preview → /intro?preview=1 regardless of flag and seen; invites still untouched', () => {
    for (const introOn of [true, false]) {
      for (const introSeen of [true, false]) {
        expect(resolveQuickSignupHref(EXPLORER_ROUTE, { introOn, introSeen, preview: true })).toBe(INTRO_PREVIEW_ROUTE);
        for (const href of invites) {
          expect(resolveQuickSignupHref(href, { introOn, introSeen, preview: true })).toBe(href);
        }
      }
    }
  });

  it('preview query parsing', () => {
    expect(isIntroPreview('?intro=preview', 'landing')).toBe(true);
    expect(isIntroPreview('?a=1&intro=preview', 'landing')).toBe(true);
    expect(isIntroPreview('?intro=1', 'landing')).toBe(false);
    expect(isIntroPreview('', 'landing')).toBe(false);
    expect(isIntroPreview(null, 'landing')).toBe(false);
    expect(isIntroPreview('?preview=1', 'intro')).toBe(true);
    expect(isIntroPreview('?preview=0', 'intro')).toBe(false);
    expect(isIntroPreview('?intro=preview', 'intro')).toBe(false);
  });

  it('withIntroRedirect forwards the resolved href to the real router', () => {
    const pushed: string[] = [];
    const r = withIntroRedirect({ push: (h: string) => pushed.push(h) }, { introOn: true, introSeen: false });
    r.push(EXPLORER_ROUTE);
    r.push(invites[0]);
    expect(pushed).toEqual([INTRO_ROUTE, invites[0]]);
  });
});

describe('ring geometry (matches the canvas mockups)', () => {
  it('bridge ring segment 0 = the mockup arc', () => {
    expect(segmentPath(0, 300, 110)).toBe('M165.31 41.07 A110 110 0 0 1 248.87 101.78');
    expect(segmentPath(2, 300, 110)).toBe('M201.64 247.12 A110 110 0 0 1 98.36 247.12');
  });
  it('badge mini ring + the closing ring', () => {
    expect(segmentPath(0, 22, 8)).toBe('M12.11 3.08 A8 8 0 0 1 18.19 7.49');
    expect(segmentPath(0, 300, 120, 7)).toBe('M164.62 30.89 A120 120 0 0 1 258.76 99.29');
  });
  it('labels sit clockwise from the top-right', () => {
    const l0 = labelCenter(0, 300, 160);
    const l2 = labelCenter(2, 300, 160);
    expect(l0.x).toBeGreaterThan(150);
    expect(l0.y).toBeLessThan(150);
    expect(Math.round(l2.x)).toBe(150);
    expect(l2.y).toBeGreaterThan(300);
  });
  it('arcPath large-arc flag', () => {
    expect(arcPath(0, 0, 10, 0, 200)).toContain(' 0 1 1 ');
  });
});

describe('story timeline', () => {
  const tracks = storyTracks(BARRIER_STORIES[0]);
  it('reduced motion = the last frame, no animation', () => {
    const p = trackProps(tracks.phone, tracks.total, { reduce: true });
    expect(p.initial).toBe(false);
    expect(p.animate).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
    expect(p.transition).toBeUndefined();
  });
  it('plays once from the first keyframe, after the hand-off delay', () => {
    const p = trackProps(tracks.think, tracks.total, { reduce: false, delay: 2.4 });
    expect(p.initial).toEqual({ opacity: 0, scale: 0.94 });
    expect((p.transition as { delay: number }).delay).toBe(2.4);
    expect((p.transition as { repeat?: number }).repeat).toBeUndefined();
  });
  it('right-side stories mirror the small phone', () => {
    expect(storyTracks(BARRIER_STORIES[1]).phone.values.x[0]).toBe(-105);
    expect(storyTracks(BARRIER_STORIES[0]).phone.values.x[0]).toBe(105);
  });
  it('every track ends where it holds (times end at 1, values match)', () => {
    for (const t of [tracks.think, tracks.phone, tracks.happy, tracks.push, tracks.tap, tracks.lock, tracks.sad]) {
      expect(t.times[0]).toBe(0);
      expect(t.times[t.times.length - 1]).toBe(1);
      for (let i = 1; i < t.times.length; i++) expect(t.times[i]).toBeGreaterThanOrEqual(t.times[i - 1]);
      for (const v of Object.values(t.values)) expect(v).toHaveLength(t.times.length);
    }
  });
});
