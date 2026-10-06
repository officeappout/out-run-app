'use client';

/**
 * Shared funnel-stage visual block — KPI strip + funnel chart + detailed
 * conversion table. Extracted from `/admin/analytics/page.tsx` (journey
 * hub Wave 1, 05.10.2026) so the Journey hub's Acquisition tab can render
 * a subset of the same 6-stage funnel (`funnel-analytics.service.ts`)
 * without duplicating this JSX — same reuse pattern PushFunnelSection
 * already established.
 *
 * Callers pick which `stages` subset to pass in. globalConversion /
 * stepConversion are already computed relative to the FULL funnel inside
 * `getFunnelCounts`, so a filtered subset still shows mathematically
 * correct percentages (e.g. passing only the `activation` stage still
 * shows its true % of Stage 1, not something recomputed from the subset).
 */

import React, { useMemo } from 'react';
import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BarChart3, AlertTriangle, CheckCircle2, TrendingDown, Loader2 } from 'lucide-react';
import {
  FUNNEL_DROP_THRESHOLD,
  FUNNEL_CAUTION_THRESHOLD,
  type FunnelStage,
} from '@/features/admin/services/funnel-analytics.service';
import InfoHint from './InfoHint';

/** Piece 5 (06.10.2026) — plain-Hebrew explanation of what each stage actually counts. */
export const STAGE_HINT: Record<FunnelStage['id'], string> = {
  registered: 'משתמשים שנרשמו למערכת ופתחו חשבון — תחילת המשפך.',
  midpoint: 'הגיעו לאמצע תהליך האונבורדינג אך עדיין לא סיימו אותו.',
  completed: 'סיימו את כל שלבי האונבורדינג.',
  activation: 'הפעלה = כמה מהנרשמים השלימו אימון אמיתי ראשון (לא כולל חימום בלבד).',
  retention: 'השלימו 3 אימונים אמיתיים או יותר — איתות ראשוני לשימור.',
  revenue: 'שלב הכנסות — placeholder, תשלומים עדיין לא מחווטים.',
};

export const STAGE_FILL: Record<FunnelStage['id'], string> = {
  registered: '#6366f1',  // indigo-500  — top of funnel anchor
  midpoint:   '#0ea5e9',  // sky-500     — onboarding push
  completed:  '#10b981',  // emerald-500 — onboarding success
  activation: '#f59e0b',  // amber-500   — first workout
  retention:  '#ef4444',  // red-500     — retained user
  revenue:    '#9ca3af',  // gray-400    — placeholder (no data yet)
};

const fmtCount = (n: number | null) => (n == null ? '—' : n.toLocaleString('he-IL'));
const fmtPct = (p: number | null) => (p == null ? '—' : `${p.toFixed(1)}%`);

interface FunnelStagesSectionProps {
  stages: FunnelStage[];
  loading: boolean;
  title?: string;
  subtitle?: string;
}

