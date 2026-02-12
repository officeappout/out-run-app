'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Plus, Edit2, Trash2, Save, X, MessageSquareQuote, Target, Heart, BarChart3, Bell, Eye, Upload, Download, AlertTriangle, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { resolveNotificationText, getAvailableTags, resolveDescription, getAvailableDescriptionTags, TagResolverContext } from '@/features/content/branding/core/branding.utils';
import { injectParentPersonaData } from './inject-parent-data';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
// Brand fields removed per David's request

// ============================================================================
// GOLDEN CONTENT — Shared enrichment fields across all content types
// ============================================================================

const sportTypeLabels: Record<string, string> = {
  // כוח ותנועה
  calisthenics: 'קליסתניקס',
  crossfit: 'קרוספיט',
  functional: 'פונקציונלי',
  movement: 'תנועה',
  // אירובי וסיבולת
  running: 'ריצה',
  walking: 'הליכה',
  cycling: 'רכיבה',
  swimming: 'שחייה',
  // משחקי כדור
  basketball: 'כדורסל',
  soccer: 'כדורגל',
  tennis: 'טניס',
  padel: 'פאדל',
  // גוף-נפש
  yoga: 'יוגה',
  pilates: 'פילאטיס',
  flexibility: 'גמישות',
  // אתגרי
  climbing: 'טיפוס',
  skate_roller: 'סקייט / רולר',
  martial_arts: 'אמנויות לחימה',
};

const motivationStyleLabels: Record<string, string> = {
  tough: 'קשוח',
  encouraging: 'מעודד',
  scientific: 'מדעי',
  funny: 'הומוריסטי',
  military: 'צבאי',
  zen: 'רגוע',
};

const experienceLevelLabels: Record<string, string> = {
  beginner: 'מתחיל',
  intermediate: 'בינוני',
  advanced: 'מתקדם',
  pro: 'מקצועי',
};

const progressRangeLabels: Record<string, string> = {
  '0-20': 'מתחילים (0-20%)',
  '20-90': 'בדרך (20-90%)',
  '90-100': 'לקראת דרגה הבאה (90-100%)',
};

const dayPeriodLabels: Record<string, string> = {
  all: 'כל השבוע',
  start_of_week: 'תחילת שבוע (א-ב)',
  mid_week: 'אמצע שבוע (ג-ה)',
  weekend: 'סוף שבוע (ו-ש)',
};

interface WorkoutTitle {
  id: string;
  category: 'strength' | 'volume' | 'endurance' | 'skills' | 'mobility' | 'hiit' | 'general';
  text: string;
  persona?: string;
  location?: string;
  timeOfDay?: string;
  gender?: string;
  sportType?: string;
  motivationStyle?: string;
  experienceLevel?: string;
  progressRange?: string; // '0-20' | '20-90' | '90-100'
  dayPeriod?: string; // 'start_of_week' | 'mid_week' | 'weekend' | 'all'
  programId?: string; // Target program (e.g., 'pulling', 'pushing') or 'all' for general
  minLevel?: number;  // Min user level within the specified program
  maxLevel?: number;  // Max user level within the specified program
  createdAt?: Date;
  updatedAt?: Date;
}

interface MotivationalPhrase {
  id: string;
  location: string;
  persona: string;
  timeOfDay?: string;
  phrase: string;
  gender?: string;
  sportType?: string;
  motivationStyle?: string;
  experienceLevel?: string;
  progressRange?: string;
  dayPeriod?: string;
  programId?: string;
  minLevel?: number;
  maxLevel?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';

function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

interface Notification {
  id: string;
  triggerType: 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance' | 'Proximity';
  daysInactive?: number;
  persona: string;
  psychologicalTrigger: 'FOMO' | 'Challenge' | 'Support' | 'Reward';
  text: string;
  calendarIntegration?: boolean;
  clickCount?: number;
  completionRate?: number;
  gender?: string;
  sportType?: string;
  motivationStyle?: string;
  experienceLevel?: string;
  progressRange?: string;
  dayPeriod?: string;
  distanceMeters?: number; // For Proximity triggers
  programId?: string;
  minLevel?: number;
  maxLevel?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface SmartDescription {
  id: string;
  location: string;
  persona: string;
  description: string;
  clickCount?: number;
  completionRate?: number;
  gender?: string;
  sportType?: string;
  motivationStyle?: string;
  experienceLevel?: string;
  progressRange?: string;
  dayPeriod?: string;
  programId?: string;
  minLevel?: number;
  maxLevel?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export default function WorkoutSettingsPage() {
  const [activeTab, setActiveTab] = useState<'titles' | 'phrases' | 'notifications' | 'descriptions'>('titles');
  const [loading, setLoading] = useState(true);
  
  // Titles state
  const [titles, setTitles] = useState<WorkoutTitle[]>([]);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [showNewTitleForm, setShowNewTitleForm] = useState(false);
  const [titleForm, setTitleForm] = useState<Partial<WorkoutTitle>>({
    category: 'general',
    text: '',
    persona: '',
    location: 'home',
    timeOfDay: 'any',
    gender: 'both',
    sportType: '',
    motivationStyle: '',
    experienceLevel: '',
    progressRange: '',
    dayPeriod: '',
    programId: '',
    minLevel: undefined,
    maxLevel: undefined,
  });

  // Phrases state
  const [phrases, setPhrases] = useState<MotivationalPhrase[]>([]);
  const [editingPhrase, setEditingPhrase] = useState<string | null>(null);
  const [showNewPhraseForm, setShowNewPhraseForm] = useState(false);
  const [phraseForm, setPhraseForm] = useState<Partial<MotivationalPhrase>>({
    location: 'home',
    persona: '',
    timeOfDay: 'any',
    gender: 'both',
    sportType: '',
    motivationStyle: '',
    experienceLevel: '',
    progressRange: '',
    dayPeriod: '',
    programId: '',
    minLevel: undefined,
    maxLevel: undefined,
    phrase: '',
  });
  
  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [editingNotification, setEditingNotification] = useState<string | null>(null);
  const [showNewNotificationForm, setShowNewNotificationForm] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'All' | 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance' | 'Proximity'>('All');
  const [notificationForm, setNotificationForm] = useState<Partial<Notification>>({
    triggerType: 'Inactivity',
    daysInactive: 1,
    persona: '',
    gender: 'both',
    psychologicalTrigger: 'FOMO',
    text: '',
    calendarIntegration: false,
    sportType: '',
    motivationStyle: '',
    experienceLevel: '',
    progressRange: '',
    dayPeriod: '',
    distanceMeters: undefined,
    programId: '',
    minLevel: undefined,
    maxLevel: undefined,
  });

  // Smart Descriptions state
  const [smartDescriptions, setSmartDescriptions] = useState<SmartDescription[]>([]);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [showNewDescriptionForm, setShowNewDescriptionForm] = useState(false);
  const [descriptionForm, setDescriptionForm] = useState<Partial<SmartDescription>>({
    location: 'home',
    persona: '',
    gender: 'both',
    sportType: '',
    motivationStyle: '',
    experienceLevel: '',
    progressRange: '',
    dayPeriod: '',
    programId: '',
    minLevel: undefined,
    maxLevel: undefined,
    description: '',
  });
  
  // Description Templates state
  const [descriptionTemplates, setDescriptionTemplates] = useState<any[]>([]);

  // Programs for programId dropdown
  const [programs, setPrograms] = useState<Program[]>([]);

  // Clean Slate (Danger Zone) state
  const [showCleanSlateModal, setShowCleanSlateModal] = useState(false);
  const [cleanSlateStep, setCleanSlateStep] = useState<'initial' | 'confirm' | 'deleting' | 'done'>('initial');
  const [cleanSlateCollections, setCleanSlateCollections] = useState({
    titles: true,
    descriptions: true,
    notifications: true,
    phrases: true,
  });
  const [cleanSlateProgress, setCleanSlateProgress] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [titlesData, phrasesData, notificationsData, descriptionsData, templatesData, programsData] = await Promise.all([
        loadTitles(),
        loadPhrases(),
        loadNotifications(),
        loadSmartDescriptions(),
        loadDescriptionTemplates(),
        getAllPrograms().catch(() => [] as Program[]),
      ]);
      setTitles(titlesData);
      setPhrases(phrasesData);
      setNotifications(notificationsData);
      setSmartDescriptions(descriptionsData);
      setDescriptionTemplates(templatesData);
      setPrograms(programsData);
    } catch (error) {
      console.error('Error loading workout settings:', error);
      alert('שגיאה בטעינת ההגדרות');
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async (): Promise<Notification[]> => {
    try {
      const notificationsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`);
      const snapshot = await getDocs(notificationsRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDate(doc.data().createdAt),
        updatedAt: toDate(doc.data().updatedAt),
      } as Notification));
    } catch (error) {
      console.error('Error loading notifications:', error);
      return [];
    }
  };

  const loadDescriptionTemplates = async (): Promise<any[]> => {
    try {
      const templatesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/descriptionTemplates/templates`);
      const snapshot = await getDocs(templatesRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDate(doc.data().createdAt),
        updatedAt: toDate(doc.data().updatedAt),
      }));
    } catch (error) {
      console.error('Error loading description templates:', error);
      return [];
    }
  };

