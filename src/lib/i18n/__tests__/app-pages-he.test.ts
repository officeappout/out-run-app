/**
 * i18n wave 2 (app pages): the keys this batch added to existing namespaces + the new `pages`
 * namespace — every Hebrew key returns exactly what the page rendered before the extraction. The
 * `old` side is the original literal / template copied verbatim from origin/main.
 * Own file (HOW-TO pitfall 42) so it never conflicts with the namespaces' other key tests.
 *
 * Counted PER PREFIX (other batches add keys to the same namespace files).
 */
import { describe, expect, it } from 'vitest';
import onboardingHe from '@/messages/he/onboarding.json';
import playerHe from '@/messages/he/player.json';
import mapHe from '@/messages/he/map.json';
import communityHe from '@/messages/he/community.json';
import libraryHe from '@/messages/he/library.json';
import pagesHe from '@/messages/he/pages.json';
import commonHe from '@/messages/he/common.json';
import { onboarding } from '@/messages/ns/onboarding';
import { player } from '@/messages/ns/player';
import { map } from '@/messages/ns/map';
import { community } from '@/messages/ns/community';
import { library } from '@/messages/ns/library';
import { pages } from '@/messages/ns/pages';
import { common } from '@/messages/ns/common';
import { makeT } from '../t';

const keysWith = (cat: Record<string, string>, prefix: string) => Object.keys(cat).filter((k) => k.startsWith(prefix));

