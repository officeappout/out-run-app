/**
 * CreateGroupWizard — pure logic (no React, no Firestore). Unit-tested in
 * __tests__/wizard-logic.test.ts.
 */
import type { Park } from '@/features/parks/core/types/park.types';
import type { ScheduleSlot } from '@/types/community.types';
import { ALWAYS_PRIVATE_TYPES } from './wizard-constants';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import type { CommunityKey } from '@/messages/ns/community';
import type { WizardForm } from './wizard-types';

/** The caller's `community` translator (from useT / makeT). */
export type CommunityT = (key: CommunityKey, values?: MessageValues) => string;

/** Gender-aware text helper. Returns the female form when gender === 'female', male form otherwise. */
export function t(male: string, female: string, gender?: string | null): string {
  return gender === 'female' ? female : male;
}

// ── Haversine distance (km) between two lat/lng points ───────────────────────
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Parks nearest-first from `from` (a new array; the input is untouched). */
export function sortParksByDistance(parks: Park[], from: { lat: number; lng: number }): Park[] {
  return [...parks].sort(
    (a, b) =>
      haversineKm(from.lat, from.lng, a.location.lat, a.location.lng) -
      haversineKm(from.lat, from.lng, b.location.lat, b.location.lng),
  );
}

/** Whether the footer's "המשך" is enabled on `step`. */
export function canAdvanceStep(step: number, form: WizardForm): boolean {
  if (step === 0) return true;                                                    // StepType
  if (step === 1) return form.name.trim().length >= 2;                           // StepBasics
  if (step === 2) return form.hasMeetups !== null;                               // StepMode
  // StepWhenWhere (step 3) — optional for non-geographic types
  if (step === 3) return ALWAYS_PRIVATE_TYPES.has(form.groupType) || form.locationSelected;
  if (step === 4) return true;                                                    // StepPrivacy
  return true;
}

export interface SubmitMeetingFields {
  rulesStr: string | null;
  effectiveHasMeetups: boolean;
  effectiveSlots: ScheduleSlot[];
  effectiveLocation: { address?: string; location: { lat: number; lng: number } } | undefined;
}

/** Location / schedule / rules exactly as the submit writes them. */
export function resolveSubmitMeetingFields(form: WizardForm): SubmitMeetingFields {
  const DEFAULT_LAT = 31.7683;
  const DEFAULT_LNG = 35.2137;
  const hasCustomCoords =
    form.coords.lat !== DEFAULT_LAT || form.coords.lng !== DEFAULT_LNG;
  const addressStr =
    form.address.trim() ||
    (hasCustomCoords ? 'מיקום ידני על המפה' : ''); // i18n-allow-hebrew: data — written to meetingLocation.address

  const meetingLocation =
    addressStr || hasCustomCoords
      ? {
          ...(addressStr ? { address: addressStr } : {}),
          location: { lat: form.coords.lat, lng: form.coords.lng },
        }
      : undefined;

  const rulesStr = form.rules.trim() || null;

  // hasMeetups=false → no location, no schedule slots
  const effectiveHasMeetups = form.hasMeetups ?? true;
  const effectiveSlots = effectiveHasMeetups ? form.scheduleSlots : [];
  const effectiveLocation = effectiveHasMeetups ? meetingLocation : undefined;

  return { rulesStr, effectiveHasMeetups, effectiveSlots, effectiveLocation };
}

/** The join link shared from the success screen. */
export function inviteLink(origin: string, inviteCode: string): string {
  return `${origin}/join/${inviteCode}`;
}

/** The WhatsApp / native-share text for a freshly created community. */
export function inviteShareText(t: CommunityT, name: string, inviteCode: string, link: string): string {
  return t('createGroup.success.shareText', { name, inviteCode, link });
}

/** The finalize summary's "מיקום" value: the first two address parts. */
export function summaryLocationLabel(t: CommunityT, address: string): string {
  return address.trim()
    ? address.split(',').slice(0, 2).join(',').trim()
    : t('createGroup.finalize.summary.noLocation');
}
