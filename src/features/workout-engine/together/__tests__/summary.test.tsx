import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
import { buildTogetherSummary } from '../core/summary';
import TogetherSummarySection from '../components/TogetherSummarySection';
import type { PresenceEntry } from '../core/types';

const e = (o: Partial<PresenceEntry>): PresenceEntry => ({ uid: 'x', name: 'x', kind: 'run', state: 'done', clientMs: 0, seq: 1, serverMs: 1, ...o });

describe('together summary maths', () => {
  const run = [
    e({ uid: 'b', name: 'בני', distanceKm: 5.2, paceSecPerKm: 330, cheersSent: { me: 2 } }),
    e({ uid: 'me', name: 'אני', distanceKm: 5.0, paceSecPerKm: 340, duelUid: 'b', cheersSent: { b: 1 } }),
    e({ uid: 'a', name: 'אבי', distanceKm: 7.1 }),
  ];
  it('needs at least two people', () => {
    expect(buildTogetherSummary([run[0]], 'b')).toBeNull();
  });
  it('totals, and an equal list: me first then by name, never by result', () => {
    const s = buildTogetherSummary(run, 'me')!;
    expect(s.totals.distanceKm).toBe(17.3);
    expect(s.people.map((p) => p.uid)).toEqual(['me', 'a', 'b']);
    expect(s.people.find((p) => p.uid === 'me')!.cheers).toBe(2);
    expect(s.people.find((p) => p.uid === 'b')!.cheers).toBe(1);
    expect(s.closenessMeters).toBeNull(); // 3 people
  });
  it('duel result only when I picked one', () => {
    expect(buildTogetherSummary(run, 'me')!.duel).toMatchObject({ uid: 'b', leader: 'them', gapKm: expect.closeTo(0.2, 5) });
    expect(buildTogetherSummary(run, 'a')!.duel).toBeNull();
  });
  it('pair closeness in metres', () => {
    const s = buildTogetherSummary([run[0], run[1]], 'me')!;
    expect(s.closenessMeters).toBe(200);
  });
  it('strength / amrap totals use sets and rounds', () => {
    const s = buildTogetherSummary([e({ uid: 'me', kind: 'strength', set: 12 }), e({ uid: 'q', name: 'ק', kind: 'strength', set: 10 })], 'me')!;
    expect(s.totals.sets).toBe(22);
    const a = buildTogetherSummary([e({ uid: 'me', kind: 'amrap', roundsDone: 5 }), e({ uid: 'q', name: 'ק', kind: 'amrap', roundsDone: 4 })], 'me')!;
    expect(a.totals.rounds).toBe(9);
  });
});

describe('TogetherSummarySection', () => {
  const html = (entries: PresenceEntry[], me = 'me') => renderToStaticMarkup(<TogetherSummarySection summary={buildTogetherSummary(entries, me)!} />).replaceAll('<!-- -->', '');
  it('run group: collective line, equal list, cheers, no ranking/MVP words', () => {
    const h = html([
      e({ uid: 'me', name: 'אני', distanceKm: 5, paceSecPerKm: 340 }),
      e({ uid: 'a', name: 'אבי', distanceKm: 6, paceSecPerKm: 300, cheersSent: { me: 1 } }),
      e({ uid: 'b', name: 'בני', distanceKm: 5.5, cheersSent: { me: 3 } }),
    ]);
    expect(h).toContain('3 אנשים · 16.5 ק״מ סה״כ יחד');
    expect(h).toContain('5.0 ק״מ · 5:40');
    expect(h).toContain('4 כיפים'.replace('4', '4')) ;
    expect(h).not.toContain('MVP');
    expect(h).not.toContain('data-testid="together-duel"');
  });
  it('pair: closeness line; duel block when chosen', () => {
    const h = html([e({ uid: 'me', name: 'אני', distanceKm: 5, duelUid: 'a' }), e({ uid: 'a', name: 'אבי', distanceKm: 5.2 })]);
    expect(h).toContain('200 מטר ביניכם בסיום');
    expect(h).toContain('אני מול אבי');
    expect(h).toContain('הפרש: 0.20 ק״מ לטובת אבי');
  });
  it('amrap collective line', () => {
    expect(html([e({ uid: 'me', kind: 'amrap', roundsDone: 5 }), e({ uid: 'q', name: 'ק', kind: 'amrap', roundsDone: 4 })])).toContain('2 אנשים · 9 סבבים סה״כ יחד');
  });
});
