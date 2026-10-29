'use client';

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { FeedPrivacySheet } from '@/features/social/components/FeedPublishSheets';
import { openCalendarSubscription, useCalendarFeedPath } from '@/lib/calendar-subscription';
import { feedPrefsFrom, saveFeedPrefs, type FeedPrefs } from '@/features/social/services/feed-prefs';

/** Home v2 (enable_home_v2) for the row primitives below — set once by the modal. */
const SettingsV2 = createContext(false);
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Lock, Bell, Shield, Wrench, FileText, LogOut, Trash2,
  ChevronLeft, ArrowRight, Loader2, AlertTriangle, Globe, Users, EyeOff,
  Heart, Ruler, Camera, MapPin, Dumbbell, Eye,
  BarChart3, Mail, Pencil, Check, Tag, CreditCard, MessageSquare, Calendar, CalendarDays,
  Clock, Plus, Accessibility, ListChecks, Footprints, Moon, Map as MapIcon, HelpCircle, Vibrate,
} from 'lucide-react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { setStepGoalChoice } from '@/features/activity/services/step-goal.service';
import {
  MANUAL_STEP_GOAL_MAX,
  MANUAL_STEP_GOAL_MIN,
  STEP_GOAL_INCREMENT,
} from '@/features/activity/lib/step-goal';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { signOutUser } from '@/lib/auth.service';
import { readA11yWidgetEnabled, writeA11yWidgetEnabled } from '@/lib/accessibilityWidgetPref';
import { useUserStore } from '@/features/user';
import { readGuidedSettings, GUIDED_SETTING_KEY } from '@/features/workout-engine/hybrid/guided-station';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useSettingsStore } from '../store/useSettingsStore';
import PushReAskSettingsCard from '@/features/schedule/components/push-reask/PushReAskSettingsCard';
import { usePrivacyStore, type PrivacyMode } from '@/features/safecity/store/usePrivacyStore';
import { computeAgeGroup } from '@/lib/age';
import { validateAccessCode, type AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';
import UnitJoinSuccessBanner from '@/components/ui/UnitJoinSuccessBanner';
import { disconnectHealth } from '@/lib/healthBridge/init';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import NeighborhoodPickerSheet from '@/features/profile/components/NeighborhoodPickerSheet';
import { usePersonalInfoEditor } from '@/features/profile/hooks/usePersonalInfoEditor';
import LegalDocModal from '@/features/legal/components/LegalDocModal';
import EquipmentFilterSheet from '@/features/content/exercises/client/components/EquipmentFilterSheet';
import { useToast } from '@/components/ui/Toast';
import { requestAccountDeletion } from '@/lib/requestAccountDeletion';
import ProfilePhotoUploader from '@/components/ui/ProfilePhotoUploader';
import { applyAnalyticsConsent } from '@/features/analytics/consent';
import { getUserFromFirestore } from '@/lib/firestore.service';
import {
  getNotificationPrefs,
  setPushEnabled,
  setChannelEnabled,
  setNotificationFrequency,
  setShabbatObserver,
  type PushChannel,
  type NotificationFrequency,
} from '@/features/notifications/services/notification-prefs.service';
import { initPushNotifications } from '@/lib/native/push';
import { hapticSelection } from '@/lib/haptics';
import { readHapticsPref, writeHapticsPref } from '@/lib/haptics-gate';
import MyPersonasSection from './settings/MyPersonasSection';
import { DrumTimePicker } from '@/components/ui/DrumTimePicker';
import {
  getReminderSchedule,
  addReminderSlot,
  removeReminderSlot,
} from '@/features/notifications/services/reminder-schedule.service';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { useT } from '@/hooks/useT';
import { useLanguageSetting } from '@/hooks/useLanguageSetting';
import { home, type HomeKey } from '@/messages/ns/home';
import { common } from '@/messages/ns/common';
import { weekdayLabel, type WeekdayIndex } from '@/lib/i18n/units';
import type { ReminderSlot, ReminderWeekday } from '@/features/user/core/types/user.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Workout Reminders (App Store cleanup D6 — RE-ENABLED) ──────────────────
// Previously hidden: relied on in-memory React state with no FCM/
// LocalNotifications persistence. Now backed by
// `users/{uid}.lifestyle.reminders.schedule` via reminder-schedule.service.ts
// — see scheduling-capability-audit.md Part A. Sending (the sweep cron that
// would actually fire a push at these times) is a separate, not-yet-built
// Part B — this UI only persists the user's chosen slots.

const DAYS_OF_WEEK: { value: ReminderWeekday; index: WeekdayIndex }[] = [
  { value: 'sunday',    index: 0 },
  { value: 'monday',    index: 1 },
  { value: 'tuesday',   index: 2 },
  { value: 'wednesday', index: 3 },
  { value: 'thursday',  index: 4 },
  { value: 'friday',    index: 5 },
  { value: 'saturday',  index: 6 },
];

const PRIVACY_MODES: Array<{
  value: PrivacyMode;
  labelKey: HomeKey;
  sublabelKey: HomeKey;
  icon: React.FC<{ className?: string }>;
  activeColor: string;
}> = [
  { value: 'ghost',          labelKey: 'settings.privacy.mode.ghost.label',  sublabelKey: 'settings.privacy.mode.ghost.sub',  icon: EyeOff, activeColor: 'bg-gray-100 border-gray-400 text-gray-700' },
  { value: 'squad',          labelKey: 'settings.privacy.mode.squad.label',  sublabelKey: 'settings.privacy.mode.squad.sub',  icon: Users,  activeColor: 'bg-cyan-50 border-cyan-400 text-cyan-700' },
  { value: 'verified_global',labelKey: 'settings.privacy.mode.global.label', sublabelKey: 'settings.privacy.mode.global.sub', icon: Globe,  activeColor: 'bg-green-50 border-green-400 text-green-700' },
];

const DELETE_CONFIRM_WORD = 'מחק'; // i18n-allow-hebrew: data — the word the user types; compared with the input (shown through settings.delete.typeToConfirm)

// Chrome polish — temporary UI-hide only. City Pass status + coupon-code
// entry are hidden pending restoration; their state/handlers/write-paths
// (couponCode/handleCouponSubmit/validateAccessCode/cityAffiliation, etc.)
// are completely untouched below — flipping this back to true brings the
// "מנוי" section straight back with zero other changes.
const SHOW_SUBSCRIPTION_SECTION = false;

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
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Accessible name for the switch (pass it for any switch whose row text isn't programmatically associated). */
  label?: string;
}) {
  const v2 = useContext(SettingsV2);
  if (v2) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => { if (!disabled) { hapticSelection(); onChange(!checked); } }}
        className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors duration-200 ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
        } ${checked ? 'bg-v2-ink' : 'bg-v2-pill-border'}`}
      >
        <span
          className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[inset-inline-start] duration-200 ease-v2"
          style={{ insetInlineStart: checked ? 'calc(100% - 26px)' : '2px' }}
        />
      </button>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => { if (!disabled) { hapticSelection(); onChange(!checked); } }}
      className={`w-12 h-6 rounded-full relative flex-shrink-0 transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-cyan-500' : 'bg-gray-200'}`}
    >
      <motion.div
        animate={{ x: checked ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
      />
    </button>
  );
}

function SettingsRow({
  icon,
  label,
  sublabel,
  right,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  // Flattened ("פרופיל חלק" Part 3) — no card chrome (was bg-white rounded-xl
  // border per row); Section's divide-y below now draws the hairline between
  // adjacent rows, so this primitive just needs its own vertical padding.
  // Clean icon treatment (chrome polish follow-up): dropped the colored
  // rounded-square background a row icon used to sit in (was `p-2 rounded-lg
  // ${iconBg}`, iconBg removed from every call site in the same pass), and
  // every icon's own per-icon color has since been unified to one flat
  // neutral (text-gray-700) across every call site in this file — no box,
  // no rainbow, per instruction.
  // Text size bumped slightly (chrome polish): label text-sm→text-base,
  // sublabel text-xs→text-sm, applied once here so it cascades to every
  // row in the file.
  const v2 = useContext(SettingsV2);
  if (v2) {
    const body = (
      <>
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[12px] bg-v2-surface text-v2-ink [&_svg]:!text-v2-ink">{icon}</span>
        <span className="min-w-0 flex-1 text-right">
          <span className="block text-[14.5px] font-extrabold text-v2-ink">{label}</span>
          {sublabel && <span className="mt-0.5 block text-[12px] font-bold leading-snug text-v2-muted">{sublabel}</span>}
        </span>
      </>
    );
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'active:bg-v2-surface'}`}
      >
        {body}
        {right ?? <ChevronLeft size={16} strokeWidth={2.6} className="flex-shrink-0 text-v2-muted" />}
      </button>
    ) : (
      <div className="flex items-center gap-3 px-3.5 py-3">
        {body}
        {right}
      </div>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center gap-3 py-3.5 transition-colors text-start ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'active:bg-gray-50'
        }`}
      >
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-base font-semibold text-gray-900 font-simpler">{label}</p>
          {sublabel && (
            <p className="text-sm text-gray-400 font-simpler mt-0.5 leading-snug">{sublabel}</p>
          )}
        </div>
        {right ?? <ChevronLeft size={16} className="text-gray-300 flex-shrink-0" />}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 text-right">
        <p className="text-base font-semibold text-gray-900 font-simpler">{label}</p>
        {sublabel && (
          <p className="text-sm text-gray-400 font-simpler mt-0.5 leading-snug">{sublabel}</p>
        )}
      </div>
      {right}
    </div>
  );
}

