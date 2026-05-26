'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Lock, Bell, Shield, Wrench, FileText, LogOut, Trash2,
  ChevronLeft, Loader2, AlertTriangle, Globe, Users, EyeOff,
  Heart, Ruler, Camera, MapPin, Clock, Plus, Dumbbell, Eye,
  BarChart3, Mail, Pencil, Check, Tag, CreditCard,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { signOutUser } from '@/lib/auth.service';
import { useUserStore } from '@/features/user';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePrivacyStore, type PrivacyMode } from '@/features/safecity/store/usePrivacyStore';
import { validateAccessCode } from '@/features/user/onboarding/services/access-code.service';
import { disconnectHealth } from '@/lib/healthBridge/init';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import LegalDocModal from '@/features/legal/components/LegalDocModal';
import EquipmentFilterSheet from '@/features/content/exercises/client/components/EquipmentFilterSheet';
import { useToast } from '@/components/ui/Toast';
import { requestAccountDeletion } from '@/lib/requestAccountDeletion';
import ProfilePhotoUploader from '@/components/ui/ProfilePhotoUploader';
import { applyAnalyticsConsent } from '@/features/analytics/consent';
import { getUserFromFirestore } from '@/lib/firestore.service';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Reminder {
  id: string;
  day: string;
  time: string;
}

const DAYS_OF_WEEK = [
  { value: 'sunday',    label: 'ראשון' },
  { value: 'monday',    label: 'שני' },
  { value: 'tuesday',   label: 'שלישי' },
  { value: 'wednesday', label: 'רביעי' },
  { value: 'thursday',  label: 'חמישי' },
  { value: 'friday',    label: 'שישי' },
  { value: 'saturday',  label: 'שבת' },
];

const PRIVACY_MODES: Array<{
  value: PrivacyMode;
  label: string;
  sublabel: string;
  icon: React.FC<{ className?: string }>;
  activeColor: string;
}> = [
  { value: 'ghost',          label: 'רוח',    sublabel: 'לא נראה לאף אחד',              icon: EyeOff, activeColor: 'bg-gray-100 border-gray-400 text-gray-700' },
  { value: 'squad',          label: 'חברים',  sublabel: 'רק מי שאני עוקב אחריו',        icon: Users,  activeColor: 'bg-cyan-50 border-cyan-400 text-cyan-700' },
  { value: 'verified_global',label: 'גלובלי', sublabel: 'כל המאומתים בקבוצת הגיל שלי', icon: Globe,  activeColor: 'bg-green-50 border-green-400 text-green-700' },
];

const DELETE_CONFIRM_WORD = 'מחק';

/** Unified permission lifecycle state used by Location, Camera and Health rows. */
type PermStatus = 'loading' | 'granted' | 'prompt' | 'denied';

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

function openNativeAppSettings(): void {
  if (!isNativeApp()) return;
  try {
    // Capacitor intercepts this URL scheme and routes to iOS System Settings.
    // On Android the WebView ignores it gracefully.
    window.open('app-settings:', '_system');
  } catch {
    // Silently ignored — not all platforms support this URL scheme
  }
}

