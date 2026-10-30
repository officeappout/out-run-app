import { beforeAll, describe, it, expect } from 'vitest';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { makeT } from '@/lib/i18n/t';
import { player } from '@/messages/ns/player';
import { adaptiveChangeLine } from '../adaptive-change-lines';
import type { AdaptiveChange } from '@/features/workout-engine/logic/adaptive/adaptive-change';

const base: AdaptiveChange = {
  exerciseId: 'x', exerciseName: 'x', kind: 'up', from: 8, to: 9, doneMin: 8, doneMax: 8, isHold: false, overshoot: false,
};
const he = makeT('he', player);

describe('adaptiveChangeLine — one template, any exercise', () => {
  it('Hebrew', () => {
    expect(adaptiveChangeLine(he, base)).toBe('עמדת ביעד. בפעם הבאה 9 חזרות במקום 8.');
    expect(adaptiveChangeLine(he, { ...base, isHold: true, from: 30, to: 35, doneMin: 30, doneMax: 30 }))
      .toBe('עמדת ביעד. בפעם הבאה 35 שניות במקום 30.');
    expect(adaptiveChangeLine(he, { ...base, kind: 'harder_variation', overshoot: true, doneMin: 13, doneMax: 15 }))
      .toBe('עשית 13 עד 15 חזרות, הרבה מעל הטווח. בפעם הבאה ננסה גרסה קשה יותר.');
    expect(adaptiveChangeLine(he, { ...base, kind: 'extra_set' })).toBe('פעמיים ברצף בראש הטווח. בפעם הבאה סט נוסף.');
    expect(adaptiveChangeLine(he, { ...base, kind: 'down', from: 8, to: 6 })).toBe('היה קשה הפעם. בפעם הבאה 6 חזרות, כדי לבנות בסיס.');
  });
  beforeAll(async () => { await ensureCatalog('en', 'player'); });
  it('English', () => {
    expect(adaptiveChangeLine(makeT('en', player), base)).toBe('You hit the target. Next time 9 reps instead of 8.');
  });
});
