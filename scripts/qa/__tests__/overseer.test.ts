import { describe, it, expect } from 'vitest';
import { clusterFindings, clusterKey, countBySeverity } from '../lib/overseer/cluster';
import { buildReport, buildSummaryDoc } from '../lib/overseer/report';
import { parseQaSummary } from '@/lib/demo-control/qa-summary';
import type { Finding } from '../lib/findings';

const f = (p: Partial<Finding> = {}): Finding => ({
  id: 'x', fingerprint: Math.random().toString(36), runId: 'qa-1', mission: 'M01_walker58', persona: 'rachel_58', device: 'iphone-13', cohort: 'v2', url: '/home', route: '/home', step: 3,
  category: 'design-rule', severity: 'P2', rule: 'V2-FONT-11', title: 'טקסט קטן', expected: 'לפחות 11px', actual: '10px: שלום', screenshot: 'qa/qa-1/M01_walker58/003.png',
  repro: [{ name: 'tap', ref: 'e3' }], confidence: 1, source: 'lint', count: 1, createdAtMs: 0, ...p,
});

describe('clusterFindings', () => {
  it('groups by rule × route and ranks severity × reach first', () => {
    const fs = [
      f(),
      f({ persona: 'dana_41', mission: 'M03_home_beginner', device: 'iphone-se' }),
      f({ route: '/run/:id', rule: null, category: 'broken', severity: 'P0', title: 'הכפתור סיום לא עובד', source: 'llm', confidence: 0.9 }),
      f({ route: '/map', rule: 'STAB-CONSOLE', category: 'broken', severity: 'P1', title: 'שגיאת הרשאה', actual: 'Missing or insufficient permissions' }),
    ];
    const c = clusterFindings(fs);
    expect(c).toHaveLength(3);
    expect(c[0]).toMatchObject({ severity: 'P0', route: '/run/:id', infra: false });
    expect(c[1]).toMatchObject({ rule: 'V2-FONT-11', count: 2, personas: ['dana_41', 'rachel_58'], devices: ['iphone-13', 'iphone-se'] });
    expect(c[2].infra).toBe(true); // infrastructure noise goes last
  });
  it('marks clusters seen in the previous summary as known', () => {
    const one = f();
    expect(clusterFindings([one], new Set([clusterKey(one)]))[0].isNew).toBe(false);
    expect(clusterFindings([one])[0].isNew).toBe(true);
  });
  it('counts severities', () => {
    expect(countBySeverity([f(), f({ severity: 'P0' })])).toEqual({ P0: 1, P1: 0, P2: 1, P3: 0 });
  });
});

describe('report + summary', () => {
  const fs = [f(), f({ route: '/run/:id', rule: null, category: 'broken', severity: 'P1', title: 'לא ברור איך לעצור', source: 'llm' })];
  const clusters = clusterFindings(fs);
  const sessions = [{ mission: 'M01_walker58', device: 'iphone-13', outcome: 'gave_up', steps: 31, summary: 'התבלבלתי במסך ההליכה' }];

  it('writes a Hebrew report with top items, sessions and task proposals', () => {
    const md = buildReport('qa-1', fs, clusters, sessions);
    expect(md).toMatch(/^# דוח בודקי AI — qa-1/);
    expect(md).toMatch(/3 הדברים הכי חשובים היום/);
    expect(md).toMatch(/ויתר/);
    expect(md).toMatch(/הצעות משימה/);
    expect(md).toMatch(/tap\(e3\)/);
  });
  it('the summary doc round-trips through the panel parser', () => {
    const doc = buildSummaryDoc('qa-1', fs, clusters, sessions);
    const parsed = parseQaSummary({ ...doc, generatedAt: 123 });
    expect(parsed).toMatchObject({ runId: 'qa-1', findings: 2, bySeverity: { P1: 1, P2: 1 }, generatedAtMs: 123, sessions: [{ mission: 'M01_walker58', outcome: 'gave_up' }] });
    expect(parsed.clusters[0]).toMatchObject({ severity: 'P1', isNew: true });
    expect(parsed.clusterKeys).toHaveLength(2);
  });
  it('the parser survives junk', () => {
    expect(parseQaSummary(null)).toMatchObject({ runId: null, findings: 0, clusters: [] });
    expect(parseQaSummary({ clusters: [null, { key: 1 }, { key: 'k', title: 't', severity: 'P9' }] }).clusters).toEqual([
      expect.objectContaining({ key: 'k', severity: 'P3' }),
    ]);
  });
});
