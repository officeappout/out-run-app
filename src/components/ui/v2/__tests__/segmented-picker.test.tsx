import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedPicker, JourneyStrip } from '../index';

describe('SegmentedPicker', () => {
  it('one pressed option, brand tint (never black), nowrap labels', () => {
    const html = renderToStaticMarkup(
      <SegmentedPicker ariaLabel="בחירה" value="b" onChange={() => {}}
        options={[{ key: 'a', label: 'הליכה · 50׳' }, { key: 'b', label: 'ריצה · 25׳' }]} />,
    );
    expect(html.split('aria-pressed="true"').length - 1).toBe(1);
    expect(html).toContain('bg-v2-tint');
    expect(html).not.toMatch(/bg-black|bg-v2-ink /);
    expect(html.split('whitespace-nowrap').length - 1).toBe(2);
  });
});

describe('JourneyStrip inset variant', () => {
  const items = [{ key: 'a', kind: 'aerobic' as const, subtype: 'running', seconds: 1500 }];
  it('v2 inset = a tinted well; default and pre-v2 unchanged', () => {
    expect(renderToStaticMarkup(<JourneyStrip v2 variant="inset" items={items} />)).toContain('bg-v2-surface ring-1 ring-inset ring-v2-hairline');
    expect(renderToStaticMarkup(<JourneyStrip v2 items={items} />)).toBe(renderToStaticMarkup(<JourneyStrip v2 variant="card" items={items} />));
    expect(renderToStaticMarkup(<JourneyStrip variant="inset" items={items} />)).toBe(renderToStaticMarkup(<JourneyStrip items={items} />));
  });
});
