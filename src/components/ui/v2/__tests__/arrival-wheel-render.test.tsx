import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ArrivalPublishPanel from '@/features/parks/client/components/park-detail/sections/ArrivalPublishPanel';
import he from '@/messages/he/map.json';

const base = {
  v2: true, hasSessions: false, dayFilter: 'today' as const, showTimePicker: false,
  onToggleTimePicker: () => {}, pickedDate: '2026-10-22', onPickDate: () => {},
  timeRangeMinutes: [1020, 1140] as [number, number], onTimeRangeChange: () => {},
  publishing: false, onPublish: () => {},
};

describe('ArrivalPublishPanel × wheel flag', () => {
  it('flag off — today\'s panel, byte-identical with and without the new props', () => {
    const before = renderToStaticMarkup(<ArrivalPublishPanel {...base} />);
    expect(before).toContain('אני מגיע…');
    expect(renderToStaticMarkup(<ArrivalPublishPanel {...base} wheel={false} onPublishAt={() => {}} />)).toBe(before);
  });
  it('flag off + open — still the slider', () => {
    expect(renderToStaticMarkup(<ArrivalPublishPanel {...base} showTimePicker />)).toContain('חלון הגעה');
  });
  it('flag on + open — no inline slider (the wheel lives in a portalled sheet)', () => {
    const html = renderToStaticMarkup(<ArrivalPublishPanel {...base} wheel showTimePicker onPublishAt={() => {}} />);
    expect(html).not.toContain('חלון הגעה');
  });
  it('catalog: gendered CTA with a neutral `other`, title and noun CTA', () => {
    const c = he as Record<string, string>;
    expect(c['arrivalWheel.cta']).toContain('male {אני מגיע…}');
    expect(c['arrivalWheel.cta']).toContain('female {אני מגיעה…}');
    expect(c['arrivalWheel.cta']).toContain('other {מגיעים…}');
    expect(c['arrivalWheel.title']).toBe('מתי מגיעים?');
    expect(c['arrivalWheel.publish']).toBe('פרסום');
  });
});
