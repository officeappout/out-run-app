/** Round y-axis ticks for VolumeChart (pure): 0 … max in 3–4 steps of 1/2/2.5/5 × 10ⁿ. */
export function niceAxis(max: number, steps = 3): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0] };
  const raw = max / steps;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { max: top, ticks };
}
