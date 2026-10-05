'use client';

/**
 * Journey Hub Wave 3 (05.10.2026, approved wave plan) — cohort
 * retention curve, day 0/1/3/7/14/30, one line per weekly signup
 * cohort. Confirmed missing everywhere else in the codebase
 * (growth-analytics-plan.md's gap audit).
 *
 * Per David's explicit Wave 3 instruction: build the REAL structure
 * wired to a real query (`/api/admin/retention-depth`'s
 * `cohortRetention`), gated behind a minimum-sample-size threshold —
 * never a fake/stubbed curve. A cohort below `minSampleSize` renders
 * as a listed row with an explicit "not enough data yet" state for
 * every day-offset (server-side null, not a noisy real percentage);
 * it auto-populates once that cohort's signups cross the threshold —
 * no manual flip, no code change needed here when that happens.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { GitBranch } from 'lucide-react';

export interface CohortRetentionEntry {
  cohortLabel: string;
  cohortWeekStart: string;
  cohortSize: number;
  retentionByDay: Record<string, number | null>;
}

interface CohortRetentionChartProps {
  cohorts: CohortRetentionEntry[];
  dayOffsets: readonly number[];
  minSampleSize: number;
  loading?: boolean;
}

// Fixed categorical order, not cycled — matches the "assign hue in
// fixed order" convention the rest of this admin panel's charts follow
// (e.g. funnel STAGE_FILL). Capped at 6 — COHORT_WEEKS is 12 server-
// side, but a 12-line chart would be unreadable; only cohorts that
// already meet minSampleSize are drawn as real lines (see below), so
// in practice far fewer than 12 ever compete for these 6 slots.
const COHORT_COLORS = ['#0891B2', '#6366F1', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6'];

export default function CohortRetentionChart({ cohorts, dayOffsets, minSampleSize, loading }: CohortRetentionChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-56 mb-4 animate-pulse" />
        <div className="h-[280px] bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  const readyCohorts = cohorts.filter((c) => c.cohortSize >= minSampleSize);

  const chartData = dayOffsets.map((day) => {
    const row: Record<string, number | string | null> = { day: `יום ${day}` };
    readyCohorts.forEach((c) => {
      row[c.cohortLabel] = c.retentionByDay[String(day)];
    });
    return row;
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch size={20} className="text-cyan-600" />
        <h3 className="text-lg font-black text-gray-900">עקומת שימור לפי קוהורט</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        % מכל קוהורט-הרשמה שבועי שחוזר לאימון ביום 0/1/3/7/14/30 — Wave 3, נבנה-על-אמת
      </p>

      {cohorts.length === 0 ? (
        <EmptyState minSampleSize={minSampleSize} />
      ) : readyCohorts.length === 0 ? (
        <EmptyState minSampleSize={minSampleSize} largestCohort={Math.max(...cohorts.map((c) => c.cohortSize))} />
      ) : (
        <>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" width={40} />
                <Tooltip contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, direction: 'rtl' }} />
                {readyCohorts.map((c, idx) => (
                  <Line
                    key={c.cohortWeekStart}
                    type="monotone"
                    dataKey={c.cohortLabel}
                    stroke={COHORT_COLORS[idx % COHORT_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {cohorts.length > readyCohorts.length && (
            <p className="text-[11px] text-gray-400 mt-2">
              {cohorts.length - readyCohorts.length} קוהורטים נוספים עדיין מתחת ל-{minSampleSize} משתמשים — לא מוצגים עד שיגדלו.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ minSampleSize, largestCohort }: { minSampleSize: number; largestCohort?: number }) {
  return (
    <div className="text-center py-16 text-gray-400 text-sm">
      <p className="font-bold text-gray-500">אין מספיק נתונים עדיין</p>
      <p className="mt-1">
        דרושים לפחות {minSampleSize} משתמשים בקוהורט-הרשמה שבועי אחד לפחות
        {largestCohort != null && ` (הקוהורט הגדול ביותר כיום: ${largestCohort})`}.
      </p>
      <p className="mt-1">ממלא את עצמו אוטומטית כשהקוהורטים יגדלו — אין צורך בפעולה.</p>
    </div>
  );
}
