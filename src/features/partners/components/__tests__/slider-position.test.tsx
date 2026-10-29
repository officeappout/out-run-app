import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sliderFillStyle, sliderPointStyle } from '@/lib/i18n/slider-position';
import { DualRangeSlider } from '@/features/partners/components/DualRangeSlider';

describe('slider positioning', () => {
  it('Hebrew keeps the exact legacy physical values (FreeRunDrawer + DualRangeSlider)', () => {
    expect(sliderPointStyle(true, 30)).toEqual({ right: '30%', transform: 'translateX(50%)' });
    // FreeRunDrawer fill: { right: 0, left: `${100 - pct}%` }
    expect(sliderFillStyle(true, 0, 40)).toEqual({ right: 0, left: '60%' });
    // DualRangeSlider fill: { right: `${minPct}%`, left: `${100 - maxPct}%` }
    expect(sliderFillStyle(true, 20, 70)).toEqual({ right: '20%', left: '30%' });
  });
  it('LTR mirrors them so the fill and label follow the thumb', () => {
    expect(sliderPointStyle(false, 30)).toEqual({ left: '30%', transform: 'translateX(-50%)' });
    expect(sliderFillStyle(false, 0, 40)).toEqual({ left: 0, right: '60%' });
    expect(sliderFillStyle(false, 20, 70)).toEqual({ left: '20%', right: '30%' });
  });
  it('DualRangeSlider renders the legacy Hebrew style values', () => {
    const html = renderToStaticMarkup(
      <DualRangeSlider min={0} max={100} step={1} values={[20, 70]} onChange={() => {}} ariaLabelMin="a" ariaLabelMax="b" />,
    );
    expect(html).toContain('right:20%;transform:translateX(50%)');
    expect(html).toContain('right:70%;transform:translateX(50%)');
    expect(html).toContain('right:20%;left:30%');
    expect(html).toContain('dir="rtl"');
  });
});
