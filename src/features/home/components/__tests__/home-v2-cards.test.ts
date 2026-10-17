/**
 * Home v2 (enable_home_v2) — the workout card and the location chip restyle
 * only when HomeV2Context is on; off = byte-identical to today's markup.
 */
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HeroWorkoutCard from '../HeroWorkoutCard';
import AnchorLocationChip from '../AnchorLocationChip';
import { HomeV2Context } from '@/features/home/context/HomeV2Context';

const workout = { id: 'w1', title: 'אימון בפארק', duration: 30, difficulty: 'medium' } as never;

const render = (el: React.ReactElement, v2: boolean) => renderToStaticMarkup(h(HomeV2Context.Provider, { value: v2 }, el));
const card = () => h(HeroWorkoutCard, { workout, onStart: () => {} });
const chip = () => h(AnchorLocationChip, { value: 'park', onSelect: () => {} });

describe('HeroWorkoutCard under home v2', () => {
  it('v2: 24px radius, navy shadow, no hard border, a play glyph in the CTA', () => {
    const out = render(card(), true);
    expect(out).toContain('border-radius:24px');
    expect(out).toContain('rgba(9,30,50,0.45)');
    expect(out).not.toContain('1.17px solid');
    expect(out).toContain('lucide-play');
  });
  it('off: today’s card', () => {
    const out = render(card(), false);
    expect(out).toContain('1.17px solid');
    expect(out).not.toContain('lucide-play');
  });
});

describe('AnchorLocationChip under home v2', () => {
  it('v2: a pill with a hairline ring', () => {
    const out = render(chip(), true);
    expect(out).toContain('border-radius:999px');
    expect(out).toContain('whitespace-nowrap');
  });
  it('off: today’s chip', () => {
    const out = render(chip(), false);
    expect(out).toContain('border-radius:10px');
  });
});
