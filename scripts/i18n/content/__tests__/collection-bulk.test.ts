import { describe, expect, it } from 'vitest';
import {
  applyWrites, buildExport, buildImport, checkTranslation, extractFields, getAtPath, isReadyPath, liveDrift, sourceDriftBetween,
  verifyCreates, verifyImport,
} from '../collection-bulk';

const docs = [
  { id: 'b', data: { name: 'משיכה', description: { he: 'תיאור', en: '' }, blocks: [{ label: 'חימום 5 דק׳' }, { label: 'ריצה' }], n: 5 } },
  { id: 'a', data: { name: { he: 'דחיפה', en: 'Push' }, other: 'abc' } },
];

describe('extractFields', () => {
  it('finds plain and { he, en } leaves with array paths, skips non-Hebrew', () => {
    const f = extractFields('b', docs[0].data);
    expect(f.map((x) => x.path)).toEqual(['name', 'description', 'blocks[0].label', 'blocks[1].label']);
    expect(f[1]).toMatchObject({ shape: 'localized', he: 'תיאור', en: '' });
    expect(getAtPath(docs[0].data, 'blocks[1].label')).toBe('ריצה');
  });
});

describe('buildImport', () => {
  const exp = buildExport('programs', docs, 'T');
  it('writes only READY paths as { he, en }, never replaces existing English, lists the rest as needsCode', () => {
    const exp2 = buildExport('programs', [{ id: 'b', data: { name: 'משיכה', tags: ['חם'] } }, ...docs.slice(1)], 'T');
    const { file, missing } = buildImport(exp2, { 'משיכה': 'Pull', 'חם': 'hot', 'דחיפה': 'SHOULD NOT WRITE' });
    expect(missing).toEqual([]);
    expect(file.writes).toEqual([{ docId: 'b', path: 'name', he: 'משיכה', en: 'Pull', write: { he: 'משיכה', en: 'Pull' } }]);
    expect(file.needsCode.map((n) => n.path)).toEqual(['tags[0]']);
    expect(file.alreadyTranslated).toBe(1);
  });
  it('null = skipped junk, absent = missing; unknown collections have no ready paths', () => {
    const r = buildImport(exp, { 'משיכה': null });
    expect(r.skipped).toEqual(['משיכה']);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(isReadyPath('runWorkoutTemplates', 'blocks[3].label')).toBe(true);
    expect(isReadyPath('push_messages', 'title')).toBe(false);
    expect(isReadyPath('levels', 'description')).toBe(true);
  });
});

describe('verify', () => {
  const exp = buildExport('levels', [{ id: 'x', data: { name: 'הדוחף', description: 'ב-5 דק׳ {n}' } }], 'T');
  const good = () => buildImport(exp, { 'הדוחף': 'The Pusher', 'ב-5 דק׳ {n}': 'In 5 min {n}' }).file;
  it('passes a clean import', () => expect(verifyImport(exp, good())).toEqual([]));
  it('flags Hebrew in English, long dash, lost numbers/placeholders, changed source, non-ready path, overwrite', () => {
    expect(checkTranslation('ב-5 דק׳', 'in דק׳')).toEqual(expect.arrayContaining(['Hebrew characters in English']));
    expect(checkTranslation('ב-5', 'in five')).toEqual(expect.arrayContaining([expect.stringContaining('numbers/placeholders')]));
    expect(checkTranslation('א', 'a — b')).toContain('long dash');
    expect(checkTranslation('א\nב', 'a b')).toContain('line count differs');
    const bad = good(); bad.writes[0].he = 'אחר';
    expect(verifyImport(exp, bad).map((i) => i.check)).toContain('source-changed');
    const nr = good(); nr.writes[0].path = 'tags[0]';
    expect(verifyImport(exp, nr).map((i) => i.check)).toEqual(expect.arrayContaining(['unknown-field']));
    const exp2 = buildExport('levels', [{ id: 'x', data: { name: { he: 'הדוחף', en: 'Pusher' } } }], 'T');
    const ow = good(); ow.writes = [{ docId: 'x', path: 'name', he: 'הדוחף', en: 'X', write: { he: 'הדוחף', en: 'X' } }];
    expect(verifyImport(exp2, ow).map((i) => i.check)).toContain('overwrites-english');
  });
  it('detects source drift against a fresh export', () => {
    const fresh = buildExport('levels', [{ id: 'x', data: { name: 'שונה', description: 'ב-5 דק׳ {n}' } }], 'T2');
    expect(sourceDriftBetween(exp, fresh).map((i) => i.check)).toEqual(['source-changed']);
    expect(sourceDriftBetween(exp, exp)).toEqual([]);
  });
});

describe('creates + live drift', () => {
  it('only -en ids with locale en, no Hebrew, not existing, only allowed collections', () => {
    const ok = [{ docId: 'help-x-en', data: { locale: 'en', q: 'Q' } }];
    expect(verifyCreates('site_content', ok, new Set())).toEqual([]);
    expect(verifyCreates('levels', ok, new Set()).map((i) => i.check)).toContain('creates-not-allowed');
    expect(verifyCreates('site_content', ok, new Set(['help-x-en'])).map((i) => i.check)).toContain('id-exists');
    expect(verifyCreates('site_content', [{ docId: 'help-x', data: { locale: 'he', q: 'שלום' } }], new Set()).map((i) => i.check)).toEqual(expect.arrayContaining(['id', 'locale', 'hebrew']));
  });
  it('live drift: Hebrew changed or English already present blocks the write', () => {
    const w = { docId: 'x', path: 'name', he: 'א', en: 'a', write: { he: 'א', en: 'a' } };
    expect(liveDrift({ name: 'א' }, w)).toBeNull();
    expect(liveDrift({ name: 'ב' }, w)).toMatch(/changed/);
    expect(liveDrift({ name: { he: 'א', en: 'z' } }, w)).toMatch(/English/);
  });
});

describe('applyWrites', () => {
  it('replaces whole top-level fields, setting { he, en } at array/nested paths and leaving the rest untouched', () => {
    const live = { blocks: [{ label: 'חימום', n: 1 }, { label: 'ריצה', n: 2 }], cues: ['א', 'ב'], name: 'x', other: 5 };
    const w = (path: string, he: string, en: string) => ({ path, write: { he, en } });
    const out = applyWrites(live, [w('blocks[1].label', 'ריצה', 'Run'), w('cues[0]', 'א', 'a'), w('cues[1]', 'ב', 'b'), w('name', 'x', 'X')]);
    expect(out.blocks).toEqual([{ label: 'חימום', n: 1 }, { label: { he: 'ריצה', en: 'Run' }, n: 2 }]);
    expect(out.cues).toEqual([{ he: 'א', en: 'a' }, { he: 'ב', en: 'b' }]);
    expect(out.name).toEqual({ he: 'x', en: 'X' });
    expect('other' in out).toBe(false);
    expect(live.cues).toEqual(['א', 'ב']); // input not mutated
  });
});
