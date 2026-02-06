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
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Plus, Edit2, Trash2, Save, X, MessageSquareQuote, Target, Heart, BarChart3, Bell, Eye, Upload } from 'lucide-react';
import Link from 'next/link';
import { resolveNotificationText, getAvailableTags, resolveDescription, getAvailableDescriptionTags, TagResolverContext } from '@/features/content/branding/core/branding.utils';
import { injectParentPersonaData } from './inject-parent-data';
// Brand fields removed per David's request

interface WorkoutTitle {
  id: string;
  category: 'strength' | 'volume' | 'endurance' | 'skills' | 'mobility' | 'hiit' | 'general';
  text: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MotivationalPhrase {
  id: string;
  location: string; // e.g., 'home', 'park', 'office'
  persona: string; // e.g., 'parent', 'student', 'office_worker'
  timeOfDay?: string; // 'morning', 'afternoon', 'evening', 'any'
  phrase: string;
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
  triggerType: 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance';
  daysInactive?: number; // Only for Inactivity trigger type
  persona: string;
  psychologicalTrigger: 'FOMO' | 'Challenge' | 'Support' | 'Reward';
  text: string;
  calendarIntegration?: boolean; // Placeholder for future calendar sync
  clickCount?: number;
  completionRate?: number;
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
    phrase: '',
  });
  
  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [editingNotification, setEditingNotification] = useState<string | null>(null);
  const [showNewNotificationForm, setShowNewNotificationForm] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'All' | 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance'>('All');
  const [notificationForm, setNotificationForm] = useState<Partial<Notification>>({
    triggerType: 'Inactivity',
    daysInactive: 1,
    persona: '',
    gender: 'both',
    psychologicalTrigger: 'FOMO',
    text: '',
    calendarIntegration: false,
  });

  // Smart Descriptions state
  const [smartDescriptions, setSmartDescriptions] = useState<SmartDescription[]>([]);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [showNewDescriptionForm, setShowNewDescriptionForm] = useState(false);
  const [descriptionForm, setDescriptionForm] = useState<Partial<SmartDescription>>({
    location: 'home',
    persona: '',
    gender: 'both',
    description: '',
  });
  
  // Description Templates state
  const [descriptionTemplates, setDescriptionTemplates] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [titlesData, phrasesData, notificationsData, descriptionsData, templatesData] = await Promise.all([
        loadTitles(),
        loadPhrases(),
        loadNotifications(),
        loadSmartDescriptions(),
        loadDescriptionTemplates(),
      ]);
      setTitles(titlesData);
      setPhrases(phrasesData);
      setNotifications(notificationsData);
      setSmartDescriptions(descriptionsData);
      setDescriptionTemplates(templatesData);
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
    setTitleForm({ category: 'general', text: '' });
  };

  const resetPhraseForm = () => {
    setPhraseForm({ location: 'home', persona: '', timeOfDay: 'any', phrase: '' });
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
  };

  const personaLabels: Record<string, string> = {
    parent: 'הורה',
    student: 'סטודנט',
    office_worker: 'עובד משרד',
    remote_worker: 'עובד מהבית',
    athlete: 'ספורטאי',
    senior: 'גיל הזהב',
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

          {/* New/Edit Title Form */}
          {(showNewTitleForm || editingTitle) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editingTitle ? 'ערוך כותרת' : 'כותרת חדשה'}
              </h3>
              <div className="space-y-4">
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
                  <label className="block text-sm font-bold text-gray-700 mb-2">טקסט הכותרת</label>
                  <input
                    type="text"
                    value={titleForm.text || ''}
                    onChange={(e) => setTitleForm({ ...titleForm, text: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                    placeholder="לדוגמה: אימון כוח אינטנסיבי"
                  />
                </div>
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

          {/* Titles List */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">קטגוריה</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">טקסט</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {titles.map((title) => (
                  <tr key={title.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded text-xs font-bold">
                        {categoryLabels[title.category]}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{title.text}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingTitle(title.id);
                            setTitleForm({ category: title.category, text: title.text });
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
                    <option value="parent">הורה</option>
                    <option value="student">סטודנט</option>
                    <option value="office_worker">עובד משרד</option>
                    <option value="remote_worker">עובד מהבית</option>
                    <option value="athlete">ספורטאי</option>
                    <option value="senior">גיל הזהב</option>
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
                            setPhraseForm({ location: phrase.location, persona: phrase.persona, timeOfDay: phrase.timeOfDay || 'any', gender: phrase.gender || 'both', phrase: phrase.phrase });
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
                        daysInactive: triggerType === 'Inactivity' ? (notificationForm.daysInactive || 1) : undefined
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="Inactivity">אי-פעילות</option>
                    <option value="Scheduled">מתוזמן</option>
                    <option value="Location_Based">מבוסס מיקום</option>
                    <option value="Habit_Maintenance">תחזוקת הרגל</option>
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
                        setNotificationForm({ triggerType: 'Inactivity', daysInactive: 1, persona: '', gender: 'both', psychologicalTrigger: 'FOMO', text: '', calendarIntegration: false });
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
                setDescriptionForm({ location: 'home', persona: '', gender: 'both', description: '' });
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
                    ניתן להשתמש ב-@tags לדינמיות. ראה את הרשימה למטה.
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
                        setDescriptionForm({ location: 'home', persona: '', gender: 'both', description: '' });
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
                      setDescriptionForm({ location: 'home', persona: '', gender: 'both', description: '' });
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
    </div>
  );
}

const PSYCHOLOGICAL_TRIGGER_LABELS: Record<string, string> = {
  FOMO: 'FOMO - פחד להחמיץ',
  Challenge: 'אתגר',
  Support: 'תמיכה',
  Reward: 'פרס',
};