  const loadSmartDescriptions = async (): Promise<SmartDescription[]> => {
    try {
      const descriptionsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`);
      const snapshot = await getDocs(descriptionsRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDate(doc.data().createdAt),
        updatedAt: toDate(doc.data().updatedAt),
      } as SmartDescription));
    } catch (error) {
      console.error('Error loading smart descriptions:', error);
      return [];
    }
  };

  const loadTitles = async (): Promise<WorkoutTitle[]> => {
    try {
      const titlesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`);
      const snapshot = await getDocs(titlesRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDate(doc.data().createdAt),
        updatedAt: toDate(doc.data().updatedAt),
      } as WorkoutTitle));
    } catch (error) {
      console.error('Error loading titles:', error);
      return [];
    }
  };

  const loadPhrases = async (): Promise<MotivationalPhrase[]> => {
    try {
      const phrasesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`);
      const snapshot = await getDocs(phrasesRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDate(doc.data().createdAt),
        updatedAt: toDate(doc.data().updatedAt),
      } as MotivationalPhrase));
    } catch (error) {
      console.error('Error loading phrases:', error);
      return [];
    }
  };

  const handleSaveTitle = async () => {
    try {
      if (editingTitle) {
        const titleRef = doc(db, `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`, editingTitle);
        await setDoc(titleRef, {
          ...titleForm,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        const titlesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`);
        await addDoc(titlesRef, {
          ...titleForm,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await loadData();
      setEditingTitle(null);
      setShowNewTitleForm(false);
      resetTitleForm();
    } catch (error) {
      console.error('Error saving title:', error);
      alert('שגיאה בשמירת הכותרת');
    }
  };

  const handleSavePhrase = async () => {
    try {
      const phraseData: any = {
        ...phraseForm,
        // Brand field removed per David's request
      };
      
      if (editingPhrase) {
        const phraseRef = doc(db, `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`, editingPhrase);
        await setDoc(phraseRef, {
          ...phraseData,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        const phrasesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`);
        await addDoc(phrasesRef, {
          ...phraseData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await loadData();
      setEditingPhrase(null);
      setShowNewPhraseForm(false);
      resetPhraseForm();
    } catch (error) {
      console.error('Error saving phrase:', error);
      alert('שגיאה בשמירת המשפט');
    }
  };

  const handleDeleteTitle = async (titleId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הכותרת?')) return;
    try {
      await deleteDoc(doc(db, `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`, titleId));
      await loadData();
    } catch (error) {
      console.error('Error deleting title:', error);
      alert('שגיאה במחיקת הכותרת');
    }
  };

  const handleDeletePhrase = async (phraseId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את המשפט?')) return;
    try {
      await deleteDoc(doc(db, `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`, phraseId));
      await loadData();
    } catch (error) {
      console.error('Error deleting phrase:', error);
      alert('שגיאה במחיקת המשפט');
    }
  };

  const resetTitleForm = () => {
    setTitleForm({ category: 'general', text: '', persona: '', location: 'home', timeOfDay: 'any', gender: 'both', sportType: '', motivationStyle: '', experienceLevel: '', progressRange: '', dayPeriod: '', programId: '', minLevel: undefined, maxLevel: undefined });
  };

  const resetPhraseForm = () => {
    setPhraseForm({ location: 'home', persona: '', timeOfDay: 'any', phrase: '', gender: 'both', sportType: '', motivationStyle: '', experienceLevel: '', progressRange: '', dayPeriod: '', programId: '', minLevel: undefined, maxLevel: undefined });
  };

  // ============================================================================
  // CLEAN SLATE — Backup Export + Batch Delete
  // ============================================================================

  /** Export selected collections as a JSON backup file */
  const exportBackup = () => {
    const backup: Record<string, unknown[]> = {};
    if (cleanSlateCollections.titles) backup.workout_titles = titles;
    if (cleanSlateCollections.phrases) backup.motivational_phrases = phrases;
    if (cleanSlateCollections.notifications) backup.notifications = notifications;
    if (cleanSlateCollections.descriptions) backup.smart_descriptions = smartDescriptions;

    const totalRows = Object.values(backup).reduce((sum, arr) => sum + arr.length, 0);
    if (totalRows === 0) {
      alert('אין נתונים לייצוא — הטבלאות ריקות');
      return;
    }

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Batch-delete all docs in selected collections */
  const executeCleanSlate = async () => {
    setCleanSlateStep('deleting');

    const collectionsToDelete: { path: string; label: string }[] = [];
    if (cleanSlateCollections.titles) {
      collectionsToDelete.push({ path: `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`, label: 'כותרות אימון' });
    }
    if (cleanSlateCollections.phrases) {
      collectionsToDelete.push({ path: `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`, label: 'משפטים מוטיבציוניים' });
    }
    if (cleanSlateCollections.notifications) {
      collectionsToDelete.push({ path: `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`, label: 'התראות' });
    }
    if (cleanSlateCollections.descriptions) {
      collectionsToDelete.push({ path: `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`, label: 'תיאורים חכמים' });
    }

    try {
      let totalDeleted = 0;
      for (const col of collectionsToDelete) {
        setCleanSlateProgress(`מוחק ${col.label}...`);
        const snapshot = await getDocs(collection(db, col.path));
        
        // Firestore batches support max 500 operations
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 500);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
          totalDeleted += chunk.length;
          setCleanSlateProgress(`מוחק ${col.label}... (${totalDeleted} שורות נמחקו)`);
        }
      }

      // Reload data to clear in-memory state
      setCleanSlateProgress('מרענן נתונים...');
      await loadData();
      setCleanSlateStep('done');
      setCleanSlateProgress(`הושלם! ${totalDeleted} שורות נמחקו בהצלחה.`);
    } catch (error) {
      console.error('Error during Clean Slate:', error);
      setCleanSlateStep('initial');
      alert('שגיאה במחיקה. חלק מהנתונים עלולים להיות נמחקו. רענן את הדף.');
    }
  };

  const categoryLabels: Record<WorkoutTitle['category'], string> = {
    strength: 'כוח',
    volume: 'נפח',
    endurance: 'סיבולת',
    skills: 'סקילס',
    mobility: 'ניידות',
    hiit: 'HIIT',
    general: 'כללי',
  };

  const locationLabels: Record<string, string> = {
    home: 'בית',
    park: 'פארק',
    office: 'משרד',
    street: 'רחוב',
    school: 'בית ספר',
    gym: 'חדר כושר',
    airport: 'שדה תעופה',
    library: 'ספרייה',
  };

  const personaLabels: Record<string, string> = {
    parent: 'הורה',
    student: 'סטודנט',
    school_student: 'תלמיד',
    office_worker: 'עובד משרד',
    remote_worker: 'עובד מהבית',
    athlete: 'ספורטאי',
    senior: 'גיל הזהב',
    reservist: 'מילואימניק',
    active_soldier: 'חייל סדיר',
  };

  const timeOfDayLabels: Record<string, string> = {
    morning: 'בוקר',
    afternoon: 'צהריים',
    evening: 'ערב',
    any: 'כל היום',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900">ניהול שפה ומיתוג</h1>
          <p className="text-gray-500 mt-2">נהל כותרות אימון, משפטים מוטיבציוניים והתראות</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 bg-white rounded-2xl p-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('titles')}
          className={`px-6 py-3 font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'titles'
              ? 'border-b-2 border-cyan-500 text-cyan-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Target size={18} />
          כותרות אימון
        </button>
        <button
          onClick={() => setActiveTab('phrases')}
          className={`px-6 py-3 font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'phrases'
              ? 'border-b-2 border-cyan-500 text-cyan-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Heart size={18} />
          משפטים מוטיבציוניים
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-6 py-3 font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'border-b-2 border-cyan-500 text-cyan-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bell size={18} />
          מנהל התראות
        </button>
        <button
          onClick={() => setActiveTab('descriptions')}
          className={`px-6 py-3 font-bold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'descriptions'
              ? 'border-b-2 border-cyan-500 text-cyan-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquareQuote size={18} />
          תיאורים חכמים
        </button>
        <Link
          href="/admin/workout-settings/status"
          className="px-6 py-3 font-bold text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <BarChart3 size={18} />
          מטריצת כיסוי
        </Link>
        <Link
          href="/admin/workout-settings/bulk"
          className="px-6 py-3 font-bold text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <Upload size={18} />
          העלאה מרוכזת
        </Link>
      </div>

      {/* Titles Tab */}
      {activeTab === 'titles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setShowNewTitleForm(true);
                setEditingTitle(null);
                resetTitleForm();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
            >
              <Plus size={18} />
              כותרת חדשה
            </button>
          </div>

          {/* New/Edit Title Form — Unified schema matching phrases */}
          {(showNewTitleForm || editingTitle) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editingTitle ? 'ערוך כותרת' : 'כותרת חדשה'}
              </h3>
              <div className="space-y-4">
                {/* Row 1: Category + Location */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">קטגוריה</label>
                    <select
                      value={titleForm.category}
                      onChange={(e) => setTitleForm({ ...titleForm, category: e.target.value as WorkoutTitle['category'] })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">מיקום</label>
                    <select
                      value={titleForm.location || 'home'}
                      onChange={(e) => setTitleForm({ ...titleForm, location: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל המיקומים</option>
                      {Object.entries(locationLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Row 2: Persona + TimeOfDay + Gender */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">פרסונה</label>
                    <select
                      value={titleForm.persona || ''}
                      onChange={(e) => setTitleForm({ ...titleForm, persona: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הפרסונות</option>
                      {Object.entries(personaLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">שעת היום</label>
                    <select
                      value={titleForm.timeOfDay || 'any'}
                      onChange={(e) => setTitleForm({ ...titleForm, timeOfDay: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      {Object.entries(timeOfDayLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">מגדר</label>
                    <select
                      value={titleForm.gender || 'both'}
                      onChange={(e) => setTitleForm({ ...titleForm, gender: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="both">שניהם</option>
                      <option value="male">זכר</option>
                      <option value="female">נקבה</option>
                    </select>
                  </div>
                </div>
                {/* Row 3: Golden Content enrichment fields */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סוג ספורט</label>
                    <select
                      value={titleForm.sportType || ''}
                      onChange={(e) => setTitleForm({ ...titleForm, sportType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הספורטים</option>
                      {Object.entries(sportTypeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סגנון מוטיבציה</label>
                    <select
                      value={titleForm.motivationStyle || ''}
                      onChange={(e) => setTitleForm({ ...titleForm, motivationStyle: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הסגנונות</option>
                      {Object.entries(motivationStyleLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמת ניסיון</label>
                    <select
                      value={titleForm.experienceLevel || ''}
                      onChange={(e) => setTitleForm({ ...titleForm, experienceLevel: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הרמות</option>
                      {Object.entries(experienceLevelLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Row 4: Progress Range + Day Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">טווח התקדמות</label>
                    <select
                      value={titleForm.progressRange || ''}
                      onChange={(e) => setTitleForm({ ...titleForm, progressRange: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הטווחים</option>
                      {Object.entries(progressRangeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      90-100% = בונוס Level-Up (+5)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תקופה בשבוע</label>
                    <select
                      value={titleForm.dayPeriod || ''}
                      onChange={(e) => setTitleForm({ ...titleForm, dayPeriod: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הימים</option>
                      {Object.entries(dayPeriodLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      התאמה ליום בשבוע (+2 ניקוד)
                    </p>
                  </div>
                </div>
                {/* Row 4.5: Program + Level Range */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תוכנית</label>
                    <select
                      value={titleForm.programId || ''}
                      onChange={(e) => setTitleForm({ ...titleForm, programId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל התוכניות</option>
                      <option value="all">כללי (all)</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.isMaster ? ' (ראשית)' : ''}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">סינון קשיח — לא מתאים = ניקוד 0</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מינימלית</label>
                    <input
                      type="number"
                      min="1"
                      max="25"
                      value={titleForm.minLevel ?? ''}
                      onChange={(e) => setTitleForm({ ...titleForm, minLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מקסימלית</label>
                    <input
                      type="number"
                      min="1"
                      max="25"
                      value={titleForm.maxLevel ?? ''}
                      onChange={(e) => setTitleForm({ ...titleForm, maxLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                </div>
                {/* Row 5: Title text */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">טקסט הכותרת</label>
                  <input
                    type="text"
                    value={titleForm.text || ''}
                    onChange={(e) => setTitleForm({ ...titleForm, text: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    placeholder="לדוגמה: אימון כוח אינטנסיבי ל@פרסונה ב@מיקום"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    @tags: @שם, @מיקום, @פרסונה, @זמן_יום, @ספורט, @רמה, @מגדר, @את/ה, @מוכן/ה, @בוא/י
                  </p>
                </div>
                {/* Preview */}
                {titleForm.text && titleForm.text.includes('@') && (
                  <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl">
                    <p className="text-xs font-bold text-cyan-700 mb-1">תצוגה מקדימה:</p>
                    <p className="text-sm text-gray-800">
                      {resolveDescription(titleForm.text, {
                        persona: titleForm.persona,
                        location: titleForm.location,
                        userName: 'דוד',
                        userGoal: 'חיזוק הגוף',
                        currentTime: new Date(),
                      })}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTitle}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600"
                  >
                    <Save size={16} />
                    שמור
                  </button>
                  <button
                    onClick={() => {
                      setShowNewTitleForm(false);
                      setEditingTitle(null);
                      resetTitleForm();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                  >
                    <X size={16} />
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Titles List — Unified columns matching phrases */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">קטגוריה</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">מיקום</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">פרסונה</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">שעת היום</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">מגדר</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">טקסט</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {titles.map((title) => (
                  <tr key={title.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded text-xs font-bold">
                        {categoryLabels[title.category]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">
                        {title.location ? (locationLabels[title.location] || title.location) : 'הכל'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">
                        {title.persona ? (personaLabels[title.persona] || title.persona) : 'הכל'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                        {timeOfDayLabels[title.timeOfDay || 'any'] || 'כל היום'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded text-xs font-bold">
                        {title.gender === 'male' ? 'זכר' : title.gender === 'female' ? 'נקבה' : 'שניהם'}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-gray-900">{title.text}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingTitle(title.id);
                            setTitleForm({
                              category: title.category,
                              text: title.text,
                              persona: title.persona || '',
                              location: title.location || '',
                              timeOfDay: title.timeOfDay || 'any',
                              gender: title.gender || 'both',
                              sportType: title.sportType || '',
                              motivationStyle: title.motivationStyle || '',
                              experienceLevel: title.experienceLevel || '',
                              progressRange: title.progressRange || '',
                              dayPeriod: title.dayPeriod || '',
                              programId: title.programId || '',
                              minLevel: title.minLevel,
                              maxLevel: title.maxLevel,
                            });
                            setShowNewTitleForm(false);
                          }}
                          className="p-2 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteTitle(title.id)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Phrases Tab */}
      {activeTab === 'phrases' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setShowNewPhraseForm(true);
                setEditingPhrase(null);
                resetPhraseForm();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
            >
              <Plus size={18} />
              משפט חדש
            </button>
          </div>

          {/* New/Edit Phrase Form */}
          {(showNewPhraseForm || editingPhrase) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editingPhrase ? 'ערוך משפט' : 'משפט חדש'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">מיקום</label>
                  <select
                    value={phraseForm.location}
                    onChange={(e) => setPhraseForm({ ...phraseForm, location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    {Object.entries(locationLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">פרסונה</label>
                  <select
                    value={phraseForm.persona || ''}
                    onChange={(e) => setPhraseForm({ ...phraseForm, persona: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">בחר פרסונה...</option>
                    {Object.entries(personaLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">שעת היום</label>
                  <select
                    value={phraseForm.timeOfDay || 'any'}
                    onChange={(e) => setPhraseForm({ ...phraseForm, timeOfDay: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    {Object.entries(timeOfDayLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                {/* Golden Content enrichment */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סוג ספורט</label>
                    <select
                      value={phraseForm.sportType || ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, sportType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הספורטים</option>
                      {Object.entries(sportTypeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סגנון מוטיבציה</label>
                    <select
                      value={phraseForm.motivationStyle || ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, motivationStyle: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הסגנונות</option>
                      {Object.entries(motivationStyleLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמת ניסיון</label>
                    <select
                      value={phraseForm.experienceLevel || ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, experienceLevel: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הרמות</option>
                      {Object.entries(experienceLevelLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Progress Range + Day Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">טווח התקדמות</label>
                    <select
                      value={phraseForm.progressRange || ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, progressRange: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הטווחים</option>
                      {Object.entries(progressRangeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      90-100% = בונוס Level-Up (+5)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תקופה בשבוע</label>
                    <select
                      value={phraseForm.dayPeriod || ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, dayPeriod: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הימים</option>
                      {Object.entries(dayPeriodLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      התאמה ליום בשבוע (+2 ניקוד)
                    </p>
                  </div>
                </div>
                {/* Program + Level Range */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תוכנית</label>
                    <select
                      value={phraseForm.programId || ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, programId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל התוכניות</option>
                      <option value="all">כללי (all)</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.isMaster ? ' (ראשית)' : ''}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">סינון קשיח — לא מתאים = ניקוד 0</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מינימלית</label>
                    <input
                      type="number" min="1" max="25"
                      value={phraseForm.minLevel ?? ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, minLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מקסימלית</label>
                    <input
                      type="number" min="1" max="25"
                      value={phraseForm.maxLevel ?? ''}
                      onChange={(e) => setPhraseForm({ ...phraseForm, maxLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">משפט מוטיבציוני</label>
                  <textarea
                    value={phraseForm.phrase || ''}
                    onChange={(e) => setPhraseForm({ ...phraseForm, phrase: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 bg-white text-slate-900"
                    placeholder="לדוגמה: גם ביום עמוס, 5 דקות זה כל מה שצריך..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSavePhrase}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600"
                  >
                    <Save size={16} />
                    שמור
                  </button>
                  <button
                    onClick={() => {
                      setShowNewPhraseForm(false);
                      setEditingPhrase(null);
                      resetPhraseForm();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                  >
                    <X size={16} />
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Phrases List */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">מיקום</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פרסונה</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">שעת היום</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">משפט</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {phrases.map((phrase) => (
                  <tr key={phrase.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">
                        {locationLabels[phrase.location] || phrase.location}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">
                        {personaLabels[phrase.persona] || phrase.persona}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                        {timeOfDayLabels[phrase.timeOfDay || 'any'] || phrase.timeOfDay || 'כל היום'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{phrase.phrase}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingPhrase(phrase.id);
                            setPhraseForm({ location: phrase.location, persona: phrase.persona, timeOfDay: phrase.timeOfDay || 'any', gender: phrase.gender || 'both', sportType: phrase.sportType || '', motivationStyle: phrase.motivationStyle || '', experienceLevel: phrase.experienceLevel || '', progressRange: phrase.progressRange || '', dayPeriod: phrase.dayPeriod || '', programId: phrase.programId || '', minLevel: phrase.minLevel, maxLevel: phrase.maxLevel, phrase: phrase.phrase });
                            setShowNewPhraseForm(false);
                          }}
                          className="p-2 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeletePhrase(phrase.id)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inactivity Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setShowNewNotificationForm(true);
                setEditingNotification(null);
                setNotificationForm({ daysInactive: 1, persona: '', psychologicalTrigger: 'FOMO', text: '' });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
            >
              <Plus size={18} />
              התראה חדשה
            </button>
          </div>

          {/* New/Edit Notification Form */}
          {(showNewNotificationForm || editingNotification) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editingNotification ? 'ערוך התראה' : 'התראה חדשה'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">סוג טריגר</label>
                  <select
                    value={notificationForm.triggerType || 'Inactivity'}
                    onChange={(e) => {
                      const triggerType = e.target.value as any;
                      setNotificationForm({ 
                        ...notificationForm, 
                        triggerType,
                        daysInactive: triggerType === 'Inactivity' ? (notificationForm.daysInactive || 1) : undefined,
                        distanceMeters: triggerType === 'Proximity' ? (notificationForm.distanceMeters || 500) : undefined
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="Inactivity">אי-פעילות</option>
                    <option value="Scheduled">מתוזמן</option>
                    <option value="Location_Based">מבוסס מיקום</option>
                    <option value="Habit_Maintenance">תחזוקת הרגל</option>
                    <option value="Proximity">קרבה (Proximity)</option>
                  </select>
                </div>
                {notificationForm.triggerType === 'Inactivity' && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ימים ללא אימון</label>
                    <select
                      value={notificationForm.daysInactive || 1}
                      onChange={(e) => setNotificationForm({ ...notificationForm, daysInactive: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value={1}>1 יום</option>
                      <option value={2}>2 ימים</option>
                      <option value={7}>7 ימים</option>
                      <option value={30}>30 ימים</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">פרסונה</label>
                  <select
                    value={notificationForm.persona || ''}
                    onChange={(e) => setNotificationForm({ ...notificationForm, persona: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">בחר פרסונה...</option>
                    {Object.entries(personaLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">טריגר פסיכולוגי</label>
                  <select
                    value={notificationForm.psychologicalTrigger || 'FOMO'}
                    onChange={(e) => setNotificationForm({ ...notificationForm, psychologicalTrigger: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="FOMO">FOMO - פחד להחמיץ</option>
                    <option value="Challenge">אתגר</option>
                    <option value="Support">תמיכה</option>
                    <option value="Reward">פרס</option>
                  </select>
                </div>
                {/* Golden Content Enrichment Fields */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סוג ספורט</label>
                    <select
                      value={notificationForm.sportType || ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, sportType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הספורטים</option>
                      {Object.entries(sportTypeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סגנון מוטיבציה</label>
                    <select
                      value={notificationForm.motivationStyle || ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, motivationStyle: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הסגנונות</option>
                      {Object.entries(motivationStyleLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמת ניסיון</label>
                    <select
                      value={notificationForm.experienceLevel || ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, experienceLevel: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הרמות</option>
                      {Object.entries(experienceLevelLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Progress Range + Day Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">טווח התקדמות</label>
                    <select
                      value={notificationForm.progressRange || ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, progressRange: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הטווחים</option>
                      {Object.entries(progressRangeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      90-100% = בונוס Level-Up (+5)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תקופה בשבוע</label>
                    <select
                      value={notificationForm.dayPeriod || ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, dayPeriod: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הימים</option>
                      {Object.entries(dayPeriodLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      התאמה ליום בשבוע (+2 ניקוד)
                    </p>
                  </div>
                </div>
                {/* Program + Level Range */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תוכנית</label>
                    <select
                      value={notificationForm.programId || ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, programId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל התוכניות</option>
                      <option value="all">כללי (all)</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.isMaster ? ' (ראשית)' : ''}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">סינון קשיח — לא מתאים = ניקוד 0</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מינימלית</label>
                    <input
                      type="number" min="1" max="25"
                      value={notificationForm.minLevel ?? ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, minLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מקסימלית</label>
                    <input
                      type="number" min="1" max="25"
                      value={notificationForm.maxLevel ?? ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, maxLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                </div>
                {/* Proximity Distance (for Proximity trigger type) */}
                {notificationForm.triggerType === 'Proximity' && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">מרחק (מטרים)</label>
                    <input
                      type="number"
                      value={notificationForm.distanceMeters || ''}
                      onChange={(e) => setNotificationForm({ ...notificationForm, distanceMeters: parseInt(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="לדוגמה: 500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      מרחק בקרבה מפארק/מקום אימון (למשל: 500 מטר)
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">טקסט ההתראה</label>
                  <textarea
                    value={notificationForm.text || ''}
                    onChange={(e) => setNotificationForm({ ...notificationForm, text: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 bg-white text-slate-900"
                    placeholder="לדוגמה: כבר @ימי_אי_פעילות ימים שלא ראינו אותך. בוא נחזור לשגרה!"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ניתן להשתמש ב-@tags לדינמיות. ראה את הרשימה למטה.
                  </p>
                  
                  {/* Preview */}
                  {notificationForm.text && (
                    <div className="mt-3 p-3 bg-cyan-50 border border-cyan-200 rounded-xl">
                      <p className="text-xs font-bold text-cyan-700 mb-1">תצוגה מקדימה:</p>
                      <p className="text-sm text-gray-800">
                        {resolveNotificationText(notificationForm.text, {
                          triggerType: notificationForm.triggerType,
                          daysInactive: notificationForm.daysInactive,
                          persona: notificationForm.persona,
                          location: 'park',
                          locationName: 'פארק הירקון',
                          currentTime: new Date(),
                        })}
                      </p>
                    </div>
                  )}
                  
                  {/* Available Tags */}
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <p className="text-xs font-bold text-gray-700 mb-2">תגים זמינים:</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {getAvailableTags(notificationForm.triggerType).map((tagInfo) => (
                        <div key={tagInfo.tag} className="text-xs">
                          <span className="font-mono text-cyan-600 font-bold">{tagInfo.tag}</span>
                          <span className="text-gray-600 mr-2"> - {tagInfo.description}</span>
                          <span className="text-gray-400 italic">({tagInfo.example})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {notificationForm.triggerType === 'Scheduled' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="calendarIntegration"
                      checked={notificationForm.calendarIntegration || false}
                      onChange={(e) => setNotificationForm({ ...notificationForm, calendarIntegration: e.target.checked })}
                      className="w-4 h-4 text-cyan-500 rounded focus:ring-cyan-500"
                    />
                    <label htmlFor="calendarIntegration" className="text-sm font-medium text-gray-700">
                      אינטגרציה עם יומן (מקום למימוש עתידי)
                    </label>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        if (editingNotification) {
                          const notificationRef = doc(db, `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`, editingNotification);
                          await setDoc(notificationRef, {
                            ...notificationForm,
                            updatedAt: serverTimestamp(),
                          }, { merge: true });
                        } else {
                          const notificationsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`);
                          await addDoc(notificationsRef, {
                            ...notificationForm,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                          });
                        }
                        await loadData();
                        setEditingNotification(null);
                        setShowNewNotificationForm(false);
                        setNotificationForm({ triggerType: 'Inactivity', daysInactive: 1, persona: '', gender: 'both', psychologicalTrigger: 'FOMO', text: '', calendarIntegration: false, sportType: '', motivationStyle: '', experienceLevel: '', progressRange: '', dayPeriod: '', distanceMeters: undefined });
                      } catch (error) {
                        console.error('Error saving notification:', error);
                        alert('שגיאה בשמירת ההתראה');
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600"
                  >
                    <Save size={16} />
                    שמור
                  </button>
                  <button
                    onClick={() => {
                      setShowNewNotificationForm(false);
                      setEditingNotification(null);
                      setNotificationForm({ triggerType: 'Inactivity', daysInactive: 1, persona: '', psychologicalTrigger: 'FOMO', text: '', calendarIntegration: false });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                  >
                    <X size={16} />
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notifications List */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">סוג טריגר</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פרסונה</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">ימים ללא אימון</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">טריגר פסיכולוגי</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">טקסט</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {notifications
                  .filter((n) => notificationFilter === 'All' || n.triggerType === notificationFilter)
                  .map((notification) => (
                  <tr key={notification.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                        {notification.triggerType === 'Inactivity' ? 'אי-פעילות' :
                         notification.triggerType === 'Scheduled' ? 'מתוזמן' :
                         notification.triggerType === 'Location_Based' ? 'מבוסס מיקום' :
                         notification.triggerType === 'Proximity' ? 'קרבה' :
                         'תחזוקת הרגל'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">
                        {personaLabels[notification.persona] || notification.persona}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded text-xs font-bold">
                        {notification.gender === 'male' ? 'זכר' : notification.gender === 'female' ? 'נקבה' : 'שניהם'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {notification.daysInactive ? (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">
                          {notification.daysInactive} ימים
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">
                        {PSYCHOLOGICAL_TRIGGER_LABELS[notification.psychologicalTrigger] || notification.psychologicalTrigger}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{notification.text}</div>
                      {notification.text.includes('@') && (
                        <div className="mt-1 text-xs text-gray-500">
                          תצוגה מקדימה: {resolveNotificationText(notification.text, {
                            triggerType: notification.triggerType,
                            daysInactive: notification.daysInactive,
                            persona: notification.persona,
                            location: 'park',
                            locationName: 'פארק הירקון',
                            currentTime: new Date(),
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const preview = resolveNotificationText(notification.text, {
                              triggerType: notification.triggerType,
                              daysInactive: notification.daysInactive,
                              persona: notification.persona,
                              location: 'park',
                              locationName: 'פארק הירקון',
                              currentTime: new Date(),
                            });
                            alert(`תצוגה מקדימה:\n\n${preview}`);
                          }}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="תצוגה מקדימה"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingNotification(notification.id);
                            setNotificationForm({
                              triggerType: notification.triggerType,
                              daysInactive: notification.daysInactive,
                              persona: notification.persona,
                              gender: notification.gender || 'both',
                              psychologicalTrigger: notification.psychologicalTrigger,
                              text: notification.text,
                              calendarIntegration: notification.calendarIntegration,
                              sportType: notification.sportType || '',
                              motivationStyle: notification.motivationStyle || '',
                              experienceLevel: notification.experienceLevel || '',
                              progressRange: notification.progressRange || '',
                              dayPeriod: notification.dayPeriod || '',
                              distanceMeters: notification.distanceMeters,
                              programId: notification.programId || '',
                              minLevel: notification.minLevel,
                              maxLevel: notification.maxLevel,
                            });
                            setShowNewNotificationForm(false);
                          }}
                          className="p-2 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('האם אתה בטוח שברצונך למחוק את ההתראה?')) return;
                            try {
                              await deleteDoc(doc(db, `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`, notification.id));
                              await loadData();
                            } catch (error) {
                              console.error('Error deleting notification:', error);
                              alert('שגיאה במחיקת ההתראה');
                            }
                          }}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Smart Descriptions Tab */}
      {activeTab === 'descriptions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setShowNewDescriptionForm(true);
                setEditingDescription(null);
                setDescriptionForm({ location: 'home', persona: '', gender: 'both', sportType: '', motivationStyle: '', experienceLevel: '', progressRange: '', dayPeriod: '', description: '' });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
            >
              <Plus size={18} />
              תיאור חכם חדש
            </button>
          </div>

          {/* New/Edit Description Form */}
          {(showNewDescriptionForm || editingDescription) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editingDescription ? 'ערוך תיאור' : 'תיאור חכם חדש'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">מיקום</label>
                  <select
                    value={descriptionForm.location}
                    onChange={(e) => setDescriptionForm({ ...descriptionForm, location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    {Object.entries(locationLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">פרסונה</label>
                  <select
                    value={descriptionForm.persona || ''}
                    onChange={(e) => setDescriptionForm({ ...descriptionForm, persona: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">בחר פרסונה...</option>
                    {Object.entries(personaLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                {/* Golden Content enrichment */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סוג ספורט</label>
                    <select
                      value={descriptionForm.sportType || ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, sportType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הספורטים</option>
                      {Object.entries(sportTypeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">סגנון מוטיבציה</label>
                    <select
                      value={descriptionForm.motivationStyle || ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, motivationStyle: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הסגנונות</option>
                      {Object.entries(motivationStyleLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמת ניסיון</label>
                    <select
                      value={descriptionForm.experienceLevel || ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, experienceLevel: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הרמות</option>
                      {Object.entries(experienceLevelLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Progress Range + Day Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">טווח התקדמות</label>
                    <select
                      value={descriptionForm.progressRange || ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, progressRange: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הטווחים</option>
                      {Object.entries(progressRangeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      90-100% = בונוס Level-Up (+5)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תקופה בשבוע</label>
                    <select
                      value={descriptionForm.dayPeriod || ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, dayPeriod: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל הימים</option>
                      {Object.entries(dayPeriodLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      התאמה ליום בשבוע (+2 ניקוד)
                    </p>
                  </div>
                </div>
                {/* Program + Level Range */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">תוכנית</label>
                    <select
                      value={descriptionForm.programId || ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, programId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">כל התוכניות</option>
                      <option value="all">כללי (all)</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.isMaster ? ' (ראשית)' : ''}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">סינון קשיח — לא מתאים = ניקוד 0</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מינימלית</label>
                    <input
                      type="number" min="1" max="25"
                      value={descriptionForm.minLevel ?? ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, minLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">רמה מקסימלית</label>
                    <input
                      type="number" min="1" max="25"
                      value={descriptionForm.maxLevel ?? ''}
                      onChange={(e) => setDescriptionForm({ ...descriptionForm, maxLevel: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                      placeholder="—"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">תיאור חכם</label>
                  <textarea
                    value={descriptionForm.description || ''}
                    onChange={(e) => setDescriptionForm({ ...descriptionForm, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 bg-white text-slate-900"
                    placeholder="תיאור מותאם למיקום ופרסונה... ניתן להשתמש ב-@tags לדינמיות"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    @tags: @שם, @מיקום, @פרסונה, @ספורט, @רמה, @מגדר, @את/ה, @מוכן/ה, @בוא/י
                  </p>
                  
                  {/* Preview */}
                  {descriptionForm.description && (
                    <div className="mt-3 p-3 bg-cyan-50 border border-cyan-200 rounded-xl">
                      <p className="text-xs font-bold text-cyan-700 mb-1">תצוגה מקדימה:</p>
                      <p className="text-sm text-gray-800">
                        {resolveDescription(descriptionForm.description, {
                          persona: descriptionForm.persona,
                          location: descriptionForm.location,
                          locationName: descriptionForm.location === 'park' ? 'פארק הירקון' : undefined,
                          userName: 'דוד',
                          userGoal: 'חיזוק הגוף',
                          exerciseName: 'כפיפות בטן',
                          category: 'כוח',
                          muscles: ['abs', 'core'],
                          equipment: ['מזרן', 'מים'],
                          currentTime: new Date(),
                        })}
                      </p>
                    </div>
                  )}
                  
                  {/* Available Tags */}
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <p className="text-xs font-bold text-gray-700 mb-2">תגים זמינים:</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {getAvailableDescriptionTags().map((tagInfo) => (
                        <div key={tagInfo.tag} className="text-xs">
                          <span className="font-mono text-cyan-600 font-bold">{tagInfo.tag}</span>
                          <span className="text-gray-600 mr-2"> - {tagInfo.description}</span>
                          <span className="text-gray-400 italic">({tagInfo.example})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        if (editingDescription) {
                          const descriptionRef = doc(db, `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`, editingDescription);
                          await setDoc(descriptionRef, {
                            ...descriptionForm,
                            updatedAt: serverTimestamp(),
                          }, { merge: true });
                        } else {
                          const descriptionsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`);
                          await addDoc(descriptionsRef, {
                            ...descriptionForm,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                          });
                        }
                        await loadData();
                        setEditingDescription(null);
                        setShowNewDescriptionForm(false);
                        setDescriptionForm({ location: 'home', persona: '', gender: 'both', sportType: '', motivationStyle: '', experienceLevel: '', progressRange: '', dayPeriod: '', description: '' });
                      } catch (error) {
                        console.error('Error saving description:', error);
                        alert('שגיאה בשמירת התיאור');
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600"
                  >
                    <Save size={16} />
                    שמור
                  </button>
                  <button
                    onClick={() => {
                      setShowNewDescriptionForm(false);
                      setEditingDescription(null);
                      setDescriptionForm({ location: 'home', persona: '', gender: 'both', sportType: '', motivationStyle: '', experienceLevel: '', progressRange: '', dayPeriod: '', description: '' });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                  >
                    <X size={16} />
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Descriptions List */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">מיקום</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פרסונה</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">תיאור</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {smartDescriptions.map((description) => (
                  <tr key={description.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">
                        {locationLabels[description.location] || description.location}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">
                        {personaLabels[description.persona] || description.persona}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded text-xs font-bold">
                        {description.gender === 'male' ? 'זכר' : description.gender === 'female' ? 'נקבה' : 'שניהם'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{description.description}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingDescription(description.id);
                            setDescriptionForm({
                              location: description.location,
                              persona: description.persona,
                              gender: description.gender || 'both',
                              sportType: description.sportType || '',
                              motivationStyle: description.motivationStyle || '',
                              experienceLevel: description.experienceLevel || '',
                              progressRange: description.progressRange || '',
                              dayPeriod: description.dayPeriod || '',
                              programId: description.programId || '',
                              minLevel: description.minLevel,
                              maxLevel: description.maxLevel,
                              description: description.description,
                            });
                            setShowNewDescriptionForm(false);
                          }}
                          className="p-2 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('האם אתה בטוח שברצונך למחוק את התיאור?')) return;
                            try {
                              await deleteDoc(doc(db, `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`, description.id));
                              await loadData();
                            } catch (error) {
                              console.error('Error deleting description:', error);
                              alert('שגיאה במחיקת התיאור');
                            }
                          }}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* DANGER ZONE — Clean Slate                                          */}
      {/* ================================================================== */}
      <div className="mt-12 border-2 border-red-200 rounded-2xl bg-red-50/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert size={24} className="text-red-600" />
          <h2 className="text-xl font-black text-red-700">Danger Zone</h2>
        </div>
        <p className="text-sm text-red-600/80 mb-4">
          פעולות בלתי הפיכות. מחיקת כל התוכן מאפסת את המערכת לגמרי.
          מומלץ לייצא גיבוי לפני כל מחיקה.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Stats */}
          <div className="flex items-center gap-4 text-xs text-red-600/70 ml-auto">
            <span>{titles.length} כותרות</span>
            <span>{phrases.length} משפטים</span>
            <span>{notifications.length} התראות</span>
            <span>{smartDescriptions.length} תיאורים</span>
          </div>

          <button
            onClick={() => {
              setShowCleanSlateModal(true);
              setCleanSlateStep('initial');
              setCleanSlateProgress('');
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm"
          >
            <Trash2 size={16} />
            Clean Slate — מחיקת כל התוכן
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* CLEAN SLATE MODAL                                                  */}
      {/* ================================================================== */}
      {showCleanSlateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" dir="rtl">
            {/* Header */}
            <div className="bg-red-600 p-5 flex items-center gap-3">
              <AlertTriangle size={28} className="text-white" />
              <div>
                <h3 className="text-lg font-black text-white">Clean Slate — מחיקה מלאה</h3>
                <p className="text-red-100 text-sm">פעולה זו אינה ניתנת לביטול</p>
              </div>
              <button
                onClick={() => setShowCleanSlateModal(false)}
                className="mr-auto text-white/80 hover:text-white"
                disabled={cleanSlateStep === 'deleting'}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Step 1: Select & Export */}
              {cleanSlateStep === 'initial' && (
                <>
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-3">בחר טבלאות למחיקה:</p>
                    <div className="space-y-2">
                      {[
                        { key: 'titles' as const, label: 'כותרות אימון', count: titles.length },
                        { key: 'phrases' as const, label: 'משפטים מוטיבציוניים', count: phrases.length },
                        { key: 'notifications' as const, label: 'התראות', count: notifications.length },
                        { key: 'descriptions' as const, label: 'תיאורים חכמים', count: smartDescriptions.length },
                      ].map((item) => (
                        <label key={item.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={cleanSlateCollections[item.key]}
                            onChange={(e) => setCleanSlateCollections(prev => ({ ...prev, [item.key]: e.target.checked }))}
                            className="w-4 h-4 accent-red-600"
                          />
                          <span className="font-medium text-gray-800">{item.label}</span>
                          <span className="text-xs text-gray-400 mr-auto">{item.count} שורות</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={exportBackup}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold hover:bg-blue-100 transition-colors border border-blue-200"
                    >
                      <Download size={16} />
                      ייצא גיבוי JSON
                    </button>
                    <button
                      onClick={() => {
                        const selected = Object.values(cleanSlateCollections).some(v => v);
                        if (!selected) {
                          alert('נא לבחור לפחות טבלה אחת');
                          return;
                        }
                        setCleanSlateStep('confirm');
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                    >
                      <Trash2 size={16} />
                      המשך למחיקה
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Double Confirmation */}
              {cleanSlateStep === 'confirm' && (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <AlertTriangle size={40} className="text-red-500 mx-auto mb-3" />
                    <p className="text-lg font-black text-red-700 mb-1">האם אתה בטוח?</p>
                    <p className="text-sm text-red-600">
                      פעולה זו תמחק {' '}
                      <span className="font-black">
                        {(cleanSlateCollections.titles ? titles.length : 0) +
                         (cleanSlateCollections.phrases ? phrases.length : 0) +
                         (cleanSlateCollections.notifications ? notifications.length : 0) +
                         (cleanSlateCollections.descriptions ? smartDescriptions.length : 0)}
                      </span>
                      {' '} שורות לצמיתות. לא ניתן לשחזר את הנתונים.
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                      ודא שייצאת גיבוי לפני שתמשיך. אם לא — לחץ &quot;חזור&quot; וייצא קודם.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setCleanSlateStep('initial')}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                    >
                      חזור
                    </button>
                    <button
                      onClick={executeCleanSlate}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-700 text-white rounded-xl font-black hover:bg-red-800 transition-colors"
                    >
                      <Trash2 size={16} />
                      מחק הכל — אני בטוח
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: Deleting in progress */}
              {cleanSlateStep === 'deleting' && (
                <div className="text-center py-4">
                  <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto mb-4" />
                  <p className="font-bold text-gray-800 mb-1">מוחק נתונים...</p>
                  <p className="text-sm text-gray-500">{cleanSlateProgress}</p>
                </div>
              )}

              {/* Step 4: Done */}
              {cleanSlateStep === 'done' && (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-bold text-gray-800 mb-1">המחיקה הושלמה</p>
                  <p className="text-sm text-green-600">{cleanSlateProgress}</p>
                  <button
                    onClick={() => setShowCleanSlateModal(false)}
                    className="mt-4 px-6 py-2.5 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 transition-colors"
                  >
                    סגור
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PSYCHOLOGICAL_TRIGGER_LABELS: Record<string, string> = {
  FOMO: 'FOMO - פחד להחמיץ',
  Challenge: 'אתגר',
  Support: 'תמיכה',
  Reward: 'פרס',
};
