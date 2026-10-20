/**
 * Israel wall-clock helpers for the live engine (pure). The engine reasons in Israel days
 * (date keys, day of week, "HH:MM" planned starts) whatever the server's time zone is.
 */
const TZ = 'Asia/Jerusalem';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface IsraelParts {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = Sunday */
  dow: number;
  hour: number;
  minute: number;
  /** minutes since local midnight */
  minuteOfDay: number;
}

export function israelParts(ms: number): IsraelParts {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, dow, hour, minute, minuteOfDay: hour * 60 + minute };
}

/** Epoch ms of an Israel wall-clock time (date 'YYYY-MM-DD' + minutes since midnight). */
export function israelMs(date: string, minuteOfDay: number): number {
  const [y, m, d] = date.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  // Two passes settle the offset (Israel is UTC+2 / +3) also around DST switches.
  let guess = asUtc - 2 * 3_600_000;
  for (let k = 0; k < 2; k++) {
    const p = israelParts(guess);
    const shownUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.hour, p.minute);
    guess += asUtc - shownUtc;
  }
  return guess;
}

export const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** date ± n days (calendar arithmetic on the key, no time zone involved). */
export function addDays(date: string, n: number): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** The Sunday that starts the week of `date` (Israeli week). */
export const weekStartOf = (date: string, dow: number) => addDays(date, -dow);
