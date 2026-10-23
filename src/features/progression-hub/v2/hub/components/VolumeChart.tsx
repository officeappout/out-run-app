'use client';

/**
 * VolumeChart — a measurable weekly chart for the hub's pages (PG-3 / PG-4):
 * a y axis with round ticks, one column per week with its value on top, and
 * an optional "planned" column drawn as a light outline behind the done one.
 * Time runs left → right (dir=ltr), the current week is highlighted. A
 * screen-reader list carries the same numbers. Presentational, no data.
 */
import { niceAxis } from './volume-axis';

export interface VolumeDatum {
  key: string;
  /** x label ("1", "2"… or a date). */
  label: string;
  done: number;
  /** Planned amount for that week (null = no plan). */
  planned?: number | null;
  current?: boolean;
}

export interface VolumeChartProps {
  data: readonly VolumeDatum[];
  color: string;
  /** Number formatting for the axis and the value labels. */
  format: (v: number) => string;
  height?: number;
  ariaLabel: string;
  /** Screen-reader line per week: "week 3: 8.4 of 12 km". */
  describe: (d: VolumeDatum) => string;
}

export default function VolumeChart({ data, color, format, height = 190, ariaLabel, describe }: VolumeChartProps) {
  const max = Math.max(0, ...data.map((d) => Math.max(d.done, d.planned ?? 0)));
  const axis = niceAxis(max);
  const plotH = height - 40; // value labels on top + x labels below
  const pct = (v: number) => (axis.max > 0 ? Math.min(100, (v / axis.max) * 100) : 0);

  return (
    <figure className="m-0" aria-label={ariaLabel} data-volume-chart>
      <div className="flex gap-2" dir="ltr" aria-hidden>
        {/* y axis */}
        <div className="relative w-8 shrink-0" style={{ height: plotH, marginTop: 18 }}>
          {axis.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute end-0 -translate-y-1/2 text-[10.5px] font-bold tabular-nums text-v2-muted"
              style={{ bottom: `${pct(tick)}%`, transform: 'translateY(50%)' }}
            >
              {format(tick)}
            </span>
          ))}
        </div>
        {/* plot */}
        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height: plotH, marginTop: 18 }}>
            {axis.ticks.map((tick) => (
              <span key={tick} className="absolute inset-x-0 border-t border-dashed border-v2-hairline" style={{ bottom: `${pct(tick)}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-1.5">
              {data.map((d) => (
                <div key={d.key} className="relative flex h-full flex-1 items-end justify-center">
                  {d.planned != null && d.planned > 0 && (
                    <span
                      className="absolute bottom-0 w-full max-w-[26px] rounded-t-[7px]"
                      style={{ height: `${pct(d.planned)}%`, boxShadow: `inset 0 0 0 1.5px ${color}66`, background: `${color}14` }}
                    />
                  )}
                  <span
                    className="relative w-full max-w-[26px] rounded-t-[7px]"
                    style={{ height: `${pct(d.done)}%`, background: color, opacity: d.current ? 1 : 0.78 }}
                  />
                  {d.done > 0 && (
                    <span
                      className={`absolute whitespace-nowrap text-[10.5px] tabular-nums ${d.current ? 'font-black text-v2-ink' : 'font-bold text-v2-ink-2'}`}
                      style={{ bottom: `calc(${pct(Math.max(d.done, d.planned ?? 0))}% + 3px)` }}
                    >
                      {format(d.done)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {data.map((d) => (
              <span
                key={d.key}
                className={`flex-1 text-center text-[11px] tabular-nums ${d.current ? 'font-black text-v2-ink' : 'font-bold text-v2-muted'}`}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.key}>{describe(d)}</li>
        ))}
      </ul>
    </figure>
  );
}
