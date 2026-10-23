/**
 * Run-done state: HomeRunCarouselCard's partial branch (a run too short to count) is compact, has a soft
 * line and the full-run CTA, and never says "missed"; a normal slot renders exactly as before.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/features/home/hooks/usePlannedRunWorkout', () => ({ usePlannedRunWorkout: vi.fn(() => ({ workout: null, loading: false })) }));
vi.mock('@/features/workout-engine/players/running/components/preview-v2/useRunPreviewModel', () => ({ useRunPreviewModel: () => null }));
vi.mock('@/features/workout-engine/players/running/components/overview-v2/RunOverviewHomeSheet', () => ({ default: () => null }));

import HomeRunCarouselCard from '../HomeRunCarouselCard';
import { usePlannedRunWorkout } from '@/features/home/hooks/usePlannedRunWorkout';
import type { HomeRunSlot } from '@/features/home/utils/home-run-slot';

const entry = { week: 2, day: 1, status: 'pending' as const, workoutId: 'easy_w2', category: 'easy_run', workoutName: 'ריצה קלה' };
const slot = (over: Partial<HomeRunSlot> = {}): HomeRunSlot => ({ kind: 'today', entry, position: 'first', ...over });
const render = (s: HomeRunSlot) => renderToStaticMarkup(h(HomeRunCarouselCard, { slot: s, profile: null, currentWeek: 2, standalone: true }));

describe('HomeRunCarouselCard — partial', () => {
  it('shows the soft line and the full-run CTA, compact, with no missed wording', () => {
    const out = render(slot({ partial: true }));
    expect(out).toContain('data-run-partial="true"');
    expect(out).toContain('הריצה הקצרה של היום עוד לא נספרת בתוכנית');
    expect(out).toContain('לריצה המלאה');
    expect(out).toContain('הריצה של היום');
    expect(out).not.toMatch(/פספס|דילגת|הוחמץ|נכשל/);
    // compact: no program line, no week card
    expect(out).not.toContain('תוכנית 5 ק״מ');
    expect(out).not.toContain('התחלה');
  });

  it('beginner plan: the encouraging "good start" line instead of "too short"', () => {
    const out = render(slot({ partial: true, goodStart: true }));
    expect(out).toContain('יופי של התחלה!');
    expect(out).not.toContain('הריצה הקצרה של היום');
    expect(out).toContain('לריצה המלאה');
  });

  it('does not preload the planned workout for a partial card', () => {
    (usePlannedRunWorkout as unknown as ReturnType<typeof vi.fn>).mockClear();
    render(slot({ partial: true }));
    expect((usePlannedRunWorkout as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].enabled).toBe(false);
  });

  it('a normal today slot is unchanged: the week card with its Start button, no partial line', () => {
    const out = render(slot());
    expect(out).not.toContain('data-run-partial');
    expect(out).not.toContain('הריצה הקצרה של היום');
    expect(out).toContain('התחלה');
    expect(out).toContain('הריצה של היום');
  });
});