async function readHealthBridgeEnabled(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: 'outrun.healthBridge.permissionsGranted' });
    return value === '1';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => { if (!disabled) onChange(!checked); }}
      className={`w-12 h-6 rounded-full relative flex-shrink-0 transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-cyan-500' : 'bg-gray-200'}`}
    >
      <motion.div
        animate={{ x: checked ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
      />
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  sublabel,
  iconBg = 'bg-gray-100',
  right,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  iconBg?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors text-start ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'
        }`}
      >
        <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg}`}>{icon}</div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-sm font-semibold text-gray-900 font-simpler">{label}</p>
          {sublabel && (
            <p className="text-xs text-gray-400 font-simpler mt-0.5 leading-snug">{sublabel}</p>
          )}
        </div>
        {right ?? <ChevronLeft size={16} className="text-gray-300 flex-shrink-0" />}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-xl border border-gray-100">
      <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg}`}>{icon}</div>
      <div className="flex-1 min-w-0 text-right">
        <p className="text-sm font-semibold text-gray-900 font-simpler">{label}</p>
        {sublabel && (
          <p className="text-xs text-gray-400 font-simpler mt-0.5 leading-snug">{sublabel}</p>
        )}
      </div>
      {right}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 pt-5">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 font-simpler px-1">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Right-side badge rendered on each native permission row.
 * - Web (non-native): always shows a grey "נייטיב" pill.
 * - Native loading:   spinner.
 * - Native granted:   green "פעיל" pill with dot.
 * - Native denied:    red "נחסם" pill.
 * - Native prompt:    amber "הפעל" pill.
 */
function PermissionStatusBadge({
  status,
  requesting = false,
}: {
  status: PermStatus;
  requesting?: boolean;
}) {
  if (requesting) {
    return <Loader2 size={16} className="animate-spin text-gray-400 flex-shrink-0" />;
  }
  if (!isNativeApp()) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-simpler flex-shrink-0">
        נייטיב
      </span>
    );
  }
  if (status === 'loading') {
    return <Loader2 size={14} className="animate-spin text-gray-300 flex-shrink-0" />;
  }
  if (status === 'granted') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-simpler flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        פעיל
      </span>
    );
  }
  if (status === 'denied') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-simpler flex-shrink-0">
        נחסם
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-simpler flex-shrink-0">
      הפעל
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const router = useRouter();
  const { profile, resetProfile } = useUserStore();
  const { reset: resetOnboarding } = useOnboardingStore();
  const { showToast } = useToast();
  const store = useSettingsStore();
  const { mode: privacyMode, setMode: setPrivacyMode } = usePrivacyStore();

  // ── Health Connect disclosure (shown before OS permission dialog) ──────────
  const { triggerHealthPermission, disclosureProps, isRequesting: healthDisclosureRequesting } =
    useHealthWithDisclosure({
      onGranted: async () => {
        store.patch({ healthBridgeEnabled: true });
        const uid = auth.currentUser?.uid;
        if (uid) {
          try {
            await updateDoc(doc(db, 'users', uid), { 'settings.healthBridgeEnabled': true });
          } catch (err) {
            console.error('[Settings][Firestore] ✗ healthBridgeEnabled write failed:', err);
          }
        }
      },
      onDenied: () => {
        store.patch({ healthBridgeEnabled: false });
        showToast('error', 'לא ניתן לקבל גישה לנתוני הבריאות');
      },
    });

  // ── Derived ──────────────────────────────────────────────────────────────
  const userId = profile?.id ?? auth.currentUser?.uid ?? null;
  const userName = profile?.core?.name ?? 'משתמש';
  const userEmail = profile?.core?.email ?? auth.currentUser?.email ?? '';
  const userAvatar = profile?.core?.photoURL;
  const cityAffiliation = profile?.core?.affiliations?.find((a) => a.type === 'city');
  const hasEmailAuth = auth.currentUser?.providerData?.some(
    (p) => p.providerId === 'password',
  );

  // Inline edit for personal info
  const [editPersonalOpen, setEditPersonalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editDob, setEditDob] = useState({ day: '', month: '', year: '' });
  const [editSaving, setEditSaving] = useState(false);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef  = useRef<HTMLInputElement>(null);

  // Coupon / access code
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError]   = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState(false);

  // Password reset
  const [pwResetSent, setPwResetSent] = useState(false);
  const [pwResetLoading, setPwResetLoading] = useState(false);

  // Discoverable (already-working Firestore field)
  const [discoverable, setDiscoverable] = useState(false);
  const [isSavingDiscoverable, setIsSavingDiscoverable] = useState(false);

  // Analytics (already-working Firestore field)
  const [analyticsOptOut, setAnalyticsOptOut] = useState(false);
  const [isSavingAnalytics, setIsSavingAnalytics] = useState(false);

  // Reminders (in-memory — FCM integration is a separate task)
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState('sunday');
  const [selectedTime, setSelectedTime] = useState('18:00');

  // Equipment editor sheet
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);

  // Legal modals
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Delete flow
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Native permission statuses ────────────────────────────────────────────
  const [locationStatus, setLocationStatus] = useState<PermStatus>('loading');
  const [cameraStatus, setCameraStatus]     = useState<PermStatus>('loading');
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [cameraRequesting,   setCameraRequesting]   = useState(false);

  // ── Debounce ref ─────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((update: Record<string, unknown>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      console.log('[Settings][Firestore] → writing to users/', uid, ':', update);
      try {
        await updateDoc(doc(db, 'users', uid), update);
        console.log('[Settings][Firestore] ✓ write succeeded:', update);
      } catch (err) {
        console.error('[Settings][Firestore] ✗ write failed:', update, err);
      }
    }, 500);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Hydrate on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const raw = (profile as Record<string, unknown> | null | undefined);
    const settings = (raw?.settings as Record<string, unknown> | undefined);
    const notifs = (settings?.notifications as Record<string, unknown> | undefined);

    store.hydrate({
      inactivityAlerts: (notifs?.inactivity as boolean | undefined) ?? true,
      achievementAlerts: (notifs?.achievements as boolean | undefined) ?? true,
      tipsAlerts: (notifs?.tips as boolean | undefined) ?? true,
      units: ((settings?.units as 'km' | 'miles') ?? 'km'),
      healthBridgeEnabled: false,
    });

    // Load HealthKit/Health Connect state (Capacitor Preferences — native only)
    void readHealthBridgeEnabled().then((enabled) => {
      store.patch({ healthBridgeEnabled: enabled });
    });

    // Hydrate already-working toggles from profile
    setAnalyticsOptOut(profile?.core?.analyticsOptOut === true);
    setDiscoverable(profile?.core?.discoverable === true);
    applyAnalyticsConsent(profile?.core?.analyticsOptOut === true);

    // Reset transient UI state
    setCouponCode('');
    setCouponError(null);
    setCouponSuccess(false);
    setPwResetSent(false);
    setEditPersonalOpen(false);
    setRemindersExpanded(false);
    setShowAddReminder(false);

    // ── Check native permission statuses ──────────────────────────────────
    // Re-probe on every open so the status reflects any OS-level changes
    // the user may have made since the last time they opened settings.
    setLocationStatus('loading');
    setCameraStatus('loading');

    const permStateToStatus = (s: PermissionState): PermStatus =>
      s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';

    // 5 s safety net: WKWebView's `navigator.permissions.query` can hang
    // indefinitely in some Capacitor configurations (especially when
    // loading from a remote `server.url`). Without this fallback the
    // spinners on the Location and Camera rows would stay frozen on
    // 'loading' forever. After the timeout we downgrade to 'prompt' so
    // the row becomes interactive and a tap triggers a fresh prompt.
    const PERM_QUERY_TIMEOUT_MS = 5000;
    let locResolved = false;
    let camResolved = false;
    const locTimeout = setTimeout(() => {
      if (!locResolved) setLocationStatus('prompt');
    }, PERM_QUERY_TIMEOUT_MS);
    const camTimeout = setTimeout(() => {
      if (!camResolved) setCameraStatus('prompt');
    }, PERM_QUERY_TIMEOUT_MS);

    if (typeof navigator !== 'undefined' && navigator.permissions) {
      void navigator.permissions
        .query({ name: 'geolocation' })
        .then((ps) => {
          locResolved = true;
          clearTimeout(locTimeout);
          setLocationStatus(permStateToStatus(ps.state));
          ps.addEventListener('change', () => setLocationStatus(permStateToStatus(ps.state)));
        })
        .catch(() => {
          locResolved = true;
          clearTimeout(locTimeout);
          setLocationStatus('prompt');
        });

      void navigator.permissions
        .query({ name: 'camera' as PermissionName })
        .then((ps) => {
          camResolved = true;
          clearTimeout(camTimeout);
          setCameraStatus(permStateToStatus(ps.state));
          ps.addEventListener('change', () => setCameraStatus(permStateToStatus(ps.state)));
        })
        .catch(() => {
          camResolved = true;
          clearTimeout(camTimeout);
          setCameraStatus('prompt');
        });
    } else {
      locResolved = true;
      camResolved = true;
      clearTimeout(locTimeout);
      clearTimeout(camTimeout);
      setLocationStatus('prompt');
      setCameraStatus('prompt');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Personal info edit ───────────────────────────────────────────────────

  const openPersonalEdit = useCallback(() => {
    setEditName(profile?.core?.name ?? '');
    setEditWeight(profile?.core?.weight ? String(profile.core.weight) : '');
    if (profile?.core?.birthDate) {
      const d = profile.core.birthDate instanceof Date
        ? profile.core.birthDate
        : new Date(profile.core.birthDate as unknown as string);
      if (!isNaN(d.getTime())) {
        setEditDob({
          day:   String(d.getDate()).padStart(2, '0'),
          month: String(d.getMonth() + 1).padStart(2, '0'),
          year:  String(d.getFullYear()),
        });
      } else {
        setEditDob({ day: '', month: '', year: '' });
      }
    } else {
      setEditDob({ day: '', month: '', year: '' });
    }
    setEditPersonalOpen(true);
  }, [profile]);

  const savePersonalEdit = useCallback(async () => {
    const uid = auth.currentUser?.uid ?? userId;
    if (!uid || editSaving) return;
    setEditSaving(true);
    try {
      const update: Record<string, unknown> = {};

      const trimmedName = editName.trim();
      if (trimmedName && trimmedName !== profile?.core?.name) {
        update['core.name'] = trimmedName;
      }

      const w = parseFloat(editWeight);
      if (!isNaN(w) && w > 0 && w !== profile?.core?.weight) {
        update['core.weight'] = w;
      }

      const day   = parseInt(editDob.day,   10);
      const month = parseInt(editDob.month, 10);
      const year  = parseInt(editDob.year,  10);
      if (day && month && year && month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
        update['core.birthDate'] = new Date(year, month - 1, day);
      }

      if (Object.keys(update).length > 0) {
        await updateDoc(doc(db, 'users', uid), update);
        const fresh = await getUserFromFirestore(uid);
        if (fresh) useUserStore.setState({ profile: fresh });
        showToast('success', 'הפרטים עודכנו בהצלחה');
      }
      setEditPersonalOpen(false);
    } catch {
      showToast('error', 'שגיאה בשמירת הפרטים');
    } finally {
      setEditSaving(false);
    }
  }, [editName, editWeight, editDob, userId, profile, editSaving, showToast]);

  // ── Coupon code ──────────────────────────────────────────────────────────

  const handleCouponSubmit = useCallback(async () => {
    if (!couponCode.trim()) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const result = await validateAccessCode(couponCode);
      await setDoc(doc(db, 'users', uid), {
        core: {
          tenantId: result.tenantId,
          unitId: result.unitId,
          unitPath: result.unitPath,
          tenantType: result.tenantType,
        },
      }, { merge: true });
      const fresh = await getUserFromFirestore(uid);
      if (fresh) useUserStore.setState({ profile: fresh });
      setCouponSuccess(true);
      setCouponCode('');
      showToast('success', 'הקוד אומת בהצלחה!');
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : '') + String((err as Record<string, unknown>)?.code ?? '');
      if (msg.includes('not-found') || msg.includes('not found')) {
        setCouponError('קוד לא נמצא. בדקי ונסי שוב.');
      } else if (msg.includes('expired')) {
        setCouponError('הקוד פג תוקף.');
      } else if (msg.includes('resource-exhausted') || msg.includes('maximum')) {
        setCouponError('הקוד הגיע למכסה המקסימלית.');
      } else {
        setCouponError('שגיאה בבדיקת הקוד. נסי שוב.');
      }
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, showToast]);

  // ── Password reset ───────────────────────────────────────────────────────

  const handlePasswordReset = useCallback(async () => {
    const email = userEmail || auth.currentUser?.email;
    if (!email || !hasEmailAuth) return;
    setPwResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setPwResetSent(true);
      showToast('success', 'לינק לאיפוס סיסמה נשלח לאימייל שלך');
    } catch {
      showToast('error', 'שגיאה בשליחת מייל האיפוס');
    } finally {
      setPwResetLoading(false);
    }
  }, [userEmail, hasEmailAuth, showToast]);

  // ── Notification toggles (debounced Firestore) ───────────────────────────

  const handleInactivityToggle = useCallback((v: boolean) => {
    store.patch({ inactivityAlerts: v });
    scheduleSave({ 'settings.notifications.inactivity': v });
  }, [store, scheduleSave]);

  const handleAchievementsToggle = useCallback((v: boolean) => {
    store.patch({ achievementAlerts: v });
    scheduleSave({ 'settings.notifications.achievements': v });
  }, [store, scheduleSave]);

  const handleTipsToggle = useCallback((v: boolean) => {
    store.patch({ tipsAlerts: v });
    scheduleSave({ 'settings.notifications.tips': v });
  }, [store, scheduleSave]);

  // ── Units (debounced Firestore) ──────────────────────────────────────────

  const handleUnitsChange = useCallback((v: 'km' | 'miles') => {
    store.patch({ units: v });
    scheduleSave({ 'settings.units': v });
  }, [store, scheduleSave]);

  // ── HealthKit disconnect (connect path is handled by useHealthWithDisclosure) ──

  const handleHealthDisconnect = useCallback(async () => {
    await disconnectHealth();
    store.patch({ healthBridgeEnabled: false });
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        await updateDoc(doc(db, 'users', uid), { 'settings.healthBridgeEnabled': false });
      } catch (err) {
        console.error('[Settings][Firestore] ✗ healthBridgeEnabled write failed:', err);
      }
    }
  }, [store]);

  // ── Analytics opt-out (immediate — same pattern as existing) ────────────

  const handleAnalyticsToggle = useCallback(async () => {
    const next = !analyticsOptOut;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setAnalyticsOptOut(next);
    applyAnalyticsConsent(next);
    setIsSavingAnalytics(true);
    console.log('[Settings][Firestore] → core.analyticsOptOut =', next, '(optOut). Display toggle "שיתוף" = ', !next);
    try {
      await updateDoc(doc(db, 'users', uid), { 'core.analyticsOptOut': next });
      console.log('[Settings][Firestore] ✓ core.analyticsOptOut saved');
    } catch {
      console.error('[Settings][Firestore] ✗ core.analyticsOptOut write failed');
      setAnalyticsOptOut(!next);
      applyAnalyticsConsent(!next);
      showToast('error', 'שגיאה בשמירת ההגדרה');
    } finally {
      setIsSavingAnalytics(false);
    }
  }, [analyticsOptOut, showToast]);

  // ── Profile discoverability (immediate) ──────────────────────────────────

  const handleDiscoverableToggle = useCallback(async () => {
    const next = !discoverable;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setDiscoverable(next);
    setIsSavingDiscoverable(true);
    console.log('[Settings][Firestore] → core.discoverable =', next);
    try {
      await updateDoc(doc(db, 'users', uid), { 'core.discoverable': next });
      console.log('[Settings][Firestore] ✓ core.discoverable saved');
    } catch {
      console.error('[Settings][Firestore] ✗ core.discoverable write failed');
      setDiscoverable(!next);
      showToast('error', 'שגיאה בשמירת ההגדרה');
    } finally {
      setIsSavingDiscoverable(false);
    }
  }, [discoverable, showToast]);

  // ── Native permission handlers ───────────────────────────────────────────

  /**
   * Location row click.
   * • Web: shows an informational toast.
   * • Native, not granted: requests geolocation permission via the browser API
   *   (Capacitor surfaces this as the native OS dialog).
   * • Native, granted: shows a confirm then opens OS app-settings.
   */
  const handleLocationPermission = useCallback(async () => {
    if (!isNativeApp()) {
      showToast('error', 'הרשאות מיקום זמינות באפליקציה הנייטיב בלבד');
      return;
    }
    if (locationStatus === 'granted') {
      if (window.confirm('לפתוח את הגדרות המכשיר לניהול הרשאת המיקום?')) {
        openNativeAppSettings();
      }
      return;
    }
    setLocationRequesting(true);
    try {
      await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 }),
      );
      setLocationStatus('granted');
    } catch {
      // Re-probe so we reflect the user's actual decision (deny vs dismiss).
      const probe = await navigator.permissions
        ?.query({ name: 'geolocation' })
        .catch(() => null);
      setLocationStatus(probe?.state === 'denied' ? 'denied' : 'prompt');
      showToast('error', 'לא ניתן לקבל גישה למיקום');
    } finally {
      setLocationRequesting(false);
    }
  }, [locationStatus, showToast]);

  /**
   * Camera row click.
   * • Web: informational toast.
   * • Native, not granted: uses @capacitor/camera which triggers the
   *   proper iOS NSCameraUsageDescription / Android CAMERA permission
   *   prompts. Falls back to opening native app settings if denied.
   * • Native, granted: confirm → OS app-settings.
   */
  const handleCameraPermission = useCallback(async () => {
    if (!isNativeApp()) {
      showToast('error', 'הרשאות מצלמה זמינות באפליקציה הנייטיב בלבד');
      return;
    }
    if (cameraStatus === 'granted') {
      if (window.confirm('לפתוח את הגדרות המכשיר לניהול הרשאת המצלמה?')) {
        openNativeAppSettings();
      }
      return;
    }
    setCameraRequesting(true);
    try {
      const { Camera } = await import('@capacitor/camera');
      const current = await Camera.checkPermissions();
      // 'denied' on iOS means the user previously rejected — re-prompting
      // does nothing, so we deep-link them to Settings instead.
      if (current.camera === 'denied') {
        setCameraStatus('denied');
        if (window.confirm('הרשאת המצלמה נדחתה. לפתוח את הגדרות המכשיר?')) {
          openNativeAppSettings();
        }
        return;
      }
      let result = current;
      if (current.camera !== 'granted') {
        result = await Camera.requestPermissions({ permissions: ['camera'] });
      }
      setCameraStatus(result.camera === 'granted' ? 'granted' : 'denied');
      if (result.camera !== 'granted') {
        showToast('error', 'לא ניתן לקבל גישה למצלמה');
      }
    } catch (err) {
      console.warn('[Settings] Camera permission request failed:', err);
      setCameraStatus('denied');
      showToast('error', 'לא ניתן לקבל גישה למצלמה');
    } finally {
      setCameraRequesting(false);
    }
  }, [cameraStatus, showToast]);

  /**
   * Health row click.
   * • Web: informational toast.
   * • Native, not granted: opens the disclosure modal → then OS dialog.
   * • Native, granted: confirm → OS app-settings (user revokes there).
   */
  const handleHealthPermission = useCallback(() => {
    if (!isNativeApp()) {
      showToast('error', 'הרשאות בריאות זמינות באפליקציה הנייטיב בלבד');
      return;
    }
    if (store.healthBridgeEnabled) {
      if (window.confirm('לפתוח את הגדרות המכשיר לניהול הרשאות הבריאות?')) {
        openNativeAppSettings();
      }
      return;
    }
    triggerHealthPermission();
  }, [store.healthBridgeEnabled, triggerHealthPermission, showToast]);

  // ── Reminders ────────────────────────────────────────────────────────────

  const handleAddReminder = useCallback(() => {
    if (!selectedDay || !selectedTime) return;
    setReminders((prev) => [
      ...prev,
      { id: Date.now().toString(), day: selectedDay, time: selectedTime },
    ]);
    setShowAddReminder(false);
    setSelectedDay('sunday');
    setSelectedTime('18:00');
  }, [selectedDay, selectedTime]);

  const getDayLabel = useCallback(
    (v: string) => DAYS_OF_WEEK.find((d) => d.value === v)?.label ?? v,
    [],
  );

  // ── Logout ───────────────────────────────────────────────────────────────

  const handleLogout = useCallback(async () => {
    try {
      // signOutUser() clears the localStorage AND @capacitor/preferences
      // session hints, invalidates the server admin cookie, and finally
      // calls Firebase signOut(auth). Without this wrapper the native
      // 'out_has_session_native' key would remain set and `initNativeShell`
      // would restore the splash hint on the next cold start after logout.
      await signOutUser();
      resetOnboarding();
      resetProfile();
      onClose();
      router.push('/');
    } catch {
      showToast('error', 'שגיאה בהתנתקות. נסה שוב.');
    }
  }, [resetOnboarding, resetProfile, onClose, router, showToast]);

  // ── Delete account ───────────────────────────────────────────────────────

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmText.trim() !== DELETE_CONFIRM_WORD) return;
    setDeleteError(null);
    setIsDeleting(true);
    if (!auth.currentUser) {
      setDeleteError('לא נמצא משתמש מחובר.');
      setIsDeleting(false);
      return;
    }
    try {
      await requestAccountDeletion();
      // signOutUser() also clears native + web session hints in addition
      // to signing out of Firebase. Wrapped in try because signOut after
      // a successful deletion can throw "user-token-expired" — expected
      // and safe to ignore.
      try { await signOutUser(); } catch { /* expected after deletion */ }
      try { resetOnboarding(); resetProfile(); } catch { /* ignore */ }
      setShowDeleteConfirm(false);
      onClose();
      router.push('/');
    } catch (err: unknown) {
      const code = (err as Record<string, unknown>)?.code as string | undefined;
      setDeleteError(
        code === 'unauthenticated'
          ? 'תוקף החיבור פג. התחבר מחדש ונסה שוב.'
          : 'שגיאה במחיקת החשבון. הנתונים לא נמחקו. נסה שוב.',
      );
      setIsDeleting(false);
    }
  }, [deleteConfirmText, resetOnboarding, resetProfile, onClose, router]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              key="settings-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col"
              dir="rtl"
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* Sticky header */}
              <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10 flex-shrink-0">
                <h2 className="text-xl font-black text-gray-900 font-simpler">הגדרות</h2>
                <button
                  onClick={onClose}
                  disabled={isDeleting}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-40"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto pb-10">

                {/* ══════════════════════════════════════════════════════════
                    1. USER HERO
                   ══════════════════════════════════════════════════════════ */}
                <div className="px-5 pt-5 pb-2">
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center gap-3">
                      {/* Avatar — tap the camera badge to upload from native
                          camera/gallery (native only; web shows a toast). */}
                      <ProfilePhotoUploader
                        photoURL={userAvatar}
                        displayName={userName}
                        size={64}
                        className="flex-shrink-0"
                      />

                      {/* Name + email */}
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-gray-900 font-simpler truncate">{userName}</p>
                        <p className="text-xs text-gray-500 font-simpler truncate">{userEmail}</p>
                      </div>

                      {/* Edit toggle */}
                      <button
                        type="button"
                        onClick={editPersonalOpen ? savePersonalEdit : openPersonalEdit}
                        disabled={editSaving}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-xs font-semibold text-gray-700 font-simpler active:scale-95 disabled:opacity-50"
                      >
                        {editSaving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : editPersonalOpen ? (
                          <Check size={14} className="text-cyan-500" />
                        ) : (
                          <Pencil size={14} />
                        )}
                        {editPersonalOpen ? 'שמור' : 'עריכה'}
                      </button>
                    </div>

                    {/* Inline edit form */}
                    <AnimatePresence>
                      {editPersonalOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
                            {/* Name */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1 font-simpler">שם מלא</label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="שמך"
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-simpler focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none text-right"
                              />
                            </div>
                            {/* Weight */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1 font-simpler">משקל (ק"ג)</label>
                              <input
                                type="number"
                                value={editWeight}
                                onChange={(e) => setEditWeight(e.target.value)}
                                placeholder="70"
                                min="20"
                                max="300"
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-simpler focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none"
                                dir="ltr"
                              />
                            </div>
                            {/* Birthdate */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1 font-simpler">תאריך לידה</label>
                              <div className="flex gap-2" dir="ltr">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={editDob.day}
                                  onChange={(e) => {
                                    const v = e.target.value.slice(0, 2);
                                    setEditDob((p) => ({ ...p, day: v }));
                                    if (v.length === 2) monthRef.current?.focus();
                                  }}
                                  placeholder="DD"
                                  className="w-14 px-2 py-2 border border-gray-200 rounded-xl text-sm font-simpler text-center focus:ring-2 focus:ring-cyan-400 outline-none"
                                />
                                <input
                                  ref={monthRef}
                                  type="text"
                                  inputMode="numeric"
                                  value={editDob.month}
                                  onChange={(e) => {
                                    const v = e.target.value.slice(0, 2);
                                    setEditDob((p) => ({ ...p, month: v }));
                                    if (v.length === 2) yearRef.current?.focus();
                                  }}
                                  placeholder="MM"
                                  className="w-14 px-2 py-2 border border-gray-200 rounded-xl text-sm font-simpler text-center focus:ring-2 focus:ring-cyan-400 outline-none"
                                />
                                <input
                                  ref={yearRef}
                                  type="text"
                                  inputMode="numeric"
                                  value={editDob.year}
                                  onChange={(e) => setEditDob((p) => ({ ...p, year: e.target.value.slice(0, 4) }))}
                                  placeholder="YYYY"
                                  className="w-20 px-2 py-2 border border-gray-200 rounded-xl text-sm font-simpler text-center focus:ring-2 focus:ring-cyan-400 outline-none"
                                />
                              </div>
                            </div>
                            {/* Cancel */}
                            <button
                              type="button"
                              onClick={() => setEditPersonalOpen(false)}
                              className="w-full py-2 text-sm text-gray-500 font-simpler font-medium hover:text-gray-700 transition-colors"
                            >
                              ביטול
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ══════════════════════════════════════════════════════════
                    2. חשבון
                   ══════════════════════════════════════════════════════════ */}
                <Section title="חשבון">
                  <SettingsRow
                    icon={<User size={18} className="text-cyan-600" />}
                    iconBg="bg-cyan-50"
                    label="פרטים אישיים"
                    sublabel="שם, תאריך לידה, משקל"
                    onClick={openPersonalEdit}
                  />
                  <SettingsRow
                    icon={<Lock size={18} className="text-purple-600" />}
                    iconBg="bg-purple-50"
                    label={pwResetSent ? 'מייל נשלח ✓' : 'סיסמה ואבטחה'}
                    sublabel={
                      !hasEmailAuth
                        ? 'מחובר דרך גוגל / אפל — לא נדרשת סיסמה'
                        : pwResetSent
                        ? 'בדוק את תיבת הדואר שלך'
                        : 'שלח קישור לאיפוס סיסמה'
                    }
                    disabled={!hasEmailAuth || pwResetSent || pwResetLoading}
                    onClick={handlePasswordReset}
                    right={
                      pwResetLoading ? (
                        <Loader2 size={16} className="animate-spin text-gray-400" />
                      ) : undefined
                    }
                  />
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    3. מנוי
                   ══════════════════════════════════════════════════════════ */}
                <Section title="מנוי">
                  {/* City Pass status */}
                  <SettingsRow
                    icon={<CreditCard size={18} className={cityAffiliation ? 'text-emerald-600' : 'text-gray-400'} />}
                    iconBg={cityAffiliation ? 'bg-emerald-50' : 'bg-gray-100'}
                    label="City Pass"
                    sublabel={
                      cityAffiliation
                        ? `פעיל — ${cityAffiliation.name ?? cityAffiliation.id}`
                        : 'לא פעיל — הצטרף לעיר שלך'
                    }
                    right={
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cityAffiliation
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {cityAffiliation ? 'פעיל' : 'לא פעיל'}
                      </span>
                    }
                  />

                  {/* Coupon / access code */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="p-2 rounded-lg bg-amber-50 flex-shrink-0">
                        <Tag size={18} className="text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-semibold text-gray-900 font-simpler">הזנת קוד קופון</p>
                        {couponSuccess && (
                          <p className="text-xs text-emerald-600 font-simpler mt-0.5">הקוד אומת בהצלחה ✓</p>
                        )}
                      </div>
                    </div>
                    <div className="px-4 pb-4 space-y-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); setCouponSuccess(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleCouponSubmit(); }}
                        placeholder="UNIT-X79"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono tracking-widest text-center focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none"
                        disabled={couponLoading}
                      />
                      {couponError && (
                        <p className="text-xs text-red-500 font-simpler text-center">{couponError}</p>
                      )}
                      <button
                        type="button"
                        onClick={handleCouponSubmit}
                        disabled={couponLoading || !couponCode.trim()}
                        className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl text-sm font-bold font-simpler transition-colors active:scale-[0.98]"
                      >
                        {couponLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'אמת קוד'}
                      </button>
                    </div>
                  </div>
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    4. התראות
                   ══════════════════════════════════════════════════════════ */}
                <Section title="התראות">
                  <SettingsRow
                    icon={<Bell size={18} className="text-orange-500" />}
                    iconBg="bg-orange-50"
                    label="מעקב אי-פעילות"
                    sublabel="קבל התראה כשלא התאמנת כמה ימים"
                    right={
                      <Toggle
                        checked={store.inactivityAlerts}
                        onChange={handleInactivityToggle}
                        disabled={!store.isLoaded}
                      />
                    }
                  />
                  <SettingsRow
                    icon={<Bell size={18} className="text-amber-500" />}
                    iconBg="bg-amber-50"
                    label="הישגים ורמות"
                    sublabel="עדכונים על פתיחת הישגים ועלייה ברמה"
                    right={
                      <Toggle
                        checked={store.achievementAlerts}
                        onChange={handleAchievementsToggle}
                        disabled={!store.isLoaded}
                      />
                    }
                  />
                  <SettingsRow
                    icon={<Bell size={18} className="text-cyan-500" />}
                    iconBg="bg-cyan-50"
                    label="טיפים ומוטיבציה"
                    sublabel="תוכן יומי מהקואץ׳"
                    right={
                      <Toggle
                        checked={store.tipsAlerts}
                        onChange={handleTipsToggle}
                        disabled={!store.isLoaded}
                      />
                    }
                  />

                  {/* Reminders accordion */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setRemindersExpanded((v) => !v)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-start hover:bg-gray-50 transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-blue-50 flex-shrink-0">
                        <Clock size={18} className="text-blue-500" />
                      </div>
                      <div className="flex-1 text-right">
                        <p className="text-sm font-semibold text-gray-900 font-simpler">תזכורות אימון</p>
                        <p className="text-xs text-gray-400 font-simpler mt-0.5">
                          {reminders.length > 0 ? `${reminders.length} תזכורות מוגדרות` : 'לא הוגדרו תזכורות'}
                        </p>
                      </div>
                      <motion.div animate={{ rotate: remindersExpanded ? 90 : 0 }}>
                        <ChevronLeft size={16} className="text-gray-300" />
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {remindersExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden border-t border-gray-100"
                        >
                          <div className="px-4 py-3 space-y-2">
                            {reminders.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between py-2 px-3 bg-cyan-50 border border-cyan-100 rounded-xl"
                              >
                                <button
                                  type="button"
                                  onClick={() => setReminders((prev) => prev.filter((x) => x.id !== r.id))}
                                  className="text-red-400 hover:text-red-600 p-1"
                                  aria-label="הסר תזכורת"
                                >
                                  <X size={14} />
                                </button>
                                <span className="text-sm font-medium text-gray-800 font-simpler">
                                  {getDayLabel(r.day)} — {r.time}
                                </span>
                                <Clock size={14} className="text-cyan-500" />
                              </div>
                            ))}

                            {showAddReminder ? (
                              <div className="space-y-2 pt-1">
                                <div className="flex gap-2">
                                  <select
                                    value={selectedDay}
                                    onChange={(e) => setSelectedDay(e.target.value)}
                                    className="flex-1 px-2 py-2 border border-gray-200 rounded-xl text-sm font-simpler outline-none focus:ring-2 focus:ring-cyan-400"
                                  >
                                    {DAYS_OF_WEEK.map((d) => (
                                      <option key={d.value} value={d.value}>{d.label}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="time"
                                    value={selectedTime}
                                    onChange={(e) => setSelectedTime(e.target.value)}
                                    className="w-24 px-2 py-2 border border-gray-200 rounded-xl text-sm font-simpler outline-none focus:ring-2 focus:ring-cyan-400"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setShowAddReminder(false)}
                                    className="flex-1 py-2 text-sm text-gray-500 font-simpler bg-gray-100 rounded-xl hover:bg-gray-200"
                                  >
                                    ביטול
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleAddReminder}
                                    className="flex-1 py-2 text-sm font-bold text-white bg-cyan-500 rounded-xl hover:bg-cyan-600 font-simpler"
                                  >
                                    הוסף
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setShowAddReminder(true)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-cyan-600 font-semibold font-simpler border border-cyan-200 bg-cyan-50 rounded-xl hover:bg-cyan-100 transition-colors"
                              >
                                <Plus size={16} />
                                הוסף תזכורת
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    5. פרטיות ומיקום
                   ══════════════════════════════════════════════════════════ */}
                <Section title="פרטיות ומיקום">
                  {/* Map visibility — inline 3-option selector */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin size={16} className="text-gray-500" />
                      <p className="text-sm font-semibold text-gray-800 font-simpler">נראות במפה</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {PRIVACY_MODES.map((m) => {
                        const Icon = m.icon;
                        const isActive = privacyMode === m.value;
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                            console.log('[Settings][Privacy] → localStorage only (NOT Firestore). mode =', m.value, '| Presence heartbeat will pick this up on next broadcast.');
                            setPrivacyMode(m.value);
                          }}
                            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-center ${
                              isActive ? m.activeColor : 'border-gray-100 bg-gray-50 text-gray-500'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <p className="text-xs font-bold font-simpler leading-tight">{m.label}</p>
                            <p className="text-[9px] text-current opacity-70 font-simpler leading-snug">{m.sublabel}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Profile discoverability */}
                  <SettingsRow
                    icon={discoverable ? <Eye size={18} className="text-amber-600" /> : <EyeOff size={18} className="text-amber-600" />}
                    iconBg="bg-amber-50"
                    label="נגישות פרופיל בחיפוש"
                    sublabel="אפשר למשתמשים אחרים למצוא אותך לפי שם"
                    right={
                      <Toggle
                        checked={discoverable}
                        onChange={handleDiscoverableToggle}
                        disabled={isSavingDiscoverable}
                      />
                    }
                  />

                  {/* Analytics sharing — note: display is inverted (analyticsOptOut → "share" = !optOut) */}
                  <SettingsRow
                    icon={<BarChart3 size={18} className="text-emerald-600" />}
                    iconBg="bg-emerald-50"
                    label="שיתוף אנליטיקס"
                    sublabel="שיתוף נתוני שימוש אנונימיים לשיפור האפליקציה"
                    right={
                      <Toggle
                        checked={!analyticsOptOut}
                        onChange={handleAnalyticsToggle}
                        disabled={isSavingAnalytics}
                      />
                    }
                  />
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    6. כלים
                   ══════════════════════════════════════════════════════════ */}
                <Section title="כלים">
                  {/* ── Health Tracking (HealthKit / Health Connect) ──────── */}
                  <SettingsRow
                    icon={
                      <Heart
                        size={18}
                        className={store.healthBridgeEnabled ? 'text-red-500' : 'text-gray-400'}
                      />
                    }
                    iconBg={store.healthBridgeEnabled ? 'bg-red-50' : 'bg-gray-100'}
                    label="HealthKit / Health Connect"
                    sublabel={
                      !isNativeApp()
                        ? 'זמין באפליקציה הנייטיב בלבד'
                        : store.healthBridgeEnabled
                        ? 'מחובר — לחץ לניהול הרשאות ב-OS'
                        : 'סנכרן צעדים, קלוריות ודקות פעילות'
                    }
                    onClick={handleHealthPermission}
                    disabled={healthDisclosureRequesting}
                    right={
                      <PermissionStatusBadge
                        status={store.healthBridgeEnabled ? 'granted' : 'prompt'}
                        requesting={healthDisclosureRequesting}
                      />
                    }
                  />

                  {/* Units */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Ruler size={16} className="text-gray-500" />
                      <p className="text-sm font-semibold text-gray-800 font-simpler">יחידות מידה</p>
                    </div>
                    <div className="flex gap-2">
                      {(['km', 'miles'] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => handleUnitsChange(u)}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold font-simpler transition-all ${
                            store.units === u
                              ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500'
                          }`}
                        >
                          {u === 'km' ? 'קילומטרים' : 'מיילים'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Equipment */}
                  <SettingsRow
                    icon={<Dumbbell size={18} className="text-cyan-600" />}
                    iconBg="bg-cyan-50"
                    label="הציוד שלי"
                    sublabel="עדכן את הציוד הזמין לך"
                    onClick={() => setEquipmentSheetOpen(true)}
                  />

                  {/* ── Camera & Gallery permission ───────────────────────── */}
                  <SettingsRow
                    icon={
                      <Camera
                        size={18}
                        className={cameraStatus === 'granted' ? 'text-slate-700' : 'text-gray-400'}
                      />
                    }
                    iconBg={cameraStatus === 'granted' ? 'bg-slate-100' : 'bg-gray-100'}
                    label="גישה למצלמה וגלריה"
                    sublabel={
                      !isNativeApp()
                        ? 'זמין באפליקציה הנייטיב בלבד'
                        : cameraStatus === 'granted'
                        ? 'מורשה — לחץ לניהול הרשאות ב-OS'
                        : cameraStatus === 'denied'
                        ? 'נחסם — פתח הגדרות מכשיר לשחרור'
                        : 'אפשר גישה למצלמה ולגלריה'
                    }
                    onClick={handleCameraPermission}
                    disabled={cameraRequesting}
                    right={
                      <PermissionStatusBadge status={cameraStatus} requesting={cameraRequesting} />
                    }
                  />

                  {/* ── Location permission ───────────────────────────────── */}
                  <SettingsRow
                    icon={
                      <MapPin
                        size={18}
                        className={locationStatus === 'granted' ? 'text-cyan-600' : 'text-gray-400'}
                      />
                    }
                    iconBg={locationStatus === 'granted' ? 'bg-cyan-50' : 'bg-gray-100'}
                    label="גישה למיקום"
                    sublabel={
                      !isNativeApp()
                        ? 'זמין באפליקציה הנייטיב בלבד'
                        : locationStatus === 'granted'
                        ? 'מורשה — לחץ לניהול הרשאות ב-OS'
                        : locationStatus === 'denied'
                        ? 'נחסם — פתח הגדרות מכשיר לשחרור'
                        : 'אפשר גישה למיקום ל-GPS'
                    }
                    onClick={handleLocationPermission}
                    disabled={locationRequesting}
                    right={
                      <PermissionStatusBadge
                        status={locationStatus}
                        requesting={locationRequesting}
                      />
                    }
                  />
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    7. כללי
                   ══════════════════════════════════════════════════════════ */}
                <Section title="כללי">
                  <SettingsRow
                    icon={<FileText size={18} className="text-purple-600" />}
                    iconBg="bg-purple-50"
                    label="תנאי שימוש ופרטיות"
                    onClick={() => setShowTermsModal(true)}
                  />
                  <SettingsRow
                    icon={<Shield size={18} className="text-purple-600" />}
                    iconBg="bg-purple-50"
                    label="מדיניות פרטיות"
                    onClick={() => setShowPrivacyModal(true)}
                  />
                  <SettingsRow
                    icon={<Mail size={18} className="text-blue-600" />}
                    iconBg="bg-blue-50"
                    label="יצירת קשר"
                    sublabel="support@outrun.app"
                    onClick={() => window.open('mailto:support@outrun.app', '_blank')}
                  />
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    8. Logout
                   ══════════════════════════════════════════════════════════ */}
                <div className="px-5 pt-5">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors active:scale-[0.98]"
                  >
                    <div className="p-2 bg-gray-200 rounded-lg">
                      <LogOut size={18} className="text-gray-600" />
                    </div>
                    <span className="flex-1 text-right text-sm font-semibold text-gray-700 font-simpler">התנתק</span>
                  </button>
                </div>

                {/* ══════════════════════════════════════════════════════════
                    9. DANGER ZONE
                   ══════════════════════════════════════════════════════════ */}
                <div className="px-5 pt-4 pb-2">
                  <div className="border-2 border-red-200 rounded-2xl p-4 bg-red-50/50">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={16} className="text-red-500" />
                      <h3 className="text-sm font-bold text-red-900 font-simpler">אזור מסוכן</h3>
                    </div>
                    <p className="text-xs text-red-700 font-simpler mb-3 leading-relaxed">
                      פעולות בלתי הפיכות שימחקו את כל הנתונים שלך.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setDeleteConfirmText(''); setDeleteError(null); setShowDeleteConfirm(true); }}
                      disabled={isDeleting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-red-400 text-red-600 bg-white rounded-xl text-sm font-bold font-simpler hover:bg-red-50 transition-colors active:scale-[0.98] disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                      מחק חשבון
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-5 text-center">
                  <p className="text-[10px] text-gray-300 font-simpler">גרסה 1.0.0</p>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Equipment editor ─────────────────────────────────────────────── */}
      <EquipmentFilterSheet
        mode="profile"
        isOpen={equipmentSheetOpen}
        onClose={() => setEquipmentSheetOpen(false)}
        initialIds={profile?.equipment?.home ?? []}
      />

      {/* ── Legal modals ──────────────────────────────────────────────────── */}
      <LegalDocModal type="terms"   isOpen={showTermsModal}   onClose={() => setShowTermsModal(false)} />
      <LegalDocModal type="privacy" isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />

      {/* ── Health Connect disclosure (required before OS permission dialog) ── */}
      <HealthConnectDisclosureModal {...disclosureProps} />

      {/* ── Delete confirmation overlay ───────────────────────────────────── */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
            onClick={() => { if (!isDeleting) setShowDeleteConfirm(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              dir="rtl"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-red-500" />
                  <h2 className="text-base font-bold text-red-700 font-simpler">מחיקת חשבון לצמיתות</h2>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!isDeleting) setShowDeleteConfirm(false); }}
                  disabled={isDeleting}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40"
                >
                  <X size={18} className="text-slate-600" />
                </button>
              </div>

              <div className="p-5 space-y-4 font-simpler">
                <p className="text-sm text-slate-700 leading-relaxed">
                  הפעולה הזו <span className="font-bold text-red-600">לא ניתנת לביטול</span>. כל המידע שלך יימחק לצמיתות.
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    הקלד <span className="font-bold text-red-600">{DELETE_CONFIRM_WORD}</span> לאישור
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    disabled={isDeleting}
                    placeholder={DELETE_CONFIRM_WORD}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    autoComplete="off"
                  />
                </div>
                {deleteError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {deleteError}
                  </p>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => { if (!isDeleting) setShowDeleteConfirm(false); }}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold font-simpler disabled:opacity-50 transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting || deleteConfirmText.trim() !== DELETE_CONFIRM_WORD}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-simpler transition-all disabled:bg-red-200 disabled:text-red-400 enabled:bg-red-600 enabled:hover:bg-red-700 enabled:text-white"
                >
                  {isDeleting ? (
                    <><Loader2 size={16} className="animate-spin" /><span>מוחק...</span></>
                  ) : (
                    <><Trash2 size={16} /><span>מחק לצמיתות</span></>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
