'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Dumbbell,
  Moon,
  Mail,
  LogOut,
  Trash2,
  User,
  Sun,
  Plus,
  Clock,
  FileText,
  ShieldCheck,
  BarChart3,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { requestAccountDeletion } from '@/lib/requestAccountDeletion';
import { applyAnalyticsConsent } from '@/features/analytics/consent';
import LegalDocModal from '@/features/legal/components/LegalDocModal';

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
  { value: 'sunday', label: 'ראשון' },
  { value: 'monday', label: 'שני' },
  { value: 'tuesday', label: 'שלישי' },
  { value: 'wednesday', label: 'רביעי' },
  { value: 'thursday', label: 'חמישי' },
  { value: 'friday', label: 'שישי' },
  { value: 'saturday', label: 'שבת' },
];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const router = useRouter();
  const { profile, resetProfile } = useUserStore();
  const { reset: resetOnboarding } = useOnboardingStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Notification toggles (Smart Push)
  const [inactivityAlerts, setInactivityAlerts] = useState(true);
  const [achievements, setAchievements] = useState(true);
  const [dailyTips, setDailyTips] = useState(true);

  // Custom reminders
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [selectedDay, setSelectedDay] = useState('sunday');
  const [selectedTime, setSelectedTime] = useState('18:00');

  // Compliance Phase 5.1 — Analytics opt-out (mirrors users/{uid}.core.analyticsOptOut).
  // Default: analytics ON. Toggle persists to Firestore + flips Firebase Analytics
  // collection in real time. Custom event telemetry honours it via
  // `isCustomAnalyticsAllowed()` in AnalyticsService.
  const [analyticsOptOut, setAnalyticsOptOut] = useState(false);
  const [isSavingAnalytics, setIsSavingAnalytics] = useState(false);

  // Compliance Phase 6.4 — Profile discoverability toggle (mirrors
  // users/{uid}.core.discoverable). Default: OFF (privacy-first opt-in,
  // matches T&C §9.3). When ON, the user's profile becomes findable via
  // `searchUsersByName` and readable cross-user via the firestore.rules
  // `users` rule (`resource.data.core.discoverable == true`).
  const [discoverable, setDiscoverable] = useState(false);
  const [isSavingDiscoverable, setIsSavingDiscoverable] = useState(false);

  // Compliance Phase 5.2 — Legal doc modals.
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Compliance Phase 3.3 — Typed-confirmation deletion flow.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const DELETE_CONFIRM_WORD = 'מחק';

  const userName = profile?.core?.name || 'משתמש';
  const userAvatar = profile?.core?.photoURL;

  // Hydrate analytics toggle from the loaded user profile and re-apply
  // consent to the GA SDK every time the modal opens so the SDK state
  // matches the stored preference even after a hard refresh.
  useEffect(() => {
    if (!isOpen) return;
    const stored = profile?.core?.analyticsOptOut === true;
    setAnalyticsOptOut(stored);
    applyAnalyticsConsent(stored);
  }, [isOpen, profile?.core?.analyticsOptOut]);

  // Compliance Phase 6.4 — hydrate discoverability from the loaded
  // profile every time the modal opens. Treats `undefined` as `false`
  // to match the firestore.rules / search behavior (private by default).
  useEffect(() => {
    if (!isOpen) return;
    setDiscoverable(profile?.core?.discoverable === true);
  }, [isOpen, profile?.core?.discoverable]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      sessionStorage.clear();
      resetOnboarding();
      resetProfile();
      onClose();
      router.push('/');
    } catch (error) {
      console.error('[Settings] Error logging out:', error);
      alert('שגיאה בהתנתקות. אנא נסה שוב.');
    }
  };

  /**
   * Compliance Phase 3.3 — Right-to-erasure flow.
   *
   * Calls the `requestAccountDeletion` Cloud Function (Compliance Phase
   * 3.1) which recursively purges users/{uid}, dailyActivity, presence,
   * connections, activity, kudos, feed_posts, DMs, group-chat membership,
   * communities the user created, and storage prefixes — then deletes
   * the Auth user with the Admin SDK (so we never hit the
   * `auth/requires-recent-login` trap the old client-side delete had).
   *
   * The server function is idempotent, so a network-flaky retry is safe.
   */
  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== DELETE_CONFIRM_WORD) return;
    setDeleteError(null);
    setIsDeleting(true);

    const user = auth.currentUser;
    if (!user) {
      setDeleteError('לא נמצא משתמש מחובר. אנא התחבר/י מחדש ונסה/י שוב.');
      setIsDeleting(false);
      return;
    }

    try {
      await requestAccountDeletion();

      // Best-effort sign-out — the Auth user is already gone, so this may
      // throw 'user-token-expired' or similar. Either way, we want to
      // clear local state and route home.
      try {
        await signOut(auth);
      } catch (signOutErr) {
        console.warn('[Settings] signOut after delete failed (expected):', signOutErr);
      }

      try {
        localStorage.clear();
        sessionStorage.clear();
        resetOnboarding();
        resetProfile();
      } catch (cleanupErr) {
        console.warn('[Settings] local cleanup error:', cleanupErr);
      }

      setShowDeleteConfirm(false);
      onClose();
      router.push('/');
    } catch (err: any) {
      console.error('[Settings] requestAccountDeletion failed:', err);
      // Common Firebase callable error shape: { code, message, details }
      const msg =
        err?.code === 'unauthenticated'
          ? 'תוקף החיבור פג. אנא התחבר/י מחדש ונסה/י שוב.'
          : err?.code === 'failed-precondition'
            ? 'לא ניתן לאמת את הבקשה. אנא רענן/י את הדף ונסה/י שוב.'
            : 'אירעה שגיאה במחיקת החשבון. הנתונים שלך לא נמחקו. נסה/י שוב או צור/י קשר עם התמיכה.';
      setDeleteError(msg);
      setIsDeleting(false);
    }
  };

  const handleOpenDeleteConfirm = () => {
    setDeleteConfirmText('');
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  /**
   * Compliance Phase 5.1 — Persist analytics opt-out and apply it
   * immediately to the Firebase Analytics SDK. Optimistic UI: flip the
   * switch first, persist, and roll back if the write fails.
   */
  const handleToggleAnalyticsOptOut = async () => {
    const next = !analyticsOptOut;
    const user = auth.currentUser;
    if (!user) {
      alert('יש להתחבר כדי לשנות את הגדרת האנליטיקה.');
      return;
    }

    setAnalyticsOptOut(next);
    applyAnalyticsConsent(next);
    setIsSavingAnalytics(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'core.analyticsOptOut': next,
      });
    } catch (err) {
      console.error('[Settings] Failed to persist analytics opt-out:', err);
      // Roll back UI on persistence failure.
      setAnalyticsOptOut(!next);
      applyAnalyticsConsent(!next);
      alert('שמירת ההגדרה נכשלה. אנא נסה/י שוב.');
    } finally {
      setIsSavingAnalytics(false);
    }
  };

  /**
   * Compliance Phase 6.4 — Persist profile discoverability. Optimistic
   * UI: flip the switch first, persist, and roll back on write failure
   * (mirrors the analytics opt-out handler exactly so behaviour is
   * predictable across both privacy controls).
   *
   * Writes through `core.discoverable` so the existing firestore.rules
   * `users` rule (`resource.data.core.discoverable == true`) and
   * `searchUsersByName` query both pick it up immediately.
   */
  const handleToggleDiscoverable = async () => {
    const next = !discoverable;
    const user = auth.currentUser;
    if (!user) {
      alert('יש להתחבר כדי לשנות את הגדרת הפרטיות.');
      return;
    }

    setDiscoverable(next);
    setIsSavingDiscoverable(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'core.discoverable': next,
      });
    } catch (err) {
      console.error('[Settings] Failed to persist discoverable:', err);
      setDiscoverable(!next);
      alert('שמירת ההגדרה נכשלה. אנא נסה/י שוב.');
    } finally {
      setIsSavingDiscoverable(false);
    }
  };

  const handleContactSupport = () => {
    window.open('mailto:support@outrun.app', '_blank');
  };

  const handleEditProfile = () => {
    alert('עריכת פרופיל - בקרוב!');
  };

  const handleAddReminder = () => {
    if (!selectedDay || !selectedTime) return;
    
    const newReminder: Reminder = {
      id: Date.now().toString(),
      day: selectedDay,
      time: selectedTime,
    };
    
    setReminders([...reminders, newReminder]);
    setShowAddReminder(false);
    setSelectedDay('sunday');
    setSelectedTime('18:00');
  };

  const handleDeleteReminder = (id: string) => {
    setReminders(reminders.filter((r) => r.id !== id));
  };

  const getDayLabel = (dayValue: string) => {
    return DAYS_OF_WEEK.find((d) => d.value === dayValue)?.label || dayValue;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-2xl font-black text-gray-900 font-simpler">הגדרות</h2>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={24} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Section 1: User Profile */}
            <div className="px-6 py-6 border-b border-gray-100">
              <div className="flex flex-col items-center gap-4">
                <div className="w-24 h-24 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-full overflow-hidden border-4 border-white shadow-lg">
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200">
                      <User size={40} className="text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 font-simpler">{userName}</h3>
                  <p className="text-sm text-gray-500 mt-1">{profile?.core?.email || ''}</p>
                </div>
                <button
                  onClick={handleEditProfile}
                  className="px-6 py-2 border-2 border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-medium transition-colors active:scale-95 font-simpler"
                >
                  ערוך פרופיל
                </button>
              </div>
            </div>

            {/* Section 2: Notification Center */}
            <div className="px-6 py-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 font-simpler">התראות ולו"ז</h3>
              
              {/* Subsection A: Smart Push (System Scenarios) */}
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-4 font-simpler">
                  איזה עדכונים תרצה שקואץ' יתן לך?
                </p>
                
                <div className="space-y-3">
                  {/* Inactivity Alerts */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-900 font-simpler">מעקב אי-פעילות</span>
                    <div
                      onClick={() => setInactivityAlerts(!inactivityAlerts)}
                      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${
                        inactivityAlerts ? 'bg-cyan-500' : 'bg-gray-200'
                      }`}
                    >
                      <motion.div
                        animate={{ x: inactivityAlerts ? 24 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                      />
                    </div>
                  </div>

                  {/* Achievements */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-900 font-simpler">הישגים ורמות</span>
                    <div
                      onClick={() => setAchievements(!achievements)}
                      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${
                        achievements ? 'bg-cyan-500' : 'bg-gray-200'
                      }`}
                    >
                      <motion.div
                        animate={{ x: achievements ? 24 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                      />
                    </div>
                  </div>

                  {/* Daily Tips */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-900 font-simpler">טיפים ומוטיבציה</span>
                    <div
                      onClick={() => setDailyTips(!dailyTips)}
                      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${
                        dailyTips ? 'bg-cyan-500' : 'bg-gray-200'
                      }`}
                    >
                      <motion.div
                        animate={{ x: dailyTips ? 24 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Subsection B: My Reminders (Custom Schedule) */}
              <div>
                <p className="text-sm text-gray-600 mb-4 font-simpler">
                  קבע מתי להזכיר לך להתאמן
                </p>
                
                {/* Active Reminders List */}
                <AnimatePresence>
                  {reminders.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {reminders.map((reminder) => (
                        <motion.div
                          key={reminder.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="flex items-center justify-between px-4 py-3 bg-cyan-50 border border-cyan-200 rounded-xl"
                        >
                          <div className="flex items-center gap-3">
                            <Clock size={18} className="text-cyan-600" />
                            <span className="text-sm font-medium text-gray-900 font-simpler">
                              {getDayLabel(reminder.day)} - {reminder.time}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteReminder(reminder.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>

                {/* Add Reminder Form */}
                {showAddReminder ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-3"
                  >
                    <div className="space-y-3">
                      {/* Day Selector */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5 font-simpler">יום בשבוע</label>
                        <select
                          value={selectedDay}
                          onChange={(e) => setSelectedDay(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                        >
                          {DAYS_OF_WEEK.map((day) => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Time Picker */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5 font-simpler">שעה</label>
                        <input
                          type="time"
                          value={selectedTime}
                          onChange={(e) => setSelectedTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddReminder}
                          className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors active:scale-95 font-simpler"
                        >
                          שמור
                        </button>
                        <button
                          onClick={() => {
                            setShowAddReminder(false);
                            setSelectedDay('sunday');
                            setSelectedTime('18:00');
                          }}
                          className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors active:scale-95 font-simpler"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setShowAddReminder(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-700 rounded-xl font-medium transition-colors active:scale-95 font-simpler"
                  >
                    <Plus size={18} />
                    <span>הוסף תזכורת</span>
                  </button>
                )}
              </div>
            </div>

            {/* Section 3: General & Support */}
            <div className="px-6 py-6 border-b border-gray-100 space-y-2">
              {/* Dark Mode */}
              <div
                onClick={() => setDarkMode(!darkMode)}
                className="w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98 cursor-pointer"
              >
                <div className="p-2 bg-slate-100 rounded-lg">
                  {darkMode ? (
                    <Sun size={20} className="text-slate-700" />
                  ) : (
                    <Moon size={20} className="text-slate-600" />
                  )}
                </div>
                <span className="flex-1 text-right font-medium text-gray-900 font-simpler">מצב כהה</span>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setDarkMode(!darkMode);
                  }}
                  className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${
                    darkMode ? 'bg-cyan-500' : 'bg-gray-200'
                  }`}
                >
                  <motion.div
                    animate={{ x: darkMode ? 24 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                  />
                </div>
              </div>

              {/* My Equipment */}
              <button
                onClick={() => {
                  alert('הציוד שלי - בקרוב!');
                  onClose();
                }}
                className="w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98"
              >
                <div className="p-2 bg-cyan-50 rounded-lg">
                  <Dumbbell size={20} className="text-cyan-600" />
                </div>
                <span className="flex-1 text-right font-medium text-gray-900 font-simpler">הציוד שלי</span>
              </button>

              {/* Contact Support */}
              <button
                onClick={handleContactSupport}
                className="w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98"
              >
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Mail size={20} className="text-blue-600" />
                </div>
                <span className="flex-1 text-right font-medium text-gray-900 font-simpler">צור קשר</span>
              </button>

              {/* Analytics Opt-Out (Compliance Phase 5.1) */}
              <div
                onClick={() => { if (!isSavingAnalytics) handleToggleAnalyticsOptOut(); }}
                className={`w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98 ${
                  isSavingAnalytics ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                }`}
              >
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <BarChart3 size={20} className="text-emerald-600" />
                </div>
                <div className="flex-1 text-right">
                  <div className="font-medium text-gray-900 font-simpler">אנליטיקה ושיפור מוצר</div>
                  <p className="text-xs text-gray-500 mt-0.5 font-simpler leading-snug">
                    שיתוף נתוני שימוש אנונימיים לשיפור האפליקציה
                  </p>
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                    !analyticsOptOut ? 'bg-cyan-500' : 'bg-gray-200'
                  }`}
                >
                  <motion.div
                    animate={{ x: !analyticsOptOut ? 24 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                  />
                </div>
              </div>

              {/* Profile Discoverability (Compliance Phase 6.4) */}
              <div
                onClick={() => { if (!isSavingDiscoverable) handleToggleDiscoverable(); }}
                className={`w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98 ${
                  isSavingDiscoverable ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                }`}
              >
                <div className="p-2 bg-amber-50 rounded-lg">
                  {discoverable ? (
                    <Eye size={20} className="text-amber-600" />
                  ) : (
                    <EyeOff size={20} className="text-amber-600" />
                  )}
                </div>
                <div className="flex-1 text-right">
                  <div className="font-medium text-gray-900 font-simpler">נראות הפרופיל בחיפוש</div>
                  <p className="text-xs text-gray-500 mt-0.5 font-simpler leading-snug">
                    אם פעיל, משתמשים אחרים יוכלו למצוא אותך בחיפוש לפי שם
                  </p>
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                    discoverable ? 'bg-cyan-500' : 'bg-gray-200'
                  }`}
                >
                  <motion.div
                    animate={{ x: discoverable ? 24 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                  />
                </div>
              </div>

              {/* Terms of Use (Compliance Phase 5.2) */}
              <button
                onClick={() => setShowTermsModal(true)}
                className="w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98"
              >
                <div className="p-2 bg-purple-50 rounded-lg">
                  <FileText size={20} className="text-purple-600" />
                </div>
                <span className="flex-1 text-right font-medium text-gray-900 font-simpler">תנאי השימוש</span>
              </button>

              {/* Privacy Policy (Compliance Phase 5.2) */}
              <button
                onClick={() => setShowPrivacyModal(true)}
                className="w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98"
              >
                <div className="p-2 bg-purple-50 rounded-lg">
                  <ShieldCheck size={20} className="text-purple-600" />
                </div>
                <span className="flex-1 text-right font-medium text-gray-900 font-simpler">מדיניות הפרטיות</span>
              </button>
            </div>

            {/* Section 4: Danger Zone */}
            <div className="px-6 py-6 space-y-3">
              {/* Log Out */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-4 py-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-all active:scale-98"
              >
                <div className="p-2 bg-gray-200 rounded-lg">
                  <LogOut size={20} className="text-gray-600" />
                </div>
                <span className="flex-1 text-right font-medium text-gray-700 font-simpler">התנתק</span>
              </button>

              {/* Delete Account (Compliance Phase 3.3) */}
              <div className="border-2 border-red-200 rounded-xl p-6 bg-red-50/50">
                <h3 className="text-lg font-bold text-red-900 mb-2 font-simpler">אזור מסוכן</h3>
                <p className="text-sm text-red-700 mb-4 font-simpler leading-relaxed">
                  פעולות באזור זה אינן ניתנות לביטול וימחקו את כל הנתונים שלך לצמיתות
                  בהתאם לזכותך לפי חוק הגנת הפרטיות וה-GDPR.
                </p>
                <button
                  onClick={handleOpenDeleteConfirm}
                  disabled={isDeleting}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all font-bold font-simpler ${
                    isDeleting
                      ? 'bg-red-300 border-red-400 text-red-700 cursor-not-allowed'
                      : 'bg-red-50 border-red-500 text-red-600 hover:bg-red-100 hover:border-red-600 active:scale-95'
                  }`}
                >
                  <Trash2 size={20} />
                  <span>{isDeleting ? 'מוחק...' : 'מחק חשבון'}</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 font-simpler">Version 1.0.0</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Compliance Phase 5.2 — Legal doc modals ── */}
      <LegalDocModal
        type="terms"
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
      <LegalDocModal
        type="privacy"
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {/* ── Compliance Phase 3.3 — Typed-confirmation deletion modal ── */}
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
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
              dir="rtl"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={22} className="text-red-500" />
                  <h2 className="text-lg font-bold text-red-700 font-simpler">מחיקת חשבון לצמיתות</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  aria-label="סגור"
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              <div className="p-5 space-y-4 font-simpler">
                <p className="text-sm text-slate-700 leading-relaxed">
                  הפעולה הזו <span className="font-bold text-red-600">לא ניתנת לביטול</span>.
                  כל המידע שלך יימחק מהשרתים שלנו לצמיתות:
                </p>

                <ul className="text-sm text-slate-600 space-y-1.5 ps-2 leading-relaxed">
                  <li>• הפרופיל, ההעדפות והציוד</li>
                  <li>• היסטוריית האימונים, המסלולים והקלוריות</li>
                  <li>• הפוסטים, התרומות ותמונות הפרופיל</li>
                  <li>• הקשרים, הקבוצות וההודעות הפרטיות</li>
                  <li>• חשבון ההתחברות שלך</li>
                </ul>

                <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3">
                  הודעות שכתבת בקבוצות נשארות שם כדי לא לשבור את שטף השיחה,
                  אך הן נמחקות מהקרדיט אליך. יומני בטיחות (audit logs) שמורים
                  כפי שמחויב על פי חוק.
                </p>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    כדי לאשר, הקלד/י את המילה <span className="font-bold text-red-600">{DELETE_CONFIRM_WORD}</span>
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    disabled={isDeleting}
                    placeholder={DELETE_CONFIRM_WORD}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none disabled:bg-slate-50"
                    autoComplete="off"
                  />
                </div>

                {deleteError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 leading-relaxed">{deleteError}</p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors active:scale-95 font-simpler disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAccount}
                  disabled={isDeleting || deleteConfirmText.trim() !== DELETE_CONFIRM_WORD}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all font-simpler ${
                    isDeleting || deleteConfirmText.trim() !== DELETE_CONFIRM_WORD
                      ? 'bg-red-200 text-red-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white active:scale-95'
                  }`}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>מוחק...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      <span>מחק לצמיתות</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
