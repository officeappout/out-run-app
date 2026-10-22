/**
 * meta — the evidence envelope every admin-analytics result carries (plan §5.3). Enforced by
 * the type, not by asking the model: a tool cannot return a number without saying which
 * definition, period and sample it came from.
 */
export const ANALYTICS_TZ = 'Asia/Jerusalem' as const;

export interface MetricMeta {
  /** id in src/lib/admin-analytics/metric-defs.ts */
  definitionId: string;
  /** ISO dates (Israel day keys or full ISO); from = null for "all time" / a point-in-time snapshot */
  period: { from: string | null; to: string; tz: typeof ANALYTICS_TZ };
  /** sample size behind the headline number (users, docs …); null when not meaningful */
  n: number | null;
  minSample: number | null;
  belowThreshold: boolean;
  /** which sources were actually measured (e.g. push categories) */
  measuredSources?: string[];
  caveats: string[];
}

export interface MetricResult<T> {
  /** null = could not be computed (NOT zero) — see error */
  value: T | null;
  meta: MetricMeta;
  error?: string;
}

export function metaOf(
  definitionId: string,
  period: { from: string | null; to: string },
  extra: Partial<Omit<MetricMeta, 'definitionId' | 'period'>> = {},
): MetricMeta {
  const n = extra.n ?? null;
  const minSample = extra.minSample ?? null;
  return {
    definitionId,
    period: { ...period, tz: ANALYTICS_TZ },
    n,
    minSample,
    belowThreshold: extra.belowThreshold ?? (n !== null && minSample !== null && n < minSample),
    ...(extra.measuredSources ? { measuredSources: extra.measuredSources } : {}),
    caveats: extra.caveats ?? [],
  };
}

/** Never let a cell under 5 people show its exact size (plan §6.6). */
export function maskSmall(n: number): number | '<5' {
  return n > 0 && n < 5 ? '<5' : n;
}
