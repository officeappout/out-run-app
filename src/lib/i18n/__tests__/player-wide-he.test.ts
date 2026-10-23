/** Namespace `player`, wide.* (enable_wide_player_v1): Hebrew copy pinned + key count. */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/player.json';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const t = makeT('he', player);

describe('player wide.* (he)', () => {
  it('key count', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('wide.')).length).toBe(14);
  });
  it('strings and values', () => {
    expect(t('wide.nextUp')).toBe('הבא בתור');
    expect(t('wide.done')).toBe('סיימתי סט');
    expect(t('wide.set', { current: String(2), total: String(1234) })).toBe('סט 2 מתוך 1234');
    expect(t('wide.target', { target: String(12) })).toBe('יעד: 12');
    expect(t('wide.superset', { partner: 'משיכות' })).toBe('סופרסט × משיכות');
    expect(t('wide.startSide', { side: 'צד ימין' })).toBe('התחל צד ימין');
    expect(t('wide.start')).toBe('התחלה');
    expect(t('wide.perSide')).toBe('(לכל צד)');
    expect(t('wide.swap')).toBe('החלפת תרגיל');
    expect(t('wide.keys.primary')).toBe('רווח – סיימתי / השהיה');
    expect(t('wide.keys.next')).toBe('→ הבא');
    expect(t('wide.keys.back')).toBe('← חזרה');
    expect(t('wide.keys.minimize')).toBe('Esc – מזעור');
    expect(t('wide.keys.label')).toBe('קיצורי מקלדת');
  });
});
