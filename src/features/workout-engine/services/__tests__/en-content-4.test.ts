/**
 * en-content-4: logic cues with an English twin, engine title display, raw-reader helpers, route descriptions, Hebrew edit merge.
 * Hebrew behaviour is covered by en-content-4-parity.test.ts (recorded from main).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ ROWS: {} as Record<string, any[]> }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, _base: string, parentDoc: string) => ({ __parentDoc: parentDoc }),
  getDocs: async (ref: { __parentDoc: string }) => {
    const rows = state.ROWS[ref.__parentDoc] ?? [];
    return { empty: rows.length === 0, docs: rows.map((r) => ({ data: () => r })) };
  },
  query: vi.fn(),
  where: vi.fn(),
}));

import { resolveWorkoutMetadata, setLocalizedLogicCue, type WorkoutMetadataContext } from '../workout-metadata.service';
import { foldRowText, normalizeMetadataRow } from '../workout-metadata-content-fields';
import { composeEngineTitle, ENGINE_TITLE_LEXICON_HE } from '../../logic/engine-title';
import { buildEngineTitleIndex, displayWorkoutTitle, ENGINE_TITLE_CATALOG_KEYS } from '../../logic/engine-title-display';
import { mergeHebrewEdit } from '@/features/content/shared/stored-text-fields';
import { routeDescriptionText } from '@/features/parks/core/utils/route-description';
import heHome from '@/messages/he/home.json';
import enHome from '@/messages/en/home.json';

const ctx: WorkoutMetadataContext = { persona: null, location: 'home', timeOfDay: 'morning' };

beforeEach(() => {
  state.ROWS = {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('logic cue rows with an English twin', () => {
  it('keeps the Hebrew string in logicCue and carries the pair, tags resolved in both', async () => {
    state.ROWS.logicCues = [{ text: { he: 'אימון של @זמן_אימון דקות', en: 'A @זמן_אימון minute workout' }, variant: 'balanced' }];
    const r = await resolveWorkoutMetadata({ ...ctx, durationMinutes: 25 }, 'balanced');
    expect(r.logicCue).toBe('אימון של 25 דקות');
    expect(r.logicCueLocalized).toEqual({ he: 'אימון של 25 דקות', en: 'A 25 minute workout' });
  });

  it('a plain Hebrew row has no pair (byte-identical Hebrew)', async () => {
    state.ROWS.logicCues = [{ text: 'שורה רגילה', variant: 'balanced' }];
    const r = await resolveWorkoutMetadata(ctx, 'balanced');
    expect(r.logicCue).toBe('שורה רגילה');
    expect(r.logicCueLocalized).toBeUndefined();
  });

  it('setLocalizedLogicCue sets, replaces and removes the pair', () => {
    const w: { logicCueLocalized?: { he: string; en: string } } = {};
    setLocalizedLogicCue(w, { logicCue: 'א', logicCueLocalized: { he: 'א', en: 'a' } });
    expect(w.logicCueLocalized).toEqual({ he: 'א', en: 'a' });
    setLocalizedLogicCue(w, { logicCue: 'ב', logicCueLocalized: undefined });
    expect(w.logicCueLocalized).toBeUndefined();
    setLocalizedLogicCue(w, { logicCue: null, logicCueLocalized: undefined });
    expect(w).toEqual({});
  });
});

describe('raw readers never see an object', () => {
  it('normalizeMetadataRow: pair -> Hebrew string + <field>Localized; plain rows unchanged', () => {
    const row = normalizeMetadataRow({ id: 'a', text: { he: 'כותרת', en: 'Title' }, phrase: { he: 'משפט', en: 'Phrase' }, description: 'תיאור' }) as Record<string, unknown>;
    expect(row.text).toBe('כותרת');
    expect(row.textLocalized).toEqual({ he: 'כותרת', en: 'Title' });
    expect(row.phrase).toBe('משפט');
    expect(row.description).toBe('תיאור');
    expect('descriptionLocalized' in row).toBe(false);
  });

  it('foldRowText keeps the English on a Hebrew edit', () => {
    expect(foldRowText({ he: 'ישן', en: 'Old' }, 'חדש')).toEqual({ he: 'חדש', en: 'Old' });
    expect(foldRowText(undefined, 'חדש')).toBe('חדש');
    expect(foldRowText({ he: 'ישן', en: '' }, 'חדש')).toBe('חדש');
  });

  it('mergeHebrewEdit: same Hebrew = nothing, edited Hebrew keeps en, plain stored = as sent', () => {
    expect(mergeHebrewEdit({ he: 'א', en: 'a' }, 'א')).toBeUndefined();
    expect(mergeHebrewEdit({ he: 'א', en: 'a' }, 'ב')).toEqual({ he: 'ב', en: 'a' });
    expect(mergeHebrewEdit('א', 'ב')).toBe('ב');
    expect(mergeHebrewEdit(undefined, 'ב')).toBe('ב');
  });

  it('routeDescriptionText: string, pair in a language, junk -> empty', () => {
    expect(routeDescriptionText('מסלול')).toBe('מסלול');
    expect(routeDescriptionText({ he: 'מסלול', en: 'Trail' })).toBe('מסלול');
    expect(routeDescriptionText({ he: 'מסלול', en: 'Trail' }, 'en')).toBe('Trail');
    expect(routeDescriptionText({ he: 'מסלול', en: '' }, 'en')).toBe('מסלול');
    expect(routeDescriptionText(undefined)).toBe('');
    expect(routeDescriptionText(5)).toBe('');
  });
});

describe('engine title', () => {
  it('Hebrew titles recorded from main', () => {
    const c = (intentMode: string, difficulty: number, location?: string, persona?: string) => composeEngineTitle(ENGINE_TITLE_LEXICON_HE, { intentMode, difficulty, location, persona });
    expect(c('normal', 2, 'home')).toBe('אימון יומי בבית');
    expect(c('normal', 2, 'moon')).toBe('אימון יומי');
    expect(c('normal', 2, 'park', 'parent')).toBe('אימון בפארק להורים עסוקים');
    expect(c('normal', 1, 'home', 'student')).toBe('אימון התאוששות לסטודנטים בבית');
    expect(c('normal', 3, 'gym')).toBe('אימון כוח עצים 💪 בחדר כושר');
    expect(c('blast', 2, 'gym')).toBe('Gym Blast 🔥');
    expect(c('field', 2, 'home')).toBe('אימון שטח 🎖️');
    expect(c('nonsense', 2)).toBe('אימון יומי');
  });

  it('the catalog: Hebrew values equal the generator tables, English has no Hebrew, every key exists', () => {
    const he = heHome as Record<string, string>;
    const en = enHome as Record<string, string>;
    for (const k of ENGINE_TITLE_CATALOG_KEYS) expect(he[k], k).toBeTruthy();
    expect(he['workoutTitle.normal.home']).toBe(ENGINE_TITLE_LEXICON_HE.templates.normal.home);
    expect(he['workoutTitle.persona.military']).toBe(ENGINE_TITLE_LEXICON_HE.personas.military);
    expect(he['workoutTitle.prefix.3']).toBe(ENGINE_TITLE_LEXICON_HE.prefixes[3]);
    expect(he['workoutTitle.location.gym']).toBe(ENGINE_TITLE_LEXICON_HE.locations.gym);
    for (const [k, v] of Object.entries(en)) if (k.startsWith('workoutTitle.')) expect(v, k).not.toMatch(/[֐-׿]/);
  });

  const lookup = (cat: Record<string, string>) => (key: string, values?: Record<string, string>) =>
    (cat[key] ?? (heHome as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, n) => values?.[n] ?? '');
  const tr = lookup(enHome as Record<string, string>);

  it('every title the generator can produce has an English display text without Hebrew letters (non-neutral ones)', () => {
    const index = buildEngineTitleIndex(tr);
    expect(index.size).toBeGreaterThan(100);
    expect(index.get('אימון יומי בבית')).toBe('Daily workout at home');
    expect(index.get('אימון התאוששות לסטודנטים בבית')).toBe('Recovery workout for students at home');
    expect(index.get('אימון כוח עצים 💪 בחדר כושר')).toBe('Max strength workout 💪 at the gym');
    expect(index.get('Gym Blast 🔥')).toBe('Gym Blast 🔥');
    for (const [heTitle, enTitle] of Array.from(index.entries())) expect(enTitle, heTitle).not.toMatch(/[֐-׿]/);
  });

  it('display: pair first (content language), engine catalog second (UI language), Hebrew as saved otherwise', () => {
    const index = buildEngineTitleIndex(tr);
    const base = { tr, index };
    const parts = { title: 'אימון יומי בבית', dayFocus: null };
    expect(displayWorkoutTitle(parts, { ...base, contentLang: 'en', uiLang: 'en', heWithFocus: 'אימון יומי בבית' })).toBe('Daily workout at home');
    expect(displayWorkoutTitle({ ...parts, titleLocalized: { he: 'אימון יומי בבית', en: 'A calm day' } }, { ...base, contentLang: 'en', uiLang: 'en', heWithFocus: 'x' })).toBe('A calm day');
    expect(displayWorkoutTitle({ ...parts, title: 'כותרת מהפיירסטור' }, { ...base, contentLang: 'en', uiLang: 'en', heWithFocus: 'כותרת מהפיירסטור' })).toBe('כותרת מהפיירסטור');
    // day focus
    expect(displayWorkoutTitle({ title: 'אימון כוח', dayFocus: 'upper' }, { ...base, contentLang: 'he', uiLang: 'en', heWithFocus: 'אימון עליון' })).toBe('Upper-body workout');
    expect(displayWorkoutTitle({ title: 'אימון בפארק', dayFocus: 'lower' }, { ...base, contentLang: 'he', uiLang: 'en', heWithFocus: 'אימון בפארק · תחתון' })).toBe('Park workout · Lower');
    expect(displayWorkoutTitle({ title: 'כותרת מהפיירסטור', dayFocus: 'push' }, { ...base, contentLang: 'he', uiLang: 'en', heWithFocus: 'כותרת מהפיירסטור · דחיפה' })).toBe('כותרת מהפיירסטור · דחיפה');
    // Hebrew UI never goes through the catalog
    expect(displayWorkoutTitle({ title: 'אימון כוח', dayFocus: 'upper' }, { ...base, contentLang: 'he', uiLang: 'he', heWithFocus: 'אימון עליון' })).toBe('אימון עליון');
  });
});
