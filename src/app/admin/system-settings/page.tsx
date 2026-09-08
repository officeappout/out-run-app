'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  Settings, Footprints, Users, Trophy, ShieldAlert, Save, CheckCircle2,
  Map as MapIcon, Dumbbell, Route as RouteIcon, type LucideIcon,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface FlagState {
  enable_running_programs: boolean;
  enable_community_feed: boolean;
  enable_leagues: boolean;
  enable_hybrid_slots: boolean;
  enable_full_park_workout: boolean;
  enable_route_stops: boolean;
}

const INITIAL_FLAGS: FlagState = {
  enable_running_programs: false,
  enable_community_feed: false,
  enable_leagues: false,
  enable_hybrid_slots: false,
  enable_full_park_workout: false,
  enable_route_stops: false,
};

// ============================================================================
// CARD REGISTRY — add a card here only; the render loop below never changes.
// `parentKey`: when set, this card is a "child" — visually disabled and its
// toggle inert whenever the parent flag is off (the parent gate already makes
// it meaningless at runtime; this just keeps the panel honest about that).
// ============================================================================

interface FlagCardConfig {
  key: keyof FlagState;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  parentKey?: keyof FlagState;
}

const FLAG_CARDS: FlagCardConfig[] = [
  {
    key: 'enable_running_programs',
    icon: Footprints,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'תוכניות ריצה',
    description: 'מסלול ריצה באונבורדינג, ווידג׳טים בדאשבורד, כרטיסיות הבית לריצה',
  },
  {
    key: 'enable_community_feed',
    icon: Users,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    title: 'פיד קהילה וארנה',
    description: 'טאבים ״קהילה״ ו-״הליגה״ בניווט, עמודי /feed ו-/arena, פרסום פוסטים אחרי אימון',
  },
  {
    key: 'enable_leagues',
    icon: Trophy,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    title: 'ליגות וארנה',
    description: 'טאב ״הליגה״ ב/community, דירוגי עיר/ארגון/פארק, ליגות חברתיות — בלתי תלוי בפיד',
  },
  {
    key: 'enable_hybrid_slots',
    icon: MapIcon,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    title: 'שכבת "מה עושים היום?"',
    description: 'כפתור הכניסה במפה, קרוסלת ההצעות המשולבות, והמתג בתפריט ריצה חופשית',
  },
  {
    key: 'enable_full_park_workout',
    icon: Dumbbell,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    title: 'אימון מלא בפארק',
    description: 'הליכה/ריצה לפארק מצויד + אימון כוח מלא + חזרה — כרטיס בתוך השכבה למעלה',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_route_stops',
    icon: RouteIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    title: 'מסלול + עצירות',
    description: 'מסלול מבוסס-מיקום עם עצירות אימון לאורך הדרך — ללא כיסוי בדיקות קצה-לקצה',
    parentKey: 'enable_hybrid_slots',
  },
];

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
// FLAG CARD
// ============================================================================

function FlagCard({
  config,
  enabled,
  onChange,
  disabled,
  parentDisabled,
}: {
  config: FlagCardConfig;
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  /** True when this card's parentKey flag is off — greys the card out. */
  parentDisabled: boolean;
}) {
  const Icon = config.icon;
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 transition-opacity ${
        parentDisabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon size={18} className={config.iconColor} />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-sm">{config.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{config.description}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {enabled ? '● פעיל' : '○ כבוי'}
              </span>
              {parentDisabled && (
                <span className="text-[10px] text-slate-400">לא פעיל — תלוי ב"מה עושים היום?"</span>
              )}
            </div>
          </div>
        </div>
        <Toggle enabled={enabled} onChange={onChange} disabled={disabled || parentDisabled} />
      </div>
    </div>
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

  const [flags, setFlags] = useState<FlagState>(INITIAL_FLAGS);
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
            enable_leagues: data.enable_leagues ?? false,
            enable_hybrid_slots: data.enable_hybrid_slots ?? false,
            enable_full_park_workout: data.enable_full_park_workout ?? false,
            enable_route_stops: data.enable_route_stops ?? false,
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

          {FLAG_CARDS.map((config) => (
            <FlagCard
              key={config.key}
              config={config}
              enabled={flags[config.key]}
              onChange={(v) => setFlags((f) => ({ ...f, [config.key]: v }))}
              disabled={saving}
              parentDisabled={!!config.parentKey && !flags[config.parentKey]}
            />
          ))}

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
