'use client';

import { Fragment, useMemo, useState } from 'react';
import { Users, Plus, Unlink, Check, X as XIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { RosterSoldierEntry } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessMatchSuggestion, ReadinessMatchAmbiguity } from '@/features/readiness/core/services/readiness-match.service';
import ReadinessStatusBadge from './ReadinessStatusBadge';

const GENDER_LABEL: Record<'male' | 'female', string> = { male: 'זכר', female: 'נקבה' };

/**
 * "מחובר לאפליקציה" — three states, not two (04.10.2026, §13.84). David,
 * explicit: never write "לא הוריד" — a soldier who downloaded the app,
 * declared a DIFFERENT unit, or typed their name slightly differently
 * looks identical, from this data, to someone who never installed it at
 * all. This column only ever states what's actually known:
 *   מחובר — a real uid is on the row.
 *   ממתין לאישור — a suggestion or ambiguity exists; click resolves it
 *     in place, right here, never a separate screen to remember to open.
 *   לא מחובר — neither of the above. Not a claim about app usage.
 */
function connectionState(soldierId: string, uid: string | null, hasSuggestion: boolean, hasAmbiguity: boolean): 'connected' | 'pending' | 'none' {
  if (uid) return 'connected';
  if (hasSuggestion || hasAmbiguity) return 'pending';
  return 'none';
}

interface SoldiersRosterTableProps {
  soldiers: RosterSoldierEntry[];
  suggestions: ReadinessMatchSuggestion[];
  ambiguities: ReadinessMatchAmbiguity[];
  onAddSoldier: () => void;
  onUnlinked: () => void;
  /** Called after a link/reject/bulk-approve succeeds — the page re-fetches both the roster and match-suggestions. */
  onMatchResolved: () => void;
}

