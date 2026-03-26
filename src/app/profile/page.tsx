"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, X, ChevronLeft, Pencil, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '@/features/user';
import HistoryTab from '@/features/profile/components/HistoryTab';
import FreeRunSummary from '@/features/workout-engine/players/running/components/FreeRun/FreeRunSummary';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import type { OnboardingStepId } from '@/features/user/onboarding/types';
import { getAllGearDefinitions, type GearDefinition } from '@/features/content/equipment/gear';
import { doc as firestoreDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { getUserFromFirestore } from '@/lib/firestore.service';

function formatBirthDate(raw: unknown): string | null {
  if (!raw) return null;
  const str = String(raw);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return str;
}

const EQUIPMENT_SVG_MAP: Record<string, string> = {
  rings: '/assets/icons/equipment/rings.svg',
  gymnastic_rings: '/assets/icons/equipment/rings.svg',
  bands: '/assets/icons/equipment/bands.svg',
  resistance_band: '/assets/icons/equipment/bands.svg',
  resistance_bands: '/assets/icons/equipment/bands.svg',
  pull_up_bar: '/assets/icons/equipment/pullupbar.svg',
  pullup_bar: '/assets/icons/equipment/pullupbar.svg',
  pullUpBar: '/assets/icons/equipment/pullupbar.svg',
  dip_station: '/assets/icons/equipment/parallelbars.svg',
  parallettes: '/assets/icons/equipment/parallelbars.svg',
  trx: '/assets/icons/equipment/trx.svg',
};

function gearIconSrc(gearId: string, gearDefs: GearDefinition[]): string | null {
  if (EQUIPMENT_SVG_MAP[gearId]) return EQUIPMENT_SVG_MAP[gearId];
  const def = gearDefs.find(g => g.id === gearId);
  if (!def) return null;
  const en = (def.name?.en || '').toLowerCase();
  const he = (def.name?.he || '').toLowerCase();
  if (en.includes('ring') || he.includes('טבעות')) return EQUIPMENT_SVG_MAP.rings;
  if (en.includes('band') || he.includes('גומי')) return EQUIPMENT_SVG_MAP.bands;
  if ((en.includes('pull') && en.includes('bar')) || he.includes('מתח')) return EQUIPMENT_SVG_MAP.pull_up_bar;
  if (en.includes('parallel') || en.includes('dip') || he.includes('מקביל')) return EQUIPMENT_SVG_MAP.dip_station;
  if (en.includes('trx')) return EQUIPMENT_SVG_MAP.trx;
  return null;
}

function gearDisplayName(gearId: string, gearDefs: GearDefinition[]): string {
  const def = gearDefs.find(g => g.id === gearId);
  return def?.name?.he || def?.name?.en || gearId;
}

export default function ProfilePage() {
  const router = useRouter();
  const { profile, _hasHydrated } = useUserStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'history'>('profile');
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutHistoryEntry | null>(null);
  const [gearDefs, setGearDefs] = useState<GearDefinition[]>([]);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  // ── Inline edit modals ──
  const [editingField, setEditingField] = useState<'name' | 'dob' | null>(null);
  const [editName, setEditName] = useState('');
  const [editDob, setEditDob] = useState({ day: '', month: '', year: '' });
  const [editSaving, setEditSaving] = useState(false);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const openNameEdit = useCallback(() => {
    setEditName(profile?.core?.name || '');
    setEditingField('name');
  }, [profile?.core?.name]);

  const openDobEdit = useCallback(() => {
    if (profile?.core?.birthDate) {
      const d = profile.core.birthDate instanceof Date
        ? profile.core.birthDate
        : new Date(profile.core.birthDate);
      if (!isNaN(d.getTime())) {
        setEditDob({
          day: String(d.getDate()).padStart(2, '0'),
          month: String(d.getMonth() + 1).padStart(2, '0'),
          year: String(d.getFullYear()),
        });
      } else {
        setEditDob({ day: '', month: '', year: '' });
      }
    } else {
      setEditDob({ day: '', month: '', year: '' });
    }
    setEditingField('dob');
  }, [profile?.core?.birthDate]);

  const saveInlineEdit = useCallback(async () => {
    const uid = auth.currentUser?.uid || profile?.id;
    if (!uid || editSaving) return;
    setEditSaving(true);
    try {
      if (editingField === 'name') {
        const trimmed = editName.trim();
        if (!trimmed) { setEditSaving(false); return; }
        await updateDoc(firestoreDoc(db, 'users', uid), { 'core.name': trimmed });
      } else if (editingField === 'dob') {
        const day = parseInt(editDob.day, 10);
        const month = parseInt(editDob.month, 10);
        const year = parseInt(editDob.year, 10);
        if (!day || !month || !year || month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
          setEditSaving(false); return;
        }
        const birthDate = new Date(year, month - 1, day);
        await updateDoc(firestoreDoc(db, 'users', uid), { 'core.birthDate': birthDate });
      }
      const fresh = await getUserFromFirestore(uid);
      if (fresh) useUserStore.getState().initializeProfile(fresh);
      setEditingField(null);
      setShowUpdateToast(true);
    } catch (e) {
      console.error('[Profile] Inline edit failed:', e);
    } finally {
      setEditSaving(false);
    }
  }, [editingField, editName, editDob, editSaving, profile?.id]);

  useEffect(() => {
    getAllGearDefinitions().then(setGearDefs).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = sessionStorage.getItem('profile_update_toast');
    if (!flag) return;
    sessionStorage.removeItem('profile_update_toast');
    const t = setTimeout(() => setShowUpdateToast(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showUpdateToast) return;
    const t = setTimeout(() => setShowUpdateToast(false), 3500);
    return () => clearTimeout(t);
  }, [showUpdateToast]);

  React.useEffect(() => {
    if (_hasHydrated && !profile) {
      router.replace('/onboarding');
    }
  }, [_hasHydrated, profile, router]);

  if (!_hasHydrated) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500">מעביר להרשמה...</p>
      </div>
    );
  }

  if (selectedWorkout) {
    return (
      <FreeRunSummary
        workout={selectedWorkout}
        isReadOnly={true}
        onClose={() => setSelectedWorkout(null)}
      />
    );
  }

  const progression = profile?.progression;
  const activeProgramName =
    progression?.activePrograms?.[0]?.name ?? progression?.currentLevel ?? null;

  const handleGoToStep = (step: OnboardingStepId) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('jit_return_to', 'profile');
    }
    router.push(`/onboarding-new/setup?step=${step}&jit=true`);
  };

  // Helper: build profile field rows (value | 'טרם סופק' with tap-to-complete)
  const hasName = !!profile?.core?.name && profile.core.name.trim().length > 0;
  const hasDob = !!profile?.core?.birthDate;
  const hasWeight = !!profile?.core?.weight && profile.core.weight > 0;
  const hasEquipment =
    (profile?.equipment?.home?.length ?? 0) > 0 ||
    (profile?.equipment?.outdoor?.length ?? 0) > 0;
  const hasLocation = !!profile?.core?.authorityId;
  const hasEmail = !!profile?.core?.email;
  const hasSchedule = !!(profile?.lifestyle?.scheduleDays && profile.lifestyle.scheduleDays.length > 0);

  type ProfileRow = {
    label: string;
    value: string | null;
    filled: boolean;
    step: OnboardingStepId | null;
    customRender?: React.ReactNode;
    onPress?: () => void;
  };

  // Resolve displayable city name — prefer authority object name over raw ID
  const locationDisplay = (() => {
    const auth = (profile?.core as any)?.authority;
    if (auth && typeof auth === 'object' && auth.name) return String(auth.name);
    const aff = profile?.core?.affiliations?.find(a => a.type === 'city' && a.name);
    if (aff?.name) return aff.name;
    const raw = profile?.core?.authorityId;
    if (!raw) return null;
    if (typeof raw === 'object' && raw !== null && 'name' in (raw as Record<string, unknown>)) {
      return String((raw as Record<string, unknown>).name);
    }
    if (typeof raw === 'string' && raw.length > 20) return null;
    if (typeof raw === 'string') return raw;
    return null;
  })();

  // Build equipment pill list
  const allGearIds = [...(profile?.equipment?.home ?? []), ...(profile?.equipment?.outdoor ?? [])];

  const equipmentPills = hasEquipment ? (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {allGearIds.slice(0, 6).map((gearId) => {
        const svgSrc = gearIconSrc(gearId, gearDefs);
        const name = gearDisplayName(gearId, gearDefs);
        return (
          <span
            key={gearId}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#5BC2F2]/10 text-[11px] font-bold text-[#5BC2F2]"
          >
            {svgSrc ? (
              <img src={svgSrc} alt="" className="w-3.5 h-3.5 object-contain" />
            ) : null}
            {name}
          </span>
        );
      })}
      {allGearIds.length > 6 && (
        <span className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">
          +{allGearIds.length - 6}
        </span>
      )}
    </div>
  ) : null;

  const profileRows: ProfileRow[] = [
    { label: 'שם מלא', value: hasName ? profile!.core.name : null, filled: hasName, step: null, onPress: openNameEdit },
    { label: 'תאריך לידה', value: hasDob ? formatBirthDate(profile!.core.birthDate) : null, filled: hasDob, step: null, onPress: openDobEdit },
    { label: 'משקל', value: hasWeight ? `${profile!.core.weight} ק"ג` : null, filled: hasWeight, step: 'PERSONAL_STATS' },
    { label: 'ציוד אימון', value: hasEquipment ? '__custom__' : null, filled: hasEquipment, step: 'EQUIPMENT', customRender: equipmentPills },
    { label: 'מיקום ועיר', value: locationDisplay, filled: hasLocation, step: 'LOCATION' },
    { label: 'לוח אימונים', value: hasSchedule ? `${profile!.lifestyle!.scheduleDays!.length} ימים בשבוע` : null, filled: hasSchedule, step: 'SCHEDULE' },
    { label: 'חשבון מאובטח', value: hasEmail ? profile!.core.email! : null, filled: hasEmail, step: 'ACCOUNT_SECURE' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header with back button */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3" dir="rtl">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => router.push('/home')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 active:scale-95 transition-transform"
              aria-label="חזרה לבית"
            >
              <ArrowRight className="w-5 h-5 text-gray-900" />
              <span className="text-sm font-bold text-gray-900">חזור</span>
            </button>
            <h1 className="text-lg font-black text-gray-900 flex-1">פרופיל</h1>
            <button
              onClick={() => router.push('/home')}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
              aria-label="סגור"
            >
              <X className="w-5 h-5 text-gray-900" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {(['profile', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-bold text-sm transition-colors relative ${
                  activeTab === tab
                    ? 'text-[#00C9F2]'
                    : 'text-gray-900 hover:text-gray-900'
                }`}
              >
                {tab === 'profile' && 'פרופיל'}
                {tab === 'history' && 'היסטוריה'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C9F2] rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-5">
        {activeTab === 'profile' && (
          <div className="space-y-4">
            {/* Name & Program header */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" dir="rtl">
              <h2 className="text-lg font-black text-gray-900 mb-1">
                {profile?.core?.name || 'משתמש'}
              </h2>
              {activeProgramName && (
                <span className="text-xs font-bold text-cyan-600">
                  {activeProgramName}
                </span>
              )}
            </div>

            {/* Interactive field rows */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100" dir="rtl">
              {profileRows.map((row) => (
                <button
                  key={row.label}
                  onClick={() => row.onPress ? row.onPress() : row.step && handleGoToStep(row.step)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-right transition-colors hover:bg-slate-50 active:bg-slate-100 cursor-pointer group"
                >
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    {row.label}
                    {row.filled && (
                      <Pencil size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 max-w-[60%]">
                    {row.filled ? (
                      row.customRender ? row.customRender : (
                        <span className="text-sm font-bold text-gray-900 truncate">{row.value}</span>
                      )
                    ) : (
                      <>
                        <span className="text-sm font-bold text-[#00C9F2]">טרם סופק</span>
                        <ChevronLeft className="w-4 h-4 text-[#00C9F2]" />
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>

            {/* Affiliations card */}
            {profile?.core?.affiliations && profile.core.affiliations.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" dir="rtl">
                <h3 className="text-sm font-bold text-gray-900 mb-3">שיוכים</h3>
                <div className="space-y-2">
                  {profile.core.affiliations.map((aff, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-700 font-medium">
                        {aff.type === 'city' ? 'עיר' : aff.type === 'school' ? 'בית ספר' : 'ארגון'}
                      </span>
                      <span className="font-bold text-gray-900">{aff.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryTab onWorkoutClick={(workout) => setSelectedWorkout(workout)} />
        )}
      </div>

      {/* ── Inline Edit Modal: Name / DOB ── */}
      <AnimatePresence>
        {editingField && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => !editSaving && setEditingField(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              dir="rtl"
            >
              {editingField === 'name' && (
                <>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">עריכת שם</h3>
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                    placeholder="הזן שם מלא"
                    className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-base font-semibold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors"
                  />
                </>
              )}

              {editingField === 'dob' && (
                <>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">עריכת תאריך לידה</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-gray-400 mb-1 block">יום</label>
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={editDob.day}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setEditDob(prev => ({ ...prev, day: v }));
                          if (v.length === 2) monthRef.current?.focus();
                        }}
                        placeholder="DD"
                        className="w-full h-14 px-3 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-center text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors tabular-nums"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-gray-400 mb-1 block">חודש</label>
                      <input
                        ref={monthRef}
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={editDob.month}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setEditDob(prev => ({ ...prev, month: v }));
                          if (v.length === 2) yearRef.current?.focus();
                        }}
                        placeholder="MM"
                        className="w-full h-14 px-3 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-center text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors tabular-nums"
                      />
                    </div>
                    <div className="flex-[1.3]">
                      <label className="text-[11px] font-bold text-gray-400 mb-1 block">שנה</label>
                      <input
                        ref={yearRef}
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={editDob.year}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setEditDob(prev => ({ ...prev, year: v }));
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                        placeholder="YYYY"
                        className="w-full h-14 px-3 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-center text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors tabular-nums"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={saveInlineEdit}
                  disabled={editSaving}
                  className="flex-1 h-12 rounded-2xl font-bold text-white text-sm bg-gradient-to-l from-[#00C9F2] to-[#5BC2F2] shadow-lg shadow-cyan-500/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {editSaving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={16} strokeWidth={3} />
                      <span>שמירה</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setEditingField(null)}
                  disabled={editSaving}
                  className="px-5 h-12 rounded-2xl font-bold text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 active:scale-[0.97] transition-transform"
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success toast after JIT profile update */}
      <AnimatePresence>
        {showUpdateToast && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-24 inset-x-0 z-50 flex justify-center px-4"
          >
            <div
              className="flex items-center gap-3 bg-[#10B981] text-white px-5 py-3.5 rounded-2xl shadow-xl max-w-sm w-full"
              dir="rtl"
            >
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Check size={16} strokeWidth={3} />
              </div>
              <p className="text-sm font-bold">הפרופיל עודכן בהצלחה!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