// Flattened ("פרופיל חלק" Part 3) — divide-y hairlines between rows instead
// of space-y-2 gaps between individually-boxed rows; small gray uppercase
// label stays as-is (already matched the "flat section header" language).
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const v2 = useContext(SettingsV2);
  if (v2) {
    return (
      <div className="px-4 pt-5">
        <p className="mb-1.5 px-1 text-[13px] font-extrabold text-v2-deep">{title}</p>
        <div className="divide-y divide-v2-hairline overflow-hidden rounded-[20px] bg-white shadow-v2-ring">{children}</div>
      </div>
    );
  }
  return (
    <div className="px-5 pt-5">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 font-simpler px-1">
        {title}
      </p>
      <div className="divide-y divide-gray-100">{children}</div>
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
  const t = useT(home);
  if (requesting) {
    return <Loader2 size={16} className="animate-spin text-gray-400 flex-shrink-0" />;
  }
  if (!isNativeApp()) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-simpler flex-shrink-0">
        {t('settings.perm.native')}
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
        {t('settings.perm.active')}
      </span>
    );
  }
  if (status === 'denied') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-simpler flex-shrink-0">
        {t('settings.perm.blocked')}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-simpler flex-shrink-0">
      {t('settings.perm.enable')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const t = useT(home);
  const tc = useT(common);
  const language = useLanguageSetting(); // i18n 5A: options empty (row hidden) while enable_i18n is off
  // Opt-in third-party accessibility toolbar (UserWay). Default OFF; the actual
  // script load lives in AccessibilityWidgetLoader, driven by this preference.
  const [a11yWidgetOn, setA11yWidgetOn] = useState(false);
  // enable_haptics_v1: the device-local "רטט" switch (default on) — read by src/lib/haptics-gate.
  const [hapticsOn, setHapticsOn] = useState(readHapticsPref);
  useEffect(() => {
    let alive = true;
    void readA11yWidgetEnabled().then((v) => { if (alive) setA11yWidgetOn(v); });
    return () => { alive = false; };
  }, []);
  const handleA11yWidgetToggle = useCallback((v: boolean) => {
    setA11yWidgetOn(v);
    writeA11yWidgetEnabled(v);
  }, []);

  const router = useRouter();
  const { profile, resetProfile } = useUserStore();
  const v2Flags = useFeatureFlags(!!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin).flags;
  const v2 = v2Flags.enableHomeV2;
  // Calendar sync — moved here from the home schedule in v2.
  const calendarFeedPath = useCalendarFeedPath(v2 ? profile?.id : null);
  // "מי רואה את הפוסטים שלי" — the feed's opt-in publishing prefs, here too.
  const [feedPrivacyOpen, setFeedPrivacyOpen] = useState(false);
  const [feedPrivacyBusy, setFeedPrivacyBusy] = useState(false);
  const feedPrefs = feedPrefsFrom((profile?.social as { feedPrefs?: unknown } | undefined)?.feedPrefs);
  const handleSaveFeedPrefs = async (next: FeedPrefs) => {
    if (!profile?.id) return;
    setFeedPrivacyBusy(true);
    try {
      await saveFeedPrefs(profile.id, next);
      useUserStore.getState().updateProfile({ social: { ...(profile.social ?? {}), feedPrefs: next } } as never);
      setFeedPrivacyOpen(false);
    } catch (err) {
      console.error('[Settings] saveFeedPrefs failed:', err);
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setFeedPrivacyBusy(false);
    }
  };
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
        showToast('error', t('settings.toast.healthFailed'));
      },
    });

  // ── Derived ──────────────────────────────────────────────────────────────
  const userName = profile?.core?.name ?? t('settings.userFallback');
  const userEmail = profile?.core?.email ?? auth.currentUser?.email ?? '';
  const userAvatar = profile?.core?.photoURL;
  const cityAffiliation = profile?.core?.affiliations?.find((a) => a.type === 'city');
  const hasEmailAuth = auth.currentUser?.providerData?.some(
    (p) => p.providerId === 'password',
  );

  // ── Screens ("פרופיל חלק" Part 3) ──────────────────────────────────────────
  // SettingsModal used to be one continuous scroll; it's now 4 screens
  // (main + 3 drill-down sub-screens) navigated via this local state, reset
  // to 'main' on every open (see the dedicated effect below) — matching the
  // canvas boards' iOS-Settings-style back-chevron navigation. Pure UI
  // routing: every handler/hook/save-path below is completely unchanged,
  // only WHICH existing JSX block is currently rendered changed.
  type SettingsScreen = 'main' | 'personal' | 'notifications' | 'privacy' | 'personas';
  const [screen, setScreen] = useState<SettingsScreen>('main');
  useEffect(() => {
    if (isOpen) setScreen('main');
  }, [isOpen]);

  // ── Reminder schedule — load on open ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const uid = auth.currentUser?.uid;
    if (!uid) { setRemindersLoading(false); return; }
    let cancelled = false;
    setRemindersLoading(true);
    getReminderSchedule(uid)
      .then((slots) => { if (!cancelled) setReminders(slots); })
      .catch((err) => console.error('[Settings] reminder schedule load failed:', err))
      .finally(() => { if (!cancelled) setRemindersLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Inline edit for personal info — state/effects/save logic extracted to
  // usePersonalInfoEditor (round 5 of the profile redesign) so the new Edit
  // Profile screen can reuse the exact same staged-edit + save behavior.
  // editName/setEditName NOT destructured here ("פרופיל חלק" Part 3): name
  // editing now lives in Edit Profile only (Part 2) — the hook still seeds/
  // owns that state for EditProfileModal's sake, this screen just never
  // reads it.
  const {
    editWeight, setEditWeight,
    editDob,
    editSaving,
    cityDisplay, cityResolving, cityAuthorityId, goToCityEdit,
    neighborhoodPickerOpen, setNeighborhoodPickerOpen,
    editNeighborhoodId, editNeighborhoodName, setEditNeighborhoodId, setEditNeighborhoodName,
    monthRef, yearRef,
    openPersonalEdit: openPersonalEditFields, savePersonalEdit: savePersonalEditFields,
  } = usePersonalInfoEditor();

  // Coupon / access code
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError]   = useState<string | null>(null);
  // 07.09.2026 — was a bare boolean ("הקוד אומת בהצלחה ✓") with no way to
  // know which unit the code resolved to; holding the full result lets the
  // shared UnitJoinSuccessBanner show the name (mandatory) + icon (bonus).
  const [couponSuccessResult, setCouponSuccessResult] = useState<AccessCodeResult | null>(null);

  // Password reset
  const [pwResetSent, setPwResetSent] = useState(false);
  const [pwResetLoading, setPwResetLoading] = useState(false);

  // Discoverable (already-working Firestore field)
  const [discoverable, setDiscoverable] = useState(false);
  const [isSavingDiscoverable, setIsSavingDiscoverable] = useState(false);

  // Analytics (already-working Firestore field)
  const [analyticsOptOut, setAnalyticsOptOut] = useState(false);
  const [isSavingAnalytics, setIsSavingAnalytics] = useState(false);

  // Reminders — durable (users/{uid}.lifestyle.reminders.schedule), re-enabled.
  const [reminders, setReminders] = useState<ReminderSlot[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [remindersSaving, setRemindersSaving] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState<ReminderWeekday>('sunday');
  const [selectedTime, setSelectedTime] = useState('18:00');

  // Equipment editor sheet
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);

  // Units row — collapsed by default (chrome polish); reveals the km/miles
  // options only on tap instead of always showing them inline.
  const [unitsExpanded, setUnitsExpanded] = useState(false);

  // Legal modals
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Delete flow
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Native permission statuses ────────────────────────────────────────────
  // Location permission is owned by the centralized GPS store. We derive the
  // row's PermStatus reactively from it — 'unknown' (no fix/probe yet) maps to
  // 'prompt' so the row stays interactive (navigator.permissions is unreliable
  // on native anyway, and a tap re-prompts).
  const gpsPermissionState = useGPSStore((s) => s.permissionState);
  const locationStatus: PermStatus =
    gpsPermissionState === 'granted'
      ? 'granted'
      : gpsPermissionState === 'denied'
      ? 'denied'
      : 'prompt';
  const [cameraStatus, setCameraStatus]     = useState<PermStatus>('loading');
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [cameraRequesting,   setCameraRequesting]   = useState(false);

  // ── Push notification saving guards (prevent double-tap) ─────────────────
  const [pushSaving,      setPushSaving]      = useState(false);
  const [chatNotifSaving, setChatNotifSaving] = useState(false);
  // Generic saving guard for new channels (keyed by PushChannel)
  const [channelSaving, setChannelSaving] = useState<Record<string, boolean>>({});
  const [frequencySaving, setFrequencySaving] = useState(false);
  const [shabbatSaving, setShabbatSaving] = useState(false);

  // ── Native push permission status (App Store Guideline 4.5.4 — D1/D2) ─────
  // Source of truth for whether the OS will actually deliver notifications.
  // On web (non-native) there is no OS gate, so we treat it as 'granted' and
  // let the Firestore-backed toggles behave as before. On native, anything
  // other than 'granted' (i.e. 'denied' / 'prompt') means the UI MUST render
  // the push/chat toggles as OFF regardless of the `true` DB default.
  const [pushPermStatus, setPushPermStatus] = useState<PermStatus>(
    isNativeApp() ? 'loading' : 'granted',
  );
  const nativePushBlocked = isNativeApp() && pushPermStatus !== 'granted';

  // Probe the real OS notification permission via the installed
  // @capacitor-firebase/messaging plugin (same plugin used by push.ts —
  // we intentionally do NOT add @capacitor/push-notifications as a new dep).
  const checkPushPermission = useCallback(async () => {
    if (!isNativeApp()) {
      setPushPermStatus('granted');
      return;
    }
    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      const res = await FirebaseMessaging.checkPermissions();
      const r = res.receive;
      setPushPermStatus(r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'prompt');
    } catch (err) {
      console.warn('[Settings] push checkPermissions failed:', err);
      setPushPermStatus('prompt');
    }
  }, []);

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
      // Unset = ON (default for everyone); an explicit choice wins. Same rule as the station.
      guidedStation: readGuidedSettings(raw).guidedStation ?? true,
    });

    // Load HealthKit/Health Connect state (Capacitor Preferences — native only)
    void readHealthBridgeEnabled().then((enabled) => {
      store.patch({ healthBridgeEnabled: enabled });
    });

    // Load push notification prefs from Firestore (async patch — avoids flash)
    const pushUid = auth.currentUser?.uid;
    if (pushUid) {
      void getNotificationPrefs(pushUid)
        .then((prefs) => {
          store.patch({
            pushEnabled: prefs.pushEnabled,
            chatNotifEnabled: prefs.channels.chat ?? true,
            progressionNotif: prefs.channels.progression ?? true,
            socialNotif: prefs.channels.social ?? true,
            communityNotif: prefs.channels.community ?? true,
            retentionNotif: prefs.channels.retention ?? true,
            trainingReminderNotif: prefs.channels.training_reminder ?? true,
            encouragementNotif: prefs.channels.encouragement ?? true,
            notificationFrequency: prefs.notificationFrequency ?? 'balanced',
            shabbatObserver: prefs.shabbatObserver === true,
            weekStartNotif: prefs.channels.week_start ?? true,
            coachProactiveNotif: prefs.channels.coach_proactive ?? true,
          });
        })
        .catch(() => {
          // Fallback: derive from profile store if Firestore read fails
          const s = (profile as Record<string, unknown> | null | undefined)
            ?.settings as Record<string, unknown> | undefined;
          const np = s?.notificationPrefs as Record<string, unknown> | undefined;
          store.patch({
            pushEnabled: typeof s?.pushEnabled === 'boolean' ? s.pushEnabled : true,
            chatNotifEnabled: typeof np?.chat === 'boolean' ? np.chat : true,
          });
        });
    }

    // Hydrate already-working toggles from profile
    setAnalyticsOptOut(profile?.core?.analyticsOptOut === true);
    // Default change (chrome polish, confirmed independent of the map-
    // visibility/presence-broadcast path — core.discoverable only ever
    // feeds userPublicSync.ts's mirror + user-search.service.ts's query,
    // never usePrivacyStore/usePresenceLayer): previously `=== true`
    // treated "unset" and "explicitly false" identically (both → false).
    // Now unset specifically defaults to true; an EXISTING explicit
    // true/false value is read back exactly as saved, untouched.
    setDiscoverable(
      profile?.core?.discoverable === undefined ? true : profile.core.discoverable === true,
    );
    applyAnalyticsConsent(profile?.core?.analyticsOptOut === true);

    // Probe the real OS notification permission (D1/D2). Forces push/chat
    // toggles OFF in the UI when the native permission is missing.
    void checkPushPermission();

    // Hydrate map-visibility privacy mode from Firestore if a value was saved
    // previously (keeps the choice consistent across devices). Falls back to
    // the privacy-first `ghost` default in usePrivacyStore otherwise.
    const savedPrivacy = settings?.privacyMode as PrivacyMode | undefined;
    const userIsMinor = computeAgeGroup(profile?.core?.birthDate) === 'minor';
    if (savedPrivacy === 'ghost' || savedPrivacy === 'squad' || savedPrivacy === 'verified_global') {
      // Minors can only be in ghost mode — clamp anything else on hydration.
      setPrivacyMode(userIsMinor && savedPrivacy !== 'ghost' ? 'ghost' : savedPrivacy);
    } else if (userIsMinor) {
      setPrivacyMode('ghost');
    }

    // Reset transient UI state (screen itself is reset by its own dedicated
    // effect, isolated from this effect's broader dep array)
    setCouponCode('');
    setCouponError(null);
    setCouponSuccessResult(null);
    setPwResetSent(false);

    // ── Check native permission statuses ──────────────────────────────────
    // Re-probe on every open so the status reflects any OS-level changes
    // the user may have made since the last time they opened settings.
    // Location permission status is derived reactively from useGPSStore — no
    // probe needed here. Only the camera row still uses navigator.permissions.
    setCameraStatus('loading');

    const permStateToStatus = (s: PermissionState): PermStatus =>
      s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';

    // 5 s safety net: WKWebView's `navigator.permissions.query` can hang
    // indefinitely in some Capacitor configurations (especially when
    // loading from a remote `server.url`). Without this fallback the
    // spinner on the Camera row would stay frozen on 'loading' forever.
    // After the timeout we downgrade to 'prompt' so the row becomes
    // interactive and a tap triggers a fresh prompt.
    const PERM_QUERY_TIMEOUT_MS = 5000;
    let camResolved = false;
    const camTimeout = setTimeout(() => {
      if (!camResolved) setCameraStatus('prompt');
    }, PERM_QUERY_TIMEOUT_MS);

    if (typeof navigator !== 'undefined' && navigator.permissions) {
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
      camResolved = true;
      clearTimeout(camTimeout);
      setCameraStatus('prompt');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Re-check native permissions on app resume (D1/D2) ─────────────────────
  // When the user backgrounds the app, opens iOS/Android system settings,
  // toggles the notification permission, then returns — `appStateChange`
  // (isActive=true) fires and we re-probe so the modal reflects the new OS
  // state dynamically instead of showing a stale "ON" toggle.
  useEffect(() => {
    if (!isOpen || !isNativeApp()) return;

    let listenerHandle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            void checkPushPermission();
          }
        });
        if (cancelled) {
          void handle.remove();
        } else {
          listenerHandle = handle;
        }
      } catch (err) {
        console.warn('[Settings] appStateChange listener attach failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (listenerHandle) void listenerHandle.remove();
    };
  }, [isOpen, checkPushPermission]);

  // ── Personal info edit ───────────────────────────────────────────────────
  // openPersonalEditFields/savePersonalEditFields come from
  // usePersonalInfoEditor (see the hook import above) — wrapped below to
  // also navigate this modal's own screen state, which the hook deliberately
  // doesn't own. Was "expand/collapse the inline hero form" pre-Part-3; now
  // navigates to/from the dedicated פרטים אישיים screen instead — same two
  // call sites (hero's עריכה button, חשבון section's row), same underlying
  // save, just a different screen-level destination.

  const openPersonalEdit = useCallback(() => {
    openPersonalEditFields();
    setScreen('personal');
  }, [openPersonalEditFields]);

  const savePersonalEdit = useCallback(async () => {
    const ok = await savePersonalEditFields();
    if (ok) setScreen('main');
  }, [savePersonalEditFields]);

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
      setCouponSuccessResult(result);
      setCouponCode('');
      showToast('success', t('settings.toast.couponOk'));
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : '') + String((err as Record<string, unknown>)?.code ?? '');
      if (msg.includes('not-found') || msg.includes('not found')) {
        setCouponError(t('settings.error.couponNotFound'));
      } else if (msg.includes('expired')) {
        setCouponError(t('settings.error.couponExpired'));
      } else if (msg.includes('resource-exhausted') || msg.includes('maximum')) {
        setCouponError(t('settings.error.couponMax'));
      } else {
        setCouponError(t('settings.error.couponFailed'));
      }
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, showToast, t]);

  // ── Password reset ───────────────────────────────────────────────────────

  const handlePasswordReset = useCallback(async () => {
    const email = userEmail || auth.currentUser?.email;
    if (!email || !hasEmailAuth) return;
    setPwResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setPwResetSent(true);
      showToast('success', t('settings.toast.resetSent'));
    } catch {
      showToast('error', t('settings.toast.resetFailed'));
    } finally {
      setPwResetLoading(false);
    }
  }, [userEmail, hasEmailAuth, showToast, t]);

  // ── Notification toggles (HIDDEN — App Store cleanup D3/D4/D5) ────────────
  // These three toggles wrote to `settings.notifications.{inactivity,
  // achievements,tips}` — a Firestore path NO server consumer ever reads
  // (the Cloud Function `sendPushFromQueue` only reads
  // `settings.notificationPrefs.{channel}`). They were non-functional and are
  // hidden to avoid App Store reviewer scrutiny on dead controls. Re-enable
  // these handlers together with their rows once they map to real channels.
  //
  // const handleInactivityToggle = useCallback((v: boolean) => {
  //   store.patch({ inactivityAlerts: v });
  //   scheduleSave({ 'settings.notifications.inactivity': v });
  // }, [store, scheduleSave]);
  //
  // const handleAchievementsToggle = useCallback((v: boolean) => {
  //   store.patch({ achievementAlerts: v });
  //   scheduleSave({ 'settings.notifications.achievements': v });
  // }, [store, scheduleSave]);
  //
  // const handleTipsToggle = useCallback((v: boolean) => {
  //   store.patch({ tipsAlerts: v });
  //   scheduleSave({ 'settings.notifications.tips': v });
  // }, [store, scheduleSave]);

  // ── Push-enabled master toggle ─────────────────────────────────────────────
  const handlePushEnabledToggle = useCallback(async (v: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid || pushSaving) return;

    store.patch({ pushEnabled: v });
    setPushSaving(true);

    try {
      if (v && isNativeApp()) {
        // On native: attempt permission request (shows OS dialog if status is
        // 'prompt'; no-ops if already 'granted'; returns false if 'denied').
        const registered = await initPushNotifications(uid);
        if (!registered) {
          // OS denied — revert toggle, reflect denied status and guide the
          // user to system settings.
          store.patch({ pushEnabled: false });
          await checkPushPermission();
          showToast('error', t('settings.toast.pushDenied'));
          return;
        }
        // OS granted — reflect it so the toggle renders ON immediately.
        setPushPermStatus('granted');
      }
      await setPushEnabled(uid, v);
    } catch (err) {
      console.error('[Settings] pushEnabled write failed:', err);
      store.patch({ pushEnabled: !v });
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setPushSaving(false);
    }
  }, [store, pushSaving, showToast, checkPushPermission, t]);

  // ── Chat notification channel toggle ─────────────────────────────────────
  const handleChatNotifToggle = useCallback(async (v: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid || chatNotifSaving) return;

    store.patch({ chatNotifEnabled: v });
    setChatNotifSaving(true);

    try {
      await setChannelEnabled(uid, 'chat', v);
    } catch (err) {
      console.error('[Settings] chatNotifEnabled write failed:', err);
      store.patch({ chatNotifEnabled: !v });
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setChatNotifSaving(false);
    }
  }, [store, chatNotifSaving, showToast, t]);

  // ── Generic channel toggle for new channels ───────────────────────────────
  const handleChannelToggle = useCallback(async (
    channel: PushChannel,
    storeKey: string,
    v: boolean,
  ) => {
    const uid = auth.currentUser?.uid;
    if (!uid || channelSaving[channel]) return;
    store.patch({ [storeKey]: v });
    setChannelSaving((prev) => ({ ...prev, [channel]: true }));
    try {
      await setChannelEnabled(uid, channel, v);
    } catch (err) {
      console.error(`[Settings] ${channel} write failed:`, err);
      store.patch({ [storeKey]: !v });
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setChannelSaving((prev) => ({ ...prev, [channel]: false }));
    }
  }, [store, channelSaving, showToast, t]);

  // ── Notification frequency (min/balanced/high) ────────────────────────────
  const handleFrequencyChange = useCallback(async (v: NotificationFrequency) => {
    const uid = auth.currentUser?.uid;
    if (!uid || frequencySaving) return;
    const previous = store.notificationFrequency;
    store.patch({ notificationFrequency: v });
    setFrequencySaving(true);
    try {
      await setNotificationFrequency(uid, v);
    } catch (err) {
      console.error('[Settings] notificationFrequency write failed:', err);
      store.patch({ notificationFrequency: previous });
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setFrequencySaving(false);
    }
  }, [store, frequencySaving, showToast, t]);

  // ── Shabbat observer ("שמירת שבת", settings.shabbatObserver) ─────────────
  // Server-side: push.service.ts holds every push except 1:1 chat for this user
  // from Friday/erev-chag afternoon until motzei Shabbat/chag; weekStartScheduler
  // sends observers a short week-start nudge on motzei Shabbat.
  const handleShabbatObserverToggle = useCallback(async (v: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid || shabbatSaving) return;
    store.patch({ shabbatObserver: v });
    setShabbatSaving(true);
    try {
      await setShabbatObserver(uid, v);
    } catch (err) {
      console.error('[Settings] shabbatObserver write failed:', err);
      store.patch({ shabbatObserver: !v });
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setShabbatSaving(false);
    }
  }, [store, shabbatSaving, showToast, t]);

  // ── Units (debounced Firestore) ──────────────────────────────────────────

  const handleUnitsChange = useCallback((v: 'km' | 'miles') => {
    store.patch({ units: v });
    scheduleSave({ 'settings.units': v });
  }, [store, scheduleSave]);

  // ── Training experience — guided station (debounced Firestore) ───────────
  const handleGuidedStationToggle = useCallback((v: boolean) => {
    store.patch({ guidedStation: v });
    scheduleSave({ [GUIDED_SETTING_KEY]: v });
    // Mirror into the local profile so the next station reads it without a profile refresh.
    const current = useUserStore.getState().profile as unknown as { settings?: Record<string, unknown> } | null;
    if (current) {
      useUserStore.getState().updateProfile({ settings: { ...(current.settings ?? {}), guidedStation: v } } as never);
    }
  }, [store, scheduleSave]);

  // ── Daily step goal — the ONE goal (features/activity/lib/step-goal.ts) ──
  // Ring, streak, step-deficit card and the evening push all follow it.
  const resolvedStepGoal = useActivityStore((st) => st.resolvedStepGoal);
  const stepGoalMode: 'auto' | 'manual' =
    (profile?.progression as { stepGoalMode?: unknown } | undefined)?.stepGoalMode === 'manual' ? 'manual' : 'auto';
  const [stepGoalSaving, setStepGoalSaving] = useState(false);
  const handleStepGoalChange = useCallback(async (value: string) => {
    if (!profile?.id) return;
    setStepGoalSaving(true);
    try {
      await setStepGoalChoice(profile.id, value === 'auto' ? 'auto' : Number(value));
    } catch (err) {
      console.error('[Settings] setStepGoalChoice failed:', err);
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setStepGoalSaving(false);
    }
  }, [profile?.id, showToast, t]);

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
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setIsSavingAnalytics(false);
    }
  }, [analyticsOptOut, showToast, t]);

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
      showToast('error', t('settings.toast.saveFailed'));
    } finally {
      setIsSavingDiscoverable(false);
    }
  }, [discoverable, showToast, t]);

  // ── Native permission handlers ───────────────────────────────────────────

  /**
   * Location row click.
   * • Web: shows an informational toast.
   * • Native, not granted: requests permission via the centralized GPS store
   *   (`useGPSStore.requestPermissionNow`), which Capacitor surfaces as the
   *   native OS dialog.
   * • Native, granted: shows a confirm then opens OS app-settings.
   */
  const handleLocationPermission = useCallback(async () => {
    if (!isNativeApp()) {
      showToast('error', t('settings.toast.locationNativeOnly'));
      return;
    }
    if (locationStatus === 'granted') {
      if (window.confirm(t('settings.confirm.openLocationSettings'))) {
        openNativeAppSettings();
      }
      return;
    }
    setLocationRequesting(true);
    try {
      // Explicit toggle tap → on-demand prompt via the centralized store. The
      // store updates permissionState (granted/denied/prompt), which flows
      // reactively into `locationStatus` and updates the row.
      const coords = await useGPSStore.getState().requestPermissionNow();
      if (!coords) {
        showToast('error', t('settings.toast.locationFailed'));
      }
    } finally {
      setLocationRequesting(false);
    }
  }, [locationStatus, showToast, t]);

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
      showToast('error', t('settings.toast.cameraNativeOnly'));
      return;
    }
    if (cameraStatus === 'granted') {
      if (window.confirm(t('settings.confirm.openCameraSettings'))) {
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
        if (window.confirm(t('settings.confirm.cameraDenied'))) {
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
        showToast('error', t('settings.toast.cameraFailed'));
      }
    } catch (err) {
      console.warn('[Settings] Camera permission request failed:', err);
      setCameraStatus('denied');
      showToast('error', t('settings.toast.cameraFailed'));
    } finally {
      setCameraRequesting(false);
    }
  }, [cameraStatus, showToast, t]);

  /**
   * Health row click.
   * • Web: informational toast.
   * • Native, not granted: opens the disclosure modal → then OS dialog.
   * • Native, granted: confirm → OS app-settings (user revokes there).
   */
  const handleHealthPermission = useCallback(() => {
    if (!isNativeApp()) {
      showToast('error', t('settings.toast.healthNativeOnly'));
      return;
    }
    if (store.healthBridgeEnabled) {
      if (window.confirm(t('settings.confirm.openHealthSettings'))) {
        openNativeAppSettings();
      }
      return;
    }
    triggerHealthPermission();
  }, [store.healthBridgeEnabled, triggerHealthPermission, showToast, t]);

  // ── Reminders ──────────────────────────────────────────────────────────────
  const handleAddReminder = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !selectedDay || !selectedTime || remindersSaving) return;
    const slot: ReminderSlot = { day: selectedDay, time: selectedTime };
    const previous = reminders;
    setRemindersSaving(true);
    setReminders((prev) => [...prev, slot]); // optimistic
    setShowAddReminder(false);
    try {
      const updated = await addReminderSlot(uid, slot);
      setReminders(updated);
      Analytics.logReminderSchedule({
        day: slot.day,
        time: slot.time,
        action: 'add',
        totalReminders: updated.length,
      });
    } catch (err) {
      console.error('[Settings] addReminderSlot failed:', err);
      setReminders(previous);
      showToast('error', t('settings.toast.reminderSaveFailed'));
    } finally {
      setRemindersSaving(false);
      setSelectedDay('sunday');
      setSelectedTime('18:00');
    }
  }, [selectedDay, selectedTime, reminders, remindersSaving, showToast, t]);

  const handleRemoveReminder = useCallback(async (slot: ReminderSlot) => {
    const uid = auth.currentUser?.uid;
    if (!uid || remindersSaving) return;
    const previous = reminders;
    setRemindersSaving(true);
    setReminders((prev) => prev.filter((s) => !(s.day === slot.day && s.time === slot.time))); // optimistic
    try {
      const updated = await removeReminderSlot(uid, slot);
      setReminders(updated);
      Analytics.logReminderSchedule({
        day: slot.day,
        time: slot.time,
        action: 'remove',
        totalReminders: updated.length,
      });
    } catch (err) {
      console.error('[Settings] removeReminderSlot failed:', err);
      setReminders(previous);
      showToast('error', t('settings.toast.reminderRemoveFailed'));
    } finally {
      setRemindersSaving(false);
    }
  }, [reminders, remindersSaving, showToast, t]);

  const getDayLabel = useCallback(
    (v: string) => {
      const day = DAYS_OF_WEEK.find((d) => d.value === v);
      return day ? weekdayLabel(day.index, 'long', tc) : v;
    },
    [tc],
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
      // Use router.replace() (Next.js client-side) instead of router.push()
      // so the landing page *replaces* the current history entry. On
      // Capacitor/Android the hardware back button traverses the webview
      // history stack — push() would leave /home (or wherever) reachable
      // after logout. replace() wipes that entry without triggering a full
      // page reload (unlike window.location.replace which caused -999 on iOS).
      router.replace('/');
    } catch {
      showToast('error', t('settings.error.signOut'));
    }
  }, [resetOnboarding, resetProfile, onClose, router, showToast, t]);

  // ── Delete account ───────────────────────────────────────────────────────
  const openDeleteConfirm = useCallback(() => {
    setDeleteConfirmText('');
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmText.trim() !== DELETE_CONFIRM_WORD) return;
    setDeleteError(null);
    setIsDeleting(true);
    if (!auth.currentUser) {
      setDeleteError(t('settings.error.noUser'));
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
      // Defer by one tick so the iOS WKWebView finishes flushing auth state
      // before the route change (window.location.replace caused -999 / blank-
      // screen errors by firing too early). router.replace() is a client-side
      // swap that wipes the history entry so the Android back button cannot
      // return to a protected screen after the account has been deleted.
      setTimeout(() => router.replace('/'), 150);
    } catch (err: unknown) {
      const code = (err as Record<string, unknown>)?.code as string | undefined;
      const msg  = ((err as Record<string, unknown>)?.message as string | undefined) ?? '';
      const isNetwork =
        code === 'internal' ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('transport') ||
        msg.toLowerCase().includes('fetch');
      setDeleteError(
        // callViaFetch() surfaces App Check / auth rejections as
        // 'functions/unauthenticated'; plain 'unauthenticated' covers
        // the web-SDK httpsCallable path.
        code?.includes('unauthenticated')
          ? t('settings.error.deleteSessionExpired')
          : isNetwork
          ? t('settings.error.deleteNetwork')
          : t('settings.error.deleteFailed'),
      );
      setIsDeleting(false);
    }
  }, [deleteConfirmText, resetOnboarding, resetProfile, onClose, router, t]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          // Full-screen, not a bottom-sheet (chrome polish). This was two
          // nested motion.div layers (a dimmed/blurred backdrop + a sheet
          // sliding up from the bottom, rounded-t-3xl, capped at 92vh) —
          // collapsed to one full-bleed layer sliding in from the side
          // (matching the back-chevron "push" navigation already built for
          // the internal screen drill-down), since a full-screen opaque
          // surface has no "behind" left to dim/blur or tap-to-close.
          // CONTAINED to this file: confirmed via grep that no other modal
          // in the codebase imports a shared wrapper for this outer shell —
          // every modal (this one included) inlines its own backdrop/sheet
          // JSX, so this change touches no shared modal plumbing.
          <motion.div
            key="settings-sheet"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            // z-[101], not z-50: BottomNavbar is also z-50 (fixed, mounted
            // globally in ClientLayout) and — since equal z-index ties
            // resolve by DOM order — was painting on top of this entire
            // modal, covering the bottom of every nested screen including
            // PersonaQuestionsDrawer's finish button (David, production
            // test 03.09.2026). z-[101] matches the table's own precedent
            // for full-screen sheets that also need to clear OfflineBanner
            // (z-[100], fixed bottom-0, same ClientLayout).
            className={`kb-fit fixed inset-0 z-[101] flex flex-col ${v2 ? 'overflow-hidden bg-v2-surface text-v2-ink' : 'bg-white'}`}
          >
            <SettingsV2.Provider value={v2}>
              {/* Sticky header — screen-aware ("פרופיל חלק" Part 3): a
                  back-chevron appears on every sub-screen (ArrowRight, the
                  established RTL "back" convention in this codebase — see
                  ExerciseLibraryPage's identical back button), title is
                  dynamic per screen, X always closes the whole modal
                  regardless of which screen is showing. */}
              <div
                className={
                  v2
                    // NOT sticky (owner screenshot 23.10, iPhone): this bar sits
                    // outside the scroll area, so `sticky` had no scroller of its
                    // own and WebKit resolved it against the page's <main>
                    // scroller behind the modal — opened from a scrolled
                    // profile, the bar slid down by that offset, grew a blank
                    // band above the title and covered the user card. A plain
                    // flex-shrink-0 row is always on top of the scroll area
                    // and the content always starts below it. Compact: just
                    // the safe area (min 8px) + one 40px row.
                    ? 'v2-glass-bar relative z-10 flex flex-shrink-0 items-center gap-2 px-4 pb-1.5 pt-[max(env(safe-area-inset-top,0px),8px)]'
                    : 'sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-3 flex items-center gap-2 z-10 flex-shrink-0'
                }
              >
                {screen !== 'main' && (
                  <button
                    type="button"
                    onClick={() => setScreen('main')}
                    aria-label={tc('actions.back')}
                    className="p-1 -mr-1 text-gray-500 hover:text-gray-800 flex-shrink-0"
                  >
                    <ArrowRight size={20} />
                  </button>
                )}
                <h2 className={v2 ? 'flex-1 text-[22px] font-black !tracking-[-0.02em] text-v2-ink' : 'flex-1 text-xl font-black text-gray-900 font-simpler'}>
                  {screen === 'main' ? t('settings.title')
                    : screen === 'personal' ? t('settings.screen.personal')
                    : screen === 'notifications' ? t('settings.screen.notifications')
                    : screen === 'personas' ? t('settings.screen.personas')
                    : t('settings.screen.privacy')}
                </h2>
                <button
                  onClick={onClose}
                  disabled={isDeleting}
                  aria-label={v2 ? tc('actions.close') : undefined}
                  className={
                    v2
                      ? 'grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-40'
                      : 'p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-40 flex-shrink-0'
                  }
                >
                  <X size={v2 ? 18 : 22} strokeWidth={v2 ? 2.4 : 2} />
                </button>
              </div>

              {/* Scrollable content — min-h-0 so it is the ONLY scroller in the sheet. */}
              <div className={v2 ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-10' : 'flex-1 overflow-y-auto pb-10'}>
              {screen === 'main' && (
                <>
                {/* ══════════════════════════════════════════════════════════
                    1. USER HERO — flat, read-only (no card chrome, no inline
                    edit here anymore). Name/bio/photo edit lives in Edit
                    Profile (public presentation, Part 2); city/weight/DOB
                    edit is the dedicated פרטים אישיים screen below (private,
                    reached via the חשבון row or this hero's own pencil).
                   ══════════════════════════════════════════════════════════ */}
                <div className={v2 ? 'px-4 pt-4' : 'px-5 pt-5 pb-2'}>
                  <div className={v2 ? 'flex items-center gap-3 rounded-[20px] bg-white p-3 shadow-v2-ring' : 'flex items-center gap-3 pb-4 border-b border-gray-100'}>
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

                    {/* Pencil → פרטים אישיים screen (same destination as the
                        חשבון row below; name/photo editing lives in Edit
                        Profile now, not here). */}
                    <button
                      type="button"
                      onClick={openPersonalEdit}
                      aria-label={t('settings.screen.personal')}
                      className="p-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>

                {/* ══════════════════════════════════════════════════════════
                    2. חשבון
                   ══════════════════════════════════════════════════════════ */}
                <Section title={t('settings.section.account')}>
                  <SettingsRow
                    icon={<User size={20} className="text-gray-700" />}
                    label={t('settings.screen.personal')}
                    sublabel={t('settings.account.personalSub')}
                    onClick={openPersonalEdit}
                  />
                  <SettingsRow
                    icon={<Users size={20} className="text-gray-700" />}
                    label={t('settings.screen.personas')}
                    sublabel={t('settings.account.personasSub')}
                    onClick={() => setScreen('personas')}
                  />
                  <SettingsRow
                    icon={<Lock size={20} className="text-gray-700" />}
                    label={pwResetSent ? t('settings.account.passwordSent') : t('settings.account.password')}
                    sublabel={
                      !hasEmailAuth
                        ? t('settings.account.passwordSubSocial')
                        : pwResetSent
                        ? t('settings.account.passwordSubSent')
                        : t('settings.account.passwordSubIdle')
                    }
                    disabled={!hasEmailAuth || pwResetSent || pwResetLoading}
                    onClick={handlePasswordReset}
                    right={
                      pwResetLoading ? (
                        <Loader2 size={16} className="animate-spin text-gray-400" />
                      ) : undefined
                    }
                  />
                  {/* AD7: deletion was only in the danger zone at the very bottom
                      (below logout), easy to miss. Same type-to-confirm dialog. */}
                  <SettingsRow
                    icon={<Trash2 size={20} className="text-red-600" />}
                    label={t('settings.danger.deleteAccount')}
                    sublabel={t('settings.account.deleteSub')}
                    disabled={isDeleting}
                    onClick={openDeleteConfirm}
                  />
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    3. מנוי — temporarily hidden (chrome polish, UI-only;
                    see SHOW_SUBSCRIPTION_SECTION at top of file). All
                    state/handlers/write-paths below are untouched.
                   ══════════════════════════════════════════════════════════ */}
                {SHOW_SUBSCRIPTION_SECTION && (
                <Section title={t('settings.section.subscription')}>
                  {/* City Pass status */}
                  <SettingsRow
                    icon={<CreditCard size={20} className="text-gray-700" />}
                    label="City Pass"
                    sublabel={
                      cityAffiliation
                        ? t('settings.subscription.activeSub', { name: cityAffiliation.name ?? cityAffiliation.id })
                        : t('settings.subscription.inactiveSub')
                    }
                    right={
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cityAffiliation
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {cityAffiliation ? t('settings.subscription.badgeActive') : t('settings.subscription.badgeInactive')}
                      </span>
                    }
                  />

                  {/* Coupon / access code */}
                  <div className="py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-50 flex-shrink-0">
                        <Tag size={20} className="text-gray-700" />
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-semibold text-gray-900 font-simpler">{t('settings.subscription.couponTitle')}</p>
                        {couponSuccessResult && (
                          <div className="mt-1">
                            <UnitJoinSuccessBanner result={couponSuccessResult} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="pt-3 space-y-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); setCouponSuccessResult(null); }}
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
                        {couponLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('settings.subscription.couponVerify')}
                      </button>
                    </div>
                  </div>
                </Section>
                )}

                {/* ══════════════════════════════════════════════════════════
                    4. התראות / פרטיות ונראות — now drill-down sub-screens
                    (see the screen==='notifications'/'privacy' blocks below)
                    instead of inline sections; these two rows are the only
                    thing left here.
                   ══════════════════════════════════════════════════════════ */}
                <Section title={t('settings.section.notifPrivacy')}>
                  <SettingsRow
                    icon={<Bell size={20} className="text-gray-700" />}
                    label={t('settings.screen.notifications')}
                    onClick={() => setScreen('notifications')}
                  />
                  <SettingsRow
                    icon={<Lock size={20} className="text-gray-700" />}
                    label={t('settings.screen.privacy')}
                    onClick={() => setScreen('privacy')}
                  />
                </Section>
                </>
              )}

              {/* הפרסונות שלי — own drill-down screen (chrome polish), was
                  an inline block in חשבון above. MyPersonasSection itself
                  is completely unchanged — confirmed via grep it's used
                  ONLY here (its own doc comment already said so) — this is
                  pure relocation, no logic touched. */}
              {screen === 'personas' && (
                <div className="px-5 py-5">
                  <MyPersonasSection />
                </div>
              )}

              {screen === 'notifications' && (
                <div className="px-5 py-5">
                  {v2 && <PushReAskSettingsCard />}
                  {/* Master push switch — gates ALL push; triggers OS prompt on native.
                      When the native OS permission is missing (denied/prompt) the
                      toggle is forced OFF and a PermissionStatusBadge replaces it,
                      tapping it deep-links to system settings (denied) or re-prompts
                      (prompt). This is the App Store Guideline 4.5.4 fix. */}
                  <div className="divide-y divide-gray-100">
                  <SettingsRow
                    icon={
                      pushSaving
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <Bell size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.push')}
                    sublabel={
                      nativePushBlocked
                        ? (pushPermStatus === 'denied' ? t('settings.notif.blockedOpen') : t('settings.notif.pushEnableToReceive'))
                        : isNativeApp() ? t('settings.notif.pushNativeAsk') : t('settings.notif.pushCentral')
                    }
                    right={
                      nativePushBlocked ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (pushPermStatus === 'prompt') {
                              void handlePushEnabledToggle(true);
                            } else {
                              openNativeAppSettings();
                            }
                          }}
                          className="active:scale-95 transition-transform"
                          aria-label={t('settings.notif.enableInDeviceSettings')}
                        >
                          <PermissionStatusBadge status={pushPermStatus} />
                        </button>
                      ) : (
                        <Toggle
                          checked={store.pushEnabled}
                          onChange={(v) => { void handlePushEnabledToggle(v); }}
                          disabled={!store.isLoaded || pushSaving}
                        />
                      )
                    }
                  />
                  {/* HIDDEN — App Store cleanup D3/D4/D5. These three toggles wrote to
                      `settings.notifications.{inactivity,achievements,tips}`, a Firestore
                      path no server consumer reads (the push Cloud Function only honours
                      `settings.notificationPrefs.{channel}`). Non-functional → hidden.
                  <SettingsRow
                    icon={<Bell size={18} className="text-orange-500" />}
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
                  */}

                  {/* Chat notification channel toggle — also gated by the native OS
                      permission (forced OFF + badge when access is missing). */}
                  <SettingsRow
                    icon={
                      chatNotifSaving
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <MessageSquare size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.chat')}
                    sublabel={
                      nativePushBlocked
                        ? (pushPermStatus === 'denied' ? t('settings.notif.blockedOpen') : t('settings.notif.chatEnable'))
                        : t('settings.notif.chatSub')
                    }
                    right={
                      nativePushBlocked ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (pushPermStatus === 'prompt') {
                              void handlePushEnabledToggle(true);
                            } else {
                              openNativeAppSettings();
                            }
                          }}
                          className="active:scale-95 transition-transform"
                          aria-label={t('settings.notif.enableInDeviceSettings')}
                        >
                          <PermissionStatusBadge status={pushPermStatus} />
                        </button>
                      ) : (
                        <Toggle
                          checked={store.chatNotifEnabled}
                          onChange={(v) => { void handleChatNotifToggle(v); }}
                          disabled={!store.isLoaded || !store.pushEnabled || chatNotifSaving}
                        />
                      )
                    }
                  />

                  {/* ── Per-category notification toggles ────────────────── */}
                  {/* Progression — level-up, streak, PR */}
                  <SettingsRow
                    icon={
                      channelSaving['progression']
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <Dumbbell size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.progression')}
                    sublabel={t('settings.notif.progressionSub')}
                    right={
                      <Toggle
                        checked={store.progressionNotif}
                        onChange={(v) => { void handleChannelToggle('progression', 'progressionNotif', v); }}
                        disabled={!store.isLoaded || !store.pushEnabled || !!channelSaving['progression']}
                      />
                    }
                  />
                  {/* Social — group joins, kudos */}
                  <SettingsRow
                    icon={
                      channelSaving['social']
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <Users size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.social')}
                    sublabel={t('settings.notif.socialSub')}
                    right={
                      <Toggle
                        checked={store.socialNotif}
                        onChange={(v) => { void handleChannelToggle('social', 'socialNotif', v); }}
                        disabled={!store.isLoaded || !store.pushEnabled || !!channelSaving['social']}
                      />
                    }
                  />
                  {/* Training reminder — scheduled workouts */}
                  <SettingsRow
                    icon={
                      channelSaving['training_reminder']
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <Calendar size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.trainingReminder')}
                    sublabel={t('settings.notif.trainingReminderSub')}
                    right={
                      <Toggle
                        checked={store.trainingReminderNotif}
                        onChange={(v) => { void handleChannelToggle('training_reminder', 'trainingReminderNotif', v); }}
                        disabled={!store.isLoaded || !store.pushEnabled || !!channelSaving['training_reminder']}
                      />
                    }
                  />
                  {/* Encouragement — manual admin broadcasts */}
                  <SettingsRow
                    icon={
                      channelSaving['encouragement']
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <Bell size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.encouragement')}
                    sublabel={t('settings.notif.encouragementSub')}
                    right={
                      <Toggle
                        checked={store.encouragementNotif}
                        onChange={(v) => { void handleChannelToggle('encouragement', 'encouragementNotif', v); }}
                        disabled={!store.isLoaded || !store.pushEnabled || !!channelSaving['encouragement']}
                      />
                    }
                  />
                  {/* Retention — re-engagement after inactivity */}
                  <SettingsRow
                    icon={
                      channelSaving['retention']
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <Heart size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.retention')}
                    sublabel={t('settings.notif.retentionSub')}
                    right={
                      <Toggle
                        checked={store.retentionNotif}
                        onChange={(v) => { void handleChannelToggle('retention', 'retentionNotif', v); }}
                        disabled={!store.isLoaded || !store.pushEnabled || !!channelSaving['retention']}
                      />
                    }
                  />
                  {/* Kelly phase 3 (flag ai_coach_proactive) — proactive Kelly messages, default on */}
                  {v2Flags.aiCoachProactive === true && (
                    <SettingsRow
                      icon={
                        channelSaving['coach_proactive']
                          ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                          : <MessageSquare size={20} className="text-gray-700" />
                      }
                      label={t('settings.notif.kelly')}
                      sublabel={t('settings.notif.kellySub')}
                      right={
                        <Toggle
                          label={t('settings.notif.kelly')}
                          checked={store.coachProactiveNotif}
                          onChange={(v) => { void handleChannelToggle('coach_proactive', 'coachProactiveNotif', v); }}
                          disabled={!store.isLoaded || !store.pushEnabled || !!channelSaving['coach_proactive']}
                        />
                      }
                    />
                  )}
                  {/* Shabbat observer — settings.shabbatObserver (default off). Not gated on
                      pushEnabled: it only ever withholds pushes, never adds any. */}
                  <SettingsRow
                    icon={
                      shabbatSaving
                        ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                        : <Moon size={20} className="text-gray-700" />
                    }
                    label={t('settings.notif.shabbat')}
                    sublabel={t('settings.notif.shabbatSub')}
                    right={
                      <Toggle
                        label={t('settings.notif.shabbat')}
                        checked={store.shabbatObserver}
                        onChange={(v) => { void handleShabbatObserverToggle(v); }}
                        disabled={!store.isLoaded || shabbatSaving}
                      />
                    }
                  />
                  {/* Week start — motzei-Shabbat nudge, sent to Shabbat observers only */}
                  {store.shabbatObserver && (
                    <SettingsRow
                      icon={
                        channelSaving['week_start']
                          ? <Loader2 size={18} className="text-gray-700 animate-spin" />
                          : <CalendarDays size={20} className="text-gray-700" />
                      }
                      label={t('settings.notif.weekStart')}
                      sublabel={t('settings.notif.weekStartSub')}
                      right={
                        <Toggle
                          label={t('settings.notif.weekStart')}
                          checked={store.weekStartNotif}
                          onChange={(v) => { void handleChannelToggle('week_start', 'weekStartNotif', v); }}
                          disabled={!store.isLoaded || !store.pushEnabled || !!channelSaving['week_start']}
                        />
                      }
                    />
                  )}

                  </div>

                  {/* Notification frequency — drives push.service.ts's per-user daily engagement cap */}
                  <div className="pt-4">
                    <p className="text-sm font-semibold text-gray-900 font-simpler text-right mb-2">{t('settings.freq.title')}</p>
                    <div className="space-y-2">
                      {(
                        [
                          { value: 'min' as const, labelKey: 'settings.freq.min.label' as const, subKey: 'settings.freq.min.sub' as const },
                          { value: 'balanced' as const, labelKey: 'settings.freq.balanced.label' as const, subKey: 'settings.freq.balanced.sub' as const, recommended: true },
                          { value: 'high' as const, labelKey: 'settings.freq.high.label' as const, subKey: 'settings.freq.high.sub' as const },
                        ]
                      ).map((opt) => {
                        const selected = store.notificationFrequency === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => { void handleFrequencyChange(opt.value); }}
                            disabled={!store.isLoaded || frequencySaving}
                            className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-right transition-colors ${
                              selected ? 'border-cyan-400 bg-cyan-50/50' : 'border-gray-100 bg-gray-50/50'
                            } disabled:opacity-60`}
                          >
                            <div
                              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                selected ? 'border-cyan-500 bg-cyan-500' : 'border-gray-300'
                              }`}
                            >
                              {selected && <Check size={12} className="text-on-brand" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-gray-900 font-simpler">{t(opt.labelKey)}</span>
                                {opt.recommended && (
                                  <span className="text-[10px] font-bold text-cyan-600 bg-cyan-100 rounded-full px-1.5 py-0.5">
                                    {t('settings.freq.recommended')}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{t(opt.subKey)}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reminders accordion — re-enabled (App Store cleanup D6),
                      now backed by users/{uid}.lifestyle.reminders.schedule.
                      Sending is a separate, not-yet-built Part B — this only
                      persists the chosen slots. */}
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
                        <p className="text-sm font-semibold text-gray-900 font-simpler">{t('settings.reminders.title')}</p>
                        <p className="text-xs text-gray-400 font-simpler mt-0.5">
                          {remindersLoading
                            ? t('settings.reminders.loading')
                            : reminders.length > 0 ? t('settings.reminders.count', { count: String(reminders.length) }) : t('settings.reminders.none')}
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
                                key={`${r.day}-${r.time}`}
                                className="flex items-center justify-between py-2 px-3 bg-cyan-50 border border-cyan-100 rounded-xl"
                              >
                                <button
                                  type="button"
                                  onClick={() => { void handleRemoveReminder(r); }}
                                  disabled={remindersSaving}
                                  className="text-red-400 hover:text-red-600 p-1 disabled:opacity-50"
                                  aria-label={t('settings.reminders.remove')}
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
                                <select
                                  value={selectedDay}
                                  onChange={(e) => setSelectedDay(e.target.value as ReminderWeekday)}
                                  className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm font-simpler outline-none focus:ring-2 focus:ring-cyan-400"
                                >
                                  {DAYS_OF_WEEK.map((d) => (
                                    <option key={d.value} value={d.value}>{weekdayLabel(d.index, 'long', tc)}</option>
                                  ))}
                                </select>
                                <DrumTimePicker value={selectedTime} onChange={setSelectedTime} />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setShowAddReminder(false)}
                                    className="flex-1 py-2 text-sm text-gray-500 font-simpler bg-gray-100 rounded-xl hover:bg-gray-200"
                                  >
                                    {tc('actions.cancel')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { void handleAddReminder(); }}
                                    disabled={remindersSaving}
                                    className="flex-1 py-2 text-sm font-bold text-on-brand bg-brand-cta hover:brightness-105 rounded-xl font-simpler disabled:opacity-50"
                                  >
                                    {t('settings.reminders.add')}
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
                                {t('settings.reminders.addReminder')}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {screen === 'privacy' && (
                <div className="px-5 py-5">
                  {/* Map visibility — inline 3-option selector */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin size={20} className="text-gray-700" />
                      <p className="text-base font-semibold text-gray-800 font-simpler">{t('settings.privacy.mapVisibility')}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(computeAgeGroup(profile?.core?.birthDate) === 'minor'
                        ? PRIVACY_MODES.filter(m => m.value === 'ghost')
                        : PRIVACY_MODES
                      ).map((m) => {
                        const Icon = m.icon;
                        const isActive = privacyMode === m.value;
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                            // Persist to BOTH localStorage (via store, for the live
                            // presence heartbeat) AND Firestore (settings.privacyMode)
                            // so the choice survives reinstall / new device (D7).
                            setPrivacyMode(m.value);
                            scheduleSave({ 'settings.privacyMode': m.value });
                          }}
                            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-center ${
                              isActive ? m.activeColor : 'border-gray-100 bg-gray-50 text-gray-500'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <p className="text-xs font-bold font-simpler leading-tight">{t(m.labelKey)}</p>
                            <p className="text-[9px] text-current opacity-70 font-simpler leading-snug">{t(m.sublabelKey)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 divide-y divide-gray-100">
                    {/* Feed posts — who sees them, auto-publish per activity
                        (only once the community feed is on). */}
                    {v2Flags.enableCommunityFeed && (
                      <SettingsRow
                        icon={<Users size={20} className="text-gray-700" />}
                        label={t('settings.privacy.feedPosts')}
                        sublabel={t('settings.privacy.feedPostsSub')}
                        onClick={() => setFeedPrivacyOpen(true)}
                      />
                    )}
                    {/* Profile discoverability */}
                    <SettingsRow
                      icon={discoverable ? <Eye size={20} className="text-gray-700" /> : <EyeOff size={20} className="text-gray-700" />}
                      label={t('settings.privacy.discoverable')}
                      sublabel={t('settings.privacy.discoverableSub')}
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
                      icon={<BarChart3 size={20} className="text-gray-700" />}
                      label={t('settings.privacy.analytics')}
                      sublabel={t('settings.privacy.analyticsSub')}
                      right={
                        <Toggle
                          checked={!analyticsOptOut}
                          onChange={handleAnalyticsToggle}
                          disabled={isSavingAnalytics}
                        />
                      }
                    />
                  </div>
                </div>
              )}

              {screen === 'main' && (
                <>
                {/* ══════════════════════════════════════════════════════════
                    6. כלים
                   ══════════════════════════════════════════════════════════ */}
                <Section title={t('settings.section.tools')}>
                  {language.options.length > 1 && (
                    <SettingsRow
                      icon={<Globe size={20} className="text-gray-700" />}
                      label={t('settings.language.label')}
                      right={
                        <select
                          aria-label={t('settings.language.aria')}
                          value={language.locale}
                          onChange={(e) => void language.choose(e.target.value as typeof language.locale)}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-bold text-gray-800"
                        >
                          {language.options.map((o) => (
                            <option key={o.value} value={o.value}>{o.name}</option>
                          ))}
                        </select>
                      }
                    />
                  )}
                  {/* ── Health Tracking (HealthKit / Health Connect) ──────── */}
                  <SettingsRow
                    icon={
                      <Heart
                        size={20}
                        className="text-gray-700"
                      />
                    }
                    label="HealthKit / Health Connect"
                    sublabel={
                      !isNativeApp()
                        ? t('settings.tools.nativeOnly')
                        : store.healthBridgeEnabled
                        ? t('settings.tools.healthConnected')
                        : t('settings.tools.healthIdle')
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

                  {/* Units — collapsible (chrome polish, was always-inline).
                      Reuses SettingsRow's own look (sublabel shows the
                      current value) with a custom chevron that rotates
                      open, same disclosure pattern as a drill-down row
                      without actually navigating away. */}
                  <div>
                    {/* v2: the same anatomy as SettingsRow's v2 branch (icon tile,
                        type scale, chevron) — this row hand-rolled the v1 look
                        and read faded / misaligned next to its neighbours. */}
                    {v2 ? (
                      <button
                        type="button"
                        onClick={() => setUnitsExpanded((v) => !v)}
                        aria-expanded={unitsExpanded}
                        className="flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors active:bg-v2-surface"
                      >
                        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[12px] bg-v2-surface text-v2-ink">
                          <Ruler size={20} className="text-v2-ink" />
                        </span>
                        <span className="min-w-0 flex-1 text-right">
                          <span className="block text-[14.5px] font-extrabold text-v2-ink">{t('settings.tools.units')}</span>
                          <span className="mt-0.5 block text-[12px] font-bold leading-snug text-v2-muted">
                            {t('settings.tools.unitName', { unit: store.units })}
                          </span>
                        </span>
                        <motion.span animate={{ rotate: unitsExpanded ? -90 : 0 }} className="flex flex-shrink-0">
                          <ChevronLeft size={16} strokeWidth={2.6} className="text-v2-muted" />
                        </motion.span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setUnitsExpanded((v) => !v)}
                        className="w-full flex items-center gap-3 py-3.5 text-start active:bg-gray-50 transition-colors"
                      >
                        <div className="flex-shrink-0">
                          <Ruler size={20} className="text-gray-700" />
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-base font-semibold text-gray-900 font-simpler">{t('settings.tools.units')}</p>
                          <p className="text-sm text-gray-400 font-simpler mt-0.5">
                            {t('settings.tools.unitName', { unit: store.units })}
                          </p>
                        </div>
                        <motion.div animate={{ rotate: unitsExpanded ? -90 : 0 }} className="flex-shrink-0">
                          <ChevronLeft size={16} className="text-gray-300" />
                        </motion.div>
                      </button>
                    )}
                    <AnimatePresence initial={false}>
                      {unitsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className={v2 ? 'flex gap-2 px-3.5 pb-3.5' : 'flex gap-2 pb-3.5'}>
                            {(['km', 'miles'] as const).map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => { handleUnitsChange(u); setUnitsExpanded(false); }}
                                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold font-simpler transition-all ${
                                  store.units === u
                                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                                    : 'border-gray-100 bg-gray-50 text-gray-500'
                                }`}
                              >
                                {t('settings.tools.unitName', { unit: u })}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Calendar sync (home v2 moved it here from the schedule) */}
                  {v2 && (
                    <SettingsRow
                      icon={<CalendarDays size={20} className="text-gray-700" />}
                      label={t('settings.tools.calendar')}
                      sublabel={calendarFeedPath ? t('settings.tools.calendarSub') : t('settings.loading')}
                      onClick={calendarFeedPath ? () => openCalendarSubscription(calendarFeedPath) : undefined}
                      disabled={!calendarFeedPath}
                    />
                  )}
                  {/* Equipment */}
                  <SettingsRow
                    icon={<Dumbbell size={20} className="text-gray-700" />}
                    label={t('settings.tools.equipment')}
                    sublabel={t('settings.tools.equipmentSub')}
                    onClick={() => setEquipmentSheetOpen(true)}
                  />

                  {/* ── Camera & Gallery permission ───────────────────────── */}
                  <SettingsRow
                    icon={
                      <Camera
                        size={20}
                        className="text-gray-700"
                      />
                    }
                    label={t('settings.tools.camera')}
                    sublabel={
                      !isNativeApp()
                        ? t('settings.tools.nativeOnly')
                        : cameraStatus === 'granted'
                        ? t('settings.tools.permGranted')
                        : cameraStatus === 'denied'
                        ? t('settings.tools.permDenied')
                        : t('settings.tools.cameraIdle')
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
                        size={20}
                        className="text-gray-700"
                      />
                    }
                    label={t('settings.tools.location')}
                    sublabel={
                      !isNativeApp()
                        ? t('settings.tools.nativeOnly')
                        : locationStatus === 'granted'
                        ? t('settings.tools.permGranted')
                        : locationStatus === 'denied'
                        ? t('settings.tools.permDenied')
                        : t('settings.tools.locationIdle')
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
                    חוויית אימון — guided hybrid-station layer (PR-B1)
                   ══════════════════════════════════════════════════════════ */}
                <Section title={t('settings.section.training')}>
                  <SettingsRow
                    icon={<Footprints size={20} className="text-gray-700" />}
                    label={t('settings.training.stepGoal')}
                    sublabel={
                      stepGoalMode === 'manual'
                        ? t('settings.training.stepGoalManual', { steps: (resolvedStepGoal ?? 0).toLocaleString('en-US') })
                        : resolvedStepGoal
                          ? t('settings.training.stepGoalAuto', { steps: resolvedStepGoal.toLocaleString('en-US') })
                          : t('settings.training.stepGoalAutoNone')
                    }
                    right={
                      <select
                        aria-label={t('settings.training.stepGoal')}
                        value={stepGoalMode === 'manual' && resolvedStepGoal ? String(resolvedStepGoal) : 'auto'}
                        disabled={stepGoalSaving || !profile?.id}
                        onChange={(e) => void handleStepGoalChange(e.target.value)}
                        className={
                          v2
                            ? 'max-w-[9.5rem] flex-shrink-0 rounded-full bg-v2-surface px-3 py-1.5 text-base font-extrabold text-v2-ink disabled:opacity-50'
                            : 'max-w-[9.5rem] flex-shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-base font-semibold text-gray-900 disabled:opacity-50'
                        }
                      >
                        <option value="auto">{t('settings.training.stepGoalAutoOption')}</option>
                        {Array.from(
                          { length: (MANUAL_STEP_GOAL_MAX - MANUAL_STEP_GOAL_MIN) / STEP_GOAL_INCREMENT + 1 },
                          (_, i) => MANUAL_STEP_GOAL_MIN + i * STEP_GOAL_INCREMENT,
                        ).map((n) => (
                          <option key={n} value={String(n)}>{n.toLocaleString('en-US')}</option>
                        ))}
                      </select>
                    }
                  />
                  <SettingsRow
                    icon={<ListChecks size={20} className="text-gray-700" />}
                    label={t('settings.training.guided')}
                    sublabel={t('settings.training.guidedSub')}
                    right={
                      <Toggle
                        checked={store.guidedStation}
                        onChange={handleGuidedStationToggle}
                        label={t('settings.training.guided')}
                      />
                    }
                  />
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    7. כללי
                   ══════════════════════════════════════════════════════════ */}
                <Section title={t('settings.section.general')}>
                  {/* Kelly round 4 (flag ai_coach_round4) — the help hub + replayable tours. */}
                  {v2Flags.aiCoachRound4 === true && (
                    <SettingsRow
                      icon={<HelpCircle size={20} className="text-gray-700" />}
                      label={t('settings.general.help')}
                      sublabel={t('settings.general.helpSub')}
                      onClick={() => { onClose(); router.push('/help'); }}
                    />
                  )}
                  <SettingsRow
                    icon={<Accessibility size={20} className="text-gray-700" />}
                    label={t('settings.general.a11yWidget')}
                    sublabel={t('settings.general.a11yWidgetSub')}
                    right={
                      <Toggle
                        checked={a11yWidgetOn}
                        onChange={handleA11yWidgetToggle}
                        label={t('settings.general.a11yWidget')}
                      />
                    }
                  />
                  {v2Flags.enableHapticsV1 === true && (
                    <SettingsRow
                      icon={<Vibrate size={20} className="text-gray-700" />}
                      label={t('settings.general.haptics')}
                      sublabel={t('settings.general.hapticsSub')}
                      right={
                        <Toggle
                          checked={hapticsOn}
                          onChange={(v) => { writeHapticsPref(v); setHapticsOn(v); }}
                          label={t('settings.general.haptics')}
                        />
                      }
                    />
                  )}
                  <SettingsRow
                    icon={<FileText size={20} className="text-gray-700" />}
                    label={t('settings.general.terms')}
                    onClick={() => setShowTermsModal(true)}
                  />
                  <SettingsRow
                    icon={<Shield size={20} className="text-gray-700" />}
                    label={t('settings.general.privacyPolicy')}
                    onClick={() => setShowPrivacyModal(true)}
                  />
                  <SettingsRow
                    icon={<Accessibility size={20} className="text-gray-700" />}
                    label={t('settings.general.accessibility')}
                    onClick={() => { onClose(); router.push('/accessibility'); }}
                  />
                  {/* About data sources — map/trail + elevation credits (ODbL / Copernicus). */}
                  <SettingsRow
                    icon={<MapIcon size={20} className="text-gray-700" />}
                    label={t('settings.general.sources')}
                    sublabel={t('settings.general.sourcesSub')}
                    onClick={() => window.open('https://www.openstreetmap.org/copyright', '_blank', 'noopener,noreferrer')}
                  />
                  <SettingsRow
                    icon={<Mail size={20} className="text-gray-700" />}
                    label={t('settings.general.contact')}
                    sublabel="office@appout.co.il"
                    onClick={() => window.open('mailto:office@appout.co.il', '_blank')}
                  />
                </Section>

                {/* ══════════════════════════════════════════════════════════
                    8. Logout — flattened (was boxed: bg-gray-50/border/rounded)
                   ══════════════════════════════════════════════════════════ */}
                <div className="px-5 pt-5 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 py-3.5 hover:bg-gray-50 transition-colors active:bg-gray-100"
                  >
                    {/* Icon box removed (was p-2 bg-gray-100 rounded-lg) —
                        missed in the earlier clean-icon pass; matches every
                        other row now. Size/color bumped to match too. */}
                    <div className="flex-shrink-0">
                      <LogOut size={20} className="text-gray-700" />
                    </div>
                    <span className="flex-1 text-right text-base font-semibold text-gray-700 font-simpler">{t('settings.logout')}</span>
                  </button>
                </div>

                {/* ══════════════════════════════════════════════════════════
                    9. DANGER ZONE
                   ══════════════════════════════════════════════════════════ */}
                <div className="px-5 pt-4 pb-2">
                  <div className="border-2 border-red-200 rounded-2xl p-4 bg-red-50/50">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={16} className="text-red-500" />
                      <h3 className="text-sm font-bold text-red-900 font-simpler">{t('settings.danger.title')}</h3>
                    </div>
                    <p className="text-xs text-red-700 font-simpler mb-3 leading-relaxed">
                      {t('settings.danger.desc')}
                    </p>
                    <button
                      type="button"
                      onClick={openDeleteConfirm}
                      disabled={isDeleting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-red-400 text-red-600 bg-white rounded-xl text-sm font-bold font-simpler hover:bg-red-50 transition-colors active:scale-[0.98] disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                      {t('settings.danger.deleteAccount')}
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-5 text-center">
                  <p className="text-[10px] text-gray-300 font-simpler">{t('settings.version')}</p>
                </div>
                </>
              )}

              {/* ══════════════════════════════════════════════════════════
                  פרטים אישיים — dedicated screen ("פרופיל חלק" Part 3).
                  Was the hero card's inline expand/collapse form; same
                  fields except name (name/bio/photo now live in Edit
                  Profile, public presentation, Part 2) — city, weight, DOB
                  only, matching the canvas board exactly. Same
                  usePersonalInfoEditor state/handlers, untouched; only the
                  screen this content renders on changed.
                 ══════════════════════════════════════════════════════════ */}
              {screen === 'personal' && (
                <div className="px-5 py-5">
                  <p className="text-xs text-gray-400 font-simpler mb-4">{t('settings.personal.intro')}</p>
                  <div className="divide-y divide-gray-100">
                    {/* City — display-only here, links out to /explorer
                        (core.authorityId is client-write-locked, can't join
                        this staged save). NOT /onboarding-new — that's the
                        old full onboarding wizard; its JIT mode has no exit
                        for the LOCATION step (dead-ends past confirm).
                        /explorer is the current location-edit flow (same
                        UnifiedLocationStep, explorer mode) and returns here
                        via explorer_return_to. */}
                    {/* 19.09.2026 — intentionally NOT clearing
                        core.affiliations[type='city'] here when the city
                        changes. That would fix the display bug (see
                        cityDisplay above) but the same field is also the
                        source of truth for the "City Pass" status badge
                        (main screen's "מנוי" section) — clearing it on
                        every city change would flip that badge to "לא פעיל"
                        for real users until GPS happens to re-fire
                        persistResolvedCity(). A wrong "inactive" status on
                        a real subscription feature is worse than a wrong
                        city label. Do this only after City Pass gets its
                        own source of truth independent of affiliations —
                        do not "fix" it here as a quick follow-up. */}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        goToCityEdit();
                      }}
                      className="w-full flex items-center justify-between py-3.5 text-sm font-simpler text-right"
                    >
                      <span className="text-cyan-600 font-semibold text-xs">{t('settings.personal.edit')}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-gray-900">{cityResolving ? t('settings.loading') : cityDisplay ?? t('settings.personal.notSet')}</span>
                        <span className="text-gray-900 font-semibold">{t('settings.personal.city')}</span>
                      </span>
                    </button>

                    {/* Weight */}
                    <div className="flex items-center justify-between py-3.5">
                      <input
                        type="number"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        placeholder="70"
                        min="20"
                        max="300"
                        className="w-20 bg-transparent outline-none text-right text-base text-gray-900 placeholder:text-gray-400"
                        style={{ color: '#111827', WebkitTextFillColor: '#111827' }}
                        dir="ltr"
                      />
                      <span className="text-gray-900 font-semibold text-sm">{t('settings.personal.weight')}</span>
                    </div>

                    {/* Birthdate — read-only (production incident, round 8):
                        core.birthDate is locked by firestore.rules'
                        noLockedCoreFieldsChanged(), a direct client write is
                        always rejected, so this was never a working edit
                        path. Display-only; no new edit flow added. */}
                    <div className="py-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2" dir="ltr">
                          <input
                            type="text"
                            readOnly
                            value={editDob.day}
                            placeholder="DD"
                            className="w-10 bg-transparent outline-none text-center text-base text-gray-900 placeholder:text-gray-400 cursor-default"
                            style={{ color: '#111827', WebkitTextFillColor: '#111827' }}
                          />
                          <input
                            ref={monthRef}
                            type="text"
                            readOnly
                            value={editDob.month}
                            placeholder="MM"
                            className="w-10 bg-transparent outline-none text-center text-base text-gray-900 placeholder:text-gray-400 cursor-default"
                            style={{ color: '#111827', WebkitTextFillColor: '#111827' }}
                          />
                          <input
                            ref={yearRef}
                            type="text"
                            readOnly
                            value={editDob.year}
                            placeholder="YYYY"
                            className="w-14 bg-transparent outline-none text-center text-base text-gray-900 placeholder:text-gray-400 cursor-default"
                            style={{ color: '#111827', WebkitTextFillColor: '#111827' }}
                          />
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{t('settings.personal.birthDate')}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1.5 font-simpler">{t('settings.personal.birthDateLocked')}</p>
                    </div>

                    {/* Neighborhood — staged like weight/DOB, constrained to
                        the selected city's children. */}
                    <button
                      type="button"
                      onClick={() => setNeighborhoodPickerOpen(true)}
                      disabled={!cityAuthorityId}
                      className="w-full flex items-center justify-between py-3.5 text-sm font-simpler text-right disabled:opacity-50"
                    >
                      <span className="text-cyan-600 font-semibold text-xs">
                        {editNeighborhoodName ? t('settings.personal.neighborhoodEdit') : t('settings.personal.neighborhoodChoose')}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-gray-900">
                          {!cityAuthorityId ? t('settings.personal.chooseCityFirst') : editNeighborhoodName ?? t('settings.personal.notSet')}
                        </span>
                        <span className="text-gray-900 font-semibold">{t('settings.personal.neighborhood')}</span>
                      </span>
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-400 font-simpler mt-5 leading-relaxed">
                    {t('settings.personal.footnote')}
                  </p>
                </div>
              )}

              </div>

              {/* Pinned footer save — personal-details screen only. These
                  fields ARE staged (unlike every toggle in Notifications/
                  Privacy, which already save immediately on change — see
                  those screens' own handlers) — a real, working "שמירה"
                  button here, same footer pattern EditProfileModal uses. */}
              {screen === 'personal' && (
                <div className="p-5 border-t border-gray-100 flex-shrink-0">
                  <button
                    type="button"
                    onClick={savePersonalEdit}
                    disabled={editSaving}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] text-on-brand font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                    {tc('actions.save')}
                  </button>
                </div>
              )}
              <FeedPrivacySheet
                open={feedPrivacyOpen}
                prefs={feedPrefs}
                busy={feedPrivacyBusy}
                onSave={(n) => void handleSaveFeedPrefs(n)}
                onClose={() => setFeedPrivacyOpen(false)}
              />
              {/* W3: renders INSIDE this z-[101] layer. As a sibling of it, its
                  z-70/71 opened underneath the settings screen, so tapping the
                  city/neighborhood row looked dead.
                  Neighborhood picker (personal screen, city/neighborhood row): staged
                  into editNeighborhoodId, committed together with name/weight/DOB
                  by savePersonalEdit's save button, not written immediately on select. */}
              <NeighborhoodPickerSheet
                isOpen={neighborhoodPickerOpen}
                onClose={() => setNeighborhoodPickerOpen(false)}
                cityAuthorityId={cityAuthorityId}
                cityName={cityDisplay}
                currentNeighborhoodId={editNeighborhoodId}
                onSelect={(n) => { setEditNeighborhoodId(n.id); setEditNeighborhoodName(n.name); }}
              />
            </SettingsV2.Provider>
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
            className="kb-fit fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={() => { if (!isDeleting) setShowDeleteConfirm(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-red-500" />
                  <h2 className="text-base font-bold text-red-700 font-simpler">{t('settings.delete.title')}</h2>
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
                  {t.rich('settings.delete.warning', { b: (chunks: React.ReactNode) => <span className="font-bold text-red-600">{chunks}</span> })}
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t.rich('settings.delete.typeToConfirm', { word: DELETE_CONFIRM_WORD, b: (chunks: React.ReactNode) => <span className="font-bold text-red-600">{chunks}</span> })}
                  </label>
                  <input
                    type="text"
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
                  {tc('actions.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting || deleteConfirmText.trim() !== DELETE_CONFIRM_WORD}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold font-simpler transition-all disabled:bg-red-200 disabled:text-red-400 enabled:bg-red-600 enabled:hover:bg-red-700 enabled:text-white"
                >
                  {isDeleting ? (
                    <><Loader2 size={16} className="animate-spin" /><span>{t('settings.delete.deleting')}</span></>
                  ) : (
                    <><Trash2 size={16} /><span>{t('settings.delete.confirm')}</span></>
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
