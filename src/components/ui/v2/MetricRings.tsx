'use client';

/**
 * MetricRings — the v2 summary overview's three rings: value + unit inside,
 * label (and an optional "5/6 בטווח" line) below. Screenshot-friendly.
 * `pct` is how full the ring is; pass 100 when there is no target to
 * measure against (a closed ring = done), never an invented ratio.
 */

export interface MetricRing {
  key: string;
  value: string;
  unit?: string;
  label: string;
  sub?: string | null;
  /** 0–100. */
  pct: number;
  color: string;
}

const SIZE = 92;
const STROKE = 10;

function Ring({ ring }: { ring: MetricRing }) {
  const r = SIZE / 2 - STROKE / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number.isFinite(ring.pct) ? ring.pct : 0));
  const cx = SIZE / 2;
  const long = ring.value.length > 4;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={ring.color} strokeOpacity={0.16} strokeWidth={STROKE} />
          {pct > 0 && (
            <circle
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct / 100)}
              transform={`rotate(-90 ${cx} ${cx})`}
              style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.23, 1, 0.32, 1)' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            dir="ltr"
            className={`font-black leading-none tabular-nums tracking-[-0.03em] text-v2-ink ${long ? 'text-[17px]' : 'text-[21px]'}`}
          >
            {ring.value}
          </span>
          {ring.unit && <span className="mt-0.5 whitespace-nowrap text-[11px] font-bold text-v2-muted">{ring.unit}</span>}
        </div>
      </div>
      <span className="mt-1.5 max-w-full truncate text-[12.5px] font-extrabold text-v2-ink-2">{ring.label}</span>
      {ring.sub && <span className="whitespace-nowrap text-[11.5px] font-extrabold text-[#047857]">{ring.sub}</span>}
    </div>
  );
}

export default function MetricRings({ rings }: { rings: MetricRing[] }) {
  if (rings.length === 0) return null;
  return (
    <div className="flex items-start justify-between gap-2">
      {rings.map((r) => (
        <Ring key={r.key} ring={r} />
      ))}
    </div>
  );
}
