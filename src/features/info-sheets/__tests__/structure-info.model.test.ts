import { describe, it, expect } from 'vitest';
import { buildStructureInfo, structureChips } from '../structure/structure-info.model';
import { structureCopy } from '../structure/structure-info.copy';
import { makeT } from '@/lib/i18n/t';
import { library } from '@/messages/ns/library';

const t = makeT('he', library, { gender: 'male' });
const sec = (id: string, title: string, exerciseCount = 2) => ({ id, title, exerciseCount });

describe('buildStructureInfo (board TutStructureCard)', () => {
  it('warm-up → main blocks → stretches, in that order', () => {
    const m = buildStructureInfo([
      sec('warmup', 'חימום'),
      sec('superset-0', 'סופר סט'),
      sec('regular-1', 'סט רגיל', 1),
      sec('cooldown', 'מתיחות', 3),
    ])!;
    expect(m.parts.map((p) => p.kind)).toEqual(['warmup', 'main', 'cooldown']);
    expect(m.parts[1]).toEqual({ kind: 'main', sectionIds: ['superset-0', 'regular-1'], title: 'סופר סט', exerciseCount: 3 });
    expect(m.mainBlocks).toBe(2);
    expect(structureChips(m)).toEqual(['warmup', 'cooldown']);
  });

  it('tabata / timed blocks are part of the main part', () => {
    const m = buildStructureInfo([sec('regular-0', 'סט רגיל'), sec('tabata', 'טבטה')])!;
    expect(m.parts).toHaveLength(1);
    expect(m.mainBlocks).toBe(2);
  });

  it('fallback: no warm-up / no stretches → their steps and chips go', () => {
    const m = buildStructureInfo([sec('regular-0', 'סט רגיל')])!;
    expect(m).toMatchObject({ hasWarmup: false, hasCooldown: false });
    expect(structureChips(m)).toEqual(['swap', 'rest']);
    const c = structureCopy(m, t, { methodInfo: false });
    expect(c.steps).toHaveLength(1);
    expect(c.lead).toBe('האימון בנוי מחלק אחד.');
  });

  it('empty sections are ignored; no main block → no "i"', () => {
    expect(buildStructureInfo([sec('warmup', 'חימום'), sec('regular-0', 'סט רגיל', 0), sec('cooldown', 'מתיחות')])).toBeNull();
    expect(buildStructureInfo([])).toBeNull();
  });

  it('copy: the real section titles, the method line only with the method sheets on', () => {
    const m = buildStructureInfo([sec('warmup', 'חימום'), sec('regular-0', 'סט רגיל'), sec('cooldown', 'מתיחות')])!;
    const off = structureCopy(m, t, { methodInfo: false });
    expect(off.lead).toBe('האימון בנוי משלושה חלקים, בסדר קבוע.');
    expect(off.steps[0]).toBe('חימום מכין את הגוף. כבר חם? לוחצים על ״פעיל״ והוא יורד מהאימון.');
    expect(off.steps[2]).toBe('מתיחות בסוף, כדי לשחרר את השרירים.');
    expect(off.steps[1]).not.toContain('i ');
    const on = structureCopy(m, t, { methodInfo: true });
    expect(on.lead).toContain('לכל בלוק יש i משלו');
    expect(on.steps[1]).toContain('ה-i ליד בלוק');
    for (const s of [on.title, on.lead, ...on.steps, ...on.chips]) expect(s).not.toMatch(/[—–]/);
  });
});