export default function FunnelStagesSection({
  stages,
  loading,
  title = 'המחשת המשפך',
  subtitle,
}: FunnelStagesSectionProps) {
  // Map funnel stages → Recharts data shape. The chart silently drops
  // entries with `value == null`, which is exactly what we want for the
  // revenue placeholder so it doesn't distort the funnel proportions.
  const chartData = useMemo(
    () => stages
      .filter((s) => s.count != null)
      .map((s) => ({
        name: s.labelHe,
        value: s.count as number,
        fill: STAGE_FILL[s.id],
        stage: s,
      })),
    [stages],
  );

  return (
    <div className="space-y-6">
      {/* KPI STRIP — horizontal scroll on narrow viewports */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {stages
          .filter((s) => s.id !== 'revenue')
          .map((s) => (
            <FunnelStageCard key={s.id} stage={s} loading={loading && stages.length === 0} />
          ))}
      </div>

      {/* FUNNEL CHART */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              מרענן נתונים…
            </div>
          )}
        </div>

        {/* Skeleton overlay during loading — kept absolutely positioned
            so the chart itself never unmounts, preventing the layout
            jank that a hard remount would cause on every filter tap. */}
        {loading && stages.length === 0 ? (
          <div className="h-[420px] flex items-center justify-center text-slate-400">
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[420px] flex flex-col items-center justify-center text-slate-400">
            <BarChart3 size={48} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">אין נתונים עבור הסינון הנבחר</p>
          </div>
        ) : (
          <div className="h-[420px] w-full" dir="ltr">
            {/* dir=ltr on the chart wrapper because Recharts geometry
                assumes LTR — the labels render the Hebrew text fine,
                but the funnel must layout left-to-right. */}
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart>
                <Tooltip
                  formatter={(value, _name, item) => [
                    (value as number).toLocaleString('he-IL'),
                    (item?.payload as { name?: string } | undefined)?.name ?? '',
                  ]}
                  cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Funnel
                  dataKey="value"
                  data={chartData}
                  isAnimationActive
                  lastShapeType="rectangle"
                >
                  {/* Built-in label renderers: name floats to the right
                      of each band; count is centered inside it. */}
                  <LabelList
                    position="right"
                    dataKey="name"
                    fill="#1f2937"
                    fontSize={14}
                    fontWeight={700}
                  />
                  <LabelList
                    position="center"
                    dataKey="value"
                    fill="#ffffff"
                    fontSize={16}
                    fontWeight={800}
                    formatter={(value) => (value as number).toLocaleString('he-IL')}
                  />
                  {chartData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.fill} />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* CONVERSION TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-black text-slate-900">פירוט המרות לפי שלב</h2>
          <p className="text-sm text-slate-500 mt-1">
            מסומן באדום: שלב עם נטישה חדה מעל 50%. מסומן בכתום: צריך תשומת לב.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3">שלב</th>
                <th className="px-6 py-3">משתמשים</th>
                <th className="px-6 py-3 min-w-[200px]">משפך כללי (מול S1)</th>
                <th className="px-6 py-3 min-w-[200px]">זרימת שלב (מול קודם)</th>
                <th className="px-6 py-3">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stages.map((s) => (
                <ConversionRow key={s.id} stage={s} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components — FunnelStageCard is exported standalone so a caller
// that wants just one stage as a single stat card (e.g. the Activation
// tab's first-workout-rate card) doesn't have to mount the whole chart.
// ──────────────────────────────────────────────────────────────────────

interface FunnelStageCardProps {
  stage: FunnelStage;
  loading: boolean;
}

/**
 * Single KPI card. Renders count, stage name, and step conversion %.
 * Drop-warning stages get a red border accent.
 */
export const FunnelStageCard: React.FC<FunnelStageCardProps> = ({ stage, loading }) => {
  const fill = STAGE_FILL[stage.id];
  const isWarn = stage.isDropWarning;

  // Bug-fix round, 06.10.2026 (BUG 2) — a stage whose query actually
  // FAILED (e.g. a missing composite index) must never look like a
  // confident "0 users." Checked before every other branch below.
  if (stage.isUnavailable) {
    return (
      <div className="shrink-0 min-w-[180px] rounded-2xl p-4 border-2 border-amber-300 bg-amber-50 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fill }} />
          <span className="text-xs font-bold text-slate-600">{stage.labelHe}</span>
          <InfoHint text={STAGE_HINT[stage.id]} />
        </div>
        <div className="text-lg font-black text-amber-700 flex items-center gap-1">
          <AlertTriangle size={16} />
          לא זמין
        </div>
        <p className="mt-1 text-[11px] text-amber-600">שגיאת שליפה — ראו קונסול</p>
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 min-w-[180px] rounded-2xl p-4 border-2 shadow-sm transition-shadow ${
        isWarn ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white hover:shadow-md'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fill }} />
        <span className="text-xs font-bold text-slate-600">{stage.labelHe}</span>
        <InfoHint text={STAGE_HINT[stage.id]} />
      </div>
      <div className="text-2xl font-black text-slate-900">
        {loading ? <span className="inline-block w-12 h-7 bg-slate-200 rounded animate-pulse" /> : fmtCount(stage.count)}
      </div>
      {stage.stepConversion != null && (
        <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${isWarn ? 'text-rose-600' : 'text-emerald-600'}`}>
          {isWarn && <TrendingDown size={12} />}
          {fmtPct(stage.stepConversion)} מהשלב הקודם
        </div>
      )}
      {stage.stepConversion == null && stage.globalConversion != null && (
        <div className="mt-2 text-xs font-bold text-indigo-600">
          עוגן ראשי
        </div>
      )}
    </div>
  );
};

/**
 * Single row of the conversion table. Renders both progress bars
 * (global and step), plus the stage status badge.
 */
interface ConversionRowProps {
  stage: FunnelStage;
}

const ConversionRow: React.FC<ConversionRowProps> = ({ stage }) => {
  const fill = STAGE_FILL[stage.id];
  const isPlaceholder = stage.count == null;
  // Bug-fix round, 06.10.2026 (BUG 2) — see FunnelStageCard's own comment.
  const isUnavailable = !!stage.isUnavailable;
  return (
    <tr className={isUnavailable ? 'bg-amber-50/60' : isPlaceholder ? 'bg-slate-50/50' : 'hover:bg-slate-50/60 transition-colors'}>
      {/* Stage name */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fill }} />
          <span className={`text-sm font-bold ${isPlaceholder ? 'text-slate-400' : 'text-slate-900'}`}>
            {stage.labelHe}
          </span>
          <InfoHint text={STAGE_HINT[stage.id]} />
        </div>
      </td>

      {/* Count */}
      <td className="px-6 py-4">
        <span className={`text-sm font-bold tabular-nums ${
          isUnavailable ? 'text-amber-700' : isPlaceholder ? 'text-slate-400' : 'text-slate-800'
        }`}>
          {isUnavailable ? 'לא זמין' : isPlaceholder ? 'ממתין לנתונים' : fmtCount(stage.count)}
        </span>
      </td>

      {/* Global conversion bar */}
      <td className="px-6 py-4">
        <ProgressBar percent={stage.globalConversion} fill={fill} />
      </td>

      {/* Step conversion bar */}
      <td className="px-6 py-4">
        <ProgressBar percent={stage.stepConversion} fill={fill} emphasizeWarning />
      </td>

      {/* Status badge */}
      <td className="px-6 py-4">
        <StatusBadge stepConversion={stage.stepConversion} isPlaceholder={isPlaceholder} isUnavailable={isUnavailable} />
      </td>
    </tr>
  );
};

/**
 * Horizontal progress bar with the percentage rendered to its left.
 * Width is clamped 0-100 so absurd values (e.g. stage count > stage1
 * count after an index drift) still render gracefully.
 */
interface ProgressBarProps {
  percent: number | null;
  fill: string;
  emphasizeWarning?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ percent, fill, emphasizeWarning }) => {
  if (percent == null) {
    return <span className="text-xs font-medium text-slate-400">—</span>;
  }
  const clamped = Math.max(0, Math.min(100, percent));
  const isWarn = emphasizeWarning && percent < FUNNEL_DROP_THRESHOLD;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[100px]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${clamped}%`,
            backgroundColor: isWarn ? '#ef4444' : fill,
          }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums min-w-[44px] text-left ${isWarn ? 'text-rose-600' : 'text-slate-700'}`}>
        {fmtPct(percent)}
      </span>
    </div>
  );
};

/**
 * Status pill — green / amber / red based on step conversion.
 * The placeholder revenue stage gets a calm gray "ממתין לנתונים" badge.
 * A genuinely failed stage (bug-fix round, 06.10.2026 — BUG 2) gets its
 * own distinct amber "שגיאת שליפה" badge — checked first, since it must
 * never be confused with either the placeholder or a real conversion %.
 */
interface StatusBadgeProps {
  stepConversion: number | null;
  isPlaceholder: boolean;
  isUnavailable?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ stepConversion, isPlaceholder, isUnavailable }) => {
  if (isUnavailable) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
        <AlertTriangle size={12} />
        שגיאת שליפה
      </span>
    );
  }
  if (isPlaceholder) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
        ממתין לנתונים
      </span>
    );
  }
  if (stepConversion == null) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
        עוגן ראשי
      </span>
    );
  }
  if (stepConversion < FUNNEL_DROP_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
        <AlertTriangle size={12} />
        ירידה חדה
      </span>
    );
  }
  if (stepConversion < FUNNEL_CAUTION_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
        <AlertTriangle size={12} />
        זהירות
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
      <CheckCircle2 size={12} />
      תקין
    </span>
  );
};
