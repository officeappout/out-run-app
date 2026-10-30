/**
 * enable_home_after_v1 stage 3: a finished workout as a post slide. A workout opens its summary (a button with
 * the big numbers and "details"); a met step goal has no summary (no button). Static markup, node env.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomeDonePost from '../HomeDonePost';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { TodayActivityCardData } from '../TodayActivityCard';

const setLocale = (l: 'he' | 'en') => { Object.assign(useLocaleStore.getInitialState(), { locale: l }); };
const run: TodayActivityCardData = { key: 'w1', category: 'cardio', workoutType: 'running', title: 'ריצה קלה', minutes: 26, streak: 0 };
const render = (card: TodayActivityCardData, onOpen?: () => void) =>
  renderToStaticMarkup(h(HomeDonePost, { card, workout: { id: card.key, distance: 4.1, duration: 1530, pace: 6.2167, date: new Date(2026, 9, 30, 18, 10) }, onOpen }));

describe('HomeDonePost', () => {
  beforeEach(() => setLocale('he'));

  it('a workout: a button that opens its summary, numbers, time, details', () => {
    const out = render(run, () => {});
    expect(out).toMatch(/^<button[^>]*data-home-after-post="w1"/);
    expect(out).toContain('aria-label="פתיחת סיכום האימון: ריצה קלה"');
    expect(out).toContain('בוצע היום');
    expect(out).toContain('18:10');
    expect(out).toContain('4.1');
    expect(out).toContain('25:30');
    expect(out).toContain('6:13');
    expect(out).toContain('פרטים');
    expect(out).toContain('dir="rtl"');
  });

  it('a step goal: not a button, no details', () => {
    const out = render({ key: 'stepgoal-1', category: 'steps', title: 'יעד צעדים', minutes: 0, stepsAchieved: 8400, streak: 0 }, () => {});
    expect(out).toMatch(/^<article/);
    expect(out).not.toContain('פרטים');
    expect(out).toContain('8,400');
  });

  it('English: English labels, left to right', () => {
    setLocale('en');
    const out = render(run, () => {});
    expect(out).toContain('Done today');
    expect(out).toContain('Details');
    expect(out).toContain('dir="ltr"');
  });
});
