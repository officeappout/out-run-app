import { describe, it, expect } from 'vitest';
import { resolveNotificationText, dropUnresolvedTagSegments } from '../branding.utils';

const group = { triggerType: 'Community_Group_New' as const };
const match = { triggerType: 'Social_Matchmaking' as const };

describe('notification social tags in English', () => {
  it('@סוג_קבוצה maps a known type (code or Hebrew label); free Hebrew stays unresolved', () => {
    expect(resolveNotificationText('@סוג_קבוצה', { ...group, groupTypeLabel: 'קבוצת הליכה' }, 'en')).toBe('walking group');
    expect(resolveNotificationText('@סוג_קבוצה', { ...group, groupTypeLabel: 'running' }, 'en')).toBe('running group');
    expect(resolveNotificationText('@סוג_קבוצה', { ...group, groupTypeLabel: 'קבוצת שחייה' }, 'en')).toBe('@סוג_קבוצה');
    expect(resolveNotificationText('@סוג_קבוצה', { ...group, groupTypeLabel: 'Pilates crew' }, 'en')).toBe('Pilates crew');
    expect(resolveNotificationText('@סוג_קבוצה', group, 'en')).toBe('fitness group');
  });

  it('@יום_מפגש maps weekdays; free Hebrew stays unresolved', () => {
    expect(resolveNotificationText('@יום_מפגש', { ...group, meetingDayFormatted: 'יום שלישי' }, 'en')).toBe('Tuesday');
    expect(resolveNotificationText('@יום_מפגש', { ...group, meetingDayFormatted: 'Friday' }, 'en')).toBe('Friday');
    expect(resolveNotificationText('@יום_מפגש', { ...group, meetingDayFormatted: 'מחרתיים' }, 'en')).toBe('@יום_מפגש');
  });

  it('@רמת_שותף rebuilds "רמה N" from the number; free Hebrew stays unresolved', () => {
    expect(resolveNotificationText('@רמת_שותף', { ...match, partnerLevel: 'רמה 7' }, 'en')).toBe('level 7');
    expect(resolveNotificationText('@רמת_שותף', { ...match, partnerLevel: '4' }, 'en')).toBe('level 4');
    expect(resolveNotificationText('@רמת_שותף', { ...match, partnerLevel: 'מתקדם' }, 'en')).toBe('@רמת_שותף');
  });

  it('@שם_קבוצה is a proper name: passed through as is, even in Hebrew', () => {
    expect(resolveNotificationText('@שם_קבוצה', { ...group, groupName: 'רצי השקמה' }, 'en')).toBe('רצי השקמה');
  });

  it('Hebrew output is unchanged (values pass through)', () => {
    expect(resolveNotificationText('@סוג_קבוצה @יום_מפגש', { ...group, groupTypeLabel: 'קבוצת שחייה', meetingDayFormatted: 'מחרתיים' })).toBe('קבוצת שחייה מחרתיים');
    expect(resolveNotificationText('@רמת_שותף', { ...match, partnerLevel: 'רמה 7' })).toBe('רמה 7');
  });
});

describe('dropUnresolvedTagSegments', () => {
  it('drops only the lines / sentences that still carry a tag', () => {
    expect(dropUnresolvedTagSegments('Keep your core tight.\nGreat for @מטרה goals.\nBreathe out.')).toBe('Keep your core tight.\nBreathe out.');
    expect(dropUnresolvedTagSegments('Keep your back straight. Built for @מטרה. Breathe out.')).toBe('Keep your back straight. Breathe out.');
    expect(dropUnresolvedTagSegments('Clean text, no tags.')).toBe('Clean text, no tags.');
  });
});
