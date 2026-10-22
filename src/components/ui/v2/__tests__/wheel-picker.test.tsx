import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WheelPicker } from '../index';
import { clampIndex, nextWheelIndex, wheelIndexFromScroll, wheelPadding, wheelScrollTop, wheelValueIndex } from '../wheel-picker';

describe('wheel-picker logic', () => {
  it('scrollTop ↔ index round-trips and clamps', () => {
    expect(wheelIndexFromScroll(0, 40, 10)).toBe(0);
    expect(wheelIndexFromScroll(81, 40, 10)).toBe(2);
    expect(wheelIndexFromScroll(99, 40, 10)).toBe(2);
    expect(wheelIndexFromScroll(101, 40, 10)).toBe(3);
    expect(wheelIndexFromScroll(9999, 40, 10)).toBe(9);
    expect(wheelScrollTop(3, 40)).toBe(120);
    expect(wheelPadding(40, 5)).toBe(80);
    expect(clampIndex(-3, 4)).toBe(0);
    expect(clampIndex(2, 0)).toBe(0);
  });
  it('keyboard: arrows step, page jumps, home/end, other keys ignored', () => {
    expect(nextWheelIndex('ArrowDown', 0, 4)).toBe(1);
    expect(nextWheelIndex('ArrowUp', 0, 4)).toBe(0);
    expect(nextWheelIndex('PageDown', 0, 24)).toBe(5);
    expect(nextWheelIndex('End', 0, 24)).toBe(23);
    expect(nextWheelIndex('Home', 7, 24)).toBe(0);
    expect(nextWheelIndex('a', 1, 4)).toBeNull();
  });
  it('missing value → row 0', () => {
    expect(wheelValueIndex([0, 15, 30], 30)).toBe(2);
    expect(wheelValueIndex([0, 15, 30], 45)).toBe(0);
  });
});

describe('WheelPicker render', () => {
  it('one listbox per column, one selected option each, centre band, scroll-snap', () => {
    const html = renderToStaticMarkup(
      <WheelPicker
        columns={[
          { key: 'h', ariaLabel: 'שעה', options: [17, 18, 19].map((v) => ({ value: v, label: String(v) })), value: 18, onChange: () => {} },
          { key: 'm', ariaLabel: 'דקות', options: [0, 15].map((v) => ({ value: v, label: String(v) })), value: 0, onChange: () => {} },
        ]}
      />,
    );
    expect(html.split('role="listbox"').length - 1).toBe(2);
    expect(html.split('aria-selected="true"').length - 1).toBe(2);
    expect(html).toContain('aria-label="שעה"');
    expect(html).toContain('snap-y snap-mandatory');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('bg-v2-surface');
  });
});
