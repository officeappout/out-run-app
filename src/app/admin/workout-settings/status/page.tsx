'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useIsMounted } from '@/hooks/useIsMounted';
import { CheckCircle2, XCircle, AlertCircle, BarChart3 } from 'lucide-react';
import Link from 'next/link';

interface MatrixCell {
  persona: string;
  location: string;
  daysInactive?: number;
  phraseCount: number;
  notificationCount: number;
  descriptionCount: number;
  maleCount?: number;
  femaleCount?: number;
  bothCount?: number;
}

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';

function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

const PERSONA_OPTIONS = [
  { value: 'parent', label: 'הורה' },
  { value: 'student', label: 'סטודנט' },
  { value: 'office_worker', label: 'עובד משרד' },
  { value: 'remote_worker', label: 'עובד מהבית' },
  { value: 'athlete', label: 'ספורטאי' },
  { value: 'senior', label: 'גיל הזהב' },
];

const LOCATION_OPTIONS = [
  { value: 'home', label: 'בית' },
  { value: 'park', label: 'פארק' },
  { value: 'office', label: 'משרד' },
  { value: 'street', label: 'רחוב' },
  { value: 'gym', label: 'מכון כושר' },
];

const DAYS_INACTIVE_OPTIONS = [1, 2, 7, 30];
const JOURNEY_DAYS = [0, 1, 2, 3, 7, 14, 30];

