'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Dumbbell,
  Bell,
  Moon,
  Mail,
  LogOut,
  Trash2,
  User,
  Sun,
  Plus,
  Clock,
  FileText,
  Shield,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/store/useUserStore';
import { useOnboardingStore } from '@/features/onboarding/store/useOnboardingStore';

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

  const userName = profile?.core?.name || 'משתמש';
  const userAvatar = profile?.core?.photoURL;

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

  const handleDeleteAccount = async () => {
    if (!confirm('האם את/ה בטוח/ה? הפעולה תמחק את כל הנתונים שלך ולא ניתנת לביטול.')) {
      return;
    }

    setIsDeleting(true);
    const user = auth.currentUser;

    if (!user) {
      alert('שגיאה: לא נמצא משתמש מחובר');
      setIsDeleting(false);
      return;
    }

    try {
      // Delete Firestore Data
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await deleteDoc(userDocRef);
        console.log('[Settings] Firestore document deleted');
      } catch (firestoreError) {
        console.error('[Settings] Error deleting Firestore document:', firestoreError);
      }

      // Delete Auth User
      try {
        await user.delete();
        console.log('[Settings] Auth user deleted');
      } catch (authError: any) {
        console.error('[Settings] Error deleting auth user:', authError);
        if (authError.code === 'auth/requires-recent-login') {
          alert('נדרש להתחבר מחדש כדי למחוק את החשבון. אנא התחבר/י שוב ונסה/י שוב.');
          setIsDeleting(false);
          onClose();
          return;
        }
        alert('שגיאה במחיקת חשבון. מתנתק...');
      }

      // Cleanup
      try {
        localStorage.clear();
        sessionStorage.clear();
        resetOnboarding();
        resetProfile();
        await signOut(auth);
        onClose();
        router.push('/');
      } catch (cleanupError) {
        console.error('[Settings] Error during cleanup:', cleanupError);
        onClose();
        router.push('/');
      }
    } catch (error) {
      console.error('[Settings] Unexpected error:', error);
      alert('שגיאה בלתי צפויה. אנא נסה שוב.');
      setIsDeleting(false);
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

              {/* Terms & Privacy */}
              <button
                onClick={() => {
                  alert('תנאים והצהרת פרטיות - בקרוב!');
                }}
                className="w-full flex items-center gap-4 px-4 py-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all active:scale-98"
              >
                <div className="p-2 bg-purple-50 rounded-lg">
                  <FileText size={20} className="text-purple-600" />
                </div>
                <span className="flex-1 text-right font-medium text-gray-900 font-simpler">תנאים והצהרת פרטיות</span>
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

              {/* Delete Account */}
              <div className="border-2 border-red-200 rounded-xl p-6 bg-red-50/50">
                <h3 className="text-lg font-bold text-red-900 mb-2 font-simpler">אזור מסוכן</h3>
                <p className="text-sm text-red-700 mb-4 font-simpler">
                  פעולות באזור זה אינן ניתנות לביטול וימחקו את כל הנתונים שלך לצמיתות.
                </p>
                <button
                  onClick={handleDeleteAccount}
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
    </AnimatePresence>
  );
}
