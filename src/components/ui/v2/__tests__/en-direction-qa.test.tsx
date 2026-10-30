/**
 * English direction QA (owner device test, 30.10): screens built on the shared primitives behaved RTL in English.
 *
 * Root causes pinned here:
 *   1. <Sheet> (every bottom sheet / drawer: park sheet, workout overview, plus drawer, chat list, training-at) defaulted to
 *      dir="rtl", so English text inside it was right-aligned, bidi-reordered ("?What would you like to do", "min 30") and
 *      truncated on the wrong side. It now defaults to the UI direction; an explicit `dir` still wins.
 *   2. HScroller / LineChart / BarChart / StoryBars had the same literal default.
 *   3. Hard-coded `text-right` and a bare `ChevronLeft` as "forward" in the Settings rows, plus drawer, chat list, Kelly card.
 * Hebrew stays byte-identical (the rtl branch of every assertion; the parity snapshots cover the markup).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Sheet from '../Sheet';
import HScroller from '../HScroller';
import BarChart from '../BarChart';
import LineChart from '../LineChart';
import { useLocaleStore } from '@/store/useLocaleStore';

// zustand's server snapshot is the initial state, so the locale must be read through a real client render.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const renderToStaticMarkup = (el: React.ReactElement): string => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  const out = host.innerHTML;
  act(() => root.unmount());
  host.remove();
  return out;
};
const setLocale = (locale: 'he' | 'en') => act(() => useLocaleStore.setState({ locale }));
afterEach(() => setLocale('he'));

const sheet = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <Sheet open onClose={() => {}} portal={false} title="What would you like to do?" {...props}>
      <p>body</p>
    </Sheet>,
  );

describe('Sheet frame direction', () => {
  it('follows the UI direction: rtl in Hebrew, ltr in English', () => {
    setLocale('he');
    expect(sheet()).toMatch(/role="dialog"[^>]*dir="rtl"/);
    setLocale('en');
    const en = sheet();
    expect(en).toMatch(/role="dialog"[^>]*dir="ltr"/);
    expect(en).not.toContain('dir="rtl"');
  });

  it('an explicit dir wins over the UI direction', () => {
    setLocale('en');
    expect(sheet({ dir: 'rtl' })).toMatch(/role="dialog"[^>]*dir="rtl"/);
    setLocale('he');
    expect(sheet({ dir: 'ltr' })).toMatch(/role="dialog"[^>]*dir="ltr"/);
  });
});

describe('v2 primitives default to the UI direction', () => {
  it('HScroller', () => {
    setLocale('he');
    expect(renderToStaticMarkup(<HScroller><i /></HScroller>)).toContain('dir="rtl"');
    setLocale('en');
    expect(renderToStaticMarkup(<HScroller><i /></HScroller>)).toContain('dir="ltr"');
  });

  it('BarChart', () => {
    const data = [{ key: 'a', label: 'A', value: 1 }];
    setLocale('he');
    expect(renderToStaticMarkup(<BarChart data={data} />)).toContain('dir="rtl"');
    setLocale('en');
    expect(renderToStaticMarkup(<BarChart data={data} />)).toContain('dir="ltr"');
  });

  it('LineChart anchors the goal label at the reading start', () => {
    const data = [{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 2 }];
    setLocale('he');
    expect(renderToStaticMarkup(<LineChart data={data} goal={2} goalLabel="goal" />)).toContain('text-anchor="end"');
    setLocale('en');
    expect(renderToStaticMarkup(<LineChart data={data} goal={2} goalLabel="goal" />)).toContain('text-anchor="start"');
  });
});

/** Source guards for the screens the owner listed: they must not bring back a physical alignment or an unflipped chevron. */
const SRC = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const SCREENS: Record<string, string> = {
  'Settings rows': 'features/home/components/SettingsModal.tsx',
  'plus drawer': 'features/parks/client/components/planned-activity/UnifiedPlusDrawer.tsx',
  'chat list': 'features/social/components/ChatInbox.tsx',
  'Kelly card': 'features/ai-coach/components/AiCoachEntry.tsx',
  'training-at sheet': 'features/parks/client/components/training-here/TrainingHereSheet.tsx',
  'park sheet': 'features/parks/client/components/park-detail/ParkDetailSheet.tsx',
};

describe.each(Object.entries(SCREENS))('%s source', (_name, rel) => {
  const src = read(rel);
  it('has no hard-coded rtl direction or physical text alignment', () => {
    expect(src).not.toMatch(/\bdir="rtl"/);
    expect(src).not.toMatch(/direction:\s*'rtl'/);
    // text-right inside a dir="ltr" numeric field is deliberate (digits stay right-aligned in both languages).
    const bad = Array.from(src.matchAll(/(^|[\s"'`])text-right(?=[\s"'`])/g)).filter((m) => !src.slice(m.index!, m.index! + 300).includes('dir="ltr"'));
    expect(bad.map((m) => src.slice(m.index!, m.index! + 80))).toEqual([]);
  });
  it('every ChevronLeft / ArrowRight used as "forward" mirrors in English', () => {
    for (const m of src.matchAll(/<(ChevronLeft|ArrowRight)\b[^>]*>/g)) {
      expect(m[0], `${rel}: ${m[0]}`).toMatch(/ltr:-scale-x-100|isRtl|direction/);
    }
  });
});
