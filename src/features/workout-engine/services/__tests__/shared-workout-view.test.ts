import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { sharedDocToGeneratedWorkout } from '../shared-workout-plan';
import {
  applyCatalogMedia, heroMediaOf, idsMissingImage, inviteDayKind, inviteView, senderOf, sharedVariant,
} from '../shared-workout-view';
import he from '@/messages/he/library.json';
import { library } from '@/messages/ns/library';
import { makeT } from '@/lib/i18n/t';

const ex = (id: string, extra: Record<string, unknown> = {}) => ({
  exerciseId: id, name: `ex-${id}`, sets: 3, reps: 10, isTimeBased: false, restSeconds: 60, ...extra,
});
const base = { title: 'T', description: 'D', difficulty: 2, estimatedDuration: 30, totalPlannedSets: 9, isRecovery: false, structure: 'standard' };
const T0 = Date.UTC(2026, 9, 22, 12, 0);

describe('variant selection', () => {
  it('invite only with a usable start time', () => {
    expect(sharedVariant({ invite: { startsAtMs: T0 } })).toBe('invite');
    expect(sharedVariant({ invite: { startsAtMs: NaN } })).toBe('share');
    expect(sharedVariant({})).toBe('share');
    expect(sharedVariant(null)).toBe('share');
  });
});

describe('sender + invite mapping', () => {
  it('first name and gender, unknown -> other', () => {
    expect(senderOf({ creatorName: ' נועה כהן ', creatorGender: 'female' })).toEqual({ name: 'נועה', gender: 'female' });
    expect(senderOf({ creatorName: 'דני' })).toEqual({ name: 'דני', gender: 'other' });
    expect(senderOf({ creatorName: '  ' })).toBeNull();
    expect(senderOf({})).toBeNull();
  });
  it('invite view: 3 avatars max, count at least the listed, same-origin join path only', () => {
    const v = inviteView({
      invite: {
        startsAtMs: T0, placeName: ' גינת הירקון ', goingCount: 5, joinPath: '/session/abc',
        going: [{ name: 'דני' }, { name: 'נועה', photoURL: 'http://p' }, { name: 'יובל' }, { name: 'עומר' }],
      },
    })!;
    expect(v.avatars.map((a) => a.initial)).toEqual(['ד', 'נ', 'י']);
    expect(v.avatars[1].photoURL).toBe('http://p');
    expect(v.goingCount).toBe(5);
    expect(v.placeName).toBe('גינת הירקון');
    expect(v.joinPath).toBe('/session/abc');
    expect(inviteView({ invite: { startsAtMs: T0, joinPath: 'https://evil.example' } })!.joinPath).toBeNull();
    expect(inviteView({ invite: { startsAtMs: T0, going: [{ name: 'א' }, { name: 'ב' }] } })!.goingCount).toBe(2);
    expect(inviteView({})).toBeNull();
  });
  it('day kind', () => {
    const now = new Date(2026, 9, 22, 20, 0).getTime();
    expect(inviteDayKind(new Date(2026, 9, 22, 23, 0).getTime(), now)).toBe('today');
    expect(inviteDayKind(new Date(2026, 9, 23, 7, 0).getTime(), now)).toBe('tomorrow');
    expect(inviteDayKind(new Date(2026, 9, 25, 7, 0).getTime(), now)).toBe('date');
  });
});

describe('media mapping', () => {
  const plan = sharedDocToGeneratedWorkout({
    ...base,
    exercises: [ex('w', { exerciseRole: 'warmup', imageUrl: 'http://warm' }), ex('a'), ex('b', { imageUrl: 'http://b' })],
  } as never)!;
  it('lists only exercises lacking a thumbnail and fills them from the catalog by id', () => {
    expect(idsMissingImage(plan)).toEqual(['a']);
    const filled = applyCatalogMedia(plan, { a: { imageUrl: 'http://a', videoUrl: 'http://a.mp4' }, b: { imageUrl: 'http://other' } });
    expect(idsMissingImage(filled)).toEqual([]);
    expect((filled.exercises[1].method as any).media.imageUrl).toBe('http://a');
    expect((filled.exercises[2].method as any).media.imageUrl).toBe('http://b'); // never overwrites
  });
  it('hero prefers the main block over warmup', () => {
    expect(heroMediaOf(plan).imageUrl).toBe('http://b');
    const filled = applyCatalogMedia(plan, { a: { imageUrl: 'http://a', videoUrl: 'http://a.mp4' } });
    expect(heroMediaOf(filled)).toEqual({ imageUrl: 'http://a', videoUrl: 'http://a.mp4' });
    expect(heroMediaOf(sharedDocToGeneratedWorkout({ ...base, exercises: [ex('x')] } as never)!)).toEqual({});
  });
});

describe('copy (library catalog, gendered ICU)', () => {
  const t = makeT('he', library);
  it('share + invite titles per sender gender, neutral for unknown', () => {
    expect(t('sharedWorkout.link.share.title', { name: 'נועה', gender: 'female' })).toBe('נועה שיתפה איתך אימון שאהבה');
    expect(t('sharedWorkout.link.share.title', { name: 'דני', gender: 'male' })).toBe('דני שיתף איתך אימון שאהב');
    expect(t('sharedWorkout.link.share.title', { name: 'דנה', gender: 'other' })).toBe('אימון משותף מאת דנה');
    expect(t('sharedWorkout.link.invite.title', { name: 'דני', gender: 'male' })).toBe('דני הזמין אותך להתאמן');
    expect(t('sharedWorkout.link.invite.title', { name: 'נועה', gender: 'female' })).toBe('נועה הזמינה אותך להתאמן');
    expect(t('sharedWorkout.link.invite.going', { count: 3 })).toBe('3 מגיעים');
    expect(t('sharedWorkout.link.invite.going', { count: 1 })).toBe('מגיע אחד');
    expect(t('sharedWorkout.link.invite.when', { day: 'מחר', time: '07:00' })).toBe('מחר · 07:00');
    expect(t('sharedWorkout.link.cta.join')).toBe('מצטרפים לאימון');
    expect(t('sharedWorkout.link.cta.save')).toBe('שמירה לאימונים שלי');
  });
  it('13 link keys', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('sharedWorkout.link.'))).toHaveLength(13);
  });
});

describe('client wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('../../../../app/workouts/[id]/WorkoutPreviewClient.tsx', import.meta.url)), 'utf8');
  it('variants and footer only behind the flag path; banner kept', () => {
    expect(src).toContain('richPreview ? (\n        <SharedLinkFooter');
    expect(src).toContain('<SharedLinkContext variant={variant}');
    expect(src).toContain('{showBanner && <SmartAppBanner');
  });
});