export default function SoldiersRosterTable({ soldiers, suggestions, ambiguities, onAddSoldier, onUnlinked, onMatchResolved }: SoldiersRosterTableProps) {
  const [confirmUnlink, setConfirmUnlink] = useState<RosterSoldierEntry | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedSoldierId, setExpandedSoldierId] = useState<string | null>(null);
  const [actingPairKey, setActingPairKey] = useState<string | null>(null); // `${soldierId}:${uid}`, disables both buttons for that one pair while in flight
  const [rowError, setRowError] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  /** David's Q1, explicit: a partial failure must be VISIBLE — which
   *  pairs, and why — not just a count. Persists across the
   *  onMatchResolved() refresh (not auto-cleared) until the next bulk
   *  attempt, so the officer can read it alongside the table below,
   *  which — correctly, with no special-casing needed here — keeps
   *  showing "ממתין לאישור" for any pair whose underlying suggestion is
   *  still valid after the refresh (it only disappears when the
   *  underlying data genuinely changed, e.g. someone else linked it in
   *  the meantime — a stale suggestion correctly vanishing, not a
   *  hidden failure). */
  const [bulkFailures, setBulkFailures] = useState<{ soldierId: string; soldierName: string; error: string }[]>([]);

  const suggestionBySoldierId = useMemo(() => new Map(suggestions.map((s) => [s.soldierId, s])), [suggestions]);
  const ambiguityBySoldierId = useMemo(() => new Map(ambiguities.map((a) => [a.soldierId, a])), [ambiguities]);

  const handleUnlink = async () => {
    if (!confirmUnlink) return;
    setUnlinking(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const res = await fetch('/api/units/readiness/soldiers/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ soldierId: confirmUnlink.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה (${res.status})`);
      setConfirmUnlink(null);
      onUnlinked();
    } catch (err: any) {
      console.error('[SoldiersRosterTable] unlink failed:', err);
      setError(err?.message ?? 'שגיאה בביטול השיוך.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleLink = async (soldierId: string, uid: string) => {
    setActingPairKey(`${soldierId}:${uid}`);
    setRowError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const res = await fetch('/api/units/readiness/soldiers/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ soldierId, uid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בקישור (${res.status})`);
      setExpandedSoldierId(null);
      onMatchResolved();
    } catch (err: any) {
      setRowError(err?.message ?? 'שגיאה בקישור.');
    } finally {
      setActingPairKey(null);
    }
  };

  const handleReject = async (soldierId: string, uid: string) => {
    setActingPairKey(`${soldierId}:${uid}`);
    setRowError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const res = await fetch('/api/units/readiness/soldiers/match/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ soldierId, uid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה (${res.status})`);
      onMatchResolved();
    } catch (err: any) {
      setRowError(err?.message ?? 'שגיאה בדחיית ההתאמה.');
    } finally {
      setActingPairKey(null);
    }
  };

  const handleBulkApprove = async () => {
    if (suggestions.length === 0) return;
    setBulkApproving(true);
    setBulkError(null);
    setBulkFailures([]);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const res = await fetch('/api/units/readiness/soldiers/match/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pairs: suggestions.map((s) => ({ soldierId: s.soldierId, uid: s.uid })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה (${res.status})`);
      if (Array.isArray(body.failed) && body.failed.length > 0) {
        // Exactly which pairs, and why — a count alone isn't enough
        // (David, explicit: "צריך שיראה בדיוק אילו זוגות נכשלו ולמה").
        setBulkFailures(
          body.failed.map((f: { soldierId: string; error: string }) => ({
            soldierId: f.soldierId,
            soldierName: suggestionBySoldierId.get(f.soldierId)?.soldierName ?? f.soldierId,
            error: f.error,
          })),
        );
      }
      onMatchResolved();
    } catch (err: any) {
      setBulkError(err?.message ?? 'שגיאה באישור ההתאמות.');
    } finally {
      setBulkApproving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base font-black text-gray-900">רשימת חיילים ({soldiers.length})</h3>
        <div className="flex items-center gap-2">
          {suggestions.length > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproving}
              className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 text-sm font-bold px-4 py-2.5 rounded-xl transition-all hover:bg-emerald-100 disabled:opacity-50"
            >
              <Check size={16} /> {bulkApproving ? 'מאשר…' : `אשר את כל ההתאמות החד-משמעיות (${suggestions.length})`}
            </button>
          )}
          <button
            onClick={onAddSoldier}
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all bg-lime-700 hover:bg-lime-800"
          >
            <Plus size={16} /> הוסף חייל
          </button>
        </div>
      </div>

      {bulkError && <p className="text-xs text-red-600 font-semibold mb-3">{bulkError}</p>}

      {bulkFailures.length > 0 && (
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
          <p className="text-xs font-bold text-red-700 mb-1.5">
            {bulkFailures.length === 1 ? 'קישור אחד נכשל:' : `${bulkFailures.length} קישורים נכשלו:`}
          </p>
          <ul className="space-y-0.5">
            {bulkFailures.map((f) => (
              <li key={f.soldierId} className="text-[11px] text-red-600">
                <span className="font-bold">{f.soldierName}</span> — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {soldiers.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex p-4 rounded-full mb-4 bg-lime-50">
            <Users size={32} className="text-lime-700" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">אין עדיין חיילים ביחידה</h3>
          <p className="text-gray-500 mt-2">התחל בהוספת חיילים</p>
          <button
            onClick={onAddSoldier}
            className="mt-4 inline-flex items-center gap-2 text-white px-6 py-3 rounded-xl font-bold transition-all bg-lime-700 hover:bg-lime-800"
          >
            <Plus size={18} /><span>הוסף חייל</span>
          </button>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                <th className="text-right py-2 px-3 w-8">#</th>
                <th className="text-right py-2 px-3">שם</th>
                <th className="text-right py-2 px-3">מגדר</th>
                <th className="text-right py-2 px-3">מחובר לאפליקציה</th>
                <th className="text-right py-2 px-3">תוצאה אחרונה</th>
                <th className="text-right py-2 px-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {soldiers.map((s, i) => {
                const suggestion = suggestionBySoldierId.get(s.id);
                const ambiguity = ambiguityBySoldierId.get(s.id);
                const state = connectionState(s.id, s.uid, !!suggestion, !!ambiguity);
                const isExpanded = expandedSoldierId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-100/50 transition-colors">
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{s.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{GENDER_LABEL[s.gender]}</td>
                      <td className="py-2.5 px-3">
                        {state === 'connected' ? (
                          <span className="text-xs font-bold text-emerald-700">מחובר</span>
                        ) : state === 'pending' ? (
                          <button
                            onClick={() => { setExpandedSoldierId(isExpanded ? null : s.id); setRowError(null); }}
                            className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 hover:bg-amber-100 transition-colors"
                          >
                            ממתין לאישור {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">לא מחובר</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <ReadinessStatusBadge status={s.currentStatus} notPerformedReason={s.notPerformedReason} />
                        {s.nearThreshold.isNear && (
                          <div className="text-[10px] text-slate-500 mt-1">{s.nearThreshold.note}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {s.uid && (
                          <button
                            onClick={() => { setConfirmUnlink(s); setError(null); }}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-100 transition-colors"
                          >
                            <Unlink size={11} /> בטל שיוך
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (suggestion || ambiguity) && (
                      <tr key={`${s.id}-expanded`} className="border-b border-slate-100 last:border-b-0 bg-slate-50/50">
                        <td colSpan={6} className="py-3 px-3">
                          {rowError && <p className="text-xs text-red-600 font-semibold mb-2">{rowError}</p>}
                          {suggestion ? (
                            <div className="flex items-center justify-between bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2.5">
                              <span className="text-sm text-slate-700">
                                מתאים ל־<span className="font-bold">{suggestion.accountName}</span>
                                <span className="text-slate-400"> (מוצהר: {suggestion.declaredUnitName})</span>
                              </span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => handleLink(suggestion.soldierId, suggestion.uid)}
                                  disabled={actingPairKey === `${suggestion.soldierId}:${suggestion.uid}`}
                                  className="flex items-center gap-1 text-xs font-bold text-white bg-lime-700 hover:bg-lime-800 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                                >
                                  <Check size={12} /> קשר
                                </button>
                                <button
                                  onClick={() => handleReject(suggestion.soldierId, suggestion.uid)}
                                  disabled={actingPairKey === `${suggestion.soldierId}:${suggestion.uid}`}
                                  className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                                >
                                  <XIcon size={12} /> לא הוא
                                </button>
                              </div>
                            </div>
                          ) : ambiguity ? (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                              <p className="text-xs font-bold text-amber-700">מתאים למספר חשבונות אפשריים — בחר, או דחה</p>
                              {ambiguity.candidates.map((c) => (
                                <div key={c.uid} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                                  <span className="text-sm text-slate-700">
                                    {c.accountName} <span className="text-slate-400">(מוצהר: {c.declaredUnitName})</span>
                                  </span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={() => handleLink(ambiguity.soldierId, c.uid)}
                                      disabled={actingPairKey === `${ambiguity.soldierId}:${c.uid}`}
                                      className="flex items-center gap-1 text-xs font-bold text-white bg-lime-700 hover:bg-lime-800 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                                    >
                                      <Check size={12} /> קשר
                                    </button>
                                    <button
                                      onClick={() => handleReject(ambiguity.soldierId, c.uid)}
                                      disabled={actingPairKey === `${ambiguity.soldierId}:${c.uid}`}
                                      className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                                    >
                                      <XIcon size={12} /> לא הוא
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmUnlink && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !unlinking && setConfirmUnlink(null)}
        >
          <div dir="rtl" className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900">ביטול שיוך — {confirmUnlink.name}</h3>
            <p className="text-sm text-gray-600">
              החשבון יוסר מהרשומה. הרשומה ותוצאותיה הקיימות <span className="font-bold">לא יימחקו</span> — ניתן לשייך אליה חשבון מחדש בכל עת.
            </p>
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmUnlink(null)}
                disabled={unlinking}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all disabled:opacity-50"
              >
                {unlinking ? 'מבטל...' : 'בטל שיוך'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
