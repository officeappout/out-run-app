import { describe, expect, it } from 'vitest';
import { mapLifeFeedback, mapQaFinding, type FeedbackItem } from '../feedback-model';
import {
  buildFeedbackPage,
  dateWindow,
  decodeCursor,
  encodeCursor,
  isFeedbackDocId,
  isQaScreenshotPath,
  israelDayStartMs,
  parseFeedbackFilters,
  parseStatusInput,
  scanUpperMs,
  sourcesFor,
  type FeedbackFilters,
} from '../feedback-query';

const ALL: FeedbackFilters = { source: 'all', type: null, severity: null, persona: null, status: 'all', from: null, to: null };
const life = (id: string, ms: number, extra: Record<string, unknown> = {}): FeedbackItem =>
  mapLifeFeedback(id, { kind: 'app', uid: 'demo_a', text: id, createdAt: new Date(ms), ...extra }, new Map([['demo_a', 'אבי']]));
const qa = (id: string, ms: number, extra: Record<string, unknown> = {}): FeedbackItem =>
  mapQaFinding(id, { severity: 'P2', category: 'ux', persona: 'dana_41', title: id, createdAtMs: ms, ...extra });

describe('parseFeedbackFilters', () => {
  it('reads valid values and drops the rest', () => {
    const f = parseFeedbackFilters(new URLSearchParams('source=testers&type=broken&severity=P0&persona= דנה &status=handled&from=2026-10-01&to=2026-10-20'));
    expect(f).toEqual({ source: 'testers', type: 'broken', severity: 'P0', persona: 'דנה', status: 'handled', from: '2026-10-01', to: '2026-10-20' });
    expect(parseFeedbackFilters(new URLSearchParams('source=x&type=y&severity=P7&status=z&from=yesterday'))).toEqual(ALL);
  });
});

describe('sourcesFor', () => {
  it('severity or a tester category rules out life; a life type rules out testers', () => {
    expect(sourcesFor(ALL)).toEqual(['life', 'testers']);
    expect(sourcesFor({ ...ALL, severity: 'P1' })).toEqual(['testers']);
    expect(sourcesFor({ ...ALL, type: 'copy' })).toEqual(['testers']);
    expect(sourcesFor({ ...ALL, type: 'park' })).toEqual(['life']);
    expect(sourcesFor({ ...ALL, source: 'life', severity: 'P0' })).toEqual([]);
  });
});

describe('dates', () => {
  it('Israel midnight (summer UTC+3, winter UTC+2)', () => {
    expect(israelDayStartMs('2026-10-20')).toBe(Date.UTC(2026, 9, 19, 21));
    expect(israelDayStartMs('2026-12-01')).toBe(Date.UTC(2026, 10, 30, 22));
  });
  it('the window is inclusive of both days', () => {
    const w = dateWindow({ ...ALL, from: '2026-10-19', to: '2026-10-20' });
    expect(w.fromMs).toBe(Date.UTC(2026, 9, 18, 21));
    expect(w.toMs).toBe(Date.UTC(2026, 9, 20, 21) - 1);
  });
  it('scanUpperMs takes the tighter bound', () => {
    expect(scanUpperMs(null, null)).toBeNull();
    expect(scanUpperMs({ ms: 5, skip: [] }, 9)).toBe(5);
    expect(scanUpperMs(null, 9)).toBe(9);
  });
});

describe('cursor', () => {
  it('round-trips and rejects junk', () => {
    expect(decodeCursor(encodeCursor({ ms: 123, skip: ['life:a'] }))).toEqual({ ms: 123, skip: ['life:a'] });
    expect(decodeCursor('not-base64-json')).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ ms: -1 })).toString('base64url'))).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });
});

