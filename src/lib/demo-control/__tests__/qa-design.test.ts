import { describe, expect, it } from 'vitest';
import type { DesignSummary } from '../../../../scripts/qa/lib/overseer/design-report';
import { parseSummary } from '../../../../functions/src/lib/qa-runner-ops';
import { parseQaDesign, parseQaSummary } from '../qa-summary';
import { DESIGN_FILTER, decodeDesignScores, isDesignQaFinding, scoreTone, toClientDesign, worstDesignScreens } from '../qa-design';
import { mapQaFinding } from '../feedback-model';
import { matchesFilters, parseFeedbackFilters, sourcesFor } from '../feedback-query';
import { buildDemoStatus } from '../status';

const SHOT = 'qa/qa-1/D01_home/003-a1b2c3d4.png';
const row = (screen: string, score: number | null, extra: Partial<DesignSummary['screens'][number]> = {}): DesignSummary['screens'][number] => ({
  screen,
  label: null,
  route: '/home',
  score,
  clarity: score,
  consistency: score,
  density: score,
  rtl: score,
  devices: ['iphone-se'],
  findings: 1,
  worst: 'P2',
  topRule: 'V2-CTA-1',
  screenshot: null,
  ...extra,
});
const design: DesignSummary = {
  screensScored: 3,
  avgScore: 3.4,
  lowScreens: 1,
  findings: 4,
  screens: [row('home_strength', 2.3, { label: 'בית — כוח', screenshot: SHOT, clarity: 2, consistency: 2.5, density: 3, rtl: 1.7 }), row('summary_run', 3.9), row('/parks/[id]', null)],
  resume: ['D02_summary@summary_tabs'],
};

