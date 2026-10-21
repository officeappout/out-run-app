'use client';

/**
 * MapHealthCard — "מצב מיפוי" for one authority on /admin/city-mapping
 * (RC4 wave I2, docs/routes/CITY-MAPPING-PLAN.md §5). READ-ONLY.
 *
 * Data: GET /api/admin/city-mapping/inventory (Admin SDK) via
 * loadCityInventoryHealth — never a client Firestore query; the
 * `city_inventory/**` rule denies every client. Building / applying an
 * inventory stays in scripts/city-inventory/run.ts (apply: David only).
 *
 * Shows: readiness badge (level + score) and what blocks the next level;
 * one row per layer (amount, coverage, source + licence, last refreshed,
 * gaps); the newest runs, with layers that dropped to zero / stopped being
 * measured since the previous run. "Not measured" is never rendered as 0.
 *
 * Plain in-flow card: no overlay, no z-index, no shared store.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Gauge, Loader2, RefreshCw } from 'lucide-react';
import type { ReadinessLevel } from '@/lib/city-inventory/types';
import { INVENTORY_LAYER_KEYS } from '@/lib/city-inventory/types';
import {
  CityInventoryHealthError,
  loadCityInventoryHealth,
  type CityInventoryHealth,
} from '@/features/admin/services/city-inventory-health';
import {
  LAYER_LABELS,
  LEVEL_LABELS,
  amountText,
  coverageCell,
  formatDate,
  gapNotes,
  runRegressions,
  sourceText,
  type CoverageTone,
} from './map-health.logic';

export interface MapHealthCardProps {
  authorityId: string;
  /** Display name of the selected city (header only). */
  cityLabel?: string;
  /** Injected in tests; defaults to the API loader. */
  load?: (authorityId: string) => Promise<CityInventoryHealth>;
}

const LEVEL_CLASSES: Record<ReadinessLevel, string> = {
  red: 'bg-red-50 text-red-700 border-red-200',
  yellow: 'bg-amber-50 text-amber-800 border-amber-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const TONE_CLASSES: Record<CoverageTone, string> = {
  none: 'text-gray-400',
  low: 'text-red-600',
  mid: 'text-amber-700',
  high: 'text-emerald-700',
};

