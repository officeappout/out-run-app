'use client';

/**
 * SparkBars — a tiny bar sparkline next to a number (one bar per day / week).
 * Bars are in DOM order, so in an RTL row the first value sits on the right
 * (Sunday first, like the week strip). The current bar is full colour, past
 * bars lighter, empty / future bars a short grey stub.
 */
export interface SparkBarsProps {
  values: number[];
  color: string;
  /** The current bucket (full colour); later buckets are future. */
  currentIndex?: number;
  width?: number;
  height?: number;
  label?: string;
}

export default function SparkBars({ values, color, currentIndex = values.length - 1, width = 62, height = 26, label }: SparkBarsProps) {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  const n = Math.max(1, values.length);
  const barW = Math.max(3, Math.min(8, Math.floor((width - (n - 1) * 3) / n)));
  return (
    <span
      className="inline-flex shrink-0 items-end justify-between"
      style={{ width, height }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {values.map((v, i) => {
        const has = v > 0 && max > 0;
        const future = i > currentIndex;
        return (
          <span
            key={i}
            className="rounded-[3px]"
            style={{
              width: barW,
              height: has ? Math.max(4, Math.round((v / max) * height)) : 3,
              background: has ? color : '#cbd5e1',
              opacity: future ? 0.25 : has ? (i === currentIndex ? 1 : 0.55) : 0.5,
            }}
          />
        );
      })}
    </span>
  );
}
