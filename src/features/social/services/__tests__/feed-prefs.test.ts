import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));

import {
  applyFeedPrefs, applyShareChoice, clearPendingShare, DEFAULT_FEED_PREFS, feedPrefsFrom, isPendingShareFor,
  PENDING_SHARE_EVENT, postPlanForDecision, readPendingShare, savePendingShare,
} from '../feed-prefs';

const run = { activityCategory: 'cardio' as const, parkId: 'p1', parkName: 'פארק', audience: undefined as string | undefined };

describe('feedPrefsFrom', () => {
  it('nothing stored → nothing auto-publishes, partners, park shown', () => {
    expect(feedPrefsFrom(undefined)).toEqual(DEFAULT_FEED_PREFS);
  });
  it('keeps valid values, drops junk', () => {
    const p = feedPrefsFrom({ autoPublish: { cardio: true, strength: 'yes' }, audience: 'everyone', showPark: false });
    expect(p.autoPublish).toEqual({ strength: false, cardio: true, maintenance: false });
    expect(p.audience).toBe('partners');
    expect(p.showPark).toBe(false);
  });
});

describe('applyFeedPrefs', () => {
  it('auto-publish off → hold as a share prompt', () => {
    expect(applyFeedPrefs(run, DEFAULT_FEED_PREFS, false).publish).toBe(false);
  });
  it('auto-publish on for the activity → publish with the default audience', () => {
    const prefs = feedPrefsFrom({ autoPublish: { cardio: true }, audience: 'public' });
    const d = applyFeedPrefs(run, prefs, false);
    expect(d.publish).toBe(true);
    expect(d.params.audience).toBe('public');
  });
  it('a manual share always publishes, with the audience just picked', () => {
    const d = applyFeedPrefs({ ...run, audience: 'private' }, DEFAULT_FEED_PREFS, true);
    expect(d.publish).toBe(true);
    expect(d.params.audience).toBe('private');
  });
  it('park hidden → no park on an automatic post', () => {
    const d = applyFeedPrefs(run, feedPrefsFrom({ showPark: false, autoPublish: { cardio: true } }), false);
    expect(d.publish).toBe(true);
    expect(d.params.parkId).toBeUndefined();
    expect(d.params.parkName).toBeUndefined();
  });
  it('a manual share keeps what the sheet chose, even when the saved default hides the park/route', () => {
    const d = applyFeedPrefs({ ...run, routeShape: [0, 0, 5, 5, 9, 9] }, feedPrefsFrom({ showPark: false, showRoute: false }), true);
    expect(d.params.parkName).toBe('פארק');
    expect(d.params.routeShape).toEqual([0, 0, 5, 5, 9, 9]);
  });
  it('route hidden → no route line on an automatic post', () => {
    const d = applyFeedPrefs({ ...run, routeShape: [0, 0, 5, 5, 9, 9] }, feedPrefsFrom({ showRoute: false, autoPublish: { cardio: true } }), false);
    expect(d.params.routeShape).toBeUndefined();
  });
  it('showRoute defaults to on', () => {
    expect(feedPrefsFrom({}).showRoute).toBe(true);
    expect(feedPrefsFrom({ showRoute: false }).showRoute).toBe(false);
  });
});

describe('applyShareChoice', () => {
  const params = { activityCategory: 'cardio' as const, title: 'ריצת בוקר', parkId: 'p1', parkName: 'פארק', routeShape: [1, 2, 3, 4, 5, 6] };
  it('sets the chosen audience and title, keeps park + line when on', () => {
    expect(applyShareChoice(params, { audience: 'public', showPark: true, showRoute: true, title: 'שיא!' }))
      .toEqual({ ...params, audience: 'public', title: 'שיא!' });
  });
  it('keeps the original title when none is typed; drops park / line when off', () => {
    const out = applyShareChoice(params, { audience: 'private', showPark: false, showRoute: false });
    expect(out).toEqual({ activityCategory: 'cardio', title: 'ריצת בוקר', audience: 'private' });
    expect(params.parkId).toBe('p1'); // input untouched
  });
});

describe('postPlanForDecision (summary share card → finish handler)', () => {
  const params = { activityCategory: 'strength' as const, parkId: 'p1', parkName: 'פארק' };
  it('no decision → post as before (prefs decide: auto-publish or pending share)', () => {
    expect(postPlanForDecision(params, null)).toEqual({ post: true, params, manual: false });
  });
  it('"לא הפעם" → no post at all (so no pending share either)', () => {
    expect(postPlanForDecision(params, { kind: 'skip' })).toEqual({ post: false });
  });
  it('publish → a manual post with the sheet choice applied', () => {
    expect(postPlanForDecision(params, { kind: 'publish', choice: { audience: 'public', showPark: false, showRoute: false } }))
      .toEqual({ post: true, manual: true, params: { activityCategory: 'strength', audience: 'public', title: undefined } });
  });
});

describe('pending share on a summary screen', () => {
  it('only a share saved after the screen opened (2 min slack) belongs to it', () => {
    expect(isPendingShareFor({ at: 1_000_000 }, 1_000_000 + 60_000)).toBe(true);
    expect(isPendingShareFor({ at: 1_000_000 }, 1_000_000 + 3 * 60_000)).toBe(false);
    expect(isPendingShareFor(null, 0)).toBe(false);
  });

  it('saving fires the event; clear removes it', () => {
    const store = new Map<string, string>();
    const events: string[] = [];
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      dispatchEvent: (e: Event) => { events.push(e.type); return true; },
    });
    savePendingShare({ a: 1 }, 5);
    expect(events).toEqual([PENDING_SHARE_EVENT]);
    expect(readPendingShare(10)?.params).toEqual({ a: 1 });
    clearPendingShare();
    expect(readPendingShare(10)).toBeNull();
    vi.unstubAllGlobals();
  });
});
