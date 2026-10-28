import { describe, expect, it } from 'vitest';
import {
  buildBulkFile, buildPatch, chunkStrings, exerciseToPayload, hasSourceScript, isEmptyOrCorrupt, mergeTranslations,
  slotsOf, sourceDrift, uniqueStrings, validateBulkFile, verifyApplied, verifyImport,
} from '../exercise-bulk';

const ex = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: { he: 'משיכה', en: 'Pull-up' },
  content: { description: { he: 'תיאור', en: '' }, instructions: { he: 'הוראות', en: 'Copy of Instructions' }, goal: 'keep' },
  execution_methods: [
    {
      methodName: { he: 'רגיל', en: '' },
      notificationText: { male: 'שב על כיסא', female: 'שבי על כיסא' },
      specificCues: [{ he: 'גב ישר', en: '' }, { he: 'משיכה', en: '' }],
      highlights: [{ he: 'משיכה', en: 'Pull' }],
      media: 'x',
    },
  ],
  supportedLangs: ['he'],
  other: 1,
  ...over,
});
const docs = [ex('b'), ex('a', { name: { he: 'סקוואט', en: 'Copy of Squat' } })];

describe('export', () => {
  it('uses slots keyed by the source and target language, sorted by id, same coverage as the admin export', () => {
    const f = buildBulkFile(docs, { source: 'he', target: 'es', exportedAt: 'T' });
    expect(f.exercises.map((e) => e.exerciseId)).toEqual(['a', 'b']);
    const b = f.exercises[1]!;
    expect(b.name).toEqual({ he: 'משיכה', es: '' });
    expect(b.methods[0]!.notificationText).toEqual({ he: 'שב על כיסא', es: '' });
    expect(b.methods[0]!.specificCues).toHaveLength(2);
    expect(slotsOf(b).map((s) => s.path)).toContain('methods[0].highlights[0]');
    expect(() => validateBulkFile(JSON.parse(JSON.stringify(f)))).not.toThrow();
    expect(() => validateBulkFile({ format: 'x' })).toThrow();
  });
});

describe('corrupt detection', () => {
  it('empty, Hebrew, Copy of, (Copy) are corrupt; real text is not', () => {
    for (const bad of ['', '  ', 'שלום', 'Copy of Squat', 'Squat (Copy)']) expect(isEmptyOrCorrupt(bad, 'he'), bad).toBe(true);
    expect(isEmptyOrCorrupt('Dominada', 'he')).toBe(false);
    expect(hasSourceScript('abc', 'he')).toBe(false);
  });
});

