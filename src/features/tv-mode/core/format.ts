/** "m:ss" with Latin digits (a clock reads the same in every locale); minutes can pass 59. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const nf = new Intl.NumberFormat('en-u-nu-latn', { minimumIntegerDigits: 2, useGrouping: false });
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${new Intl.NumberFormat('en-u-nu-latn', { useGrouping: false }).format(m)}:${nf.format(s)}`;
}
