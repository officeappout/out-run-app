/* eslint-disable @typescript-eslint/no-explicit-any -- raw Firestore shapes */
import { describe, it, expect } from 'vitest';
import { normalizeExercise, sanitizeExerciseData } from '../../../../../services/exercise-mapping.utils';
import {
  duplicateMethodName,
  isGenderSplitNotification,
  methodNameLabel,
  notificationEn,
  toLocalizedMethodName,
  withNotificationEn,
} from '../method-text.utils';

/**
 * 31.10 bug: the editor flattened methodName { he, en } to the Hebrew string on
 * load, so the EN tab showed an empty name and every save wrote en: ''.
 * These tests walk the same path as the editor: Firestore doc → normalizeExercise
 * → loader → MethodsSection → card edit → MethodsSection.onUpdate →
 * sanitizeExerciseData → updateExercise's per-method merge.
 */
const DOC_METHOD = {
  location: 'park',
  methodName: { en: 'Dips at the Park', he: 'מקבילים בפארק' },
  notificationText: { he: 'גשו למקבילים', en: 'Head over to the parallel bars' },
};

function load() {
  const ex = normalizeExercise('hSVTgimudJNF5uVF7DfM', { name: { he: 'מקבילים', en: 'Dips' }, execution_methods: [DOC_METHOD] });
  const m = ex.execution_methods![0] as any;
  return { ...m, methodName: toLocalizedMethodName(m.methodName) }; // loader + MethodsSection render
}

function save(edited: any) {
  const updated = { ...edited, methodName: toLocalizedMethodName(edited.methodName) }; // MethodsSection.onUpdate
  const incoming = sanitizeExerciseData({ execution_methods: [updated] } as any).execution_methods[0];
  return { ...DOC_METHOD, ...incoming }; // updateExercise merge
}

describe('execution method text — load + save round-trip', () => {
  it('load exposes both slots to the HE and EN tabs', () => {
    const m = load();
    expect(m.methodName.he).toBe('מקבילים בפארק');
    expect(m.methodName.en).toBe('Dips at the Park');
    expect(notificationEn(m.notificationText)).toBe('Head over to the parallel bars');
  });

  it('save without edits keeps both languages', () => {
    const out = save(load());
    expect(out.methodName).toEqual(DOC_METHOD.methodName);
    expect(out.notificationText).toEqual(DOC_METHOD.notificationText);
  });

  it('EN edits write only en', () => {
    const m = load();
    const edited = {
      ...m,
      methodName: { ...m.methodName, en: 'Park dips' },
      notificationText: withNotificationEn(m.notificationText, 'Go to the bars'),
    };
    const out = save(edited);
    expect(out.methodName).toEqual({ he: 'מקבילים בפארק', en: 'Park dips' });
    expect(out.notificationText).toEqual({ he: 'גשו למקבילים', en: 'Go to the bars' });
  });

  it('HE edits write only he', () => {
    const m = load();
    const edited = {
      ...m,
      methodName: { ...m.methodName, he: 'מקבילים' },
      notificationText: { ...m.notificationText, he: 'לכו למקבילים' }, // GenderedTextInput.writeUnified
    };
    const out = save(edited);
    expect(out.methodName).toEqual({ he: 'מקבילים', en: 'Dips at the Park' });
    expect(out.notificationText).toEqual({ he: 'לכו למקבילים', en: 'Head over to the parallel bars' });
  });

  it('legacy string values load as he and stay unchanged when untouched', () => {
    expect(toLocalizedMethodName('מקבילים')).toEqual({ he: 'מקבילים', en: '' });
    expect(withNotificationEn('גשו', 'Go')).toEqual({ he: 'גשו', en: 'Go' });
    expect(notificationEn('גשו')).toBe('');
  });

  it('gender-split notification is read-only on EN', () => {
    expect(isGenderSplitNotification({ male: 'גש', female: 'גשי' } as any)).toBe(true);
    expect(isGenderSplitNotification(DOC_METHOD.notificationText)).toBe(false);
    expect(isGenderSplitNotification('גשו')).toBe(false);
  });

  it('labels and duplicates keep both slots', () => {
    expect(methodNameLabel(DOC_METHOD.methodName)).toBe('מקבילים בפארק');
    expect(methodNameLabel({ he: '', en: 'Dips' })).toBe('Dips');
    expect(duplicateMethodName(DOC_METHOD.methodName, 'Method 1')).toEqual({
      he: 'מקבילים בפארק (עותק)',
      en: 'Dips at the Park (copy)',
    });
    expect(duplicateMethodName('', 'Method 2')).toEqual({ he: 'Method 2 (עותק)', en: '' });
  });
});
