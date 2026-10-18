/**
 * "קלי AI" workout card: the home hero card's look at half height, in three states
 * (ready / building / failed). Static markup (node env, no jsdom), like home-v2-cards.test.
 */
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkoutCard } from '@/lib/ai/coach/protocol';
import AiCoachWorkoutCard, {
  AI_CARD_HEIGHT,
  AiCoachWorkoutCardError,
  AiCoachWorkoutCardFace,
  AiCoachWorkoutCardSkeleton,
} from '../components/AiCoachWorkoutCard';
import { workoutCardView } from '../services/workout-card-view.pure';

const card: WorkoutCard = {
  type: 'workout',
  workoutId: 'ai-core-home-1234',
  title: 'אימון ליבה בבית',
  minutes: 22,
  exerciseCount: 6,
  location: 'home',
  domains: ['core'],
  difficulty: 2,
};

describe('workoutCardView', () => {
  it('chips: minutes · exercises · location; difficulty in words; one accessible sentence', () => {
    const v = workoutCardView(card);
    expect(v.chips.map((c) => c.label)).toEqual(['22 דק׳', '6 תרגילים', 'בבית']);
    expect(v.difficulty).toBe(2);
    expect(v.difficultyLabel).toBe('בינוני');
    expect(v.iconKey).toBe('core');
    expect(v.ariaLabel).toBe('פתח אימון, אימון ליבה בבית, 22 דק׳, 6 תרגילים, בבית, רמת קושי בינוני');
  });

  it('older cards: difficulty from the cached workout, none at all → no difficulty; mixed domains → full body icon', () => {
    const old: WorkoutCard = { type: 'workout', workoutId: 'ai-x-1234', title: 'אימון', minutes: 20, exerciseCount: 1, location: 'park' };
    expect(workoutCardView(old, 3).difficultyLabel).toBe('מאתגר');
    expect(workoutCardView(old).difficulty).toBeNull();
    expect(workoutCardView(old).chips[1].label).toBe('תרגיל אחד');
    expect(workoutCardView({ ...old, domains: ['push', 'pull'] }).iconKey).toBe('full_body');
  });
});

describe('ready state', () => {
  const render = (thumb: string) => renderToStaticMarkup(h(AiCoachWorkoutCardFace, { card, thumbnailUrl: thumb, onOpen: () => {} }));

  it('the home card pieces: hero thumbnail, fade, heavy title, bolts, gradient CTA with play glyph', () => {
    const out = render('https://vz-example.b-cdn.net/abc/thumbnail.jpg');
    expect(out).toContain('data-ai-card="ready"');
    expect(out).toContain('src="https://vz-example.b-cdn.net/abc/thumbnail.jpg"');
    expect(out).toContain('rgba(255,255,255,0)'); // the white fade into the content
    expect(out).toContain('font-black');
    expect(out).toContain('אימון ליבה בבית');
    expect(out.match(/Bolt\.svg/g)?.length).toBe(3);
    expect(out).toContain('bg-brand-cta');
    expect(out).toContain('lucide-play');
    expect(out).toContain('פתח אימון');
    expect(out).toContain(`height:${AI_CARD_HEIGHT}px`);
    expect(out).toContain('border-radius:22px');
    expect(out).toContain('rgba(9,30,50,0.45)'); // v2 card shadow
  });

  it('chips and the accessible name', () => {
    const out = render('');
    for (const label of ['22 דק׳', '6 תרגילים', 'בבית', 'בינוני']) expect(out).toContain(label);
    expect(out).toContain('aria-label="פתח אימון, אימון ליבה בבית');
    expect(out).toContain('type="button"');
    expect(out).toContain('dir="rtl"');
  });

  it('no thumbnail → the brand gradient, never a stock photo', () => {
    const out = render('');
    expect(out).toContain('linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)');
    expect(out).not.toMatch(/<img[^>]+thumbnail/);
  });

  it('the default export renders without the device cache (older card)', () => {
    const out = renderToStaticMarkup(h(AiCoachWorkoutCard, { card, onOpen: () => {} }));
    expect(out).toContain('data-ai-card="ready"');
    expect(out).toContain('#00BAF7');
  });
});

describe('building + failed states', () => {
  it('building: a pulsing skeleton of the same card, Kelly in the masculine ("בונה לך אימון")', () => {
    const out = renderToStaticMarkup(h(AiCoachWorkoutCardSkeleton));
    expect(out).toContain('data-ai-card="building"');
    expect(out).toContain('role="status"');
    expect(out).toContain('בונה לך אימון…');
    expect(out).toContain('motion-safe:animate-pulse');
    expect(out).toContain(`height:${AI_CARD_HEIGHT}px`);
  });

  it('failed: an alert with retry + the workout builder (impersonal copy)', () => {
    const out = renderToStaticMarkup(h(AiCoachWorkoutCardError, { onRetry: () => {}, onBuilder: () => {} }));
    expect(out).toContain('data-ai-card="failed"');
    expect(out).toContain('role="alert"');
    expect(out).toContain('לא הצלחתי לבנות את האימון');
    expect(out).toContain('לנסות שוב');
    expect(out).toContain('לבונה האימונים');
    expect(out).not.toMatch(/נסי|תנסי/);
  });

  it('failed without handlers: no buttons', () => {
    const out = renderToStaticMarkup(h(AiCoachWorkoutCardError, {}));
    expect(out).not.toContain('<button');
  });
});
