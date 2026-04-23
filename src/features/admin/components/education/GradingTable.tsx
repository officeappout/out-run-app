'use client';

import { useState, useMemo } from 'react';
import { Save, Loader2, Search, ArrowUpDown } from 'lucide-react';
import type { StudentGradeRow } from '@/features/admin/services/grades.service';
import { saveManualGrades } from '@/features/admin/services/grades.service';

interface GradingTableProps {
  grades: StudentGradeRow[];
  unitId: string;
  tenantId: string;
  term: string;
  teacherUid: string;
  onSaved: () => void;
}

type SortKey = 'name' | 'autoScore' | 'manualGrade' | 'finalGrade' | 'totalXP';

export default function GradingTable({
  grades, unitId, tenantId, term, teacherUid, onSaved,
}: GradingTableProps) {
  const [localGrades, setLocalGrades] = useState<StudentGradeRow[]>(grades);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [dirty, setDirty] = useState(false);

  // Sync from parent when grades prop changes
  useState(() => { setLocalGrades(grades); });

  const updateManualGrade = (uid: string, value: string) => {
    const parsed = value === '' ? null : Math.max(0, Math.min(100, Number(value)));
    setLocalGrades(prev => prev.map(g => {
      if (g.uid !== uid) return g;
      const manualGrade = parsed === null || isNaN(parsed as number) ? null : parsed;
      const autoWeight = 0.7;
      const manualWeight = 0.3;
      const finalGrade = manualGrade === null
        ? g.autoScore
        : Math.round(g.autoScore * autoWeight + manualGrade * manualWeight);
      return { ...g, manualGrade, finalGrade };
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveManualGrades(
        localGrades.map(g => ({ uid: g.uid, autoScore: g.autoScore, manualGrade: g.manualGrade })),
        unitId, tenantId, term, teacherUid,
      );
      setDirty(false);
      onSaved();
    } catch (err) {
      console.error('[GradingTable] save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(prev => !prev);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    let list = [...localGrades];

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(g => g.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name, 'he'); break;
        case 'autoScore': cmp = a.autoScore - b.autoScore; break;
        case 'manualGrade': cmp = (a.manualGrade ?? -1) - (b.manualGrade ?? -1); break;
        case 'finalGrade': cmp = a.finalGrade - b.finalGrade; break;
        case 'totalXP': cmp = a.totalXP - b.totalXP; break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [localGrades, searchTerm, sortKey, sortAsc]);

  const classAvg = useMemo(() => {
    if (localGrades.length === 0) return 0;
    return Math.round(localGrades.reduce((s, g) => s + g.finalGrade, 0) / localGrades.length);
  }, [localGrades]);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      onClick={() => toggleSort(field)}
      className="text-right py-2.5 px-3 cursor-pointer select-none hover:text-slate-600 transition-colors"
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={sortKey === field ? 'text-cyan-500' : 'text-slate-300'} />
      </span>
    </th>
  );

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="חפש תלמיד..."
              className="pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent w-56"
            />
          </div>
          <div className="text-sm text-slate-500">
            ממוצע כיתתי: <span className="font-black text-slate-800">{classAvg}</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'שומר...' : 'שמור ציונים'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
              <th className="text-right py-2.5 px-3 w-8">#</th>
              <SortHeader label="שם תלמיד" field="name" />
              <SortHeader label="XP" field="totalXP" />
              <th className="text-right py-2.5 px-3">אימונים</th>
              <th className="text-right py-2.5 px-3">דקות</th>
              <SortHeader label="ציון אוטומטי" field="autoScore" />
              <SortHeader label="ציון ידני" field="manualGrade" />
              <SortHeader label="ציון סופי" field="finalGrade" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((g, i) => (
              <tr
                key={g.uid}
                className="border-b border-slate-100 last:border-b-0 hover:bg-white/60 transition-colors"
              >
                <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                <td className="py-2.5 px-3 font-bold text-slate-800">{g.name}</td>
                <td className="py-2.5 px-3 text-xs text-cyan-600 font-bold">{g.totalXP.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-xs text-slate-600">{g.totalWorkouts}</td>
                <td className="py-2.5 px-3 text-xs text-slate-600">{g.totalMinutes}</td>
                <td className="py-2.5 px-3">
                  <ScoreBadge value={g.autoScore} />
                </td>
                <td className="py-2.5 px-3">
                  <input
                    type="number"
                    dir="ltr"
                    min={0}
                    max={100}
                    value={g.manualGrade ?? ''}
                    onChange={e => updateManualGrade(g.uid, e.target.value)}
                    placeholder="—"
                    className="w-16 text-center px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent"
                  />
                </td>
                <td className="py-2.5 px-3">
                  <FinalBadge value={g.finalGrade} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">
          {searchTerm ? 'לא נמצאו תלמידים' : 'אין תלמידים בכיתה זו'}
        </p>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        ציון סופי = 70% ציון אוטומטי + 30% ציון ידני. אם לא הוזן ציון ידני, הציון הסופי = ציון אוטומטי.
      </p>
    </div>
  );
}

// ── Score Badges ─────────────────────────────────────────────────────

function ScoreBadge({ value }: { value: number }) {
  const color = value >= 75 ? 'text-green-700 bg-green-100'
    : value >= 50 ? 'text-cyan-700 bg-cyan-100'
    : value >= 30 ? 'text-amber-700 bg-amber-100'
    : 'text-red-700 bg-red-100';
  return (
    <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${color}`}>
      {value}
    </span>
  );
}

function FinalBadge({ value }: { value: number }) {
  const color = value >= 75 ? 'text-green-700 bg-green-50 ring-green-200'
    : value >= 55 ? 'text-cyan-700 bg-cyan-50 ring-cyan-200'
    : value >= 40 ? 'text-amber-700 bg-amber-50 ring-amber-200'
    : 'text-red-700 bg-red-50 ring-red-200';
  return (
    <span className={`text-sm font-black px-3 py-1 rounded-xl ring-1 ${color}`}>
      {value}
    </span>
  );
}
