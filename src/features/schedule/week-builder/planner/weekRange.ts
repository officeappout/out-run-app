/** "25.10–31.10" — a dated week's range from its 7 keys ('YYYY-MM-DD'). Pure. */
export function weekRangeHe(keys: readonly string[]): string {
  if (keys.length < 7) return '';
  const short = (k: string) => `${Number(k.slice(8, 10))}.${Number(k.slice(5, 7))}`;
  return `${short(keys[0])}–${short(keys[6])}`;
}
