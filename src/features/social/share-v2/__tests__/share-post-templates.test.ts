import { beforeAll, describe, expect, it } from 'vitest';
import type { ShareImageInput } from '../../services/share-image';
import { buildShareModel } from '../model';
import { paletteFor, toneFor } from '../palette';
import { templatesFor } from '../templates/registry';
import { frameFor, type ShareFormat } from '../types';

/** Boards PostShare / PostPhotoShare / PostStickers: the post family's new templates and stickers. */
function recorder() {
  const texts: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 7 });
      if (prop === 'fillText' || prop === 'strokeText') return (s: string) => { texts.push(String(s)); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value) { target[prop] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

beforeAll(() => { (globalThis as unknown as { Path2D: unknown }).Path2D = class { addPath() {} moveTo() {} lineTo() {} closePath() {} bezierCurveTo() {} arc() {} }; });

const RUN: ShareImageInput = { kind: 'cardio', durationMinutes: 31, durationSeconds: 1870, title: 'ריצת בוקר', distanceKm: 5.2, paceSecPerKm: 348, paceSplits: [352, 340, 331, 349, 360], dateMs: new Date('2026-10-31T06:40:00').getTime() };
const STRENGTH: ShareImageInput = { kind: 'strength', durationMinutes: 42, title: 'אימון בוקר', levelIndex: 4, levelCount: 12, totalSets: 18, exerciseCount: 6 };
const COMBINED: ShareImageInput = { kind: 'strength', durationMinutes: 30, title: 'הליכה + כוח', hybrid: { walkKm: 2.1, runKm: 0, strengthSets: 8 } };

const NEW_IDS = ['run-splits', 'cardio-combined-card', 'strength-combined-card', 'strength-sticker-list', 'strength-sticker-chips', 'strength-sticker-day', 'strength-sticker-combined', 'cardio-sticker-list', 'cardio-sticker-chips', 'cardio-sticker-day', 'cardio-sticker-side', 'cardio-sticker-combined'];

function drawAll(input: ShareImageInput) {
  const model = buildShareModel(input, { postV1: true });
  const drawn: Record<string, string[]> = {};
  for (const format of ['story', 'square', 'sticker'] as ShareFormat[]) {
    for (const t of templatesFor(input.kind, format, model)) {
      if (!NEW_IDS.includes(t.id)) continue;
      const { ctx, texts } = recorder();
      t.draw({ ctx, frame: frameFor(format), model, palette: paletteFor(toneFor(format === 'sticker' ? 'none' : 'brand', t.brand), input.kind), bg: format === 'sticker' ? 'none' : 'brand', photo: null });
      drawn[`${t.id}/${format}`] = texts;
    }
  }
  return { model, drawn };
}

describe('post family templates (enable_workout_post_v1)', () => {
  it('run: the splits table lists every km with its pace, plus list / chips / day / side stickers', () => {
    const { model, drawn } = drawAll(RUN);
    expect(model.splits?.labels).toEqual(['5:52', '5:40', '5:31', '5:49', '6:00']);
    expect(drawn['run-splits/story']).toEqual(expect.arrayContaining(['1', '5:52', '3', '5:31']));
    expect(Object.keys(drawn)).toEqual(expect.arrayContaining(['cardio-sticker-list/sticker', 'cardio-sticker-chips/sticker', 'cardio-sticker-day/sticker', 'cardio-sticker-side/sticker']));
    expect(Object.keys(drawn).some((k) => k.includes('combined'))).toBe(false);
  });
  it('strength: list / chips / day stickers, no combined templates', () => {
    const { drawn } = drawAll(STRENGTH);
    expect(Object.keys(drawn).sort()).toEqual(['strength-sticker-chips/sticker', 'strength-sticker-day/sticker', 'strength-sticker-list/sticker']);
  });
  it('combined: its own card (story / square) and the combined sticker', () => {
    const { drawn } = drawAll(COMBINED);
    expect(Object.keys(drawn)).toEqual(expect.arrayContaining(['strength-combined-card/story', 'strength-combined-card/square', 'strength-sticker-combined/sticker']));
    expect(drawn['strength-combined-card/story']).toEqual(expect.arrayContaining(['2.1', '8']));
  });
  it('flag off: none of the new templates is offered', () => {
    const model = buildShareModel(RUN);
    for (const f of ['story', 'square', 'sticker'] as ShareFormat[]) {
      expect(templatesFor('cardio', f, model).some((t) => NEW_IDS.includes(t.id))).toBe(false);
    }
  });
});
