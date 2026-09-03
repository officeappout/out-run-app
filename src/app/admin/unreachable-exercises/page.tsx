'use client';

export const dynamic = 'force-dynamic';

/**
 * "תרגילים לא נשלפים" — Unreachable Exercises
 *
 * David's own proposal (00-PLAN.md §13): a permanent admin tool, not a
 * one-off report, showing live which exercises in the catalog cannot be
 * selected by any real generation path, and exactly why. Triggered by the
 * discovery that ~40 filmed warmup/stretch videos sit in the catalog and
 * are never shown to any user (03-LEVEL-TRIAGE.md's reachability finding).
 *
 * All 5 reasons below reuse REAL production logic — none of it is
 * reimplemented here:
 *   - hasExplicitCoreLevel / exerciseMatchesProgram — the exact functions
 *     workout-selection.utils.ts uses for the core-slot gate (00-PLAN.md §12.3).
 *   - selectMethodForContext — the exact production execution-method
 *     selector (shared/utils/method-selection.utils.ts), called per
 *     location with the same baseline-gear assumption the generator itself
 *     injects (ESSENTIAL_PARK_GEAR / ASSUMED_HOME_GEAR).
 *   - The NO_ROLE_OR_TAG condition is copied verbatim (cited by file:line)
 *     from warmup.service.ts:394 and cooldown.service.ts:47,101 — the exact
 *     boolean checks that gate the warmup/cooldown/tabata candidate pools.
 *
 * An exercise can have MORE than one reason at once (e.g. most of the 70
 * orphaned exercises are both NO_LEVEL and NO_ROLE_OR_TAG) — all applicable
 * reasons are shown and filterable independently, not collapsed to one.
 *
 * Style matches /admin/content-matrix (same page shape: client-side fetch +
 * in-browser analysis, RTL, gradient header, stat cards, search/filter,
 * CSV/text export via Blob) per 00-PLAN.md §14's placement instruction.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getAllExercises } from '@/features/content/exercises';
import type { Exercise, ExecutionLocation } from '@/features/content/exercises';
import { EXECUTION_LOCATION_LABELS } from '@/features/content/exercises/core/exercise-location.constants';
import { getCachedPrograms, buildIdToSlugMapFromPrograms } from '@/features/workout-engine/services/program-hierarchy.utils';
import {
  ensureEquipmentCachesLoaded,
  ESSENTIAL_PARK_GEAR,
  ASSUMED_HOME_GEAR,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { ASSUMED_HOME_GEAR_ENABLED } from '@/config/feature-flags';
import { selectMethodForContext } from '@/features/workout-engine/shared/utils/method-selection.utils';
import { hasExplicitCoreLevel } from '@/features/workout-engine/logic/workout-selection.utils';
import { exerciseMatchesProgram } from '@/features/workout-engine/services/shadow-level.utils';
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  Search,
  Download,
  X,
} from 'lucide-react';

// ============================================================================
// REASON TAXONOMY
// ============================================================================

type Reason = 'NO_LEVEL' | 'NO_ROLE_OR_TAG' | 'NO_EXECUTION_METHODS' | 'NO_LOCATION_COVERAGE' | 'CORE_NO_CORE_LEVEL';

const REASON_META: Record<Reason, { label: string; short: string; color: string; explain: (row: UnreachableRow) => string }> = {
  NO_EXECUTION_METHODS: {
    label: 'אין execution_methods',
    short: 'ללא שיטת ביצוע',
    color: 'bg-red-100 text-red-800 border-red-300',
    explain: () => 'התרגיל לעולם לא ייבחר — אין אף שיטת ביצוע (execution_methods ריק). הוסף שיטת ביצוע אחת לפחות.',
  },
  NO_LOCATION_COVERAGE: {
    label: 'אין כיסוי מיקום',
    short: 'ללא כיסוי מיקום',
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    explain: () =>
      'יש execution_methods, אבל אף אחת לא עוברת את הגייטינג האמיתי (selectMethodForContext) באף אחד מ-10 המיקומים, גם עם ציוד הבסיס (ESSENTIAL_PARK_GEAR / ASSUMED_HOME_GEAR). בדוק gearIds/equipmentIds מול location/locationMapping.',
  },
  CORE_NO_CORE_LEVEL: {
    label: 'ליבה בלי רמת core',
    short: 'ליבה חסרת רמה',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    explain: (row) =>
      `מסווג כתרגיל ליבה (movementGroup='${row.movementGroup ?? '—'}', primaryMuscle='${row.primaryMuscle ?? '—'}') אך אין רשומת targetPrograms עם programId שנפתר ל-'core'. מאז גייט הליבה (00-PLAN.md §12.3) התרגיל לא נכנס לסלוט הליבה של אימון רגיל — אך נשאר זמין במלואו בתוכניות האחרות שבהן יש לו רמה אמיתית (ראה targetPrograms).`,
  },
  NO_LEVEL: {
    label: 'אין רמה',
    short: 'ללא רמה',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    explain: () => 'אין targetPrograms ואין programIds — לא נראה למערכת הרמות. לא נבחר בשום מסלול-דומיין רגיל (push/pull/legs/core/סקילים). הוסף targetPrograms עם programId + level.',
  },
  NO_ROLE_OR_TAG: {
    label: 'אין role/תג',
    short: 'ללא role/תג',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    explain: () =>
      'אין exerciseRole ואין תג mobility/flexibility/hiit_friendly — לא עומד בתנאי הבריכה של warmup.service.ts:394 (exerciseRole==="warmup" || tags.includes("mobility")) או cooldown.service.ts:47,101 (exerciseRole==="cooldown" || tags.includes("flexibility")), ולא מגיע למאגר הטבטה (tags.includes("hiit_friendly")). הוסף exerciseRole מתאים או תג.',
  },
};

const REASON_ORDER: Reason[] = ['NO_EXECUTION_METHODS', 'NO_LOCATION_COVERAGE', 'CORE_NO_CORE_LEVEL', 'NO_LEVEL', 'NO_ROLE_OR_TAG'];

interface UnreachableRow {
  id: string;
  name: string;
  reasons: Reason[];
  movementGroup?: string;
  primaryMuscle?: string;
}

function getName(ex: Exercise): string {
  const n: any = ex.name;
  if (!n) return '(ללא שם)';
  if (typeof n === 'string') return n || '(ללא שם)';
  return n.he || n.en || n.es || '(ללא שם)';
}

// All locations the live product actually schedules against (ExecutionLocation
// union, exercise.types.ts:394) — tested with the SAME baseline-gear
// assumption InputSanitizerMiddleware.normalizeEquipmentArray injects.
const ALL_LOCATIONS: ExecutionLocation[] = ['home', 'park', 'street', 'office', 'school', 'gym', 'airport', 'library', 'desk', 'service'];

function baselineGearFor(location: ExecutionLocation): string[] {
  if (location === 'park') return Array.from(ESSENTIAL_PARK_GEAR);
  if (ASSUMED_HOME_GEAR_ENABLED && (location === 'home' || location === 'office' || location === 'school')) {
    return Array.from(ASSUMED_HOME_GEAR);
  }
  return [];
}

function hasAnyLocationCoverage(ex: Exercise): boolean {
  return ALL_LOCATIONS.some((loc) => selectMethodForContext(ex, loc, baselineGearFor(loc)) !== null);
}

// ============================================================================
// PAGE
// ============================================================================

export default function UnreachableExercisesPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<UnreachableRow[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [reasonFilter, setReasonFilter] = useState<Reason | 'all'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [allExercises, allPrograms] = await Promise.all([
          getAllExercises(),
          getCachedPrograms(),
          ensureEquipmentCachesLoaded(),
        ]);
        // Resolves programId Firestore doc IDs → slugs, exactly as the live
        // generator does at the same call site (home-workout.service.ts:1463)
        // — required for hasExplicitCoreLevel / exerciseMatchesProgram to
        // recognise a 'core' targetPrograms entry stored as a Firestore ID.
        buildIdToSlugMapFromPrograms(allPrograms);

        if (cancelled) return;

        const computed: UnreachableRow[] = [];
        for (const ex of allExercises) {
          const reasons: Reason[] = [];
          const methods = (ex.execution_methods || ex.executionMethods || []) as any[];

          const hasLevel = (Array.isArray(ex.targetPrograms) && ex.targetPrograms.length > 0)
            || (Array.isArray(ex.programIds) && ex.programIds.length > 0);
          if (!hasLevel) reasons.push('NO_LEVEL');

          const tags: string[] = (ex.tags as string[]) ?? [];
          const hasRoleOrTag = !!ex.exerciseRole
            || tags.includes('mobility')
            || tags.includes('flexibility')
            || tags.includes('hiit_friendly');
          if (!hasRoleOrTag) reasons.push('NO_ROLE_OR_TAG');

          if (methods.length === 0) {
            reasons.push('NO_EXECUTION_METHODS');
          } else if (!hasAnyLocationCoverage(ex)) {
            reasons.push('NO_LOCATION_COVERAGE');
          }

          if (exerciseMatchesProgram(ex, 'core') && !hasExplicitCoreLevel(ex)) {
            reasons.push('CORE_NO_CORE_LEVEL');
          }

          if (reasons.length > 0) {
            computed.push({ id: ex.id, name: getName(ex), reasons, movementGroup: ex.movementGroup, primaryMuscle: ex.primaryMuscle });
          }
        }

        if (!cancelled) {
          setRows(computed);
          setTotalScanned(allExercises.length);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (reasonFilter !== 'all') {
      result = result.filter((r) => r.reasons.includes(reasonFilter));
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    return result;
  }, [rows, reasonFilter, searchTerm]);

  const reasonCounts = useMemo(() => {
    const counts: Record<Reason, number> = { NO_LEVEL: 0, NO_ROLE_OR_TAG: 0, NO_EXECUTION_METHODS: 0, NO_LOCATION_COVERAGE: 0, CORE_NO_CORE_LEVEL: 0 };
    for (const r of rows) for (const reason of r.reasons) counts[reason]++;
    return counts;
  }, [rows]);

  const handleExportCsv = () => {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = ['exercise_id,name,reasons,details'];
    for (const row of filteredRows) {
      const details = row.reasons.map((r) => `${REASON_META[r].label}: ${REASON_META[r].explain(row)}`).join(' | ');
      lines.push([row.id, row.name, row.reasons.join(';'), details].map(escape).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unreachable-exercises-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-gray-500 font-medium">סורק את הקטלוג...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-red-700">שגיאה בטעינת הקטלוג</p>
            <p className="text-sm text-red-600 mt-1">{loadError}</p>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw size={18} />
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-2xl shadow-lg text-white">
        <div>
          <h1 className="text-3xl font-black">תרגילים לא נשלפים</h1>
          <p className="text-indigo-100 mt-1">
            {rows.length} מתוך {totalScanned} תרגילים בקטלוג לא ניתנים לבחירה באף מסלול חי — חי מהקטלוג, לא דוח קפוא
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition-all"
          >
            <Download size={18} />
            ייצוא CSV
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition-all"
          >
            <RefreshCw size={18} />
            רענון
          </button>
        </div>
      </div>

      {/* Reason stat cards — click to filter */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {REASON_ORDER.map((reason) => (
          <button
            key={reason}
            onClick={() => setReasonFilter(reasonFilter === reason ? 'all' : reason)}
            className={`text-right p-4 rounded-2xl border-2 transition-all ${REASON_META[reason].color} ${
              reasonFilter === reason ? 'ring-2 ring-offset-2 ring-indigo-500 scale-[1.02]' : 'hover:scale-[1.01]'
            }`}
          >
            <div className="text-2xl font-black">{reasonCounts[reason]}</div>
            <div className="text-xs font-bold mt-1">{REASON_META[reason].label}</div>
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-2xl shadow border border-gray-100">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש לפי שם או id..."
            className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>
        {reasonFilter !== 'all' && (
          <button
            onClick={() => setReasonFilter('all')}
            className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-700"
          >
            <X size={14} />
            נקה סינון ({REASON_META[reasonFilter].label})
          </button>
        )}
        <div className="text-sm text-gray-500 font-medium whitespace-nowrap">{filteredRows.length} תוצאות</div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500 text-xs">
              <th className="text-right p-3 font-bold">שם</th>
              <th className="text-right p-3 font-bold">id</th>
              <th className="text-right p-3 font-bold">סיבות</th>
              <th className="text-right p-3 font-bold">מה חסר בדיוק</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                <td className="p-3 font-bold text-gray-800 whitespace-nowrap">{row.name}</td>
                <td className="p-3 text-gray-400 font-mono text-xs whitespace-nowrap">{row.id}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {row.reasons.map((r) => (
                      <span key={r} className={`px-2 py-0.5 rounded-lg border text-xs font-bold whitespace-nowrap ${REASON_META[r].color}`}>
                        {REASON_META[r].short}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-gray-600 max-w-xl">
                  {row.reasons.map((r) => (
                    <p key={r} className="mb-1 last:mb-0">
                      <span className="font-bold">{REASON_META[r].label}:</span> {REASON_META[r].explain(row)}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-400">
                  אין תרגילים תואמים לסינון הנוכחי
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
