/**
 * i18n extraction batch 3: share-v2 (model, together, canvas templates). The file snapshots were recorded from unmodified
 * origin/main (commit 1): the model objects and every string the templates hand to ctx.fillText.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ storage: {}, db: {} }));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn(), deleteObject: vi.fn() }));

import type { ShareImageInput } from '../../services/share-image';
import { buildShareModel, durationStat, shareDateLabel } from '../model';
import { paletteFor, toneFor } from '../palette';
import { SHARE_TEMPLATES_V2 } from '../templates/registry';
import { frameFor, type ShareBackground, type ShareFormat } from '../types';
import { namesLine } from '../together';

const snap = (name: string) => `./__snapshots__/share-v2-i18n/${name}.json`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const STRENGTH: ShareImageInput[] = [
  { kind: 'strength', durationMinutes: 42, title: 'אימון בוקר', programName: 'פלג גוף עליון', levelIndex: 4, levelCount: 12, totalSets: 18, totalReps: 150, exerciseCount: 6, streakDays: 6, parkName: 'גינת מאיר', dateMs: new Date('2026-10-19T06:40:00').getTime(), topExercises: [{ name: 'מתח', sets: 4, setsDone: 4, value: 10 }, { name: 'מקבילים', sets: 3, setsDone: 2 }] as never, moreExercises: 4 },
  { kind: 'strength', durationMinutes: 65 },
  { kind: 'strength', durationMinutes: 0, programName: 'אימון כוח', parkName: 'פארק', topExercises: [{ name: 'שכיבות סמיכה', sets: 3, setsDone: 3 }] as never },
  { kind: 'strength', durationMinutes: 30, title: 'ביתי', moreExercises: 2, exerciseCount: 1 },
];
const RUN: ShareImageInput[] = [
  { kind: 'cardio', durationMinutes: 31, durationSeconds: 1870, title: 'ריצת בוקר', distanceKm: 5.2, paceSecPerKm: 348, paceSplits: [352, 340, 331, 349, 360], routeShape: Array.from({ length: 12 }, (_, i) => i / 12), parkName: 'פארק הירקון', dateMs: new Date('2026-10-19T06:40:00').getTime(), streakDays: 3 },
  { kind: 'cardio', durationMinutes: 20 },
  { kind: 'cardio', durationMinutes: 75, durationSeconds: 4510, distanceKm: 12.04, paceSecPerKm: 400, together: { groupName: 'קבוצת הבוקר', collectiveKm: 12.4, participantCount: 5, people: [{ name: 'נועה כהן', km: 5.2, paceSecPerKm: 348, isMe: true }, { name: 'דניאל לוי', km: 4.8 }, { name: 'שירה בר', km: 3 }, { name: 'יוסי', km: 2 }, { name: 'אורי', km: 1 }] } },
  { kind: 'cardio', durationMinutes: 40, distanceKm: 8, together: { participantCount: 2, people: [{ name: 'נועה', km: 4, isMe: true }, { name: 'דניאל', km: 4 }] } },
  { kind: 'cardio', durationMinutes: 40, distanceKm: 8, together: { participantCount: 3, people: [{ name: '', km: 0 }, { name: '  ' }] } },
];

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

describe('share-v2 (Hebrew)', () => {
  it('model for every input', async () => {
    const out = [...STRENGTH, ...RUN].map((i) => [i, buildShareModel(i)]);
    await expect(json(out)).toMatchFileSnapshot(snap('models'));
  });

  it('date label, duration stat, names line', async () => {
    const out: unknown[] = [];
    for (const ms of [undefined, NaN, 0, new Date('2026-10-18T09:05:00').getTime(), new Date('2026-10-24T23:59:00').getTime()]) for (const t of [false, true]) out.push(['date', ms ?? null, t, shareDateLabel(ms, t) ?? null]);
    for (const [m, s] of [[0, undefined], [42, undefined], [59, undefined], [60, undefined], [125, undefined], [30, 1810], [90, 5410]] as const) for (const clock of [false, true]) out.push(['duration', m, s ?? null, clock, durationStat({ durationMinutes: m, durationSeconds: s }, clock)]);
    out.push(['names', namesLine([], 3), namesLine(['נועה כהן', 'דניאל'], 2), namesLine(['נועה', 'דניאל', 'שירה'], 3), namesLine(['נועה', 'דניאל', 'שירה'], 7)]);
    await expect(json(out)).toMatchFileSnapshot(snap('helpers'));
  });

  it('every template draws the same strings', async () => {
    const out: unknown[] = [];
    const bgs: ShareBackground[] = ['brand', 'plain', 'photo', 'none'];
    for (const kind of ['strength', 'cardio'] as const) {
      const inputs = kind === 'strength' ? STRENGTH : RUN;
      for (const t of SHARE_TEMPLATES_V2[kind]) {
        out.push(['label', t.id, t.label]);
        for (const format of t.formats as ShareFormat[]) for (const input of inputs) {
          const model = buildShareModel(input);
          if (t.available && !t.available(model)) continue;
          for (const bg of bgs) {
            const { ctx, texts } = recorder();
            const palette = paletteFor(toneFor(bg, t.brand), kind);
            try { t.draw({ ctx, frame: frameFor(format), model, palette, bg, photo: null }); } catch (e) { texts.push(`THROW ${(e as Error).message}`); }
            out.push([t.id, format, bg, input.durationMinutes, input.title ?? null, texts]);
          }
        }
      }
    }
    await expect(json(out)).toMatchFileSnapshot(snap('template-text'));
    expect(out.length).toBeGreaterThan(100);
  });
});
