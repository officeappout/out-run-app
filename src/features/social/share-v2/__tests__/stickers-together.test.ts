import { describe, expect, it } from 'vitest';
import { shareInputFromPost, type ShareImageInput } from '../../services/share-image';
import { buildShareModel } from '../model';
import { paletteFor, toneFor } from '../palette';
import { defaultTemplateId, templatesFor } from '../templates/registry';
import { buildTogetherModel, initialsOf, namesLine, togetherFromGroupCtx } from '../together';
import { SHARE_PX } from '../types';

describe('stickers', () => {
  it('a transparent 1080 square, own carousel per activity', () => {
    expect(SHARE_PX.sticker).toEqual({ width: 1080, height: 1080 });
    expect(templatesFor('cardio', 'sticker').map((t) => t.id)).toEqual(['run-sticker', 'run-sticker-stats']);
    expect(templatesFor('strength', 'sticker').map((t) => t.id)).toEqual(['strength-sticker']);
    expect(defaultTemplateId('cardio', true, 'sticker')).toBe('run-sticker');
  });

  it('ink: white (default) / dark / OUT colours, with a shadow', () => {
    expect(toneFor('none', 'night')).toBe('ink-white');
    expect(toneFor('none', 'night', 'dark')).toBe('ink-dark');
    const white = paletteFor('ink-white', 'cardio');
    expect(white.fg).toBe('#ffffff');
    expect(white.shadow).toBeTruthy();
    expect(paletteFor('ink-dark', 'strength').fg).toBe('#0e1419');
    expect(paletteFor('ink-brand', 'strength').logoInk).toBe('#00baf7');
  });
});

describe('together', () => {
  it('initials: two words → two letters, one word → its first two, empty → ?', () => {
    expect(initialsOf('דניאל כהן')).toBe('דכ');
    expect(initialsOf('נועה')).toBe('נו');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf('ג׳ון סמית')).toBe('גס');
  });

  it('names line', () => {
    expect(namesLine(['נועה לוי', 'דניאל כהן'], 2)).toBe('נועה ודניאל');
    expect(namesLine(['נועה', 'דניאל', 'רון', 'מאיה'], 5)).toBe('נועה, דניאל ועוד 3');
    expect(namesLine([], 4)).toBe('4 רצים יחד');
  });

  const ctx = {
    groupName: 'רצי הבוקר',
    collectiveDistanceKm: 10.4,
    participantCount: 2,
    participants: [
      { uid: 'b', name: 'דניאל כהן', distanceKm: 5.2, pace: 5.8 },
      { uid: 'a', name: 'נועה לוי', distanceKm: 0, pace: 0 },
    ],
  };

  it('group ctx → share input (pace min → sec, me marked, 0 → unknown)', () => {
    const t = togetherFromGroupCtx(ctx, 'a')!;
    expect(t.collectiveKm).toBe(10.4);
    expect(t.people[0]).toEqual({ name: 'דניאל כהן', km: 5.2, paceSecPerKm: 348, isMe: false });
    expect(t.people[1]).toEqual({ name: 'נועה לוי', km: undefined, paceSecPerKm: undefined, isMe: true });
    expect(togetherFromGroupCtx({ ...ctx, participantCount: 1, participants: ctx.participants.slice(0, 1) }, 'a')).toBeUndefined();
    expect(togetherFromGroupCtx(null, 'a')).toBeUndefined();
  });

  it('model: me first, initials only, rows only for runners with a distance', () => {
    const m = buildTogetherModel(togetherFromGroupCtx(ctx, 'a'))!;
    expect(m.names).toBe('נועה ודניאל');
    expect(m.subline).toBe('רצנו יחד · רצי הבוקר');
    expect(m.avatars).toEqual(['נל', 'דכ']);
    expect(m.jointKm).toBe('10.4');
    expect(m.people).toEqual([{ name: 'דניאל', initials: 'דכ', km: '5.2', frac: 1, pace: '5:48', isMe: false }]);
  });

  it('more than 4 runners → 4 avatars + count', () => {
    const many = buildTogetherModel({
      participantCount: 6,
      people: ['א ב', 'ג ד', 'ה ו', 'ז ח', 'ט י', 'כ ל'].map((name) => ({ name, km: 3 })),
    })!;
    expect(many.avatars).toHaveLength(4);
    expect(many.moreCount).toBe(2);
    expect(many.people).toHaveLength(4);
  });

  it('the "יחד" story is offered only for a group run, never for a post or strength', () => {
    const run: ShareImageInput = { kind: 'cardio', durationMinutes: 30, distanceKm: 5.2, together: togetherFromGroupCtx(ctx, 'a') };
    expect(templatesFor('cardio', 'story', buildShareModel(run)).map((t) => t.id)).toContain('run-together');
    expect(templatesFor('cardio', 'square', buildShareModel(run)).map((t) => t.id)).not.toContain('run-together');
    const post = shareInputFromPost({ activityCategory: 'cardio', durationMinutes: 30, distanceKm: 5.2 });
    expect(templatesFor('cardio', 'story', buildShareModel(post)).map((t) => t.id)).not.toContain('run-together');
    expect(buildShareModel({ kind: 'strength', durationMinutes: 30, together: run.together }).together).toBeUndefined();
  });

  it('shareInputFromPost keeps together only with ≥ 2 people', () => {
    const t = togetherFromGroupCtx(ctx, 'a');
    expect(shareInputFromPost({ activityCategory: 'cardio', durationMinutes: 30, together: t }).together).toBe(t);
  });
});
