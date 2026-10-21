import { describe, it, expect } from 'vitest';
import {
  addNote,
  applyTriageToDismissals,
  dismissalFromFinding,
  findingScreenKey,
  groupDismissals,
  nextNoteId,
  parseNoteInput,
  parseOwnerRulesDoc,
  parseReason,
  type Dismissal,
} from '../owner-rules-model';

const dis = (p: Partial<Dismissal> = {}): Dismissal => ({ findingId: 'qa-1__a', rule: 'LAY-OVERLAP', screen: 'home_today', title: 'כפתור צף', reason: '', atMs: 1, ...p });

describe('owner rules doc', () => {
  it('parses leniently: bad rows dropped, bounded', () => {
    const doc = parseOwnerRulesDoc({
      notes: [{ id: 'OWN-101', text: ' הערה ', severity: 'P1', screen: '/map', createdAtMs: 3 }, { id: 'OWN-1', text: 'x' }, { id: 'OWN-102', text: 'בלי חומרה', screen: '../x' }],
      dismissals: [dis(), { findingId: 'a/b', screen: 'x' }, { findingId: 'ok', screen: '' }, dis({ findingId: 'qa-1__b', rule: 'lower' as never })],
    });
    expect(doc.notes).toEqual([
      { id: 'OWN-101', text: 'הערה', screen: '/map', severity: 'P1', createdAtMs: 3 },
      { id: 'OWN-102', text: 'בלי חומרה', screen: null, severity: 'P2', createdAtMs: 0 },
    ]);
    expect(doc.dismissals.map((d) => [d.findingId, d.rule])).toEqual([['qa-1__a', 'LAY-OVERLAP'], ['qa-1__b', null]]);
    expect(parseOwnerRulesDoc(undefined)).toEqual({ notes: [], dismissals: [] });
  });

  it('panel note ids start at OWN-101 and never collide', () => {
    expect(nextNoteId([])).toBe('OWN-101');
    expect(nextNoteId([{ id: 'OWN-101' }, { id: 'OWN-107' }])).toBe('OWN-108');
    expect(nextNoteId([{ id: 'OWN-999' }])).toBeNull();
    const r = addNote({ notes: [], dismissals: [] }, { text: 'המיקום מעל הכרטיס', screen: 'map', severity: 'P1' }, 9)!;
    expect(r.note).toEqual({ id: 'OWN-101', text: 'המיקום מעל הכרטיס', screen: 'map', severity: 'P1', createdAtMs: 9 });
    expect(r.doc.notes).toHaveLength(1);
  });

  it('validates the "add owner note" form', () => {
    expect(parseNoteInput({ text: 'כפתור סגירה אחד', screen: '', severity: '' })).toEqual({ ok: true, value: { text: 'כפתור סגירה אחד', screen: null, severity: 'P2' } });
    expect(parseNoteInput({ text: 'abc' })).toEqual({ ok: false, error: 'bad_text' });
    expect(parseNoteInput({ text: 'x'.repeat(501) })).toEqual({ ok: false, error: 'bad_text' });
    expect(parseNoteInput({ text: 'הערה תקינה', screen: 'a b' })).toEqual({ ok: false, error: 'bad_screen' });
    expect(parseNoteInput({ text: 'הערה תקינה', screen: '../../etc' })).toEqual({ ok: false, error: 'bad_screen' });
    expect(parseNoteInput({ text: 'הערה תקינה', severity: 'P7' })).toEqual({ ok: false, error: 'bad_severity' });
    expect(parseNoteInput(null).ok).toBe(false);
  });
});

describe('dismissals (the "לא רלוונטי" learning)', () => {
  it('a finding doc → its screen key and dismissal row', () => {
    expect(findingScreenKey({ route: '/home', repro: [{ name: 'screen', screen: 'home_today' }] })).toBe('home_today');
    expect(findingScreenKey({ route: '/parks/[id]', repro: [] })).toBe('/parks/[id]');
    expect(findingScreenKey(undefined)).toBe('/');
    expect(dismissalFromFinding('qa-1__z', { rule: 'OWN-006', route: '/home', title: 'כפתור צף', repro: [] }, 'בכוונה', 5)).toEqual({
      findingId: 'qa-1__z', rule: 'OWN-006', screen: '/home', title: 'כפתור צף', reason: 'בכוונה', atMs: 5,
    });
  });

  it('irrelevant (re)adds the row; handled / reopen removes it', () => {
    const list = [dis({ findingId: 'a' }), dis({ findingId: 'b' })];
    expect(applyTriageToDismissals(list, 'a', dis({ findingId: 'a', reason: 'שוב' })).map((d) => [d.findingId, d.reason])).toEqual([['b', ''], ['a', 'שוב']]);
    expect(applyTriageToDismissals(list, 'a', null).map((d) => d.findingId)).toEqual(['b']);
  });

  it('groups by rule + screen: twice = suppressed, once = clarification; no rule = not grouped', () => {
    const g = groupDismissals([
      dis({ findingId: 'a', reason: 'בכוונה', atMs: 1 }),
      dis({ findingId: 'b', reason: 'עדיין בכוונה', atMs: 2 }),
      dis({ findingId: 'c', screen: 'map', rule: 'V2-CTA-1' }),
      dis({ findingId: 'd', rule: null }),
    ]);
    expect(g).toEqual([
      { rule: 'LAY-OVERLAP', screen: 'home_today', count: 2, reasons: ['עדיין בכוונה', 'בכוונה'], title: 'כפתור צף', lastAtMs: 2, suppressed: true },
      { rule: 'V2-CTA-1', screen: 'map', count: 1, reasons: [], title: 'כפתור צף', lastAtMs: 1, suppressed: false },
    ]);
  });

  it('parseReason trims, caps, empties to null', () => {
    expect(parseReason('  ')).toBeNull();
    expect(parseReason(undefined)).toBeNull();
    expect(parseReason('x'.repeat(400))).toHaveLength(300);
  });
});
