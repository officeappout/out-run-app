import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatTooFarLabels, WALK_TIME_DISPLAY_MAX_KM } from '../start-experience-state';
import RouteCardUnified from '../../components/RouteCardUnified';

/**
 * Sderot pilot G1.4 — walk TIME is shown only when the route is ≤ 2 km away; farther → distance only.
 * Display-only: the start gate (computeStartExperienceState) is untouched.
 */
describe('formatTooFarLabels (G1.4)', () => {
  it('threshold is 2 km', () => {
    expect(WALK_TIME_DISPLAY_MAX_KM).toBe(2);
  });

  it("≤ 2 km → walk-time wording (today's text, unchanged)", () => {
    expect(formatTooFarLabels(1.6, 20)).toEqual({
      cta: "עוד כ-20 דק' הליכה",
      toast: "התקרבו למסלול — נותרו עוד כ-20 דק' הליכה",
    });
    expect(formatTooFarLabels(2, 25).cta).toBe("עוד כ-25 דק' הליכה");
  });

  it('> 2 km → distance only, no minutes', () => {
    const l = formatTooFarLabels(11.04, 138);
    expect(l.cta).toBe('המסלול במרחק 11.0 ק״מ');
    expect(l.toast).toBe('התקרבו למסלול — הוא במרחק כ-11.0 ק״מ ממך');
    expect(l.cta).not.toContain('דק');
    expect(l.toast).not.toContain('דק');
  });

  it('unknown distance (null / 0 / NaN) keeps the walk-time wording — never invents a distance', () => {
    for (const d of [null, undefined, 0, Number.NaN]) {
      expect(formatTooFarLabels(d, 30).cta).toBe("עוד כ-30 דק' הליכה");
    }
  });
});

describe('RouteCardUnified compact spacing (G1.4) — scoped to slim + stats', () => {
  const base = { name: 'מסלול', difficulty: 'easy' as const, ctaContent: 'go', onCta: () => {} };

  it('slim + stats (curated discover card) uses the tighter padding', () => {
    const html = renderToStaticMarkup(
      createElement(RouteCardUnified, { ...base, variant: 'slim', distanceText: '1.0 ק״מ', durationText: '12 דק׳' }),
    );
    expect(html).toContain('px-4 pt-2.5 pb-2.5');
    expect(html).toContain('mt-1 mb-1.5');
  });

  it('slim without stats (hybrid slot card) keeps its spacing', () => {
    const html = renderToStaticMarkup(createElement(RouteCardUnified, { ...base, variant: 'slim', subtitle: 'x' }));
    expect(html).toContain('px-4 py-3');
    expect(html).not.toContain('pt-2.5 pb-2.5');
  });

  it('default variant keeps p-5', () => {
    const html = renderToStaticMarkup(
      createElement(RouteCardUnified, { ...base, distanceText: '1.0 ק״מ', durationText: '12 דק׳' }),
    );
    expect(html).toContain(' p-5 ');
    expect(html).toContain('mt-1.5 mb-3');
  });
});
