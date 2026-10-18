import { describe, it, expect } from 'vitest';
import { pickCalmSurface, calmCopy } from '../surface';
import { resolveCalmReturn } from '../policy';

const NOW = new Date(2026, 9, 18, 9, 0);
const state = (daysAway: number | null, episode?: unknown) => resolveCalmReturn({ daysAway, episode, now: NOW });

describe('pickCalmSurface — at most ONE visible item per open', () => {
  it('fresh-week card on the open that starts a 7–27 day episode, no level link', () => {
    expect(pickCalmSurface({ state: state(9) })).toEqual({ kind: 'fresh_week_card', showLevelCheckLink: false });
  });

  it('28+ adds the optional level-check link (a link, never a redirect)', () => {
    expect(pickCalmSurface({ state: state(30) })).toEqual({ kind: 'fresh_week_card', showLevelCheckLink: true });
  });

  it('the card beats a makeup offer, and a dismissed card leaves nothing else', () => {
    const s = state(9);
    expect(pickCalmSurface({ state: s, makeup: { ageDays: 1, isLatestMissed: true } }).kind).toBe('fresh_week_card');
    expect(pickCalmSurface({ state: s, freshWeekCardDismissed: true, makeup: { ageDays: 1, isLatestMissed: true } }).kind).toBe('none');
  });

  it('4–6 days: only the card title changes', () => {
    expect(pickCalmSurface({ state: state(5), makeup: { ageDays: 1, isLatestMissed: true } })).toEqual({ kind: 'welcome_back_title' });
  });

  it('0–3 days: makeup only for the latest miss, ≤2 days old', () => {
    expect(pickCalmSurface({ state: state(1), makeup: { ageDays: 1, isLatestMissed: true } })).toEqual({ kind: 'makeup_card' });
    expect(pickCalmSurface({ state: state(2), makeup: { ageDays: 2, isLatestMissed: true } })).toEqual({ kind: 'makeup_card' });
    expect(pickCalmSurface({ state: state(3), makeup: { ageDays: 3, isLatestMissed: true } })).toEqual({ kind: 'none' });
    expect(pickCalmSurface({ state: state(1), makeup: { ageDays: 1, isLatestMissed: false } })).toEqual({ kind: 'none' });
    expect(pickCalmSurface({ state: state(1) })).toEqual({ kind: 'none' });
  });

  it('a later open inside the same episode shows nothing', () => {
    expect(pickCalmSurface({ state: state(1, { startDate: '2026-10-16', tier: 'fresh_start', v: 1 }) })).toEqual({ kind: 'none' });
  });
});

describe('calm copy — no counts, no guilt, gendered variants instead of slashes', () => {
  const all = [...Object.values(calmCopy('male')), ...Object.values(calmCopy('female'))];
  it('never a digit, a slash, "פספסת" or "איפה היית"', () => {
    for (const line of all) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toContain('/');
      expect(line).not.toContain('פספס');
      expect(line).not.toContain('איפה היית');
      expect(line).not.toContain('נעלמת');
    }
  });
  it('female variants differ where Hebrew needs it', () => {
    expect(calmCopy('female').freshWeekBody).toContain('תמשיכי');
    expect(calmCopy('male').freshWeekBody).toContain('תמשיך');
    expect(calmCopy(undefined).freshWeekBody).toBe(calmCopy('male').freshWeekBody);
  });
  it('the owner-approved strings', () => {
    expect(calmCopy('male').freshWeekTitle).toBe('שבוע חדש מתחיל היום');
    expect(calmCopy('male').welcomeBackTitle).toBe('חוזרים בקטנה');
    expect(calmCopy('male').welcomeBackSubtitle).toBe('אימון קליל להיום');
    expect(calmCopy('male').levelCheckLink).toBe('רוצה לבדוק רמה?');
    expect(calmCopy('male').lightVersionBadge).toBe('גרסה קלה לחזרה');
  });
});
