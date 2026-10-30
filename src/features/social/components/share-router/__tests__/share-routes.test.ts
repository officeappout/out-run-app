import { describe, it, expect, beforeEach } from 'vitest';
import { availableShareRoutes } from '../share-routes';
import { registerSummaryShare, useSummaryShareRegistry } from '../summary-share-registry';

describe('share router (pilot AG2)', () => {
  it('fixed order, phone always there', () => {
    expect(availableShareRoutes({ feed: true, images: true })).toEqual(['feed', 'images', 'phone']);
    expect(availableShareRoutes({ feed: false, images: true })).toEqual(['images', 'phone']);
    expect(availableShareRoutes({ feed: false, images: false })).toEqual(['phone']);
  });

  describe('summary share registry', () => {
    beforeEach(() => useSummaryShareRegistry.setState({ feed: null, images: null }));

    it('the card registers its actions and clears them when it leaves', () => {
      const feed = () => {};
      const images = () => {};
      const clear = registerSummaryShare({ feed, images });
      expect(useSummaryShareRegistry.getState().feed).toBe(feed);
      expect(useSummaryShareRegistry.getState().images).toBe(images);
      clear();
      expect(useSummaryShareRegistry.getState().feed).toBeNull();
      expect(useSummaryShareRegistry.getState().images).toBeNull();
    });
  });
});
