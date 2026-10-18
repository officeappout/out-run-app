import { describe, it, expect } from 'vitest';
import {
  resolveEquipmentCues,
  resolveEquipmentDrawerCues,
  resolveEquipmentTips,
  resolveEquipmentPrepNote,
  buildEquipmentMethodText,
  buildEquipmentTextFields,
} from '../gym-equipment-text.utils';
import { resolveExerciseCues } from '@/features/content/exercises/utils/cue-text.utils';

const AUTO = () => ['auto 1', 'auto 2'];

describe('resolveEquipmentDrawerCues — fallback order', () => {
  it('prefers the doc cues over description and auto', () => {
    const r = resolveEquipmentDrawerCues(
      { cues: ['גב צמוד למשענת', 'נשפו בדחיפה'], description: 'שלב 1\nשלב 2' },
      AUTO,
    );
    expect(r).toEqual({ cues: ['גב צמוד למשענת', 'נשפו בדחיפה'], source: 'doc' });
  });

  it('falls back to description lines when cues are missing or blank', () => {
    const r = resolveEquipmentDrawerCues({ cues: ['  ', ''], description: 'שבו על המושב\n\nאחזו בידיות\r\nדחפו קדימה' }, AUTO);
    expect(r).toEqual({ cues: ['שבו על המושב', 'אחזו בידיות', 'דחפו קדימה'], source: 'description' });
  });

  it('falls back to the auto cues when there is neither', () => {
    expect(resolveEquipmentDrawerCues({ description: null }, AUTO)).toEqual({ cues: ['auto 1', 'auto 2'], source: 'auto' });
    expect(resolveEquipmentDrawerCues({}, AUTO).source).toBe('auto');
  });

  it('resolveEquipmentCues alone reports none (no auto)', () => {
    expect(resolveEquipmentCues({})).toEqual({ cues: [], source: 'none' });
    expect(resolveEquipmentCues(null)).toEqual({ cues: [], source: 'none' });
  });
});

describe('tips / prepNote readers', () => {
  it('keeps tips whole (no dash splitting), trims, drops empties and dupes', () => {
    expect(resolveEquipmentTips({ tips: [' קשה לכם? - קצרו טווח ', '', 'קשה לכם? - קצרו טווח'] })).toEqual([
      'קשה לכם? - קצרו טווח',
    ]);
    expect(resolveEquipmentTips({})).toEqual([]);
  });
  it('prepNote trims; null/absent → empty', () => {
    expect(resolveEquipmentPrepNote({ prepNote: '  כוונו את המושב  ' })).toBe('כוונו את המושב');
    expect(resolveEquipmentPrepNote({ prepNote: null })).toBe('');
  });
});

describe('buildEquipmentMethodText → the player resolver', () => {
  it('cues → highlights, tips → tips, prepNote → notificationText', () => {
    const fields = buildEquipmentMethodText({
      cues: ['גב צמוד', 'נשפו בדחיפה'],
      tips: ['קל לכם? האטו את החזרה'],
      prepNote: 'כוונו את המושב לגובה החזה',
    });
    expect(fields.notificationText).toBe('כוונו את המושב לגובה החזה');
    expect(resolveExerciseCues({ content: {} }, fields)).toEqual({
      highlights: ['גב צמוד', 'נשפו בדחיפה'],
      tips: ['קל לכם? האטו את החזרה'],
    });
  });
  it('uses description lines when no cues; empty machine → {}', () => {
    const fields = buildEquipmentMethodText({ description: 'אחד\nשניים' });
    expect(resolveExerciseCues(null, fields).highlights).toEqual(['אחד', 'שניים']);
    expect(buildEquipmentMethodText({})).toEqual({});
  });
  it('drops tips when there are no cues (they would become the cue list)', () => {
    expect(buildEquipmentMethodText({ tips: ['קשה לכם? קצרו טווח'] })).toEqual({});
  });
});

describe('buildEquipmentTextFields — admin save mapping', () => {
  it('trims items, drops empties, caps lists, keeps description newlines', () => {
    const out = buildEquipmentTextFields({
      cues: ['  א ', '', 'ב', '   ', 'ג', 'ד', 'ה', 'ו'],
      tips: [' t1 ', 't2', 't3'],
      prepNote: '  כוונו את המושב ',
      description: '\n שלב 1\nשלב 2 \n',
    });
    expect(out).toEqual({
      cues: ['א', 'ב', 'ג', 'ד', 'ה'],
      tips: ['t1', 't2'],
      prepNote: 'כוונו את המושב',
      description: 'שלב 1\nשלב 2',
    });
  });

  it('never-set empty fields stay undefined (not written)', () => {
    expect(buildEquipmentTextFields({ cues: [''], tips: [], prepNote: ' ', description: '' }, {})).toEqual({
      cues: undefined,
      tips: undefined,
      prepNote: undefined,
      description: undefined,
    });
  });

  it('emptied fields that had a value are written as the clear signal', () => {
    expect(
      buildEquipmentTextFields(
        { cues: [], tips: [' '], prepNote: '', description: '  ' },
        { cues: ['x'], tips: ['y'], prepNote: 'z', description: 'w' },
      ),
    ).toEqual({ cues: [], tips: [], prepNote: null, description: null });
  });
});
