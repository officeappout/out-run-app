'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import {
  Camera,
  Search,
  Download,
  Loader2,
  FileText,
  X,
  CheckCircle2,
  Copy,
  Check,
  Link2,
} from 'lucide-react';
import {
  PHOTO_RELEASE_COLLECTION,
  type PhotoReleaseSubmission,
} from '../types';

// ── Status display map (Hebrew labels + pill colors) ──
const STATUS_META: Record<string, { label: string; className: string }> = {
  submitted: { label: 'נשלח', className: 'bg-emerald-50 text-emerald-700' },
  reviewed: { label: 'נבדק', className: 'bg-blue-50 text-blue-700' },
  archived: { label: 'בארכיון', className: 'bg-slate-100 text-slate-600' },
};

function formatDate(createdAt: PhotoReleaseSubmission['createdAt']): string {
  if (!createdAt?.toDate) return '—';
  try {
    const d = createdAt.toDate();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
  } catch {
    return '—';
  }
}

export default function PhotoReleaseManagement() {
  const [submissions, setSubmissions] = useState<PhotoReleaseSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [schoolFilter, setSchoolFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Real-time subscription ──
  useEffect(() => {
    const q = query(
      collection(db, PHOTO_RELEASE_COLLECTION),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: PhotoReleaseSubmission[] = [];
        snap.forEach((docSnap) => {
          rows.push({ id: docSnap.id, ...(docSnap.data() as object) } as PhotoReleaseSubmission);
        });
        setSubmissions(rows);
        setLoading(false);
      },
      (err) => {
        console.error('[PhotoReleaseManagement] subscription error:', err);
        setError('שגיאה בטעינת האישורים. ודאו שיש לכם הרשאות מנהל.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  // ── Distinct class chips for quick filtering ──
  const distinctClasses = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      const c = (s.studentClass ?? '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [submissions]);

  // ── Apply filters (instant, case-insensitive substring) ──
  const filtered = useMemo(() => {
    const school = schoolFilter.trim().toLowerCase();
    const klass = classFilter.trim().toLowerCase();
    return submissions.filter((s) => {
      const schoolOk = !school || (s.school ?? '').toLowerCase().includes(school);
      const classOk = !klass || (s.studentClass ?? '').toLowerCase().includes(klass);
      return schoolOk && classOk;
    });
  }, [submissions, schoolFilter, classFilter]);

  // ── Download stamped PDF ──
  const handleDownload = useCallback(async (id: string) => {
    setDownloadError(null);
    setDownloadingId(id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/photo-release/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `photo-release-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[PhotoReleaseManagement] download failed:', err);
      setDownloadError('הורדת ה-PDF נכשלה. נסו שוב.');
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const hasActiveFilter = schoolFilter.trim() || classFilter.trim();

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <Camera size={32} className="text-cyan-600" />
            אישורי צילום ופרסום
          </h1>
          <p className="text-gray-500 mt-2">
            ניהול וצפייה בטפסי ההסכמה לצילום שנשלחו על ידי הורים, והורדת המסמך החתום כ-PDF.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-center min-w-[110px]">
          <p className="text-3xl font-black text-gray-900">{submissions.length}</p>
          <p className="text-xs text-gray-500 mt-1">סה"כ אישורים</p>
        </div>
      </div>

      {/* ── Public link banner ── */}
      {(() => {
        const publicUrl =
          (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000') +
          '/public/forms/photo-release';
        return (
          <div className="flex items-center gap-3 bg-cyan-50 border border-cyan-200 rounded-2xl px-5 py-3 flex-wrap">
            <Link2 size={18} className="shrink-0 text-cyan-600" />
            <span className="text-sm font-bold text-cyan-800 shrink-0">
              קישור ציבורי לשליחה להורים בוואטסאפ:
            </span>
            <span
              dir="ltr"
              className="flex-1 text-sm text-cyan-700 font-mono truncate min-w-0"
            >
              {publicUrl}
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2500);
                } catch {
                  /* clipboard permission denied — no-op */
                }
              }}
              className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-bold transition-all ${
                linkCopied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-cyan-600 text-white hover:bg-cyan-700'
              }`}
            >
              {linkCopied ? (
                <>
                  <Check size={15} />
                  הועתק!
                </>
              ) : (
                <>
                  <Copy size={15} />
                  העתק קישור
                </>
              )}
            </button>
          </div>
        );
      })()}

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* School filter */}
          <div className="relative">
            <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              placeholder="סינון לפי בית ספר (למשל: אשקלון)"
              className="w-full pr-12 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          {/* Class filter */}
          <div className="relative">
            <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              placeholder="סינון לפי כיתה (למשל: ט1, י2)"
              className="w-full pr-12 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Quick class chips */}
        {distinctClasses.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-400">כיתות:</span>
            {distinctClasses.map((c) => {
              const active = classFilter.trim() === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClassFilter(active ? '' : c)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                    active
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => { setSchoolFilter(''); setClassFilter(''); }}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800"
          >
            <X size={14} /> נקה סינון ({filtered.length} מתוך {submissions.length})
          </button>
        )}
      </div>

      {downloadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          {downloadError}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500" />
        </div>
      ) : error ? (
        <div className="text-center py-16 bg-red-50 rounded-xl border border-red-200">
          <p className="text-red-600 font-bold">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-bold">
            {hasActiveFilter ? 'לא נמצאו אישורים תואמים' : 'טרם התקבלו אישורי צילום'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {hasActiveFilter ? 'נסו לשנות את הסינון' : 'אישורים שיישלחו על ידי הורים יופיעו כאן'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">תאריך</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">שם התלמיד/ה</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">שם ההורה</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">בית ספר</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500">כיתה</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500">סטטוס</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const status = STATUS_META[s.status ?? 'submitted'] ?? STATUS_META.submitted;
                return (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-600" dir="ltr">{formatDate(s.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-gray-900">{s.studentName || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{s.parentName || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{s.school || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-medium text-gray-700">{s.studentClass || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full ${status.className}`}>
                        <CheckCircle2 size={12} /> {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDownload(s.id)}
                        disabled={downloadingId === s.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-bold hover:bg-cyan-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {downloadingId === s.id ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> מכין...
                          </>
                        ) : (
                          <>
                            <Download size={14} /> הורד PDF 📄
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
