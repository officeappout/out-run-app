import { describe, it, expect } from 'vitest';
import type { Park } from '@/features/parks/core/types/park.types';
import { makeT } from '@/lib/i18n/t';
import { community } from '@/messages/ns/community';
import { BLANK_FORM } from '../wizard-constants';
import {
  canAdvanceStep,
  haversineKm,
  inviteLink,
  inviteShareText,
  resolveSubmitMeetingFields,
  sortParksByDistance,
  summaryLocationLabel,
  t,
} from '../wizard-logic';
import type { WizardForm } from '../wizard-types';

const form = (patch: Partial<WizardForm> = {}): WizardForm => ({ ...BLANK_FORM, ...patch });

describe('t (gendered text)', () => {
  it('female form only for female', () => {
    expect(t('צור', 'צורי', 'female')).toBe('צורי');
    expect(t('צור', 'צורי', 'male')).toBe('צור');
    expect(t('צור', 'צורי', null)).toBe('צור');
    expect(t('צור', 'צורי')).toBe('צור');
  });
});

describe('haversineKm / sortParksByDistance', () => {
  it('zero for the same point, ~111km per latitude degree', () => {
    expect(haversineKm(32, 35, 32, 35)).toBe(0);
    expect(haversineKm(32, 35, 33, 35)).toBeCloseTo(111.19, 1);
  });

  it('sorts nearest first without mutating the input', () => {
    const parks = [
      { id: 'far', location: { lat: 33, lng: 35 } },
      { id: 'near', location: { lat: 32.01, lng: 35 } },
      { id: 'mid', location: { lat: 32.5, lng: 35 } },
    ] as unknown as Park[];
    const sorted = sortParksByDistance(parks, { lat: 32, lng: 35 });
    expect(sorted.map((p) => p.id)).toEqual(['near', 'mid', 'far']);
    expect(parks.map((p) => p.id)).toEqual(['far', 'near', 'mid']);
  });
});

describe('canAdvanceStep', () => {
  it('type and privacy steps always advance', () => {
    expect(canAdvanceStep(0, form())).toBe(true);
    expect(canAdvanceStep(4, form())).toBe(true);
    expect(canAdvanceStep(5, form())).toBe(true);
  });
  it('basics needs a 2+ char trimmed name', () => {
    expect(canAdvanceStep(1, form({ name: ' a ' }))).toBe(false);
    expect(canAdvanceStep(1, form({ name: 'ab' }))).toBe(true);
  });
  it('mode needs a choice', () => {
    expect(canAdvanceStep(2, form({ hasMeetups: null }))).toBe(false);
    expect(canAdvanceStep(2, form({ hasMeetups: false }))).toBe(true);
  });
  it('when & where needs a location unless the type is always-private', () => {
    expect(canAdvanceStep(3, form({ groupType: 'neighborhood' }))).toBe(false);
    expect(canAdvanceStep(3, form({ groupType: 'neighborhood', locationSelected: true }))).toBe(true);
    expect(canAdvanceStep(3, form({ groupType: 'family' }))).toBe(true);
  });
});

describe('resolveSubmitMeetingFields', () => {
  it('default coords + no address → no meeting location', () => {
    const r = resolveSubmitMeetingFields(form({ hasMeetups: true }));
    expect(r.effectiveLocation).toBeUndefined();
    expect(r.rulesStr).toBeNull();
    expect(r.effectiveHasMeetups).toBe(true);
  });
  it('custom coords without an address get the manual-pin label', () => {
    const r = resolveSubmitMeetingFields(form({ hasMeetups: true, coords: { lat: 32, lng: 34.8 } }));
    expect(r.effectiveLocation).toEqual({ address: 'מיקום ידני על המפה', location: { lat: 32, lng: 34.8 } });
  });
  it('trims the address and rules', () => {
    const r = resolveSubmitMeetingFields(form({ hasMeetups: true, address: ' הירקון ', rules: ' כבוד ' }));
    expect(r.effectiveLocation).toEqual({ address: 'הירקון', location: { lat: 31.7683, lng: 35.2137 } });
    expect(r.rulesStr).toBe('כבוד');
  });
  it('hasMeetups=false drops location and slots; null counts as true', () => {
    const slots = [{ dayOfWeek: 1, time: '19:00', frequency: 'weekly' as const }];
    const off = resolveSubmitMeetingFields(form({ hasMeetups: false, address: 'x', scheduleSlots: slots }));
    expect(off).toMatchObject({ effectiveHasMeetups: false, effectiveSlots: [], effectiveLocation: undefined });
    const unset = resolveSubmitMeetingFields(form({ hasMeetups: null, scheduleSlots: slots }));
    expect(unset.effectiveHasMeetups).toBe(true);
    expect(unset.effectiveSlots).toBe(slots);
  });
});

describe('invite + summary helpers (text through the community catalog)', () => {
  const tr = makeT('he', community);
  it('builds the join link and share text', () => {
    const link = inviteLink('https://app.example', 'AB12');
    expect(link).toBe('https://app.example/join/AB12');
    expect(inviteShareText(tr, 'רצים', 'AB12', link)).toBe(
      'היי! הקמתי קהילה חדשה "רצים" — בואו להצטרף! 🏃\nקוד הצטרפות: AB12\nhttps://app.example/join/AB12', // gender batch 3: בוא → בואו (decision 7)
    );
  });
  it('summary location keeps the first two address parts', () => {
    expect(summaryLocationLabel(tr, 'רחוב 1, חיפה, ישראל')).toBe('רחוב 1, חיפה');
    expect(summaryLocationLabel(tr, '   ')).toBe('לא נבחר מיקום');
  });
});
