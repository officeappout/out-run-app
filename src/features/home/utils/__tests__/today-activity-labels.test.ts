import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { todayCardFallbackTitle, todayCardShortLabel, HYBRID_TITLE } from '../today-activity-labels';
import { makeT } from '@/lib/i18n/t';
import { profile } from '@/messages/ns/profile';

/** G7.3 (Sderot pilot) — a hybrid workout never shows strength copy on home / profile. */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('home today card labels', () => {
  it('hybrid (styled as strength) → "אימון משולב" / "משולב", never "כוח"', () => {
    expect(todayCardFallbackTitle('strength', 'hybrid')).toBe(HYBRID_TITLE);
    expect(todayCardFallbackTitle('strength', undefined, 'hybrid')).toBe('אימון משולב');
    expect(todayCardShortLabel('strength', 'hybrid')).toBe('משולב');
  });
  it('every other category is unchanged', () => {
    expect(todayCardFallbackTitle('strength', 'strength')).toBe('אימון כוח');
    expect(todayCardFallbackTitle('strength', 'recovery')).toBe('אימון כוח');
    expect(todayCardFallbackTitle('cardio', 'cardio')).toBe('אימון אירובי');
    expect(todayCardFallbackTitle('maintenance')).toBe('גמישות ותנועתיות');
    expect(todayCardShortLabel('strength', 'strength')).toBe('כוח');
    expect(todayCardShortLabel('cardio', 'walking')).toBe('אירובי');
    expect(todayCardShortLabel('maintenance')).toBe('גמישות');
  });
  it('home uses it on every path (rich fallback, later cards, past days) and tags hybrid docs', () => {
    const page = src('../../../../app/home/page.tsx');
    expect(page).not.toContain('TODAY_ACTIVITY_CATEGORY_LABEL[');
    expect(page.match(/todayCardFallbackTitle\(displayCategory, w\.category, w\.workoutType\)/g)?.length).toBe(2);
    expect(page.match(/w\.category === 'hybrid' \? 'hybrid'/g)?.length).toBe(2);
    expect(src('../../components/TodayActivityCard.tsx')).toContain('todayCardShortLabel(category, workoutType)');
  });
});

describe('profile workout grid', () => {
  it('hybrid has its own tile ("אימון משולב"), no longer the default "ריצה"', () => {
    const grid = src('../../../profile/components/WorkoutGrid.tsx');
    expect(grid).toContain("case 'hybrid':");
    // i18n wave 2: the tile label is the `profile.grid.type` select (src/messages/he/profile.json).
    expect(grid).toContain("t('profile.grid.type', { type })");
    const t = makeT('he', profile);
    expect(t('profile.grid.type', { type: 'hybrid' })).toBe('אימון משולב');
    expect(t('profile.grid.type', { type: 'running' })).toBe('ריצה');
  });
});