describe('design block: overseer → qaRunnerReport sanitiser → panel parser', () => {
  it('round-trips the overseer shape', () => {
    const put = parseSummary({ summary: { runId: 'qa-1', design } });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    const parsed = parseQaSummary({ ...put.value, generatedAt: 5 });
    expect(parsed.design).toEqual(design);
    expect(parsed.generatedAtMs).toBe(5);
  });

  it('the function bounds, validates and drops what it does not know', () => {
    const many = Array.from({ length: 40 }, (_, i) => row(`s${i}`, 3));
    const r = parseSummary({
      summary: {
        runId: 'qa-1',
        design: {
          screensScored: -1,
          avgScore: 9,
          lowScreens: 2.7,
          findings: 'x',
          extra: 'evil',
          screens: [
            { ...row('a'.repeat(300), 0), clarity: 6, consistency: 'x', density: 4.44, rtl: 1, worst: 'P9', topRule: 'lower-case', screenshot: 'https://evil/x.png', label: 'l'.repeat(300), devices: Array(30).fill('d'.repeat(99)), evil: 1 },
            { screen: '' },
            null,
            ...many,
          ],
          resume: ['D01', 'D01', 'D02@cp_1', '../x', 'D03@Bad Space', 7],
        },
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.value.design as Record<string, unknown> & { screens: Array<Record<string, unknown>> };
    expect(d).not.toHaveProperty('extra');
    expect(d).toMatchObject({ screensScored: 0, avgScore: null, lowScreens: 2, findings: 0, resume: ['D01', 'D02@cp_1'] });
    expect(d.screens).toHaveLength(15 - 2); // first 15 entries, the empty-name and null ones dropped
    const s0 = d.screens[0];
    expect(s0).not.toHaveProperty('evil');
    expect(s0).toMatchObject({ score: null, clarity: null, consistency: null, density: 4.4, rtl: 1, worst: null, topRule: null, screenshot: null });
    expect((s0.screen as string).length).toBe(120);
    expect((s0.label as string).length).toBe(80);
    expect(s0.devices).toHaveLength(10);
    expect((s0.devices as string[])[0]).toHaveLength(40);
  });

  it('no design block → null (old runs, non-design runs)', () => {
    const r = parseSummary({ summary: { runId: 'qa-1', design: [1] } });
    expect(r.ok && r.value.design).toBe(null);
    expect(parseQaSummary({ runId: 'qa-1' }).design).toBe(null);
    expect(parseQaDesign('x')).toBe(null);
  });

  it('the panel parser is lenient', () => {
    const d = parseQaDesign({ screens: [null, { screen: 3 }, { screen: 'x', score: 7, screenshot: 'users/u.png', worst: 'P1' }] });
    expect(d?.screens).toEqual([expect.objectContaining({ screen: 'x', score: null, screenshot: null, worst: 'P1', route: '/' })]);
  });
});

describe('panel helpers', () => {
  it('the client copy hides Storage paths', () => {
    const c = toClientDesign(parseQaDesign(design));
    expect(c?.screens[0]).toMatchObject({ screen: 'home_strength', hasScreenshot: true });
    expect(c?.screens[0]).not.toHaveProperty('screenshot');
    expect(JSON.stringify(c)).not.toContain('qa/');
    expect(toClientDesign(null)).toBe(null);
  });

  it('worst screens: scored only, lowest first, at most 5', () => {
    const screens = [row('b', 3), row('a', 3, { findings: 4 }), row('c', null), row('d', 1.5), row('e', 4), row('f', 4.5), row('g', 5)];
    expect(worstDesignScreens(screens).map((s) => s.screen)).toEqual(['d', 'a', 'b', 'e', 'f']);
  });

  it('score tones', () => {
    expect([null, 1, 2.4, 2.5, 3, 3.1, 5].map(scoreTone)).toEqual(['neutral', 'bad', 'bad', 'warn', 'warn', 'good', 'good']);
  });

  it('status payload carries only the design view of the summary', () => {
    const base = { nowMs: 0, todayKey: '2026-10-21', flagsRaw: {}, configRaw: {}, controlRaw: {}, usageDocs: [], demoUserActiveDays: [], demoUsersCapped: false, dispatchConfigured: false };
    const s = buildDemoStatus({ ...base, qaSummaryRaw: { runId: 'qa-1', generatedAt: 9, clusters: [{ key: 'k', title: 't' }], design } });
    expect(s.qa.runId).toBe('qa-1');
    expect(s.qa.generatedAtMs).toBe(9);
    expect(s.qa.design?.screens).toHaveLength(3);
    expect(s.qa).not.toHaveProperty('clusters');
    expect(buildDemoStatus(base).qa).toEqual({ runId: null, generatedAtMs: null, design: null });
  });
});

describe('"עיצוב" filter in משוב דמו', () => {
  const finding = (category: string, rule: string | null, actual = '') => mapQaFinding('r1__a', { category, rule, actual, severity: 'P2' });

  it('design = design categories, design rule ids and score records; not behaviour rules', () => {
    expect(isDesignQaFinding({ category: 'design-rule', rule: null })).toBe(true);
    expect(isDesignQaFinding({ category: 'ux', rule: 'RTL-ALIGN' })).toBe(true);
    expect(isDesignQaFinding({ category: 'ux', rule: 'V2-CTA-1' })).toBe(true);
    expect(isDesignQaFinding({ category: 'design-rule', rule: 'DESIGN-SCORE' })).toBe(true);
    expect(isDesignQaFinding({ category: 'broken', rule: 'STAB-CONSOLE' })).toBe(false);
    expect(isDesignQaFinding({ category: 'design-rule', rule: 'STAB-CONSOLE' })).toBe(false);
    expect(isDesignQaFinding({ category: 'broken', rule: 'HEALTH-ONCE' })).toBe(false);
    expect(isDesignQaFinding({ category: 'perf', rule: null })).toBe(false);
  });

  it('the type filter accepts "design" and scans testers only', () => {
    const f = parseFeedbackFilters(new URLSearchParams({ type: DESIGN_FILTER, status: 'all' }));
    expect(f.type).toBe('design');
    expect(sourcesFor(f)).toEqual(['testers']);
    expect(matchesFilters(finding('ux', 'LAY-OVERLAP'), f)).toBe(true);
    expect(matchesFilters(finding('broken', null), f)).toBe(false);
    expect(parseFeedbackFilters(new URLSearchParams({ type: 'designs' })).type).toBe(null);
  });

  it('score records get their four numbers', () => {
    const item = finding('design-rule', 'DESIGN-SCORE', '[scores clarity=2 consistency=4 density=3 rtl=5] crowded');
    expect(item.designScores).toEqual({ clarity: 2, consistency: 4, density: 3, rtl: 5 });
    expect(finding('design-rule', 'V2-CARD', '[scores clarity=2 consistency=4 density=3 rtl=5]').designScores).toBe(null);
    expect(decodeDesignScores('DESIGN-SCORE', 'no scores')).toBe(null);
  });
});