describe('onboarding · /join/[inviteCode], /join, /onboarding (he)', () => {
  type Key = keyof typeof onboardingHe;
  const t = makeT('he', onboarding);
  const cases: Array<[Key, string]> = [
    ['join.invalid.title', 'הקישור אינו תקף'],
    ['join.invalid.body', 'ייתכן שהקבוצה הוסרה או שהקישור פג תוקפו.'],
    ['join.invalid.cta', 'גלה קבוצות אחרות'],
    ['join.invited', 'הוזמנת להצטרף'],
    ['join.rules.title', 'כללי הקבוצה'],
    ['join.cta', 'הצטרף לקבוצה'],
    ['join.redirectNote', 'תועבר לאפליקציית OutRun כדי להשלים את ההצטרפות'],
    ['join.referral.redirecting', 'מעביר אותך...'],
    ['legacyRedirect.redirecting', 'מעביר לאיזור האישי...'],
  ];
  const special: Key[] = ['join.category', 'join.schedule.slot', 'join.members'];

  it('every join.* / legacyRedirect.* key is covered', () => {
    expect([...cases.map(([k]) => k), ...special].sort()).toEqual(
      [...keysWith(onboardingHe, 'join.'), ...keysWith(onboardingHe, 'legacyRedirect.')].sort(),
    );
  });
  it('plain strings', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
  it('category label = old CATEGORY_CONFIG[c] ?? CATEGORY_CONFIG.other', () => {
    const OLD: Record<string, { label: string }> = {
      walking: { label: 'הליכה' },
      running: { label: 'ריצה' },
      yoga: { label: 'יוגה' },
      calisthenics: { label: 'קליסתניקס' },
      cycling: { label: 'רכיבה' },
      other: { label: 'אחר' },
    };
    for (const c of ['walking', 'running', 'yoga', 'calisthenics', 'cycling', 'other', 'hiit', '']) {
      const old = (OLD[c] ?? OLD.other).label;
      expect(t('join.category', { category: OLD[c] ? c : '' })).toBe(old);
    }
  });
  it('schedule slot + members (old templates)', () => {
    const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    for (const [d, time] of [[0, '07:00'], [6, '18:30'], [9, '10:00']] as const) {
      expect(t('join.schedule.slot', { day: String(DAY_LABELS[d]), time: String(time) })).toBe(
        `יום ${DAY_LABELS[d]} בשעה ${time}`,
      );
    }
    expect(t('join.members', { count: String(1234) })).toBe('1234 חברים כבר בפנים');
    expect(t('join.members', { count: String(3) })).toBe('3 חברים כבר בפנים');
  });
});

describe('player · /session/[token] (he)', () => {
  type Key = keyof typeof playerHe;
  const t = makeT('he', player);
  const cases: Array<[Key, string]> = [
    ['sessionInvite.error.expired', 'הקישור פג תוקף'],
    ['sessionInvite.error.invalid', 'הקישור אינו תקף'],
    ['sessionInvite.error.askHost', 'בקש מהמארח לשלוח קישור חדש'],
    ['sessionInvite.error.openApp', 'פתח את Out'],
    ['sessionInvite.subtitle.walk', 'הוזמנת ללכת ביחד'],
    ['sessionInvite.subtitle.run', 'הוזמנת לרוץ ביחד'],
    ['sessionInvite.subtitle.session', 'הוזמנת להצטרף לאימון'],
    // gender batch 1 (owner decision 7): invite text, recipient unknown → plural
    ['sessionInvite.cta.run', 'בואו לרוץ ביחד'],
    ['sessionInvite.cta.session', 'מצטרפים לאימון'],
  ];
  it('every sessionInvite.* key is covered', () => {
    expect(cases.map(([k]) => k).sort()).toEqual(keysWith(playerHe, 'sessionInvite.').sort());
  });
  it('plain strings (slash forms kept as is)', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
});

describe('map · map error boundary (he)', () => {
  type Key = keyof typeof mapHe;
  const t = makeT('he', map);
  const cases: Array<[Key, string]> = [
    ['mapError.title', 'המפה נתקלה בבעיה'],
    ['mapError.body', 'לרוב זה נפתר לאחר טעינה מחדש. הנתונים שלך נשמרו.'],
    // gender batch 1: mapError.retry is a gender select — pinned in the test below
  ];
  it('every mapError.* key is covered', () => {
    // mapError.retry is a gender select since gender batch 1 — pinned in its own describe below.
    expect([...cases.map(([k]) => k), 'mapError.retry'].sort()).toEqual(keysWith(mapHe, 'mapError.').sort());
  });
  it('plain strings', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
});

describe('community · /league deep link (he)', () => {
  const t = makeT('he', community);
  it('leagueLink.* keys', () => {
    expect(keysWith(communityHe, 'leagueLink.')).toEqual(['leagueLink.opening']);
    expect(t('leagueLink.opening')).toBe('פותח את הליגה שלך…');
  });
});

describe('library · /workouts/[id]/history (he)', () => {
  const t = makeT('he', library);
  const tCommon = makeT('he', common);
  it('workoutHistory.* keys + the common words it reuses', () => {
    expect(keysWith(libraryHe, 'workoutHistory.')).toEqual(['workoutHistory.notFound']);
    expect(t('workoutHistory.notFound')).toBe('האימון לא נמצא');
    expect(commonHe['status.loading']).toBeDefined();
    expect(tCommon('status.loading')).toBe('טוען...');
    expect(tCommon('actions.back')).toBe('חזרה');
  });
});

describe('pages · /settings/refine-levels (he)', () => {
  type Key = keyof typeof pagesHe;
  const t = makeT('he', pages);
  const cases: Array<[Key, string]> = [
    ['refineLevels.title', 'עדכון רמות'],
    ['refineLevels.subtitle', 'כוונו את הרמה לכל קבוצת שרירים'],
    ['refineLevels.saving', 'שומר שינויים...'],
    ['refineLevels.saved.title', 'הרמות עודכנו בהצלחה'],
    ['refineLevels.saved.subtitle', 'חוזרים להגדרות...'],
    ['refineLevels.saveFailed', 'שגיאה בשמירה — נסו שנית'],
  ];
  it('every refineLevels.* key is covered', () => {
    expect(cases.map(([k]) => k).sort()).toEqual(keysWith(pagesHe, 'refineLevels.').sort());
  });
  it('plain strings', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
});

describe('gender batch 1 (21.10.2026) — map error retry follows the gender', () => {
  it('male / female / unknown', async () => {
    const { makeT } = await import('../t');
    const { map } = await import('@/messages/ns/map');
    const tm = makeT('he', map);
    expect(tm('mapError.retry', { gender: 'male' })).toBe('נסה שוב');
    expect(tm('mapError.retry', { gender: 'female' })).toBe('נסי שוב');
    expect(tm('mapError.retry', { gender: 'other' })).toBe('נסו שוב');
  });
});
