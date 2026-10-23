/**
 * i18n wave 2B — namespace `coach`, keys `note.*` / `title.weather.*` (coach-note.ts, workout-metadata.service.ts).
 * The old number formatters are re-declared here exactly as they were and compared with the catalog-backed ones;
 * counts >= 1000 go in as String() so ICU never adds a thousands separator.
 */
import { describe, expect, it } from 'vitest';
import { coach } from '@/messages/ns/coach';
import { fmtRest } from '@/features/workout-engine/services/coach-note';
import { makeT } from '../t';

const t = makeT('he', coach);
type R = { min: number; max: number };

const fmtRange = (r: R) => (r.min === r.max ? `${r.min}` : `${r.min} עד ${r.max}`);
function fmtMinutes(sec: number): string {
  const halves = Math.round(sec / 30);
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 0) return 'חצי דקה';
  if (whole === 1) return half ? 'דקה וחצי' : 'דקה';
  return half ? `${whole} דקות וחצי` : `${whole} דקות`;
}
const fmtRestValue = (sec: number) => (sec >= 90 ? fmtMinutes(sec) : `${Math.round(sec / 15) * 15} שניות`);
function oldFmtRest(r: R): string {
  if (r.max - r.min <= 60) return fmtRestValue((r.min + r.max) / 2);
  if (r.max < 120) return `${fmtRange(r)} שניות`;
  const lo = r.min >= 60 ? fmtMinutes(r.min) : `${Math.round(r.min / 15) * 15} שניות`;
  const hi = fmtMinutes(r.max);
  if (lo === hi) return lo;
  const a = Math.round(r.min / 30) / 2;
  const b = Math.round(r.max / 30) / 2;
  if (Number.isInteger(a) && Number.isInteger(b) && a >= 2) return `${a} עד ${b} דקות`;
  return `${lo} עד ${hi}`;
}

describe('coach note — catalog parity with the old template literals', () => {
  it('plain fmt strings', () => {
    const cases: Array<[Parameters<typeof t>[0], string]> = [
      ['note.fmt.sets.one', 'סט אחד'],
      ['note.fmt.reps.one', 'חזרה אחת'],
      ['note.fmt.minutes.halfMinute', 'חצי דקה'],
      ['note.fmt.minutes.oneAndHalf', 'דקה וחצי'],
      ['note.fmt.minutes.one', 'דקה'],
      ['title.weather.rainHome', 'גשום היום? אימון לסלון'],
      ['title.weather.heat', 'אימון קצר בצל'],
      ['title.weather.cold', 'מתחממים טוב ויוצאים'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values, counts 0/1/2/many/1000+', () => {
    for (const n of [0, 1, 2, 5, 12, 99]) {
      const old = n === 1 ? 'תרגיל אחד' : `${n} תרגילים`;
      expect(t('note.fmt.exercises', { n })).toBe(old);
    }
    for (const n of [2, 3, 10, 1000, 123456]) {
      expect(t('note.fmt.minutes.n', { n: String(n) })).toBe(`${n} דקות`);
      expect(t('note.fmt.minutes.nAndHalf', { n: String(n) })).toBe(`${n} דקות וחצי`);
      expect(t('note.fmt.seconds', { value: String(n) })).toBe(`${n} שניות`);
      expect(t('note.fmt.sets.many', { range: String(n) })).toBe(`${n} סטים`);
      expect(t('note.fmt.reps.many', { range: String(n) })).toBe(`${n} חזרות`);
      expect(t('note.fmt.minutesRange', { a: String(n), b: String(n + 1) })).toBe(`${n} עד ${n + 1} דקות`);
      expect(t('note.fmt.range', { min: String(n), max: String(n + 1) })).toBe(`${n} עד ${n + 1}`);
    }
  });

  it('fmtRest matches the old implementation on a grid', () => {
    for (let min = 0; min <= 600; min += 5) {
      for (let max = min; max <= 900; max += 15) expect(fmtRest({ min, max })).toBe(oldFmtRest({ min, max }));
    }
  });
});
