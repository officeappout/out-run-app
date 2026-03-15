'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Edit3 } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

const DIST_KM: Record<string, number> = {
  '2k': 2, '3k': 3, '5k': 5, '10k': 10, maintenance: 5,
};

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function riegelPredict(basePaceSecKm: number, refKm: number, targetKm: number): number {
  const refTime = basePaceSecKm * refKm;
  return refTime * Math.pow(targetKm / refKm, 1.06);
}

interface RunDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const PREDICTIONS = [
  { label: '5K', km: 5 },
  { label: '10K', km: 10 },
  { label: 'חצי מרתון', km: 21.0975 },
];

export default function RunDetailsDrawer({ isOpen, onClose }: RunDetailsDrawerProps) {
  const { profile, refreshProfile } = useUserStore();
  const running = profile?.running;
  const basePace = running?.paceProfile?.basePace ?? 0;
  const refKm = DIST_KM[running?.generatedProgramTemplate?.targetDistance ?? '5k'] ?? 5;

  const predictions = useMemo(() => {
    if (!basePace || basePace <= 0) return [];
    return PREDICTIONS.map(({ label, km }) => ({
      label,
      time: formatTime(riegelPredict(basePace, refKm, km)),
    }));
  }, [basePace, refKm]);

  const [editMode, setEditMode] = useState(false);
  const [paceMin, setPaceMin] = useState(() => Math.floor(basePace / 60));
  const [paceSec, setPaceSec] = useState(() => Math.round(basePace % 60));
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const newPace = paceMin * 60 + paceSec;
    if (newPace < 180) return; // elite threshold
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'users', uid),
        { running: { paceProfile: { basePace: newPace } } },
        { merge: true },
      );
      await refreshProfile?.();
      setEditMode(false);
    } catch (err) {
      console.error('[RunDetailsDrawer] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [paceMin, paceSec, refreshProfile]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/40"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
            className="fixed bottom-0 left-0 right-0 z-[81] max-w-md mx-auto bg-white dark:bg-[#1E2A28] rounded-t-3xl shadow-2xl"
            dir="rtl"
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mt-3" />

            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                פרטי תוכנית
              </h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>

            {predictions.length > 0 && (
              <div className="px-5 pb-4">
                <p className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                  <Trophy size={13} style={{ color: '#00BAF7' }} />
                  תחזית מירוצים
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {predictions.map((p) => (
                    <div
                      key={p.label}
                      className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center"
                    >
                      <p className="text-[11px] font-bold text-slate-400 mb-1">{p.label}</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                        {p.time}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 pb-8">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  <Edit3 size={13} style={{ color: '#0AC2B6' }} />
                  קצב בסיס (דק׳/ק״מ)
                </p>
                {!editMode && (
                  <button
                    onClick={() => {
                      setPaceMin(Math.floor(basePace / 60));
                      setPaceSec(Math.round(basePace % 60));
                      setEditMode(true);
                    }}
                    className="text-xs font-bold px-3 py-1 rounded-lg"
                    style={{ color: '#00BAF7', background: 'rgba(0,186,247,0.1)' }}
                  >
                    עדכן
                  </button>
                )}
              </div>

              {editMode ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                    <input
                      type="number"
                      min={3} max={15}
                      value={paceMin}
                      onChange={(e) => setPaceMin(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-10 text-center text-xl font-black bg-transparent text-slate-900 dark:text-white outline-none tabular-nums"
                    />
                    <span className="text-slate-400 font-bold">:</span>
                    <input
                      type="number"
                      min={0} max={59}
                      value={String(paceSec).padStart(2, '0')}
                      onChange={(e) => setPaceSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-10 text-center text-xl font-black bg-transparent text-slate-900 dark:text-white outline-none tabular-nums"
                    />
                  </div>
                  <span className="text-xs text-slate-400">דק׳/ק״מ</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => setEditMode(false)}
                    className="text-xs font-bold text-slate-400 px-3 py-2"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || (paceMin * 60 + paceSec) < 180}
                    className="text-xs font-bold text-white px-4 py-2 rounded-xl disabled:opacity-40"
                    style={{ background: '#00BAF7' }}
                  >
                    {saving ? '...' : 'שמור'}
                  </button>
                </div>
              ) : (
                <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                  {basePace > 0
                    ? `${Math.floor(basePace / 60)}:${String(Math.round(basePace % 60)).padStart(2, '0')}`
                    : '—'}
                  <span className="text-sm font-bold text-slate-400 mr-2">דק׳/ק״מ</span>
                </p>
              )}
              {editMode && (paceMin * 60 + paceSec) < 180 && (paceMin * 60 + paceSec) > 0 && (
                <p className="text-xs text-red-500 mt-2 font-medium">
                  קצב מהיר מ-3:00 דק׳/ק״מ — ייתכן שיש שגיאה
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
