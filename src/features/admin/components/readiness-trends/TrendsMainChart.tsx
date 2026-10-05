'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { GreenLinePoint, BlueLinePoint } from '@/features/readiness/core/services/readiness-trends.service';
import { READINESS_COLORS } from '../readiness-dashboard/colors';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;
}

interface ChartRow {
  x: number;
  dateLabel: string;
  green: number | null;
  greenIsRealPoint: boolean;
  blue: number | null;
}

/**
 * The official (green) line is a STEP function — it only has a real
 * value at an actual test-date event and is HELD (never interpolated)
 * until the next one. This builds a single combined-x-axis row per
 * UNIQUE date (every green test-date UNIONED with every blue month-end
 * — the two series have different granularities by design), carrying
 * the green value FORWARD into every blue-only row so the rendered
 * line reads as a staircase rather than showing gaps at every month
 * that isn't also a test date. `greenIsRealPoint` is false on a
 * carried-forward row — ONLY a real row gets a visible dot (David:
 * "נקודה מסומנת על תאריכי בוחן בלבד").
 */
function buildChartRows(green: GreenLinePoint[], blue: BlueLinePoint[]): ChartRow[] {
  const byX = new Map<number, ChartRow>();
  const ensure = (iso: string): ChartRow => {
    const x = new Date(iso).getTime();
    let row = byX.get(x);
    if (!row) {
      row = { x, dateLabel: formatDate(iso), green: null, greenIsRealPoint: false, blue: null };
      byX.set(x, row);
    }
    return row;
  };
  for (const g of green) {
    const row = ensure(g.date);
    row.green = g.passPercent;
    row.greenIsRealPoint = true;
  }
  for (const b of blue) {
    const row = ensure(b.month);
    row.blue = b.meetsPercent;
  }
  const rows = Array.from(byX.values()).sort((a, b) => a.x - b.x);

  // Carry the green value forward into every row that doesn't have its
  // own real one (the "holding is the truth" rule) — never carry
  // BACKWARD (a row before the first real test date has no official
  // status at all yet, correctly left null).
  let lastGreen: number | null = null;
  for (const row of rows) {
    if (row.greenIsRealPoint) {
      lastGreen = row.green;
    } else {
      row.green = lastGreen;
    }
  }
  return rows;
}

function RealPointDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.greenIsRealPoint || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill={READINESS_COLORS.pass} stroke="white" strokeWidth={1.5} />;
}

interface TrendsMainChartProps {
  green: GreenLinePoint[];
  blue: BlueLinePoint[];
}

export default function TrendsMainChart({ green, blue }: TrendsMainChartProps) {
  const hasBlueLine = blue.some((b) => b.meetsPercent !== null);
  const rows = buildChartRows(green, blue);

  if (green.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
        <p className="text-sm text-gray-400">אין עדיין תאריך בוחן בתחום זה — דרושים מבדק שני ומשתמשים מקושרים.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      {green.length === 1 ? (
        <p className="text-[11px] text-slate-400 mb-2">תאריך בוחן אחד בלבד — נקודה, לא קו.</p>
      ) : null}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} width={34} unit="%" />
          <Tooltip contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => (value === 'green' ? 'בוחן (רשמי)' : 'אפליקציה (אינדיקציה, לא קובע)')} />
          <Line
            type="stepAfter"
            dataKey="green"
            name="green"
            stroke={READINESS_COLORS.pass}
            strokeWidth={2}
            dot={<RealPointDot />}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          {hasBlueLine && (
            <Line
              type="monotone"
              dataKey="blue"
              name="blue"
              stroke="#2563EB"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
        הפער בין הקווים — כמה חיילים כבר בכושר הנדרש אך טרם נבחנו רשמית.
      </p>
      {!hasBlueLine && (
        <p className="text-[11px] font-bold text-amber-700 mt-1">
          אין מספיק נתון אפליקציה ניתן-לקביעה כדי לצייר קו — ראו הצהרת הכיסוי למטה.
        </p>
      )}
    </div>
  );
}
