import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('../../services/reactions.service', () => ({ toggleReaction: vi.fn(), hasUserReacted: vi.fn(() => Promise.resolve(false)) }));
vi.mock('../../services/feed.service', () => ({ deleteFeedPost: vi.fn() }));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({ default: () => null }));
vi.mock('../ShareImageSheet', () => ({ default: () => null }));

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
  it('run: km, pace, minutes and the cheer button', () => {
    const html = renderToStaticMarkup(createElement(FeedPostCard, { post: post({}), currentUid: 'u1', v2: true }));
    expect(html).toContain('5.2');
    expect(html).toContain('5:48');
    expect(html).toContain('עידוד');
    expect(html).not.toContain('קצב לפי הקפה');
  });

  it('run: route hero, pace bars and the segment badge when known', () => {
    const html = renderToStaticMarkup(
      createElement(FeedPostCard, {
        post: post({ routeShape: [0, 0, 500, 400, 1000, 100], paceSplits: [330, 315, 300], runSegment: '5k', streakDays: 6 }),
        currentUid: 'u1',
        v2: true,
      }),
    );
    expect(html).toContain('קו המסלול של נועה');
    expect(html).toContain('קצב לפי הקפה');
    expect(html).toContain('5 ק״מ');
    expect(html).toContain('רצף 6 ימים');
  });

  it('run with a photo: the photo is the hero, the line a small inset', () => {
    const html = renderToStaticMarkup(
      createElement(FeedPostCard, { post: post({ photoUrl: 'https://x/p.jpg', routeShape: [0, 0, 500, 400, 1000, 100] }), currentUid: 'u1', v2: true }),
    );
    expect(html).toContain('https://x/p.jpg');
    expect(html).toContain('קו המסלול של נועה');
  });

  it('strength without details: minutes, points, intensity', () => {
    const html = renderToStaticMarkup(
      createElement(FeedPostCard, { post: post({ activityCategory: 'strength', durationMinutes: 35, activityCredit: 70, intensityLevel: 'בינונית' }), currentUid: 'u1', v2: true }),
    );
    expect(html).toContain('נקודות');
    expect(html).toContain('70');
    expect(html).toContain('כוח');
    expect(html).not.toContain('שלב');
  });

  it('strength with details: level, exercises, more, improvement badge', () => {
    const html = renderToStaticMarkup(
      createElement(FeedPostCard, {
        post: post({
          activityCategory: 'strength',
          durationMinutes: 42,
          programName: 'פלג גוף עליון',
          levelIndex: 4,
          levelCount: 12,
          topExercises: [{ name: 'מתח', sets: 3, setsDone: 3, value: 8, unit: 'reps' }],
          moreExercises: 4,
          personalBest: '8 חזרות מתח (+2 מהפעם הקודמת)',
        }),
        currentUid: 'u1',
        v2: true,
      }),
    );
    expect(html).toContain('שלב 4 מתוך 12');
    expect(html).toContain('כוח · פלג גוף עליון');
    expect(html).toContain('3 × 8');
    expect(html).toContain('ועוד 4 תרגילים');
    expect(html).toContain('+2 מהפעם הקודמת');
  });

  it('share to networks only on your own post', () => {
    const own = renderToStaticMarkup(createElement(FeedPostCard, { post: post({ authorUid: 'u1' }), currentUid: 'u1', v2: true }));
    const other = renderToStaticMarkup(createElement(FeedPostCard, { post: post({}), currentUid: 'u1', v2: true }));
    expect(own).toContain('שיתוף לרשתות');
    expect(other).not.toContain('שיתוף לרשתות');
  });

  it('classic card when v2 is off', () => {
    const html = renderToStaticMarkup(createElement(FeedPostCard, { post: post({}), currentUid: 'u1' }));
    expect(html).toContain('סיכום אימון');
  });
});
