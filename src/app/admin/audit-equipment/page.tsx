'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  Wrench,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { getAllExercises } from '@/features/content/exercises';
import { getAllGymEquipment, GymEquipment } from '@/features/content/equipment/gym';
import { getAllGearDefinitions, GearDefinition } from '@/features/content/equipment/gear';
import { getLocalizedText } from '@/features/content/shared';
import {
  normalizeGearId,
  resolveEquipmentLabel,
  isEquipmentFamilyMatch,
  getEquipmentFamily,
  seedEquipmentCaches,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// Types
// ============================================================================

type FilterMode = 'all' | 'mismatched' | 'broken' | 'ok';

interface EquipmentSlot {
  rawId: string;
  canonical: string;
  label: string;
  family: string | null;
  source: 'gearIds' | 'equipmentIds';
  methodIndex: number;
  methodName: string;
  location: string;
}

interface ExerciseAuditRow {
  exercise: Exercise;
  name: string;
  slots: EquipmentSlot[];
  expectedFamily: string | null;
  mismatches: EquipmentSlot[];
  broken: EquipmentSlot[];
  hasGarbage: boolean;
  status: 'ok' | 'mismatched' | 'broken' | 'empty';
}

// ============================================================================
// Heuristic: what equipment family SHOULD this exercise use?
// ============================================================================

const EXERCISE_NAME_TO_FAMILY: [RegExp, string][] = [
  [/(?<![א-ת])מתח(?![א-ת])|\bpull.?ups?\b|\bchin.?ups?\b/i, 'overhead_bar'],
  [/(?<![א-ת])מקבילים(?![א-ת])|\bdips?\b|שכיבות.*מקבילים/i, 'dip_surface'],
  [/(?<![א-ת])טבעות(?![א-ת])|\brings?\b/i, 'overhead_bar'],
  [/מוט נמוך|\blow.?bar\b|(?<![א-ת])אוסטרלי(?![א-ת])|\baustralian\b/i, 'bar_low'],
  [/(?<![א-ת])גומי(?:ות|ית|יה|ת|ה)?(?![א-ת])|\bbands?\b|\belastic\b/i, 'band_elastic'],
  [/(?<![א-ת])ספסל(?![א-ת])|\bbench\b/i, 'bench_seat'],
];

const MOVEMENT_GROUP_TO_FAMILY: Record<string, string> = {
  vertical_pull: 'overhead_bar',
  vertical_push: 'dip_surface',
};

/**
 * Returns the PRIMARY expected family (first regex match or movementGroup).
 * Used for display and fix suggestions.
 */
function inferExpectedFamily(exercise: Exercise): string | null {
  const name = getLocalizedText(exercise.name, 'he') || getLocalizedText(exercise.name, 'en');
  for (const [regex, family] of EXERCISE_NAME_TO_FAMILY) {
    if (regex.test(name)) return family;
  }
  if (exercise.movementGroup && MOVEMENT_GROUP_TO_FAMILY[exercise.movementGroup]) {
    return MOVEMENT_GROUP_TO_FAMILY[exercise.movementGroup];
  }
  return null;
}

/**
 * Returns ALL families the exercise name implies — handles combined exercises
 * like "החזקת מקבילים - גומייה" that legitimately need dip_surface + band_elastic.
 */
function inferAllExpectedFamilies(exercise: Exercise): Set<string> {
  const families = new Set<string>();
  const name = getLocalizedText(exercise.name, 'he') || getLocalizedText(exercise.name, 'en');
  for (const [regex, family] of EXERCISE_NAME_TO_FAMILY) {
    if (regex.test(name)) families.add(family);
  }
  if (families.size === 0 && exercise.movementGroup && MOVEMENT_GROUP_TO_FAMILY[exercise.movementGroup]) {
    families.add(MOVEMENT_GROUP_TO_FAMILY[exercise.movementGroup]);
  }
  return families;
}

// ============================================================================
// Family leader: the "default" ID to assign when fixing a mismatch
// ============================================================================

const FAMILY_LEADER: Record<string, { collection: 'gym_equipment' | 'gear_definitions'; label: string; canonicalKey: string }> = {
  overhead_bar: { collection: 'gym_equipment', label: 'מתח (Pull-up Bar)', canonicalKey: 'pullup_bar' },
  dip_surface:  { collection: 'gym_equipment', label: 'מקבילים (Dip Station)', canonicalKey: 'dip_station' },
  bench_seat:   { collection: 'gym_equipment', label: 'ספסל (Bench)', canonicalKey: 'bench' },
  band_elastic: { collection: 'gear_definitions', label: 'גומיות התנגדות (Bands)', canonicalKey: 'resistance_bands' },
  bar_low:      { collection: 'gym_equipment', label: 'מוט נמוך (Low Bar)', canonicalKey: 'low_bar' },
};

const FAMILY_LABELS: Record<string, string> = {
  overhead_bar: 'מוט עליון',
  dip_surface: 'משטח שכיבות סמיכה',
  bench_seat: 'ספסל',
  band_elastic: 'גומיות',
  bar_low: 'מוט נמוך',
};

// ============================================================================
// Component
// ============================================================================

export default function AuditEquipmentPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [gymEquipment, setGymEquipment] = useState<GymEquipment[]>([]);
  const [gearDefs, setGearDefs] = useState<GearDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [exList, gymList, gearList] = await Promise.all([
          getAllExercises(),
          getAllGymEquipment(),
          getAllGearDefinitions(),
        ]);
        if (cancelled) return;
        // Seed the gear-mapping runtime caches so resolveEquipmentLabel /
        // normalizeGearId work synchronously with the data we just fetched.
        seedEquipmentCaches(gearList, gymList);
        setExercises(exList);
        setGymEquipment(gymList);
        setGearDefs(gearList);
      } catch (err) {
        console.error('[AuditEquipment] Load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Build audit rows ─────────────────────────────────────────────────────
  const auditRows = useMemo<ExerciseAuditRow[]>(() => {
    if (!exercises.length) return [];

    const gymById = new Map(gymEquipment.map((g) => [g.id, g]));
    const gearById = new Map(gearDefs.map((g) => [g.id, g]));

    return exercises.map((ex) => {
      const name = getLocalizedText(ex.name, 'he') || getLocalizedText(ex.name, 'en') || ex.id;
      const methods = ex.execution_methods || ex.executionMethods || [];
      const slots: EquipmentSlot[] = [];

      methods.forEach((m, mIdx) => {
        const mName = m.methodName || m.location || `Method ${mIdx + 1}`;

        const rawGearIds = m.gearIds?.length ? m.gearIds : (m.gearId ? [m.gearId] : []);
        const rawEquipmentIds = m.equipmentIds?.length ? m.equipmentIds : (m.equipmentId ? [m.equipmentId] : []);

        // Sanitize: skip non-string / empty values (catches stray numbers like `1`)
        const gearIds = rawGearIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
        const equipmentIds = rawEquipmentIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '');

        for (const rawId of gearIds) {
          const canonical = normalizeGearId(rawId);
          const gearDoc = gearById.get(rawId);
          const eqOrigin = gearDoc?.category === 'improvised' ? 'מאולתר' : 'אישי';
          slots.push({
            rawId,
            canonical,
            label: resolveEquipmentLabel(rawId),
            family: getEquipmentFamily(canonical),
            source: 'gearIds',
            methodIndex: mIdx,
            methodName: mName,
            location: eqOrigin,
          });
        }
        for (const rawId of equipmentIds) {
          const canonical = normalizeGearId(rawId);
          slots.push({
            rawId,
            canonical,
            label: resolveEquipmentLabel(rawId),
            family: getEquipmentFamily(canonical),
            source: 'equipmentIds',
            methodIndex: mIdx,
            methodName: mName,
            location: 'פארק',
          });
        }
      });

      const expectedFamily = inferExpectedFamily(ex);
      const allExpectedFamilies = inferAllExpectedFamilies(ex);

      // Broken: ID doesn't resolve to any known gym equipment or gear definition
      const broken = slots.filter((s) => {
        if (s.canonical === 'bodyweight' || s.canonical === 'none') return false;
        const knownInGym = gymById.has(s.rawId);
        const knownInGear = gearById.has(s.rawId);
        const knownCanonical = s.canonical !== s.rawId.toLowerCase().replace(/-/g, '_');
        return !knownInGym && !knownInGear && !knownCanonical;
      });

      // Override labels for broken IDs — prevent ghost names from stale caches/aliases
      for (const b of broken) {
        b.label = `שבור: ${b.rawId.slice(0, 12)}…`;
      }

      // Mismatched: equipment is in the WRONG family for this exercise.
      // Combined exercises (e.g. "מקבילים - גומייה") have multiple expected
      // families — equipment from ANY of them is acceptable.
      const expectedFamiliesArr = Array.from(allExpectedFamilies);
      const mismatches = expectedFamiliesArr.length > 0
        ? slots.filter((s) => {
            if (s.canonical === 'bodyweight' || s.canonical === 'none' || s.canonical === 'unknown_gear') return false;
            if (!s.family) return false;
            return !expectedFamiliesArr.some(
              (ef) => s.family === ef || isEquipmentFamilyMatch(s.canonical, ef),
            );
          })
        : [];

      // Detect non-string garbage values in the raw arrays
      const hasGarbage = methods.some((m) => {
        const raw = [...(m.gearIds || []), ...(m.equipmentIds || [])];
        return raw.some((v) => typeof v !== 'string' || (typeof v === 'string' && v.trim() === ''));
      });

      let status: ExerciseAuditRow['status'] = 'ok';
      if (broken.length > 0 || hasGarbage) status = 'broken';
      else if (mismatches.length > 0) status = 'mismatched';
      else if (slots.length === 0 && methods.length > 0) status = 'empty';

      return { exercise: ex, name, slots, expectedFamily, mismatches, broken, hasGarbage, status };
    });
  }, [exercises, gymEquipment, gearDefs]);

  // ── Filtered + searched rows ──────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let rows = auditRows;
    if (filter !== 'all') {
      rows = rows.filter((r) => r.status === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.exercise.id.toLowerCase().includes(q) ||
          r.slots.some((s) => s.label.toLowerCase().includes(q) || s.canonical.includes(q)),
      );
    }
    return rows;
  }, [auditRows, filter, search]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = auditRows.length;
    const ok = auditRows.filter((r) => r.status === 'ok').length;
    const mismatched = auditRows.filter((r) => r.status === 'mismatched').length;
    const broken = auditRows.filter((r) => r.status === 'broken').length;
    const empty = auditRows.filter((r) => r.status === 'empty').length;
    return { total, ok, mismatched, broken, empty };
  }, [auditRows]);

  // ── Fix handler ───────────────────────────────────────────────────────────
  const handleFix = useCallback(
    async (row: ExerciseAuditRow) => {
      if (!row.expectedFamily) return;
      const leader = FAMILY_LEADER[row.expectedFamily];
      if (!leader) return;

      // Find the actual Firestore document for the family leader
      let leaderId: string | null = null;
      if (leader.collection === 'gym_equipment') {
        const match = gymEquipment.find((g) => normalizeGearId(g.iconKey || g.id) === leader.canonicalKey);
        if (match) leaderId = match.id;
      } else {
        const match = gearDefs.find((g) => normalizeGearId(g.iconKey || g.id) === leader.canonicalKey);
        if (match) leaderId = match.id;
      }

      if (!leaderId) {
        alert(`לא נמצא ${leader.label} ב-Firestore. אנא צור אותו קודם.`);
        return;
      }

      setFixingIds((prev) => new Set(prev).add(row.exercise.id));

      try {
        const methods = row.exercise.execution_methods || row.exercise.executionMethods || [];
        const updatedMethods = methods.map((m) => {
          const mismatchedInThisMethod = row.mismatches.filter(
            (ms) => ms.methodIndex === methods.indexOf(m),
          );
          if (mismatchedInThisMethod.length === 0) return m;

          const newMethod = { ...m };
          const field = leader.collection === 'gym_equipment' ? 'equipmentIds' : 'gearIds';

          // Replace mismatched IDs with the family leader
          const currentIds = (newMethod[field] || []) as string[];
          const badIds = new Set(mismatchedInThisMethod.map((ms) => ms.rawId));
          const cleaned = currentIds.filter((id) => !badIds.has(id));
          if (!cleaned.includes(leaderId!)) {
            cleaned.push(leaderId!);
          }
          (newMethod as Record<string, unknown>)[field] = cleaned;

          // Also clean the other array if the bad ID was there
          const otherField = field === 'equipmentIds' ? 'gearIds' : 'equipmentIds';
          const otherIds = (newMethod[otherField] || []) as string[];
          (newMethod as Record<string, unknown>)[otherField] = otherIds.filter((id) => !badIds.has(id));

          return newMethod;
        });

        await updateDoc(doc(db, 'exercises', row.exercise.id), {
          execution_methods: updatedMethods,
        });

        setFixedIds((prev) => new Set(prev).add(row.exercise.id));

        // Update local state
        setExercises((prev) =>
          prev.map((ex) =>
            ex.id === row.exercise.id
              ? { ...ex, execution_methods: updatedMethods as ExecutionMethod[] }
              : ex,
          ),
        );
      } catch (err) {
        console.error('[AuditEquipment] Fix failed:', err);
        alert(`שגיאה בתיקון: ${err}`);
      } finally {
        setFixingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.exercise.id);
          return next;
        });
      }
    },
    [gymEquipment, gearDefs],
  );

  // ── Remove broken IDs handler ──────────────────────────────────────────────
  const handleRemoveBroken = useCallback(
    async (row: ExerciseAuditRow) => {
      if (row.broken.length === 0) return;
      setFixingIds((prev) => new Set(prev).add(row.exercise.id));

      try {
        const brokenIds = new Set(row.broken.map((b) => b.rawId));
        const methods = row.exercise.execution_methods || row.exercise.executionMethods || [];
        const updatedMethods = methods.map((m) => {
          const newMethod = { ...m };

          // Filter gearIds: remove broken IDs AND non-string garbage values
          if (newMethod.gearIds) {
            (newMethod as Record<string, unknown>).gearIds =
              (newMethod.gearIds as unknown[]).filter(
                (v) => typeof v === 'string' && v.trim() !== '' && !brokenIds.has(v),
              );
          }
          // Filter equipmentIds: remove broken IDs AND non-string garbage values
          if (newMethod.equipmentIds) {
            (newMethod as Record<string, unknown>).equipmentIds =
              (newMethod.equipmentIds as unknown[]).filter(
                (v) => typeof v === 'string' && v.trim() !== '' && !brokenIds.has(v),
              );
          }
          return newMethod;
        });

        await updateDoc(doc(db, 'exercises', row.exercise.id), {
          execution_methods: updatedMethods,
        });

        setFixedIds((prev) => new Set(prev).add(row.exercise.id));
        setExercises((prev) =>
          prev.map((ex) =>
            ex.id === row.exercise.id
              ? { ...ex, execution_methods: updatedMethods as ExecutionMethod[] }
              : ex,
          ),
        );
      } catch (err) {
        console.error('[AuditEquipment] Remove broken failed:', err);
        alert(`שגיאה בהסרת לינקים שבורים: ${err}`);
      } finally {
        setFixingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.exercise.id);
          return next;
        });
      }
    },
    [],
  );

  // ── Toggle row expand ─────────────────────────────────────────────────────
  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ms-3 text-lg text-gray-600">טוען נתוני ציוד ותרגילים...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6" dir="rtl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">ביקורת ציוד — Equipment Audit</h1>
        <p className="text-sm text-gray-500">
          סריקת כל התרגילים מול משפחות הציוד. זיהוי אי-התאמות ולינקים שבורים.
        </p>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="סה״כ תרגילים"
          value={stats.total}
          color="text-gray-700"
          bg="bg-gray-50"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <StatCard
          label="תקינים"
          value={stats.ok}
          color="text-green-700"
          bg="bg-green-50"
          icon={<CheckCircle2 className="w-4 h-4" />}
          active={filter === 'ok'}
          onClick={() => setFilter('ok')}
        />
        <StatCard
          label="אי-התאמה"
          value={stats.mismatched}
          color="text-amber-700"
          bg="bg-amber-50"
          icon={<AlertTriangle className="w-4 h-4" />}
          active={filter === 'mismatched'}
          onClick={() => setFilter('mismatched')}
        />
        <StatCard
          label="שבורים"
          value={stats.broken}
          color="text-red-700"
          bg="bg-red-50"
          icon={<XCircle className="w-4 h-4" />}
          active={filter === 'broken'}
          onClick={() => setFilter('broken')}
        />
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם תרגיל, ID, או שם ציוד..."
          className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      {/* ── Results count ───────────────────────────────────────────────── */}
      <div className="text-xs text-gray-400 mb-2">
        מציג {filteredRows.length} מתוך {auditRows.length} תרגילים
        {filter !== 'all' && (
          <button onClick={() => setFilter('all')} className="ms-2 text-blue-500 hover:underline">
            הצג הכל
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-start py-3 px-4 font-medium text-gray-600 w-8">#</th>
              <th className="text-start py-3 px-4 font-medium text-gray-600">תרגיל</th>
              <th className="text-start py-3 px-4 font-medium text-gray-600">ציוד</th>
              <th className="text-start py-3 px-4 font-medium text-gray-600">משפחה צפויה</th>
              <th className="text-start py-3 px-4 font-medium text-gray-600">סטטוס</th>
              <th className="text-start py-3 px-4 font-medium text-gray-600 w-24">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <AuditRow
                key={row.exercise.id}
                row={row}
                idx={idx}
                expanded={expandedRows.has(row.exercise.id)}
                onToggle={() => toggleRow(row.exercise.id)}
                onFix={() => handleFix(row)}
                onRemoveBroken={() => handleRemoveBroken(row)}
                fixing={fixingIds.has(row.exercise.id)}
                fixed={fixedIds.has(row.exercise.id)}
              />
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  {filter !== 'all' ? 'אין תרגילים בסינון הנוכחי' : 'לא נמצאו תרגילים'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  label,
  value,
  color,
  bg,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl p-3 text-start transition-all ${bg} ${
        active ? 'ring-2 ring-blue-400 shadow-sm' : 'hover:shadow-sm'
      }`}
    >
      <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </button>
  );
}

function AuditRow({
  row,
  idx,
  expanded,
  onToggle,
  onFix,
  onRemoveBroken,
  fixing,
  fixed,
}: {
  row: ExerciseAuditRow;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
  onFix: () => void;
  onRemoveBroken: () => void;
  fixing: boolean;
  fixed: boolean;
}) {
  const statusColors: Record<string, string> = {
    ok: 'bg-green-50 text-green-700',
    mismatched: 'bg-amber-50 text-amber-700',
    broken: 'bg-red-50 text-red-700',
    empty: 'bg-gray-50 text-gray-500',
  };

  const statusLabels: Record<string, string> = {
    ok: 'תקין',
    mismatched: 'אי-התאמה',
    broken: 'שבור',
    empty: 'ריק',
  };

  const hasFix = row.status === 'mismatched' && row.expectedFamily && FAMILY_LEADER[row.expectedFamily];
  const rowBg =
    row.status === 'broken'
      ? 'bg-red-50/40'
      : row.status === 'mismatched'
        ? 'bg-amber-50/40'
        : '';

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer transition-colors ${rowBg}`}
        onClick={onToggle}
      >
        <td className="py-2.5 px-4 text-gray-400 text-xs">{idx + 1}</td>
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate max-w-[200px]">{row.name}</span>
            <Link
              href={`/admin/exercises/${row.exercise.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-blue-400 hover:text-blue-600 flex-shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
          {row.exercise.movementGroup && (
            <span className="text-[10px] text-gray-400">{row.exercise.movementGroup}</span>
          )}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex flex-wrap gap-1">
            {row.slots.length === 0 && !row.hasGarbage ? (
              <span className="text-gray-400 text-xs">ללא ציוד</span>
            ) : (
              <>
                {row.slots.slice(0, 3).map((s, i) => (
                  <EquipmentChip
                    key={`${s.rawId}-${i}`}
                    slot={s}
                    isMismatch={row.mismatches.includes(s)}
                    isBroken={row.broken.includes(s)}
                  />
                ))}
                {row.hasGarbage && (
                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                    ערכים פגומים
                  </span>
                )}
              </>
            )}
            {row.slots.length > 3 && (
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                +{row.slots.length - 3}
              </span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-4">
          {row.expectedFamily ? (
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              {FAMILY_LABELS[row.expectedFamily] || row.expectedFamily}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="py-2.5 px-4">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[row.status]}`}>
            {statusLabels[row.status]}
          </span>
        </td>
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5">
            {hasFix && !fixed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFix();
                }}
                disabled={fixing}
                className="flex items-center gap-1 text-xs bg-blue-500 text-white px-2.5 py-1 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {fixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                תקן
              </button>
            )}
            {row.status === 'broken' && !fixed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveBroken();
                }}
                disabled={fixing}
                className="flex items-center gap-1 text-xs bg-red-500 text-white px-2.5 py-1 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {fixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                הסר שבורים
              </button>
            )}
            {fixed && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                תוקן
              </span>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </td>
      </tr>

      {/* ── Expanded detail ──────────────────────────────────────────── */}
      {expanded && (
        <tr className="border-b border-gray-100">
          <td colSpan={6} className="bg-gray-50/50 px-6 py-4">
            <ExpandedDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function EquipmentChip({
  slot,
  isMismatch,
  isBroken,
}: {
  slot: EquipmentSlot;
  isMismatch: boolean;
  isBroken: boolean;
}) {
  const baseClasses = 'text-[11px] px-2 py-0.5 rounded-full font-medium';
  if (isBroken) return <span className={`${baseClasses} bg-red-100 text-red-700`}>{slot.label}</span>;
  if (isMismatch) return <span className={`${baseClasses} bg-amber-100 text-amber-700`}>{slot.label}</span>;
  return <span className={`${baseClasses} bg-gray-100 text-gray-700`}>{slot.label}</span>;
}

function ExpandedDetail({ row }: { row: ExerciseAuditRow }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        <span className="font-medium">Exercise ID:</span>{' '}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">{row.exercise.id}</code>
      </div>

      {row.slots.length === 0 ? (
        <p className="text-xs text-gray-400">אין ציוד מוקצה לתרגיל זה.</p>
      ) : (
        <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">Raw ID</th>
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">Canonical</th>
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">תווית</th>
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">משפחה</th>
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">מקור</th>
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">מתודה</th>
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">מיקום</th>
              <th className="text-start py-1.5 px-3 font-medium text-gray-600">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {row.slots.map((s, i) => {
              const isBroken = row.broken.includes(s);
              const isMismatch = row.mismatches.includes(s);
              const cellBg = isBroken ? 'bg-red-50' : isMismatch ? 'bg-amber-50' : '';
              return (
                <tr key={`${s.rawId}-${i}`} className={`border-t border-gray-100 ${cellBg}`}>
                  <td className="py-1.5 px-3">
                    <code className="text-[10px] bg-gray-100 px-1 rounded break-all">{s.rawId}</code>
                  </td>
                  <td className="py-1.5 px-3 font-mono text-[10px]">{s.canonical}</td>
                  <td className="py-1.5 px-3">{s.label}</td>
                  <td className="py-1.5 px-3">
                    {s.family ? (
                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                        {FAMILY_LABELS[s.family] || s.family}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-gray-500">{s.source}</td>
                  <td className="py-1.5 px-3 text-gray-500">{s.methodName}</td>
                  <td className="py-1.5 px-3 text-gray-500">{s.location}</td>
                  <td className="py-1.5 px-3">
                    {isBroken ? (
                      <span className="text-red-600 font-medium">שבור</span>
                    ) : isMismatch ? (
                      <span className="text-amber-600 font-medium">אי-התאמה</span>
                    ) : (
                      <span className="text-green-600">✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {row.mismatches.length > 0 && row.expectedFamily && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 inline-block me-1" />
          <strong>אי-התאמה:</strong> התרגיל &quot;{row.name}&quot; צפוי להשתמש במשפחת{' '}
          <strong>{FAMILY_LABELS[row.expectedFamily] || row.expectedFamily}</strong>, אבל מכיל ציוד
          ממשפחה אחרת.
          {FAMILY_LEADER[row.expectedFamily] && (
            <span>
              {' '}
              לחיצה על &quot;תקן&quot; תחליף את הציוד הבעייתי ב-
              <strong>{FAMILY_LEADER[row.expectedFamily].label}</strong>.
            </span>
          )}
        </div>
      )}

      {row.broken.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
          <XCircle className="w-4 h-4 inline-block me-1" />
          <strong>לינקים שבורים:</strong> ה-ID&apos;ים הבאים לא נמצאו ב-Firestore:{' '}
          {row.broken.map((b) => (
            <code key={b.rawId} className="bg-red-100 px-1 rounded mx-0.5">
              {b.rawId}
            </code>
          ))}
        </div>
      )}

      {row.hasGarbage && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-800">
          <AlertTriangle className="w-4 h-4 inline-block me-1" />
          <strong>ערכים פגומים:</strong> מערכי הציוד מכילים ערכים לא-תקינים (מספרים, מחרוזות ריקות).
          לחיצה על &quot;הסר שבורים&quot; תנקה אותם.
        </div>
      )}
    </div>
  );
}
