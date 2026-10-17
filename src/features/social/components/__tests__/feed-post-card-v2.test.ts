import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('../../services/reactions.service', () => ({ toggleReaction: vi.fn(), hasUserReacted: vi.fn(() => Promise.resolve(false)) }));
vi.mock('../../services/feed.service', () => ({ deleteFeedPost: vi.fn() }));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({ default: () => null }));

import FeedPostCard from '../FeedPostCard';
import type { FeedPost } from '../../services/feed.service';

const post = (over: Partial<FeedPost>): FeedPost =>
  ({
    id: 'p1',
    authorUid: 'u2',
    authorName: 'נועה',
    type: 'workout',
    activityCategory: 'cardio',
    durationMinutes: 30,
    activityCredit: 30,
    distanceKm: 5.2,
    paceMinPerKm: 5.8,
    audience: 'partners',
    createdAt: new Date(),
    ...over,
  }) as FeedPost;

describe('FeedPostCard v2', () => {
  it('run: km, pace, minutes, the aerobic pill and the cheer button', () => {
    const html = renderToStaticMarkup(createElement(FeedPostCard, { post: post({}), currentUid: 'u1', v2: true }));
    expect(html).toContain('5.2');
    expect(html).toContain('5:48');
    expect(html).toContain('אירובי');
    expect(html).toContain('עידוד');
  });

  it('strength: minutes, points, intensity', () => {
    const html = renderToStaticMarkup(
      createElement(FeedPostCard, { post: post({ activityCategory: 'strength', durationMinutes: 35, activityCredit: 70, intensityLevel: 'בינונית' }), currentUid: 'u1', v2: true }),
    );
    expect(html).toContain('נקודות');
    expect(html).toContain('70');
    expect(html).toContain('כוח');
  });

  it('classic card when v2 is off', () => {
    const html = renderToStaticMarkup(createElement(FeedPostCard, { post: post({}), currentUid: 'u1' }));
    expect(html).toContain('סיכום אימון');
  });
});
