import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));

import { applyFeedPrefs, DEFAULT_FEED_PREFS, feedPrefsFrom } from '../feed-prefs';

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
