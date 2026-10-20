import { describe, expect, it } from 'vitest';
import { buildTaskMarkdown, mapLifeFeedback, mapQaFinding, parseTriage, personaNames, reproLine } from '../feedback-model';

const T = Date.UTC(2026, 9, 20, 9, 0, 0);
const ts = (ms: number) => ({ toMillis: () => ms });

describe('mapLifeFeedback', () => {
  const names = personaNames({ personas: [{ uid: 'demo_dana', life: { name: 'דנה' } }, { uid: 'bad' }, null] });

  it('maps a park moment with the persona name and defaults to open', () => {
    const it1 = mapLifeFeedback('park_w1', { kind: 'park', uid: 'demo_dana', parkName: 'גן העיר', text: 'המתקן חורק', generatedBy: 'bank', createdAt: new Date(T), isDemo: true }, names);
    expect(it1).toMatchObject({
      id: 'park_w1',
      source: 'life',
      type: 'park',
      severity: null,
      personaName: 'דנה',
      title: 'משוב על פארק: גן העיר',
      text: 'המתקן חורק',
      createdAtMs: T,
      status: 'open',
      hasScreenshot: false,
    });
  });

  it('is lenient: unknown kind → app, unknown uid → shows the uid, missing date → 0', () => {
    const it2 = mapLifeFeedback('app_x', { kind: '???', uid: 'demo_x', text: 42 }, names);
    expect(it2).toMatchObject({ type: 'app', personaName: 'demo_x', text: '', createdAtMs: 0 });
    expect(mapLifeFeedback('n', null, names).type).toBe('app');
  });

  it('reads the triage mark', () => {
    expect(mapLifeFeedback('a', { kind: 'app', triage: { status: 'handled', at: ts(T) } }, names)).toMatchObject({ status: 'handled', statusAtMs: T });
  });
});

describe('mapQaFinding', () => {
  const raw = {
    runId: 'r1',
    persona: 'dana_41',
    device: 'iphone-13',
    mission: 'm2',
    route: '/home',
    category: 'broken',
    severity: 'P1',
    rule: 'DS-3',
    title: 'הכפתור לא מגיב',
    expected: 'נפתח מסך',
    actual: 'כלום',
    screenshot: 'qa/r1/m2/3-a.png',
    repro: [{ name: 'tap', target: 'התחל' }, { world: 'offline', seconds: 5 }, 'junk', {}],
    count: 3,
    createdAt: ts(T),
    createdAtMs: T - 5,
  };

  it('maps every field', () => {
    expect(mapQaFinding('r1__abc', raw)).toMatchObject({
      source: 'testers',
      type: 'broken',
      severity: 'P1',
      personaId: 'dana_41',
      title: 'הכפתור לא מגיב',
      text: 'כלום',
      expected: 'נפתח מסך',
      createdAtMs: T,
      route: '/home',
      count: 3,
      hasScreenshot: true,
      repro: ['tap (target: התחל)', 'world: offline, seconds: 5'],
      status: 'open',
    });
  });

  it('defaults bad enums and falls back to createdAtMs', () => {
    const it2 = mapQaFinding('x', { severity: 'P9', category: 'nope', createdAtMs: T, screenshot: 'gs://other/file.png', count: -2 });
    expect(it2).toMatchObject({ severity: 'P3', type: 'ux', createdAtMs: T, hasScreenshot: false, count: 1, title: '(ממצא בלי כותרת)' });
  });
});

describe('helpers', () => {
  it('parseTriage ignores unknown statuses', () => {
    expect(parseTriage({ status: 'deleted' }).status).toBe('open');
    expect(parseTriage(undefined)).toEqual({ status: 'open', atMs: null });
  });
  it('reproLine skips non-objects and nested values', () => {
    expect(reproLine(null)).toBeNull();
    expect(reproLine({ nested: { a: 1 } })).toBeNull();
    expect(reproLine({ name: 'scroll' })).toBe('scroll');
  });
});

describe('buildTaskMarkdown', () => {
  it('a finding: severity title, expected / actual, numbered repro, doc id', () => {
    const md = buildTaskMarkdown(
      mapQaFinding('r1__abc', { runId: 'r1', severity: 'P0', category: 'broken', title: 'קריסה', expected: 'א', actual: 'ב', repro: [{ name: 'tap' }, { name: 'back' }], screenshot: 'qa/r1/x.png' }),
    );
    expect(md).toContain('## [P0] קריסה');
    expect(md).toContain('**מה ציפינו:**\nא');
    expect(md).toContain('**מה קרה:**\nב');
    expect(md).toContain('1. tap\n2. back');
    expect(md).toContain('`qa_findings/r1__abc`');
    expect(md).toContain('צילום מסך');
  });
  it('life feedback: quoted text and the simulation note', () => {
    const md = buildTaskMarkdown(mapLifeFeedback('app_1', { kind: 'app', uid: 'demo_a', text: 'שורה 1\nשורה 2', generatedBy: 'llm' }, new Map([['demo_a', 'אבי']])));
    expect(md).toContain('## משוב / רעיון לאפליקציה');
    expect(md).toContain('פרסונה אבי, נכתב ב-AI');
    expect(md).toContain('> שורה 1\n> שורה 2');
    expect(md).toContain('`demo_registry/life/feedback/app_1`');
    expect(md).toContain('סימולציה');
  });
});
