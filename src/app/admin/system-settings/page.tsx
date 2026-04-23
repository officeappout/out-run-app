'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { Settings, Footprints, Users, ShieldAlert, Save, CheckCircle2 } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface FlagState {
  enable_running_programs: boolean;
  enable_community_feed: boolean;
}

// ============================================================================
// TOGGLE COMPONENT
// ============================================================================

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        enabled ? 'bg-cyan-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function SystemSettingsPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  const [flags, setFlags] = useState<FlagState>({
    enable_running_programs: false,
    enable_community_feed: false,
  });
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/admin/login');
        return;
      }
      try {
        const roleInfo = await checkUserRole(user.uid, user.email);
        if (!roleInfo.isSuperAdmin) {
          // Non-super-admins cannot access this page
          router.replace('/admin');
          return;
        }
        setIsSuperAdmin(true);
        setCurrentUid(user.uid);
      } catch {
        router.replace('/admin');
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  // ── Load current flags ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSuperAdmin) return;
    getDoc(doc(db, 'system_config', 'feature_flags'))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFlags({
            enable_running_programs: data.enable_running_programs ?? false,
            enable_community_feed: data.enable_community_feed ?? false,
          });
        }
      })
      .catch((e) => console.error('[SystemSettings] Failed to load flags:', e))
      .finally(() => setFlagsLoading(false));
  }, [isSuperAdmin]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!currentUid) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'system_config', 'feature_flags'),
        {
          ...flags,
          maintenance_mode: false,
          updated_at: serverTimestamp(),
          updated_by: currentUid,
        },
        { merge: true },
      );
      setSavedAt(new Date());
    } catch (e) {
      console.error('[SystemSettings] Save failed:', e);
      setError('שמירה נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / guard states ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">בודק הרשאות...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Settings size={20} className="text-slate-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">הגדרות מערכת</h1>
        </div>
        <p className="text-slate-500 text-sm">
          שליטה בזמן אמת על פיצ׳רים באפליקציה. מנהלי-על עוקפים את כל ההגדרות אוטומטית לצורך בדיקות.
        </p>
      </div>

      {/* Super Admin Notice */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>מנהל-על:</strong> אתה רואה את כל הפיצ׳רים ללא קשר לדגלים. הגדרות אלו משפיעות על משתמשים רגילים בלבד.
        </p>
      </div>

      {flagsLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
        </div>
      ) : (
        <div className="space-y-4">

          {/* Running Programs Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Footprints size={18} className="text-orange-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 text-sm">תוכניות ריצה</h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    מסלול ריצה באונבורדינג, ווידג׳טים בדאשבורד, כרטיסיות הבית לריצה
                  </p>
                  <div className="mt-1.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        flags.enable_running_programs
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {flags.enable_running_programs ? '● פעיל' : '○ כבוי'}
                    </span>
                  </div>
                </div>
              </div>
              <Toggle
                enabled={flags.enable_running_programs}
                onChange={(v) => setFlags((f) => ({ ...f, enable_running_programs: v }))}
                disabled={saving}
              />
            </div>
          </div>

          {/* Community Feed Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Users size={18} className="text-blue-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 text-sm">פיד קהילה וארנה</h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    טאבים ״קהילה״ ו-״הליגה״ בניווט, עמודי /feed ו-/arena, פרסום פוסטים אחרי אימון
                  </p>
                  <div className="mt-1.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        flags.enable_community_feed
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {flags.enable_community_feed ? '● פעיל' : '○ כבוי'}
                    </span>
                  </div>
                </div>
              </div>
              <Toggle
                enabled={flags.enable_community_feed}
                onChange={(v) => setFlags((f) => ({ ...f, enable_community_feed: v }))}
                disabled={saving}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <Save size={16} />
                  שמור שינויים
                </>
              )}
            </button>

            {savedAt && !saving && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                <CheckCircle2 size={16} />
                נשמר בהצלחה
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
