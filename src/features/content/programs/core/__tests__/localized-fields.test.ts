// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createElement, useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PROGRAM_TEXT_FIELDS,
  LEVEL_SETTINGS_TEXT_FIELDS,
  foldLocalizedFieldsForWrite,
  normalizeStoredTextFields,
  pickProgramText,
} from '../localized-fields';
import { buildStoredText, hebrewOf } from '../../../shared/content-locale';
import { HeEnTextField } from '../../../shared/components/HeEnTextField';

describe('normalizeStoredTextFields (read back-compat)', () => {
  it('leaves a legacy plain-string doc exactly as it was (no sibling keys added)', () => {
    const doc = { id: 'p1', name: 'משיכה', description: 'תיאור', maxLevels: 5 };
    const out = normalizeStoredTextFields(doc, PROGRAM_TEXT_FIELDS);
    expect(out).toEqual(doc);
    expect('nameLocalized' in out).toBe(false);
  });
  it('a stored LocalizedText keeps the Hebrew string in `name` and exposes the pair in `nameLocalized`', () => {
    const out = normalizeStoredTextFields({ id: 'p1', name: { he: 'משיכה', en: 'Pull' }, description: 'ת' }, PROGRAM_TEXT_FIELDS) as Record<string, unknown>;
    expect(out.name).toBe('משיכה');
    expect(out.nameLocalized).toEqual({ he: 'משיכה', en: 'Pull' });
    expect(out.description).toBe('ת');
    expect('descriptionLocalized' in out).toBe(false);
  });
  it('covers level settings fields', () => {
    const out = normalizeStoredTextFields({ levelDescription: { he: 'רמה 3', en: 'Level 3' } }, LEVEL_SETTINGS_TEXT_FIELDS) as Record<string, unknown>;
    expect(out.levelDescription).toBe('רמה 3');
    expect(out.levelDescriptionLocalized).toEqual({ he: 'רמה 3', en: 'Level 3' });
  });
});

describe('pickProgramText (display resolution)', () => {
  const legacy = { name: 'משיכה' };
  const withEn = { name: 'משיכה', nameLocalized: { he: 'משיכה', en: 'Pull' } };
  it('he (flag off) is the Hebrew string for both shapes', () => {
    expect(pickProgramText(legacy, 'name', 'he')).toBe('משיכה');
    expect(pickProgramText(withEn, 'name', 'he')).toBe('משיכה');
  });
  it('en gives English when present, Hebrew when the doc has none or the slot is empty', () => {
    expect(pickProgramText(withEn, 'name', 'en')).toBe('Pull');
    expect(pickProgramText(legacy, 'name', 'en')).toBe('משיכה');
    expect(pickProgramText({ name: 'משיכה', nameLocalized: { he: 'משיכה', en: '' } }, 'name', 'en')).toBe('משיכה');
  });
  it('is empty-safe', () => {
    expect(pickProgramText(null, 'name', 'en')).toBe('');
    expect(pickProgramText({}, 'description', 'en')).toBe('');
  });
});

describe('buildStoredText / hebrewOf', () => {
  it('no English -> the plain Hebrew string', () => {
    expect(buildStoredText('משיכה', '')).toBe('משיכה');
    expect(buildStoredText('משיכה', '  ')).toBe('משיכה');
    expect(buildStoredText('משיכה', undefined)).toBe('משיכה');
  });
  it('English -> LocalizedText, keeping an existing es slot', () => {
    expect(buildStoredText('משיכה', 'Pull')).toEqual({ he: 'משיכה', en: 'Pull' });
    expect(buildStoredText('משיכה', 'Pull', { he: 'x', en: 'y', es: 'Tirar' })).toEqual({ he: 'משיכה', en: 'Pull', es: 'Tirar' });
  });
  it('hebrewOf reads both shapes', () => {
    expect(hebrewOf('א')).toBe('א');
    expect(hebrewOf({ he: 'א', en: 'a' })).toBe('א');
    expect(hebrewOf({ he: '', en: 'a' })).toBe('a');
    expect(hebrewOf(undefined)).toBe('');
  });
});

describe('foldLocalizedFieldsForWrite (admin save shape)', () => {
  it('payload without the sibling key is untouched (other callers, Hebrew-only code paths)', () => {
    const data = { name: ' משיכה ', order: 1 };
    expect(foldLocalizedFieldsForWrite(data, PROGRAM_TEXT_FIELDS)).toEqual(data);
  });
  it('Hebrew-only editor save writes the same plain string as before (not re-trimmed, no extra keys)', () => {
    const out = foldLocalizedFieldsForWrite({ name: 'משיכה', nameLocalized: { he: 'משיכה', en: '' }, description: '', descriptionLocalized: { he: '', en: '' } }, PROGRAM_TEXT_FIELDS);
    expect(out).toEqual({ name: 'משיכה', description: '' });
    expect(Object.keys(out).sort()).toEqual(['description', 'name']);
  });
  it('writes LocalizedText only for the field that has English', () => {
    const out = foldLocalizedFieldsForWrite({ name: 'משיכה', nameLocalized: { he: 'משיכה', en: 'Pull' }, description: 'ת', descriptionLocalized: { he: 'ת', en: '' } }, PROGRAM_TEXT_FIELDS);
    expect(out).toEqual({ name: { he: 'משיכה', en: 'Pull' }, description: 'ת' });
  });
  it('clearing English turns the doc back into a plain string', () => {
    const out = foldLocalizedFieldsForWrite({ name: 'משיכה', nameLocalized: { he: 'משיכה', en: '' } }, PROGRAM_TEXT_FIELDS);
    expect(out.name).toBe('משיכה');
  });
  it('an undefined sibling (round-trip of a Hebrew-only doc) leaves the string alone', () => {
    const out = foldLocalizedFieldsForWrite({ levelDescription: 'רמה 2', levelDescriptionLocalized: undefined }, LEVEL_SETTINGS_TEXT_FIELDS);
    expect(out).toEqual({ levelDescription: 'רמה 2' });
  });
  it('read then write round-trips a LocalizedText doc unchanged', () => {
    const stored = { name: { he: 'משיכה', en: 'Pull' } };
    const read = normalizeStoredTextFields(stored, PROGRAM_TEXT_FIELDS);
    expect(foldLocalizedFieldsForWrite(read, PROGRAM_TEXT_FIELDS)).toEqual(stored);
  });
});

describe('HeEnTextField', () => {
  function Harness({ onSave }: { onSave: (v: { name: string; nameLocalized: { he: string; en: string } }) => void }) {
    const [f, setF] = useState({ name: 'רמה', en: '' });
    onSave({ name: f.name, nameLocalized: { he: f.name, en: f.en } });
    return createElement(HeEnTextField, { label: 'שם', he: f.name, en: f.en, onChange: ({ he, en }) => setF({ name: he, en }) });
  }
  it('typing English yields a LocalizedText on save; Hebrew alone stays a string', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onSave = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(createElement(Harness, { onSave })); });
    const last = () => onSave.mock.calls.at(-1)![0];
    expect(foldLocalizedFieldsForWrite({ ...last() }, PROGRAM_TEXT_FIELDS).name).toBe('רמה');
    const en = host.querySelector('input[aria-label="שם (EN)"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(en, 'Level');
      en.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(foldLocalizedFieldsForWrite({ ...last() }, PROGRAM_TEXT_FIELDS).name).toEqual({ he: 'רמה', en: 'Level' });
    act(() => root.unmount());
  });
});