function ReadinessBadge({ level, score, small }: { level: ReadinessLevel; score: number; small?: boolean }) {
  return (
    <span
      data-testid="readiness-badge"
      data-level={level}
      className={`inline-flex items-center gap-1 rounded-full border font-black ${LEVEL_CLASSES[level]} ${small ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
    >
      {LEVEL_LABELS[level]} · <span dir="ltr">{score}/100</span>
    </span>
  );
}

function errorText(err: unknown): string {
  if (err instanceof CityInventoryHealthError) {
    if (err.status === 401) return 'לא מחובר — יש להתחבר מחדש לפאנל.';
    if (err.status === 403) return 'אין הרשאה — הכרטיס זמין ל-super admin בלבד.';
    return `שגיאה בטעינת מצב המיפוי: ${err.message}`;
  }
  return `שגיאה בטעינת מצב המיפוי: ${(err as Error)?.message ?? 'לא ידועה'}`;
}

export default function MapHealthCard({ authorityId, cityLabel, load = loadCityInventoryHealth }: MapHealthCardProps) {
  const [health, setHealth] = useState<CityInventoryHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = authorityId.trim();
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    load(id)
      .then((h) => { if (!cancelled) setHealth(h); })
      .catch((err) => { if (!cancelled) { setHealth(null); setError(errorText(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorityId, load, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const current = health?.authorityId === authorityId.trim() ? health : null;
  const inv = current?.inventory ?? null;
  const runs = current?.runs ?? [];
  const regressions = runRegressions(runs);

  return (
    <section data-testid="map-health-card" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="text-teal-600" size={18} />
        <h2 className="text-sm font-black text-gray-700 uppercase tracking-widest">
          מצב מיפוי{cityLabel ? ` — ${cityLabel}` : ''}
        </h2>
        {inv && <ReadinessBadge level={inv.readiness.level} score={inv.readiness.score} />}
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="ms-auto inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          טען מחדש
        </button>
      </div>

      {loading && !current && (
        <p className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={13} className="animate-spin" /> טוען מצב מיפוי...
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {current && !inv && (
        <div data-testid="map-health-empty" className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 space-y-1">
          <p className="font-bold">עדיין לא נשמר מלאי מיפוי לרשות הזו.</p>
          <p>
            המלאי נבנה בסקריפט <span className="font-mono" dir="ltr">scripts/city-inventory/run.ts</span> (dry-run כברירת מחדל);
            השמירה לפרודקשן (<span className="font-mono" dir="ltr">--apply</span>) — דוד בלבד. עד אז אין כאן נתונים, וזה לא אומר שהעיר ריקה.
          </p>
        </div>
      )}

      {inv && (
        <>
          <p className="text-[11px] text-gray-500">
            snapshot OSM: <span dir="ltr">{inv.snapshot.osmPbfDate || '—'}</span> · נבנה {formatDate(inv.snapshot.builtAt)} · נשמר{' '}
            {formatDate(inv.updatedAt)} · ריצה <span className="font-mono" dir="ltr">{inv.snapshot.runId || '—'}</span>
          </p>

          {inv.readiness.blockers.length > 0 && (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer font-bold">מה חסר לרמה הבאה ({inv.readiness.blockers.length})</summary>
              <ul className="mt-1 list-disc ps-5 space-y-0.5" dir="ltr">
                {inv.readiness.blockers.map((b) => <li key={b} className="text-start">{b}</li>)}
              </ul>
            </details>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                  <th className="text-start py-1.5 pe-2 font-black">שכבה</th>
                  <th className="text-start py-1.5 pe-2 font-black">כמה</th>
                  <th className="text-start py-1.5 pe-2 font-black">כיסוי</th>
                  <th className="text-start py-1.5 pe-2 font-black">מקור ורישיון</th>
                  <th className="text-start py-1.5 pe-2 font-black">רוענן</th>
                  <th className="text-start py-1.5 font-black">פער</th>
                </tr>
              </thead>
              <tbody>
                {INVENTORY_LAYER_KEYS.map((k) => {
                  const l = inv.layers[k];
                  const cov = coverageCell(k, l);
                  const gaps = gapNotes(k, l);
                  return (
                    <tr key={k} data-testid={`layer-row-${k}`} className="border-b border-gray-100 align-top">
                      <td className="py-1.5 pe-2 font-bold text-gray-800 whitespace-nowrap">{LAYER_LABELS[k]}</td>
                      <td data-testid={`layer-amount-${k}`} className="py-1.5 pe-2 text-gray-800 whitespace-nowrap">{amountText(l)}</td>
                      <td data-testid={`layer-coverage-${k}`} className={`py-1.5 pe-2 whitespace-nowrap ${TONE_CLASSES[cov.tone]}`} title={cov.hint ?? undefined}>
                        {cov.text}
                      </td>
                      <td className="py-1.5 pe-2 text-gray-600">{sourceText(l)}</td>
                      <td className="py-1.5 pe-2 text-gray-600 whitespace-nowrap">{formatDate(l.lastRefreshAt)}</td>
                      <td data-testid={`layer-gaps-${k}`} className="py-1.5 text-gray-600">{gaps.join(' · ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {current && runs.length > 0 && (
        <div data-testid="map-health-runs">
          <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">ריצות אחרונות ({runs.length})</h3>
          <ul className="space-y-1.5">
            {runs.map((r, i) => (
              <li key={r.runId} data-testid={`run-${r.runId}`} className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
                <span className="whitespace-nowrap">{formatDate(r.createdAt ?? r.snapshot.builtAt)}</span>
                <ReadinessBadge level={r.readiness.level} score={r.readiness.score} small />
                <span className="text-gray-500">OSM <span dir="ltr">{r.snapshot.osmPbfDate || '—'}</span></span>
                <span className="font-mono text-[10px] text-gray-400" dir="ltr">{r.runId}</span>
                {regressions[i].length > 0 && (
                  <span data-testid={`run-regression-${r.runId}`} className="inline-flex items-center gap-1 text-red-600 font-bold">
                    <AlertTriangle size={12} />
                    ירד לאפס / לא נמדד מאז הריצה הקודמת: {regressions[i].map((k) => LAYER_LABELS[k]).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
