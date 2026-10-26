/**
 * Namespace `common` — flame tier labels (enable_flame_tiers_v1, 26.10.2026): the aria labels
 * of the flame levels and the "started" mark. Hebrew renders as written, en has the same keys,
 * nothing addresses the user (no gender select needed).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/common.json';
import en from '@/messages/en/common.json';
import { common } from '@/messages/ns/common';
import { makeT } from '../t';

const t = makeT('he', common);
const KEYS = Object.keys(he).filter((k) => k.startsWith('flame.'));

describe('common (he) — flame tiers', () => {
  it('has exactly the keys the flame cells use', () => {
    expect([...KEYS].sort()).toEqual(['flame.level.1', 'flame.level.2', 'flame.level.3', 'flame.started']);
  });
  it('renders the copy', () => {
    expect(t('flame.level.1')).toBe('להבה קטנה: יום שנספר ברצף');
    expect(t('flame.level.2')).toBe('להבה בינונית: יום ברצף ויעד יומי אחד הושלם');
    expect(t('flame.level.3')).toBe('להבה גדולה: יום ברצף, יעד הכוח ויעד האירובי הושלמו');
    expect(t('flame.started')).toBe('אימון התחיל, עדיין מתחת לרף היומי');
  });
  it('en has the same keys', () => {
    expect(Object.keys(en).filter((k) => k.startsWith('flame.')).sort()).toEqual([...KEYS].sort());
  });
  it('gender-neutral: no gender select', () => {
    for (const k of KEYS) expect((he as Record<string, string>)[k]).not.toContain('gender');
  });
});