describe('buildFeedbackPage', () => {
  it('merges both sources newest first and stops when everything was seen', () => {
    const page = buildFeedbackPage(
      [
        { items: [life('l2', 400), life('l1', 100)], full: false },
        { items: [qa('q2', 300), qa('q1', 200)], full: false },
      ],
      ALL,
      null,
    );
    expect(page.items.map((i) => i.id)).toEqual(['l2', 'q2', 'q1', 'l1']);
    expect(page.nextCursor).toBeNull();
  });

  it('filters by persona, status and severity in memory', () => {
    const scans = [
      { items: [life('l1', 500, { triage: { status: 'handled' } })], full: false },
      { items: [qa('q1', 400), qa('q2', 300, { severity: 'P0' })], full: false },
    ];
    expect(buildFeedbackPage(scans, { ...ALL, persona: 'אב' }, null).items.map((i) => i.id)).toEqual(['l1']);
    expect(buildFeedbackPage(scans, { ...ALL, status: 'open' }, null).items.map((i) => i.id)).toEqual(['q1', 'q2']);
    expect(buildFeedbackPage(scans, { ...ALL, severity: 'P0' }, null).items.map((i) => i.id)).toEqual(['q2']);
  });

  it('cuts at the page size and resumes after the last item (skipping ties already shown)', () => {
    const items = [qa('a', 900), qa('b', 800), qa('c', 800), qa('d', 700)];
    const p1 = buildFeedbackPage([{ items, full: false }], ALL, null, 2);
    expect(p1.items.map((i) => i.id)).toEqual(['a', 'b']);
    const c1 = decodeCursor(p1.nextCursor)!;
    expect(c1).toEqual({ ms: 800, skip: ['testers:b'] });
    // the next scan reads createdAt <= 800 → b, c, d
    const p2 = buildFeedbackPage([{ items: items.slice(1), full: false }], ALL, c1, 2);
    expect(p2.items.map((i) => i.id)).toEqual(['c', 'd']);
    expect(p2.nextCursor).toBeNull();
  });

  it('never shows items past the horizon of a full scan, and resumes there', () => {
    // testers hit the scan limit at 500 → life items older than 500 are not yet certain
    const page = buildFeedbackPage(
      [
        { items: [life('l1', 900), life('l0', 100)], full: false },
        { items: [qa('q2', 800), qa('q1', 500)], full: true },
      ],
      ALL,
      null,
    );
    expect(page.items.map((i) => i.id)).toEqual(['l1', 'q2']);
    expect(decodeCursor(page.nextCursor)).toEqual({ ms: 500, skip: [] });
  });

  it('a scan with no matches still returns a cursor so "טען עוד" keeps going', () => {
    const page = buildFeedbackPage([{ items: [qa('q2', 800), qa('q1', 500)], full: true }], { ...ALL, severity: 'P0' }, null);
    expect(page.items).toEqual([]);
    expect(decodeCursor(page.nextCursor)).toEqual({ ms: 500, skip: [] });
  });

  it('steps past a cursor ms that a whole full scan sits on (no endless loop)', () => {
    const page = buildFeedbackPage([{ items: [qa('a', 500), qa('b', 500)], full: true }], ALL, { ms: 500, skip: [] });
    expect(decodeCursor(page.nextCursor)).toEqual({ ms: 499, skip: [] });
  });
});

describe('inputs', () => {
  it('parseStatusInput', () => {
    expect(parseStatusInput({ source: 'testers', id: 'r1__abc', status: 'handled' })).toEqual({ ok: true, value: { source: 'testers', id: 'r1__abc', status: 'handled', reason: null } });
    expect(parseStatusInput({ source: 'testers', id: 'r1__abc', status: 'irrelevant', reason: ' בכוונה ' })).toEqual({ ok: true, value: { source: 'testers', id: 'r1__abc', status: 'irrelevant', reason: 'בכוונה' } });
    // a reason only counts with "irrelevant"; a non-string reason is rejected
    expect(parseStatusInput({ source: 'testers', id: 'r1__abc', status: 'handled', reason: 'x' })).toMatchObject({ ok: true, value: { reason: null } });
    expect(parseStatusInput({ source: 'testers', id: 'r1__abc', status: 'irrelevant', reason: 5 }).ok).toBe(false);
    expect(parseStatusInput({ source: 'life', id: 'app_demo_a_2026-10-20', status: 'irrelevant' }).ok).toBe(true);
    for (const bad of [null, {}, { source: 'users', id: 'a', status: 'open' }, { source: 'life', id: 'a/b', status: 'open' }, { source: 'life', id: '..', status: 'open' }, { source: 'life', id: 'a', status: 'done' }]) {
      expect(parseStatusInput(bad)).toEqual({ ok: false, error: 'bad_request' });
    }
  });
  it('doc ids and screenshot paths', () => {
    expect(isFeedbackDocId('r1__fp')).toBe(true);
    expect(isFeedbackDocId('../x')).toBe(false);
    expect(isFeedbackDocId(null)).toBe(false);
    expect(isQaScreenshotPath('qa/r1/m1/3-a.png')).toBe(true);
    expect(isQaScreenshotPath('qa/../users/x.png')).toBe(false);
    expect(isQaScreenshotPath('users/x.png')).toBe(false);
    expect(isQaScreenshotPath('qa//x.png')).toBe(false);
  });
});
