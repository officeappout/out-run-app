/**
 * Namespace `summary` (i18n wave 2, batch af — the legacy SummaryOrchestrator
 * fallback blocks and the segment-rail labels): every Hebrew key returns exactly
 * what the code rendered before the extraction. The `old` side is the original
 * literal / template, copied verbatim. Static-markup snapshots
 * (summary-fallbacks-i18n-parity.test.tsx) cover the keys in context; this test
 * also pins what a static render can't reach (the in-map loading overlay, a
 * count ≥ 1000).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/summary.json';
import { summary } from '@/messages/ns/summary';
import { segmentLabelKey } from '@/features/workout-engine/summary/blocks/segment-rail.util';
import { makeT } from '../t';

const t = makeT('he', summary);

describe('summary — fallback blocks', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['fallback.header.title', 'האימון הושלם!'],
      ['fallback.stats.distance.label', 'מרחק'],
      ['fallback.stats.time.label', 'זמן'],
      ['fallback.stats.pace.label', 'קצב ממוצע'],
      ['fallback.stats.calories.label', 'קלוריות'],
      ['fallback.stats.elevation.label', 'עלייה'],
      ['fallback.laps.title', 'הקפות'],
      ['fallback.laps.lap', 'הקפה'],
      ['fallback.laps.km', 'ק"מ'],
      ['fallback.laps.pace', 'קצב'],
      ['fallback.laps.time', 'זמן'],
      ['fallback.map.loading', 'טוען מפה...'],
      ['fallback.map.noRoute', 'אין נתוני מסלול'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values equal the old templates (ASCII quote / apostrophe kept)', () => {
    for (const km of [0, 5.123, 21.1, 1234.5]) {
      expect(t('fallback.stats.distance.value', { km: km.toFixed(2) })).toBe(`${km.toFixed(2)} ק"מ`);
    }
    for (const m of [1, 42.6, 1234]) {
      expect(t('fallback.stats.elevation.value', { m: String(Math.round(m)) })).toBe(`${Math.round(m)} מ'`);
    }
  });

  it('segment labels equal the old segmentLabel branches', () => {
    expect(t(segmentLabelKey('strength'))).toBe('כוח');
    expect(t(segmentLabelKey('stairs'))).toBe('מדרגות');
    expect(t(segmentLabelKey('aerobic', 'cycling'))).toBe('רכיבה');
    expect(t(segmentLabelKey('aerobic', 'walking'))).toBe('הליכה');
    expect(t(segmentLabelKey('aerobic', 'running'))).toBe('ריצה');
    expect(t(segmentLabelKey('aerobic'))).toBe('ריצה');
  });
});