export default function MessagingStatusPage() {
  const mounted = useIsMounted();
  const [loading, setLoading] = useState(true);
  const [phrases, setPhrases] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [smartDescriptions, setSmartDescriptions] = useState<any[]>([]);
  const [workoutTitles, setWorkoutTitles] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [viewMode, setViewMode] = useState<'phrases' | 'notifications' | 'descriptions'>('phrases');
  const [journeyMode, setJourneyMode] = useState<boolean>(false);
  const [selectedPersona, setSelectedPersona] = useState<string>('');
  const [showMissingOnly, setShowMissingOnly] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (phrases.length > 0 || notifications.length > 0 || smartDescriptions.length > 0) {
      buildMatrix();
    }
  }, [phrases, notifications, smartDescriptions, workoutTitles, viewMode, journeyMode, selectedPersona, showMissingOnly]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [phrasesData, notificationsData, descriptionsData, titlesData] = await Promise.all([
        loadPhrases(),
        loadInactivityNotifications(),
        loadSmartDescriptions(),
        loadWorkoutTitles(),
      ]);
      setPhrases(phrasesData);
      setNotifications(notificationsData);
      setSmartDescriptions(descriptionsData);
      setWorkoutTitles(titlesData);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  const loadPhrases = async () => {
    try {
      const phrasesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`);
      const snapshot = await getDocs(phrasesRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error loading phrases:', error);
      return [];
    }
  };

  const loadInactivityNotifications = async () => {
    try {
      const notificationsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`);
      const snapshot = await getDocs(notificationsRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error loading notifications:', error);
      return [];
    }
  };

  const loadSmartDescriptions = async () => {
    try {
      const descriptionsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`);
      const snapshot = await getDocs(descriptionsRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error loading descriptions:', error);
      return [];
    }
  };

  const loadWorkoutTitles = async () => {
    try {
      const titlesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`);
      const snapshot = await getDocs(titlesRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error loading titles:', error);
      return [];
    }
  };

  const buildMatrix = () => {
    const matrixData: MatrixCell[] = [];

    // Journey Mode: Days 0-30 on X-axis, Gender rows for selected persona
    if (journeyMode && viewMode === 'notifications') {
      const personasToShow = selectedPersona 
        ? PERSONA_OPTIONS.filter(p => p.value === selectedPersona)
        : PERSONA_OPTIONS;
      
      personasToShow.forEach((persona) => {
        // Show gender rows: Male, Female, Both
        const genderRows = [
          { label: 'זכר', value: 'male' },
          { label: 'נקבה', value: 'female' },
          { label: 'שניהם', value: 'both' },
        ];
        
        genderRows.forEach((genderRow) => {
          JOURNEY_DAYS.forEach((day) => {
            // Find closest matching notification (round to nearest available day)
            const closestDay = DAYS_INACTIVE_OPTIONS.reduce((prev, curr) =>
              Math.abs(curr - day) < Math.abs(prev - day) ? curr : prev
            );
            
            const matchingNotifications = notifications.filter(
              (n) => n.persona === persona.value && 
                     n.triggerType === 'Inactivity' &&
                     n.daysInactive === closestDay &&
                     (n.gender === genderRow.value || (!n.gender && genderRow.value === 'male'))
            );
            
            const notificationCount = matchingNotifications.length;
            const maleCount = matchingNotifications.filter(n => n.gender === 'male' || !n.gender).length;
            const femaleCount = matchingNotifications.filter(n => n.gender === 'female').length;
            const bothCount = matchingNotifications.filter(n => n.gender === 'both').length;
            
            // Only add if not filtering for missing only, or if count is 0
            if (!showMissingOnly || notificationCount === 0) {
              matrixData.push({
                persona: `${persona.value}_${genderRow.value}`, // Unique identifier
                location: '',
                daysInactive: day,
                phraseCount: 0,
                notificationCount,
                descriptionCount: 0,
                maleCount,
                femaleCount,
                bothCount,
              });
            }
          });
        });
      });
      setMatrix(matrixData);
      return;
    }

    // Regular Matrix Mode
    // Build matrix for Phrases view
    if (viewMode === 'phrases') {
      PERSONA_OPTIONS.forEach((persona) => {
        LOCATION_OPTIONS.forEach((location) => {
          const matchingPhrases = phrases.filter(
            (p) => p.persona === persona.value && p.location === location.value
          );
          const phraseCount = matchingPhrases.length;
          const maleCount = matchingPhrases.filter(p => p.gender === 'male' || !p.gender).length;
          const femaleCount = matchingPhrases.filter(p => p.gender === 'female' || !p.gender).length;
          const bothCount = matchingPhrases.filter(p => p.gender === 'both').length;
          
          matrixData.push({
            persona: persona.value,
            location: location.value,
            phraseCount,
            notificationCount: 0,
            descriptionCount: 0,
            maleCount,
            femaleCount,
            bothCount,
          });
        });
      });
    }

    // Build matrix for Notifications view
    if (viewMode === 'notifications') {
      PERSONA_OPTIONS.forEach((persona) => {
        DAYS_INACTIVE_OPTIONS.forEach((days) => {
          const matchingNotifications = notifications.filter(
            (n) => n.persona === persona.value && n.daysInactive === days && n.triggerType === 'Inactivity'
          );
          const notificationCount = matchingNotifications.length;
          const maleCount = matchingNotifications.filter(n => n.gender === 'male' || !n.gender).length;
          const femaleCount = matchingNotifications.filter(n => n.gender === 'female' || !n.gender).length;
          const bothCount = matchingNotifications.filter(n => n.gender === 'both').length;
          
          matrixData.push({
            persona: persona.value,
            location: '',
            daysInactive: days,
            phraseCount: 0,
            notificationCount,
            descriptionCount: 0,
            maleCount,
            femaleCount,
            bothCount,
          });
        });
      });
    }

    // Build matrix for Smart Descriptions view
    if (viewMode === 'descriptions') {
      PERSONA_OPTIONS.forEach((persona) => {
        LOCATION_OPTIONS.forEach((location) => {
          const matchingDescriptions = smartDescriptions.filter(
            (d) => d.persona === persona.value && d.location === location.value
          );
          const descriptionCount = matchingDescriptions.length;
          const maleCount = matchingDescriptions.filter(d => d.gender === 'male' || !d.gender).length;
          const femaleCount = matchingDescriptions.filter(d => d.gender === 'female' || !d.gender).length;
          const bothCount = matchingDescriptions.filter(d => d.gender === 'both').length;
          
          matrixData.push({
            persona: persona.value,
            location: location.value,
            phraseCount: 0,
            notificationCount: 0,
            descriptionCount,
            maleCount,
            femaleCount,
            bothCount,
          });
        });
      });
    }

    setMatrix(matrixData);
  };

  const getCount = (cell: MatrixCell): number => {
    if (viewMode === 'phrases') return cell.phraseCount;
    if (viewMode === 'notifications') return cell.notificationCount;
    if (viewMode === 'descriptions') return cell.descriptionCount;
    return 0;
  };

  const getStatusColor = (count: number): string => {
    if (count === 0) return 'bg-red-100 text-red-700';
    if (count === 1) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  const getCoverageStats = () => {
    const total = matrix.length;
    const totalMessages = matrix.reduce((sum, cell) => sum + getCount(cell), 0);
    const covered = matrix.filter((cell) => getCount(cell) > 0).length;
    return { 
      total, 
      covered, 
      totalMessages,
      percentage: total > 0 ? Math.round((covered / total) * 100) : 0 
    };
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען נתונים...</div>
      </div>
    );
  }

  const stats = getCoverageStats();

  return (
    <div className="space-y-6 text-slate-900" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <BarChart3 size={32} className="text-cyan-500" />
            מטריצת כיסוי הודעות
          </h1>
          <p className="text-gray-500 mt-2">מעקב אחר כיסוי טקסטים לפי פרסונה, מיקום וימי אי-פעילות</p>
        </div>
        <Link
          href="/admin/workout-settings"
          className="px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
        >
          ניהול הודעות
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <div className="text-3xl font-black text-green-700">{stats.covered}</div>
            <div className="text-sm text-green-600 font-bold">תאים מכוסים</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <div className="text-3xl font-black text-red-700">{stats.total - stats.covered}</div>
            <div className="text-sm text-red-600 font-bold">תאים חסרים</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="text-3xl font-black text-blue-700">{stats.totalMessages}</div>
            <div className="text-sm text-blue-600 font-bold">סה"כ הודעות</div>
          </div>
          <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-200">
            <div className="text-3xl font-black text-cyan-700">{stats.percentage}%</div>
            <div className="text-sm text-cyan-600 font-bold">אחוז כיסוי</div>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('phrases')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                viewMode === 'phrases'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              משפטים מוטיבציוניים
            </button>
            <button
              onClick={() => setViewMode('notifications')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                viewMode === 'notifications'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              התראות אי-פעילות
            </button>
            <button
              onClick={() => setViewMode('descriptions')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                viewMode === 'descriptions'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              תיאורים חכמים
            </button>
          </div>
          
          {/* Journey Mode Toggle (only for notifications) */}
          {viewMode === 'notifications' && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-700">מצב מסע:</span>
                <button
                  onClick={() => setJourneyMode(!journeyMode)}
                  className={`px-4 py-2 rounded-xl font-bold transition-all ${
                    journeyMode
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {journeyMode ? 'מסע (0-30 ימים)' : 'רגיל'}
                </button>
              </div>
              
              {/* Persona Selector (for Journey Mode) */}
              {journeyMode && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-bold text-gray-700">פרסונה:</label>
                  <select
                    value={selectedPersona}
                    onChange={(e) => setSelectedPersona(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
                  >
                    <option value="">כל הפרסונות</option>
                    {PERSONA_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Missing Content Filter */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showMissingOnly"
                  checked={showMissingOnly}
                  onChange={(e) => setShowMissingOnly(e.target.checked)}
                  className="w-4 h-4 text-cyan-500 rounded focus:ring-2 focus:ring-cyan-500"
                />
                <label htmlFor="showMissingOnly" className="text-sm font-bold text-gray-700 cursor-pointer">
                  הצג רק תוכן חסר
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-500">טוען...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase sticky right-0 bg-gray-50 z-10">
                    פרסונה
                  </th>
                  {journeyMode && viewMode === 'notifications' ? (
                    JOURNEY_DAYS.map((day) => (
                      <th key={day} className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">
                        יום {day}
                      </th>
                    ))
                  ) : viewMode === 'phrases' || viewMode === 'descriptions' ? (
                    LOCATION_OPTIONS.map((loc) => (
                      <th key={loc.value} className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">
                        {loc.label}
                      </th>
                    ))
                  ) : (
                    DAYS_INACTIVE_OPTIONS.map((days) => (
                      <th key={days} className="px-4 py-4 text-xs font-bold text-gray-500 uppercase">
                        {days} ימים
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  // In Journey Mode with selected persona, show gender rows
                  if (journeyMode && viewMode === 'notifications' && selectedPersona) {
                    const persona = PERSONA_OPTIONS.find(p => p.value === selectedPersona);
                    if (!persona) return null;
                    
                    const genderRows = [
                      { label: 'זכר', value: 'male', prefix: `${persona.value}_male` },
                      { label: 'נקבה', value: 'female', prefix: `${persona.value}_female` },
                      { label: 'שניהם', value: 'both', prefix: `${persona.value}_both` },
                    ];
                    
                    return genderRows.map((genderRow) => {
                      const personaCells = matrix.filter((cell) => cell.persona === genderRow.prefix);
                      return (
                        <tr key={genderRow.prefix} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-bold text-gray-900 sticky right-0 bg-white z-10 border-r border-gray-200">
                            <div className="flex items-center gap-2">
                              <span>{persona.label}</span>
                              <span className="text-sm text-gray-500">({genderRow.label})</span>
                            </div>
                          </td>
                          {JOURNEY_DAYS.map((day) => {
                            const cell = personaCells.find((c) => c.daysInactive === day);
                            const count = cell ? getCount(cell) : 0;
                            const isCriticalGap = (day === 0 || day === 3) && count === 0;
                            
                            return (
                              <td key={day} className="px-4 py-4 text-center">
                                <div
                                  className={`inline-flex flex-col items-center gap-1 px-3 py-2 rounded-lg ${getStatusColor(count)} ${
                                    isCriticalGap ? 'border-2 border-red-500' : ''
                                  }`}
                                >
                                  {count > 0 ? (
                                    <>
                                      <CheckCircle2 size={16} className={count === 1 ? 'text-yellow-600' : 'text-green-600'} />
                                      <span className="text-xs font-bold">{count}</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle size={16} className="text-red-600" />
                                      <span className="text-xs font-bold text-red-600">0</span>
                                    </>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  }
                  
                  // Regular mode: show all personas
                  return PERSONA_OPTIONS.map((persona) => {
                    const personaCells = matrix.filter((cell) => {
                      // In journey mode, filter by persona prefix
                      if (journeyMode && viewMode === 'notifications') {
                        return cell.persona.startsWith(persona.value);
                      }
                      return cell.persona === persona.value;
                    });
                    
                    if (personaCells.length === 0) return null;
                    
                    return (
                      <tr key={persona.value} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-bold text-gray-900 sticky right-0 bg-white z-10 border-r border-gray-200">
                          {persona.label}
                        </td>
                        {journeyMode && viewMode === 'notifications' ? (
                          JOURNEY_DAYS.map((day) => {
                            // Aggregate counts across all gender rows for this persona
                            const cellsForDay = personaCells.filter((c) => c.daysInactive === day);
                            const totalCount = cellsForDay.reduce((sum, cell) => sum + getCount(cell), 0);
                            const isCriticalGap = (day === 0 || day === 3) && totalCount === 0;
                            
                            return (
                              <td key={day} className="px-4 py-4 text-center">
                                <div
                                  className={`inline-flex flex-col items-center gap-1 px-3 py-2 rounded-lg ${getStatusColor(totalCount)} ${
                                    isCriticalGap ? 'border-2 border-red-500' : ''
                                  }`}
                                >
                                  {totalCount > 0 ? (
                                    <>
                                      <CheckCircle2 size={16} className={totalCount === 1 ? 'text-yellow-600' : 'text-green-600'} />
                                      <span className="text-xs font-bold">{totalCount}</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle size={16} className="text-red-600" />
                                      <span className="text-xs font-bold text-red-600">0</span>
                                    </>
                                  )}
                                </div>
                              </td>
                            );
                          })
                        ) : viewMode === 'phrases' || viewMode === 'descriptions' ? (
                          LOCATION_OPTIONS.map((loc) => {
                            const cell = personaCells.find((c) => c.location === loc.value);
                            const count = cell ? getCount(cell) : 0;
                            return (
                              <td key={loc.value} className="px-4 py-4 text-center">
                                <div
                                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${getStatusColor(count)}`}
                                >
                                  {count > 0 ? (
                                    <CheckCircle2 size={16} className={count === 1 ? 'text-yellow-600' : 'text-green-600'} />
                                  ) : (
                                    <XCircle size={16} className="text-red-600" />
                                  )}
                                  <span className="text-sm font-bold">{count}</span>
                                </div>
                              </td>
                            );
                          })
                        ) : (
                          DAYS_INACTIVE_OPTIONS.map((days) => {
                            const cell = personaCells.find((c) => c.daysInactive === days);
                            const count = cell ? getCount(cell) : 0;
                            return (
                              <td key={days} className="px-4 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <div
                                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${getStatusColor(count)}`}
                                  >
                                    {count > 0 ? (
                                      <CheckCircle2 size={16} className={count === 1 ? 'text-yellow-600' : 'text-green-600'} />
                                    ) : (
                                      <XCircle size={16} className="text-red-600" />
                                    )}
                                    <span className="text-sm font-bold">{count}</span>
                                  </div>
                                  {cell && cell.maleCount !== undefined && cell.femaleCount !== undefined && (
                                    <div className="flex gap-1 text-xs">
                                      <span className="text-blue-600 font-bold">{cell.maleCount || 0}ז</span>
                                      <span className="text-pink-600 font-bold">{cell.femaleCount || 0}נ</span>
                                      {cell.bothCount && cell.bothCount > 0 && (
                                        <span className="text-gray-600 font-bold">{cell.bothCount}כ</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })
                        )}
                    </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-4">מקרא</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
            <span className="text-sm text-gray-700">2+ הודעות (כיסוי מלא)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-yellow-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 size={16} className="text-yellow-600" />
            </div>
            <span className="text-sm text-gray-700">1 הודעה (כיסוי חלקי)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle size={16} className="text-red-600" />
            </div>
            <span className="text-sm text-gray-700">0 הודעות (חסר)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