describe('chunks', () => {
  const file = buildBulkFile(docs, { source: 'he', target: 'es' });
  it('de-duplicates identical source strings and keeps contexts', () => {
    const entries = uniqueStrings(file);
    const pull = entries.filter((e) => e.source === 'משיכה');
    expect(pull).toHaveLength(1);
    expect(pull[0]!.contexts.length).toBeGreaterThan(1);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
  it('chunks by size with ids and totals', () => {
    const entries = uniqueStrings(file);
    const chunks = chunkStrings(entries, { size: 3, sourceLang: 'he', targetLang: 'es' });
    expect(chunks.length).toBe(Math.ceil(entries.length / 3));
    expect(chunks.every((c) => c.totalChunks === chunks.length)).toBe(true);
    expect(chunks.flatMap((c) => c.items)).toHaveLength(entries.length);
  });
  it('a fully translated export yields no strings', () => {
    const done = buildBulkFile([ex('x', { name: { he: 'א', es: 'A' }, content: { description: { he: 'ב', es: 'B' }, instructions: { he: 'ג', es: 'C' } }, execution_methods: [] })], { source: 'he', target: 'es' });
    expect(uniqueStrings(done)).toEqual([]);
  });
});

describe('merge', () => {
  const file = buildBulkFile([ex('b', { name: { he: 'משיכה', es: 'Barra' } })], { source: 'he', target: 'es' });
  const chunk = { items: [
    { source: 'משיכה', target: 'Dominada' }, { source: 'תיאור', target: 'Descripción' }, { source: 'הוראות', target: 'Instrucciones' },
    { source: 'רגיל', target: 'Normal' }, { source: 'גב ישר', target: 'שלום' }, { source: 'שב על כיסא', target: 'Siéntate' }, { source: 'לא קיים', target: 'x' },
  ] };
  const { file: out, report } = mergeTranslations(file, [chunk]);
  it('fills only empty or corrupt slots and never overwrites a good existing target', () => {
    const e = out.exercises[0]!;
    expect(e.name.es).toBe('Barra'); // good existing target kept although the chunk has another translation
    expect(e.methods[0]!.highlights[0]!.es).toBe('Dominada'); // same source string, empty slot: filled (de-duplicated)
    expect(e.description.es).toBe('Descripción');
    expect(e.instructions.es).toBe('Instrucciones');
    expect(e.methods[0]!.methodName.es).toBe('Normal');
    expect(e.methods[0]!.notificationText!.es).toBe('Siéntate');
  });
  it('rejects translator output with Hebrew, reports stale sources, counts what is missing', () => {
    expect(report.rejected.map((r) => r.source)).toEqual(['גב ישר']);
    expect(report.unknownSources).toEqual(['לא קיים']);
    expect(report.stillMissing).toBeGreaterThan(0);
    expect(report.filled).toBe(6);
  });
  it('does not mutate the export', () => expect(file.exercises[0]!.description.es).toBe(''));
});

describe('verify-import', () => {
  const exp = buildBulkFile(docs, { source: 'he', target: 'es' });
  const clone = () => JSON.parse(JSON.stringify(exp));
  const checks = (f: any, opts = {}) => verifyImport(exp, f, opts).map((i) => i.check);
  it('passes an identical file', () => expect(checks(clone())).toEqual([]));
  it('source changed, structure changed, id missing/extra', () => {
    let f = clone(); f.exercises[0].name.he = 'אחר'; expect(checks(f)).toContain('source');
    f = clone(); f.exercises[1].methods[0].specificCues.pop(); expect(checks(f)).toContain('structure');
    f = clone(); f.exercises.pop(); f.exerciseCount = 1; expect(checks(f)).toContain('ids');
    f = clone(); f.exercises[0].exerciseId = 'zzz'; expect(checks(f)).toContain('ids');
  });
  it('source-language characters, Copy of, and (optionally) incomplete targets', () => {
    let f = clone(); f.exercises[0].name.es = 'שלום'; expect(checks(f)).toContain('script');
    f = clone(); f.exercises[0].name.es = 'Copy of Squat'; expect(checks(f)).toContain('copy');
    f = clone(); expect(checks(f, { requireComplete: true })).toContain('empty');
  });
  it('a good existing target must survive', () => {
    const e = buildBulkFile([ex('g', { name: { he: 'א', es: 'Bueno' } })], { source: 'he', target: 'es' });
    const f = JSON.parse(JSON.stringify(e)); f.exercises[0].name.es = 'Otro';
    expect(verifyImport(e, f).map((i) => i.check)).toContain('overwrite');
  });
});

describe('apply: patch building mirrors importTranslationJSON', () => {
  const d = ex('b', { name: { he: 'משיכה', es: '' } });
  const payload = JSON.parse(JSON.stringify(exerciseToPayload(d, 'he', 'es')));
  payload.name.es = 'Dominada';
  payload.content = undefined;
  payload.description.es = 'Descripción';
  payload.instructions.es = 'Instrucciones';
  payload.methods[0].methodName.es = 'Normal';
  payload.methods[0].notificationText.es = 'Siéntate';
  payload.methods[0].specificCues[0].es = 'Espalda recta';
  payload.methods[0].specificCues[1].es = 'Tirar';
  payload.methods[0].highlights[0].es = 'Tirar';
  const patch = buildPatch(d, payload, 'es');

  it('writes only the es slot; he and en stay; other content keys stay', () => {
    expect(patch.name).toEqual({ he: 'משיכה', es: 'Dominada' });
    expect(patch.content.description).toEqual({ he: 'תיאור', en: '', es: 'Descripción' });
    expect(patch.content.instructions).toEqual({ he: 'הוראות', en: 'Copy of Instructions', es: 'Instrucciones' });
    expect(patch.content.goal).toBe('keep');
    expect(patch.execution_methods[0].media).toBe('x');
    expect(patch.execution_methods[0].highlights[0]).toEqual({ he: 'משיכה', en: 'Pull', es: 'Tirar' });
  });
  it('upgrades legacy gendered notificationText to a localized slot (male as he) and sets both method fields', () => {
    expect(patch.execution_methods[0].notificationText).toEqual({ he: 'שב על כיסא', es: 'Siéntate' });
    expect(patch.executionMethods).toEqual(patch.execution_methods);
  });
  it('adds the language to supportedLangs once', () => {
    expect(patch.supportedLangs).toEqual(['he', 'es']);
    expect(buildPatch({ ...d, supportedLangs: ['he', 'es'] }, payload, 'es').supportedLangs).toEqual(['he', 'es']);
  });
  it('a plain string name does not get spread into characters', () => {
    expect(buildPatch(ex('s', { name: 'סתם' }), { ...payload, name: { he: 'סתם', es: 'Cualquiera' } }, 'es').name).toEqual({ he: 'סתם', es: 'Cualquiera' });
  });

  it('sourceDrift: unchanged live doc is fine; changed source, structure or a newer good target is not', () => {
    expect(sourceDrift(d, payload, 'es')).toEqual([]);
    expect(sourceDrift(ex('b', { name: { he: 'שונה', es: '' } }), payload, 'es')[0]).toMatch(/source text changed/);
    expect(sourceDrift(ex('b', { execution_methods: [] }), payload, 'es')[0]).toMatch(/methods/);
    expect(sourceDrift(ex('b', { name: { he: 'משיכה', es: 'Humana' } }), payload, 'es')[0]).toMatch(/target changed/);
  });

  it('verifyApplied: ok for the patched doc; flags changed source, wrong target, unrelated field', () => {
    const after = { ...d, ...patch };
    expect(verifyApplied(d, after, payload, 'es')).toEqual([]);
    expect(verifyApplied(d, { ...after, name: { he: 'x', es: 'Dominada' } }, payload, 'es').join()).toMatch(/source slot changed/);
    expect(verifyApplied(d, { ...after, name: { he: 'משיכה', es: 'Otra' } }, payload, 'es').join()).toMatch(/target slot differs/);
    expect(verifyApplied(d, { ...after, other: 2 }, payload, 'es').join()).toMatch(/unrelated field "other"/);
  });
});

describe('target language guard', () => {
  const base = buildBulkFile(docs, { source: 'he', target: 'es' });
  it('validateBulkFile rejects target he or target equal to source, and a payload with another sourceLang', () => {
    expect(() => validateBulkFile({ ...base, targetLang: 'he' })).toThrow(/not allowed/);
    expect(() => validateBulkFile({ ...base, sourceLang: 'en', targetLang: 'en' })).toThrow(/not allowed/);
    expect(() => validateBulkFile({ ...base, exercises: [{ ...base.exercises[0], sourceLang: 'en' }] })).toThrow(/sourceLang/);
  });
  it('buildPatch throws for he and for the source language', () => {
    const p = base.exercises[0]!;
    expect(() => buildPatch(docs[0], p, 'he')).toThrow(/not allowed/);
    expect(() => buildPatch(docs[0], { ...p, sourceLang: 'en' }, 'en')).toThrow(/not allowed/);
  });
  it('verifyImport compares each payload sourceLang', () => {
    const f = JSON.parse(JSON.stringify(base));
    f.exercises[0].sourceLang = 'en';
    expect(verifyImport(base, f).map((i) => i.check)).toContain('lang');
  });
});
