'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import {
  getClassGrades, getCurrentTerm, getTermLabel,
} from '@/features/admin/services/grades.service';
import type { StudentGradeRow } from '@/features/admin/services/grades.service';
import GradingTable from '@/features/admin/components/education/GradingTable';
import { Loader2, GraduationCap, ChevronDown } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface ClassOption {
  id: string;
  name: string;
  memberCount: number;
}

// ── Page ──────────────────────────────────────────────────────────────

export default function GradesPage() {
  const [loading, setLoading] = useState(true);
  const [teacherUid, setTeacherUid] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [term, setTerm] = useState(getCurrentTerm());
  const [grades, setGrades] = useState<StudentGradeRow[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);

  // Build term options: current year + previous year, both semesters
  const termOptions = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return [
      { value: `${year}_A`, label: getTermLabel(`${year}_A`) },
      { value: `${year}_B`, label: getTermLabel(`${year}_B`) },
      { value: `${year - 1}_A`, label: getTermLabel(`${year - 1}_A`) },
      { value: `${year - 1}_B`, label: getTermLabel(`${year - 1}_B`) },
    ];
  }, []);

  // Auth + load classes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setTeacherUid(user.uid);

      try {
        const role = await checkUserRole(user.uid);
        if (!role) return;
        const authorities = await getAuthoritiesByManager(user.uid);
        if (authorities.length === 0) return;

        const authority = authorities[0];
        setTenantId(authority.id);

        // Load class-level units (children of this authority's tenant)
        const unitsSnap = await getDocs(query(
          collection(db, 'tenants', authority.id, 'units'),
        ));

        const classList: ClassOption[] = [];
        for (const unitDoc of unitsSnap.docs) {
          const d = unitDoc.data();
          classList.push({
            id: unitDoc.id,
            name: d.name ?? unitDoc.id,
            memberCount: d.memberCount ?? 0,
          });
        }

        // If no units collection yet, fall back to authority itself as a single class
        if (classList.length === 0) {
          classList.push({
            id: authority.id,
            name: authority.name ?? 'כיתה ראשית',
            memberCount: 0,
          });
        }

        setClasses(classList);
        setSelectedClassId(classList[0]?.id ?? '');
      } catch (err) {
        console.error('[GradesPage] init error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Load grades when class or term changes
  useEffect(() => {
    if (!selectedClassId || !tenantId) return;
    loadGrades();
  }, [selectedClassId, term, tenantId]);

  const loadGrades = async () => {
    setLoadingGrades(true);
    try {
      const data = await getClassGrades(selectedClassId, tenantId, term);
      setGrades(data);
    } catch (err) {
      console.error('[GradesPage] grade load error:', err);
    } finally {
      setLoadingGrades(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center">
          <GraduationCap size={28} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">ציוני חנ&quot;ג</h1>
          <p className="text-sm text-gray-500">
            ניהול ציונים לפי כיתה וסמסטר
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-4 flex-wrap bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        {/* Class selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-400 font-bold">כיתה</label>
          <div className="relative">
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pe-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Term selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-400 font-bold">סמסטר</label>
          <div className="relative">
            <select
              value={term}
              onChange={e => setTerm(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pe-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              {termOptions.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="ms-auto text-sm text-slate-400">
          {grades.length} תלמידים
        </div>
      </div>

      {/* ── Grading Table ── */}
      {loadingGrades ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          <span className="ms-2 text-sm text-slate-500">טוען ציונים...</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <GradingTable
            grades={grades}
            unitId={selectedClassId}
            tenantId={tenantId}
            term={term}
            teacherUid={teacherUid ?? ''}
            onSaved={loadGrades}
          />
        </div>
      )}
    </div>
  );
}
