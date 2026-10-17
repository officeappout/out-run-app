import { describe, it, expect } from 'vitest';
import { serverTimestamp, Timestamp, deleteField } from 'firebase/firestore';
import {
  cleanCueItemsForSave,
  convertUndefinedToNull,
  sanitizeExerciseData,
} from '../exercise-mapping.utils';

/**
 * Admin editor save path: ExecutionMethodCard edits method cues/highlights as
 * `{ he, en }`, but the old inline filter in ExerciseEditorForm only kept plain
 * strings / `{ male, female }` — every `{ he, en }` cue was deleted on save.
 */
describe('cleanCueItemsForSave', () => {
  it('keeps non-empty { he, en } items (the shape the editor produces)', () => {
    expect(cleanCueItemsForSave([
      { he: 'גב ישר', en: '' },
      { he: '', en: 'Brace' },
      { he: '  ', en: '' },
    ])).toEqual([{ he: 'גב ישר', en: '' }, { he: '', en: 'Brace' }]);
  });

  it('keeps legacy strings (trimmed) and { male, female }, drops empties', () => {
    expect(cleanCueItemsForSave([
      '  בטן אסופה ',
      '',
      { male: 'עמוד', female: 'עמדי' },
      { male: ' ', female: '' },
      null,
      42,
    ])).toEqual(['בטן אסופה', { male: 'עמוד', female: 'עמדי' }]);
  });

  it('non-arrays → []', () => {
    expect(cleanCueItemsForSave(undefined)).toEqual([]);
    expect(cleanCueItemsForSave('x')).toEqual([]);
  });

  it('survives the write sanitizer as LocalizedText', () => {
    const cues = cleanCueItemsForSave([{ he: 'גב ישר', en: 'Straight back' }, 'בטן אסופה']);
    const out = sanitizeExerciseData({
      execution_methods: [{ location: 'home', requiredGearType: 'none', specificCues: cues, highlights: [], media: {} }],
    } as never);
    expect(out.execution_methods[0].specificCues).toEqual([
      { he: 'גב ישר', en: 'Straight back' },
      { he: 'בטן אסופה', en: '' },
    ]);
  });
});

describe('convertUndefinedToNull — non-plain objects pass through', () => {
  it('still converts undefined deep inside plain objects / arrays', () => {
    expect(convertUndefinedToNull({ a: undefined, b: [undefined, { c: undefined }], d: [] }))
      .toEqual({ a: null, b: [null, { c: null }], d: [] });
  });

  it('keeps FieldValue sentinels by identity (no { _methodName } copy)', () => {
    const ts = serverTimestamp();
    const del = deleteField();
    const out = convertUndefinedToNull({ updatedAt: ts, nested: { createdAt: ts, gone: del } });
    expect(out.updatedAt).toBe(ts);
    expect(out.nested.createdAt).toBe(ts);
    expect(out.nested.gone).toBe(del);
  });

  it('keeps Timestamp and Date instances', () => {
    const t = Timestamp.fromMillis(1_700_000_000_000);
    const d = new Date(1_700_000_000_000);
    const out = convertUndefinedToNull({ t, d, list: [t] });
    expect(out.t).toBe(t);
    expect(out.d).toBe(d);
    expect(out.list[0]).toBe(t);
  });
});
