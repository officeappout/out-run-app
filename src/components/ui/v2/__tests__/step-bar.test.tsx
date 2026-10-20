import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepBar, buildStepBarSegments, ENTRY_STEP_LABELS } from '../index';

describe('buildStepBarSegments', () => {
  it('step 1: current + two future, entry labels verbatim', () => {
    const s = buildStepBarSegments({ current: 1 });
    expect(s.map((x) => x.state)).toEqual(['current', 'future', 'future']);
    expect(s.map((x) => x.label)).toEqual(['1. האזור שלך', '2. מה בא לך', '3. מתאימים לך']);
    expect(s.map((x) => x.step)).toEqual([1, 2, 3]);
  });
  it('step 2 / 3: earlier steps are done', () => {
    expect(buildStepBarSegments({ current: 2 }).map((x) => x.state)).toEqual(['done', 'current', 'future']);
    expect(buildStepBarSegments({ current: 3 }).map((x) => x.state)).toEqual(['done', 'done', 'current']);
  });
  it('clamps out-of-range / non-finite current', () => {
    expect(buildStepBarSegments({ current: 0 })[0].state).toBe('current');
    expect(buildStepBarSegments({ current: 9 })[2].state).toBe('current');
    expect(buildStepBarSegments({ current: Number.NaN })[0].state).toBe('current');
  });
  it('suffix goes on the last label only', () => {
    const s = buildStepBarSegments({ current: 3, lastLabelSuffix: ' · רשות' });
    expect(s[2].label).toBe('3. מתאימים לך · רשות');
    expect(s[0].label).toBe(ENTRY_STEP_LABELS[0]);
  });
  it('custom labels and empty labels', () => {
    expect(buildStepBarSegments({ current: 2, labels: ['א', 'ב'] }).map((x) => x.state)).toEqual(['done', 'current']);
    expect(buildStepBarSegments({ current: 1, labels: [] })).toEqual([]);
  });
});

describe('StepBar render', () => {
  it('marks current / done / future and the ✓ on done steps', () => {
    const out = renderToStaticMarkup(<StepBar current={2} />);
    expect(out).toContain('data-step-state="done"');
    expect(out).toContain('data-step-state="current"');
    expect(out).toContain('data-step-state="future"');
    expect(out).toContain('aria-current="step"');
    expect(out).toContain('✓');
    expect(out).toContain('bg-v2-cta');
    expect(out).toContain('2. מה בא לך');
  });
  it('no ✓ on step 1', () => {
    expect(renderToStaticMarkup(<StepBar current={1} />)).not.toContain('✓');
  });
});
