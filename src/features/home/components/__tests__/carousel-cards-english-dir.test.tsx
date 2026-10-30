/**
 * Cards rendered inside LTR carousel tracks must not use `ltr:` variants or physical edges:
 * `ltr:` matches the track ancestor in Hebrew too. Direction-dependent bits are picked in JS from useUiDir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import ProgramStartCard from '../start-cards/ProgramStartCard';
import NotAloneCard from '@/features/schedule/walking/components/NotAloneCard';
import { EquipmentBadgeRow } from '@/features/home/components/HeroWorkoutCard';
import { useLocaleStore } from '@/store/useLocaleStore';

const setLocale = (l: 'he' | 'en') => { Object.assign(useLocaleStore.getInitialState(), { locale: l }); };
const chevron = (html: string) => (html.match(/<svg[^>]*lucide-chevron-left[^>]*>/) ?? [''])[0];

describe('carousel card chevrons and edges', () => {
  beforeEach(() => setLocale('he'));

  it('ProgramStartCard: Hebrew chevron unmirrored, English mirrored, no ltr: variant', () => {
    const render = () => renderToStaticMarkup(h(ProgramStartCard, { track: 'running', title: 'T', valueLine: 'V', chipLabel: 'C', onTap: () => {} }));
    const he = render();
    expect(chevron(he)).toContain('ltr:-scale-x-100'); // Hebrew markup kept byte-identical
    expect(he).toContain('dir="rtl"');
    setLocale('en');
    const en = render();
    expect(chevron(en)).toContain('-scale-x-100');
    expect(chevron(en)).not.toContain('ltr:-scale');
    expect(en).toContain('dir="ltr"');
  });

  it('NotAloneCard: same rule', () => {
    const s = { groupId: 'g', name: 'N' } as never;
    const render = () => renderToStaticMarkup(h(NotAloneCard, { suggestion: s, onOpenGroup: () => {} }));
    expect(chevron(render())).toContain('ltr:-scale-x-100'); // Hebrew markup kept byte-identical
    setLocale('en');
    expect(chevron(render())).toContain('-scale-x-100');
    expect(render()).not.toContain('ltr:-scale');
  });

  it('EquipmentBadgeRow: right edge in Hebrew (unchanged), left edge in English', () => {
    const render = () => renderToStaticMarkup(h(EquipmentBadgeRow, { icons: [], showBodyweightFallback: true }));
    expect(render()).toContain('absolute right-4 flex');
    setLocale('en');
    const en = render();
    expect(en).toContain('absolute left-4 flex');
    expect(en).not.toContain('right-4');
  });
});
