'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  getGroupsByAuthority,
  createGroup,
  updateGroup,
  deleteGroup,
  migrateLegacyGroupsToAuthority,
} from '@/features/admin/services/community.service';
import { getParksByAuthority } from '@/features/parks';
import { CommunityGroup, CommunityGroupCategory, ScheduleSlot, TargetGender } from '@/types/community.types';
import { Park } from '@/types/admin-types';
import { Plus, Edit2, Trash2, Users, Calendar, MapPin, ShieldCheck, Dumbbell, Target, DollarSign, Clock, CalendarPlus, ImagePlus, X, Building2, MapPinned, Search, ChevronDown, ImageOff } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { MediaAsset } from '@/features/admin/services/media-assets.service';
import CommunityEvents from './CommunityEvents';
import dynamic from 'next/dynamic';

const SessionsDashboard = dynamic(
  () => import('@/features/admin/components/authority-manager/SessionsDashboard'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-48"><div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div> },
);

const MiniLocationPicker = dynamic(
  () => import('@/features/admin/components/MiniLocationPicker'),
  { ssr: false, loading: () => <div className="h-40 bg-gray-100 animate-pulse rounded-xl" /> },
);

const MediaLibraryModal = dynamic(
  () => import('@/features/admin/components/MediaLibraryModal'),
  { ssr: false },
);

interface CommunityGroupsProps {
  authorityId: string;
  authorityCoordinates?: { lat: number; lng: number };
  /** Child neighborhood authorities for the dropdown */
  neighborhoods?: { id: string; name: string }[];
  /** Auto-select sub-tab on mount (from URL query) */
  initialSubTab?: 'sessions';
  /** Auto-open the edit form for this groupId (from reports inspector) */
  inspectGroupId?: string;
}

const CATEGORY_LABELS: Record<CommunityGroupCategory, string> = {
  walking: 'הליכה',
  running: 'ריצה',
  yoga: 'יוגה',
  calisthenics: 'קליסטניקס',
  cycling: 'אופניים',
  other: 'אחר',
};

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const MUSCLE_OPTIONS = ['חזה', 'גב', 'כתפיים', 'זרועות', 'בטן', 'רגליים', 'ירכיים', 'גוף מלא'];
const EQUIPMENT_OPTIONS = ['מתח', 'מקבילים', 'טבעות', 'TRX', 'גומיות', 'משקולות', 'ללא ציוד'];
const TAG_OPTIONS = ['ריצה', 'הליכה', 'יוגה', 'קליסטניקס', 'כדורגל', 'כדורסל', 'טניס', 'אופניים', 'שחייה', 'פילאטיס', 'אגרוף', 'כושר כללי', 'אחר'];

const EMPTY_SLOT: ScheduleSlot = { dayOfWeek: 0, time: '18:00', frequency: 'weekly', price: null, requiredEquipment: [], targetMuscles: [], label: '', tags: [], images: [] };

export default function CommunityGroups({ authorityId, authorityCoordinates, neighborhoods = [], initialSubTab, inspectGroupId }: CommunityGroupsProps) {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CommunityGroup | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessionGroupId, setSessionGroupId] = useState<string | null>(null);
  const sessionFormRef = useRef<HTMLDivElement>(null);
  const [locationMode, setLocationMode] = useState<'park' | 'manual'>('park');
  const [formData, setFormData] = useState<Partial<CommunityGroup>>({
    name: '',
    description: '',
    category: 'walking',
    isActive: true,
    currentParticipants: 0,
    scheduleSlots: [],
    targetMuscles: [],
    equipment: [],
    price: null,
    isOfficial: false,
    targetGender: 'all',
    targetAgeRange: undefined,
    images: [],
    rules: '',
    isCityOnly: false,
    restrictedNeighborhoodId: undefined,
  });
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [slotMediaIdx, setSlotMediaIdx] = useState<number | null>(null);
  const [parkSearch, setParkSearch] = useState('');
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'general' | number | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [subTab, setSubTab] = useState<'groups' | 'sessions'>(initialSubTab ?? 'groups');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadGroups();
    loadParks();
  }, [authorityId]);

  useEffect(() => {
    if (inspectGroupId && groups.length > 0 && !editingGroup) {
      const target = groups.find((g) => g.id === inspectGroupId);
      if (target) {
        setSubTab('groups');
        setEditingGroup(target);
        setFormData(target);
        setShowForm(true);
      }
    }
  }, [inspectGroupId, groups]);

  useEffect(() => {
    if (sessionGroupId && sessionFormRef.current) {
      setTimeout(() => {
        sessionFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [sessionGroupId]);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await getGroupsByAuthority(authorityId);
      setGroups(data);
    } catch (error) {
      console.error('Error loading groups:', error);
      alert('שגיאה בטעינת הקבוצות');
    } finally {
      setLoading(false);
    }
  };

  const loadParks = async () => {
    try {
      const data = await getParksByAuthority(authorityId);
      setParks(data);
    } catch (error) {
      console.error('Error loading parks:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingGroup) {
        // Always stamp source on update so legacy docs get repaired in place.
        await updateGroup(editingGroup.id, {
          ...formData,
          source: 'authority',
          isOfficial: formData.isOfficial ?? true,
        });
      } else {
        if (!currentUserId) {
          alert('נא להתחבר למערכת');
          return;
        }
        await createGroup({
          ...formData,
          authorityId,
          createdBy: currentUserId,
          source: 'authority',
          isOfficial: formData.isOfficial ?? true,
        } as Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>);
      }
      await loadGroups();
      setShowForm(false);
      setEditingGroup(null);
      resetForm();
    } catch (error) {
      console.error('Error saving group:', error);
      alert('שגיאה בשמירת הקבוצה');
    }
  };

  const handleDelete = async (groupId: string, groupName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הקבוצה "${groupName}"?`)) return;

    try {
      await deleteGroup(groupId);
      await loadGroups();
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('שגיאה במחיקת הקבוצה');
    }
  };

  const resetForm = () => {
    setLocationMode('park');
    setFormData({
      name: '',
      description: '',
      category: 'walking',
      isActive: true,
      currentParticipants: 0,
      scheduleSlots: [],
      targetMuscles: [],
      equipment: [],
      price: null,
      isOfficial: false,
      targetGender: 'all',
      targetAgeRange: undefined,
      images: [],
      rules: '',
      isCityOnly: false,
      restrictedNeighborhoodId: undefined,
    });
  };

  const handleMediaSelect = (asset: MediaAsset) => {
    if (slotMediaIdx != null) {
      const slots = [...(formData.scheduleSlots ?? [])];
      const slot = slots[slotMediaIdx];
      if (slot) {
        slots[slotMediaIdx] = { ...slot, images: [...(slot.images ?? []), asset.url] };
        setFormData((prev) => ({ ...prev, scheduleSlots: slots }));
      }
      setSlotMediaIdx(null);
    } else {
      setFormData((prev) => ({ ...prev, images: [...(prev.images ?? []), asset.url] }));
      setMediaModalOpen(false);
    }
  };

  const filteredParks = useMemo(() => {
    if (!parkSearch.trim()) return parks;
    const term = parkSearch.toLowerCase();
    return parks.filter((p) => p.name.toLowerCase().includes(term) || p.city?.toLowerCase().includes(term));
  }, [parks, parkSearch]);

  /**
   * Admin list shows ONLY official / authority-managed groups.
   * User-created (source === 'user') and professional groups are hidden here.
   * They surface only through the Reports/Moderation inspector (inspectGroupId prop).
   */
  const officialGroups = useMemo(
    () => groups.filter((g) => g.source !== 'user' && g.source !== 'professional'),
    [groups],
  );

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען קבוצות...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs: ניהול קבוצות | לו"ז ובקרה */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setSubTab('groups')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === 'groups' ? 'bg-cyan-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          ניהול קבוצות
        </button>
        <button
          onClick={() => setSubTab('sessions')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === 'sessions' ? 'bg-cyan-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          לו&quot;ז ובקרה
        </button>
      </div>

      {subTab === 'sessions' ? (
        <SessionsDashboard authorityId={authorityId} compact />
      ) : (
      <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">קבוצות קהילה</h2>
        <div className="flex items-center gap-2">
          {/* One-time data migration: stamps source:'authority' on legacy docs */}
          <button
            onClick={async () => {
              if (!confirm('פעולה זו תסמן את כל הקבוצות הישנות (ללא שדה source) כ-authority. להמשיך?')) return;
              try {
                const count = await migrateLegacyGroupsToAuthority(authorityId);
                await loadGroups();
                alert(`✅ עודכנו ${count} קבוצות ישנות. כעת הן מופיעות בטיר 1 (קהילות עירוניות).`);
              } catch (err) {
                console.error('Migration failed:', err);
                alert('שגיאה בעדכון הנתונים. בדוק את הקונסול.');
              }
            }}
            className="flex items-center gap-2 px-3 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-semibold hover:bg-amber-200 transition-colors border border-amber-300"
            title="תקן נתוני Legacy — הרץ פעם אחת"
          >
            תקן נתונים ישנים
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingGroup(null);
              resetForm();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
          >
            <Plus size={18} />
            צור קבוצה חדשה
          </button>
        </div>
      </div>

      {/* Form */}
      {(showForm || editingGroup) && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {editingGroup ? 'ערוך קבוצה' : 'קבוצה חדשה'}
          </h3>

          {/* Moderation-only banner — shown when inspecting a user-created group */}
          {editingGroup?.source === 'user' && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4">
              <span className="text-xl mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-black text-amber-900">קבוצה קהילתית — מצב בקרת תוכן</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  קבוצה זו נוצרה על ידי משתמש רגיל. היא אינה מופיעה ברשימת הניהול הרגילה שלך.
                  אתה צופה בה לצורכי בדיקה בלבד — ניתן לערוך, להשבית, או למחוק במידת הצורך.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">שם הקבוצה</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">תיאור</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                rows={3}
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-1">
                <ShieldCheck size={14} className="text-amber-500" />
                כללי הקהילה (אופציונלי)
              </label>
              <textarea
                value={formData.rules || ''}
                onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 text-sm"
                rows={4}
                placeholder={'כבוד הדדי ועידוד לכל חבר\nהגעה בזמן לכל מפגש\nאיסור שימוש בטלפון במהלך האימון'}
                dir="rtl"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                כל שורה תוצג בנפרד בפרטי הקבוצה. ניתן להשאיר ריק.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">קטגוריה</label>
                <select
                  value={formData.category || 'walking'}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as CommunityGroupCategory })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">מיקום מפגש</label>
                <div className="flex items-center gap-3 mb-2">
                  <button
                    type="button"
                    onClick={() => setLocationMode('park')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      locationMode === 'park' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    פארק רשמי
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationMode('manual')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      locationMode === 'manual' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    מיקום ידני
                  </button>
                </div>
                {locationMode === 'park' ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setActivePicker(activePicker === 'general' ? null : 'general'); setParkSearch(''); }}
                      className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-cyan-400 transition-colors"
                    >
                      <span className={formData.meetingLocation?.parkId ? 'text-gray-800 font-medium' : 'text-gray-400'}>
                        {formData.meetingLocation?.parkId
                          ? formData.meetingLocation.address || 'פארק נבחר'
                          : 'בחר פארק...'}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${activePicker === 'general' ? 'rotate-180' : ''}`} />
                    </button>
                    {activePicker === 'general' && (
                      <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                        <div className="relative p-2 border-b border-gray-100">
                          <Search size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <input
                            type="text"
                            value={parkSearch}
                            onChange={(e) => setParkSearch(e.target.value)}
                            className="w-full pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                            placeholder="חפש פארק..."
                            autoFocus
                          />
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          {filteredParks.length === 0 ? (
                            <div className="p-3 text-xs text-gray-400 text-center">לא נמצאו פארקים</div>
                          ) : (
                            filteredParks.map((park) => (
                              <button
                                key={park.id}
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    meetingLocation: {
                                      parkId: park.id,
                                      address: `${park.name}, ${park.city}`,
                                      location: park.location,
                                    },
                                  });
                                  setParkSearch('');
                                  setActivePicker(null);
                                }}
                                className={`w-full text-right px-3 py-2 text-sm hover:bg-cyan-50 transition-colors flex items-center justify-between ${
                                  formData.meetingLocation?.parkId === park.id ? 'bg-cyan-50 font-bold text-cyan-700' : 'text-gray-700'
                                }`}
                              >
                                <span>{park.name} - {park.city}</span>
                                {formData.meetingLocation?.parkId === park.id && <span className="text-cyan-500 text-xs">✓</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={formData.meetingLocation?.address || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          meetingLocation: {
                            ...formData.meetingLocation,
                            parkId: undefined,
                            address: e.target.value,
                            location: formData.meetingLocation?.location || authorityCoordinates,
                          },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      placeholder="שם המיקום (למשל: שער הכניסה הראשי)"
                    />
                    <MiniLocationPicker
                      value={formData.meetingLocation?.location || authorityCoordinates || { lat: 31.525, lng: 34.5955 }}
                      onChange={(coords) =>
                        setFormData({
                          ...formData,
                          meetingLocation: {
                            ...formData.meetingLocation,
                            parkId: undefined,
                            address: formData.meetingLocation?.address || '',
                            location: coords,
                          },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── Schedule Slots ────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                  <Clock size={14} />
                  לוח זמנים (מפגשים חוזרים)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      scheduleSlots: [...(formData.scheduleSlots ?? []), { ...EMPTY_SLOT }],
                    })
                  }
                  className="text-xs font-bold text-cyan-600 hover:text-cyan-700 px-2 py-1 rounded-lg hover:bg-cyan-50"
                >
                  + הוסף מפגש
                </button>
              </div>
              {(formData.scheduleSlots ?? []).map((slot, idx) => {
                const updateSlot = (patch: Partial<ScheduleSlot>) => {
                  const slots = [...(formData.scheduleSlots ?? [])];
                  slots[idx] = { ...slots[idx], ...patch };
                  setFormData({ ...formData, scheduleSlots: slots });
                };
                const isExpanded = expandedSlot === idx;
                return (
                  <div key={idx} className="mb-3 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* Header: Day, Time, Frequency, Expand, Delete */}
                    <div className="flex items-center gap-2 p-2 bg-gray-50/50">
                      <select
                        value={slot.dayOfWeek}
                        onChange={(e) => updateSlot({ dayOfWeek: Number(e.target.value) })}
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm flex-1"
                      >
                        {DAY_LABELS.map((label, i) => (
                          <option key={i} value={i}>יום {label}</option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={slot.time}
                        onChange={(e) => updateSlot({ time: e.target.value })}
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-28"
                      />
                      <select
                        value={slot.frequency}
                        onChange={(e) => updateSlot({ frequency: e.target.value as ScheduleSlot['frequency'] })}
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="weekly">שבועי</option>
                        <option value="biweekly">דו-שבועי</option>
                        <option value="monthly">חודשי</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setExpandedSlot(isExpanded ? null : idx)}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                        title={isExpanded ? 'צמצם' : 'הרחב הגדרות'}
                      >
                        <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const slots = (formData.scheduleSlots ?? []).filter((_, i) => i !== idx);
                          setFormData({ ...formData, scheduleSlots: slots });
                          if (expandedSlot === idx) setExpandedSlot(null);
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Quick summary row (always visible) */}
                    <div className="flex flex-wrap gap-1 px-2 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">
                      {slot.label && <span className="bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded-full font-bold">{slot.label}</span>}
                      {(slot.tags ?? []).length > 0 && slot.tags!.map(t => <span key={t} className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full">{t}</span>)}
                      {slot.price != null && <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">₪{slot.price}</span>}
                      {slot.maxParticipants && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{slot.maxParticipants} מקומות</span>}
                      {slot.location?.address && <span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full">📍 {slot.location.address}</span>}
                      {(slot.images ?? []).length > 0 && <span className="bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded-full">🖼 {slot.images!.length} תמונות</span>}
                      {!slot.label && !(slot.tags ?? []).length && slot.price == null && !slot.maxParticipants && !slot.location?.address && !(slot.images ?? []).length && (
                        <span className="text-gray-300 italic">הגדרות ברירת מחדל ישמשו</span>
                      )}
                    </div>

                    {/* Expanded per-slot metadata */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 p-3 space-y-3 bg-white">
                        {/* Row: Label, Max Participants, Price */}
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 mb-0.5 block">תווית (אופציונלי)</label>
                            <input
                              type="text"
                              value={slot.label ?? ''}
                              onChange={(e) => updateSlot({ label: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs"
                              placeholder="יוגה / ריצה..."
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 mb-0.5 block">מקומות מקס׳ <span className="text-gray-300 font-normal">(ריק = ללא הגבלה)</span></label>
                            <input
                              type="number"
                              min={0}
                              value={slot.maxParticipants ?? ''}
                              onChange={(e) => updateSlot({ maxParticipants: e.target.value === '' ? undefined : Number(e.target.value) })}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs"
                              placeholder="ללא הגבלה"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 mb-0.5 block">מחיר (₪) <span className="text-gray-300 font-normal">(ריק = ברירת מחדל)</span></label>
                            <input
                              type="number"
                              min={0}
                              value={slot.price ?? ''}
                              onChange={(e) => updateSlot({ price: e.target.value === '' ? null : Number(e.target.value) })}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs"
                              placeholder="חינם"
                            />
                          </div>
                        </div>

                        {/* Tags (predefined multiselect) */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 mb-1 block">תוויות (סוג פעילות)</label>
                          <div className="flex flex-wrap gap-1">
                            {TAG_OPTIONS.map((tag) => {
                              const sel = (slot.tags ?? []).includes(tag);
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    const tags = slot.tags ?? [];
                                    updateSlot({ tags: sel ? tags.filter((t) => t !== tag) : [...tags, tag] });
                                  }}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                    sel ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Equipment */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 mb-1 block">ציוד נדרש <span className="text-gray-300 font-normal">(ריק = ברירת מחדל)</span></label>
                          <div className="flex flex-wrap gap-1">
                            {EQUIPMENT_OPTIONS.map((item) => {
                              const sel = (slot.requiredEquipment ?? []).includes(item);
                              return (
                                <button
                                  key={item}
                                  type="button"
                                  onClick={() => {
                                    const eq = slot.requiredEquipment ?? [];
                                    updateSlot({ requiredEquipment: sel ? eq.filter((e) => e !== item) : [...eq, item] });
                                  }}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                    sel ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {item}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Target Muscles */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 mb-1 block">קבוצות שרירים <span className="text-gray-300 font-normal">(ריק = ברירת מחדל)</span></label>
                          <div className="flex flex-wrap gap-1">
                            {MUSCLE_OPTIONS.map((muscle) => {
                              const sel = (slot.targetMuscles ?? []).includes(muscle);
                              return (
                                <button
                                  key={muscle}
                                  type="button"
                                  onClick={() => {
                                    const ms = slot.targetMuscles ?? [];
                                    updateSlot({ targetMuscles: sel ? ms.filter((m) => m !== muscle) : [...ms, muscle] });
                                  }}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                    sel ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {muscle}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Per-slot Images */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                            <ImagePlus size={10} />
                            תמונות למפגש <span className="text-gray-300 font-normal">(ריק = ברירת מחדל)</span>
                          </label>
                          {(slot.images ?? []).length > 0 && (
                            <div className="flex gap-2 mb-1.5 flex-wrap">
                              {(slot.images ?? []).map((url, imgIdx) => (
                                <div key={imgIdx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 group">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const imgs = (slot.images ?? []).filter((_, i) => i !== imgIdx);
                                      updateSlot({ images: imgs });
                                    }}
                                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setSlotMediaIdx(idx); setMediaModalOpen(true); }}
                            className="text-[10px] text-cyan-600 font-bold hover:text-cyan-700"
                          >
                            + הוסף תמונה מהספרייה
                          </button>
                        </div>

                        {/* Per-slot location override (same searchable dropdown as general picker) */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 mb-0.5 flex items-center gap-1">
                            <MapPin size={10} className="text-orange-500" />
                            מיקום מפגש <span className="text-gray-300 font-normal">(ריק = ברירת מחדל)</span>
                          </label>
                          <div className="relative mt-0.5">
                            <button
                              type="button"
                              onClick={() => { setActivePicker(activePicker === idx ? null : idx); setParkSearch(''); }}
                              className="w-full flex items-center justify-between px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white hover:border-cyan-300 transition-colors"
                            >
                              <span className={slot.location?.address ? 'text-gray-700 font-medium' : 'text-gray-400'}>
                                {slot.location?.address || 'בחר מיקום ספציפי (או השאר ריק)'}
                              </span>
                              <div className="flex items-center gap-1">
                                {slot.location?.address && (
                                  <span
                                    onClick={(e) => { e.stopPropagation(); updateSlot({ location: undefined }); }}
                                    className="text-red-400 hover:text-red-600 text-[10px] cursor-pointer"
                                  >
                                    ✕
                                  </span>
                                )}
                                <ChevronDown size={12} className={`text-gray-400 transition-transform ${activePicker === idx ? 'rotate-180' : ''}`} />
                              </div>
                            </button>
                            {activePicker === idx && (
                              <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                                <div className="relative p-1.5 border-b border-gray-100">
                                  <Search size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                  <input
                                    type="text"
                                    value={parkSearch}
                                    onChange={(e) => setParkSearch(e.target.value)}
                                    className="w-full pl-2 pr-7 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-cyan-500"
                                    placeholder="חפש פארק..."
                                    autoFocus
                                  />
                                </div>
                                <div className="max-h-36 overflow-y-auto">
                                  {filteredParks.length === 0 ? (
                                    <div className="p-2 text-[10px] text-gray-400 text-center">לא נמצאו פארקים</div>
                                  ) : (
                                    filteredParks.map((park) => (
                                      <button
                                        key={park.id}
                                        type="button"
                                        onClick={() => {
                                          updateSlot({
                                            location: {
                                              address: `${park.name}, ${park.city}`,
                                              lat: park.location?.lat,
                                              lng: park.location?.lng,
                                            },
                                          });
                                          setParkSearch('');
                                          setActivePicker(null);
                                        }}
                                        className={`w-full text-right px-2 py-1.5 text-xs hover:bg-cyan-50 transition-colors flex items-center justify-between ${
                                          slot.location?.address === `${park.name}, ${park.city}` ? 'bg-cyan-50 font-bold text-cyan-700' : 'text-gray-700'
                                        }`}
                                      >
                                        <span>{park.name} - {park.city}</span>
                                        {slot.location?.address === `${park.name}, ${park.city}` && <span className="text-cyan-500 text-xs">✓</span>}
                                      </button>
                                    ))
                                  )}
                                </div>
                                <div className="border-t border-gray-100 p-1.5">
                                  <input
                                    type="text"
                                    value={slot.location?.address ?? ''}
                                    onChange={(e) => {
                                      const addr = e.target.value;
                                      updateSlot({ location: addr ? { ...slot.location, address: addr } : undefined });
                                    }}
                                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                    placeholder="או הקלד כתובת ידנית..."
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Default Settings (collapsible) ──────────── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setDefaultsOpen(!defaultsOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                  <Target size={14} className="text-cyan-500" />
                  הגדרות ברירת מחדל (Default Settings)
                </span>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${defaultsOpen ? 'rotate-180' : ''}`} />
              </button>
              {defaultsOpen && (
                <div className="p-4 space-y-4 border-t border-gray-200">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
                    <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      ערכים אלה ישמשו <strong>כברירת מחדל</strong> לכל המפגשים. מפגש עם הגדרה ספציפית (מחיר, ציוד, שרירים, תמונות) <strong>ידרוס</strong> אותם באפליקציה.
                    </p>
                  </div>
                  {/* Muscles */}
                  <div>
                    <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                      <Target size={14} />
                      קבוצות שרירים
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {MUSCLE_OPTIONS.map((muscle) => {
                        const selected = (formData.targetMuscles ?? []).includes(muscle);
                        return (
                          <button
                            key={muscle}
                            type="button"
                            onClick={() => {
                              const current = formData.targetMuscles ?? [];
                              setFormData({
                                ...formData,
                                targetMuscles: selected
                                  ? current.filter((m) => m !== muscle)
                                  : [...current, muscle],
                              });
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                              selected
                                ? 'bg-cyan-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {muscle}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Equipment */}
                  <div>
                    <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                      <Dumbbell size={14} />
                      ציוד נדרש
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {EQUIPMENT_OPTIONS.map((item) => {
                        const selected = (formData.equipment ?? []).includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              const current = formData.equipment ?? [];
                              setFormData({
                                ...formData,
                                equipment: selected
                                  ? current.filter((e) => e !== item)
                                  : [...current, item],
                              });
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                              selected
                                ? 'bg-emerald-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Price & Official */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                        <DollarSign size={14} />
                        מחיר ברירת מחדל
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formData.price ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            price: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                        placeholder="חינם (ריק)"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isOfficial ?? false}
                          onChange={(e) => setFormData({ ...formData, isOfficial: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-cyan-500" />
                          אירוע רשמי
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Images (Media Library) ────────────────────── */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <ImagePlus size={14} />
                תמונות
              </label>
              {(formData.images ?? []).length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(formData.images ?? []).map((url, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                      <div className="aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`תמונה ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                      <div className="px-1.5 py-1 text-[10px] text-gray-500 font-medium truncate text-center bg-white border-t border-gray-100">
                        {idx === 0 ? 'שער ראשי' : `תמונה ${idx + 1}`}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const imgs = (formData.images ?? []).filter((_, i) => i !== idx);
                          setFormData({ ...formData, images: imgs });
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setMediaModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 hover:border-cyan-400 hover:bg-cyan-50/50 transition-colors w-full justify-center"
              >
                <ImagePlus size={16} className="text-gray-500" />
                <span className="text-sm font-bold text-gray-600">בחר / העלה מדיה</span>
              </button>
            </div>

            {/* ── Geo-Restrictions ─────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isCityOnly ?? false}
                    onChange={(e) => setFormData({ ...formData, isCityOnly: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                    <Building2 size={14} className="text-purple-500" />
                    תושבי העיר בלבד
                  </span>
                </label>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <MapPinned size={14} className="text-purple-500" />
                  הגבלת שכונה (אופציונלי)
                </label>
                <select
                  value={formData.restrictedNeighborhoodId || ''}
                  onChange={(e) => setFormData({ ...formData, restrictedNeighborhoodId: e.target.value || undefined })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm"
                >
                  <option value="">ללא הגבלה</option>
                  {neighborhoods.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Target Audience (Gender & Age) ──────────── */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Users size={14} />
                  קהל יעד (מגדר)
                </label>
                <select
                  value={formData.targetGender || 'all'}
                  onChange={(e) => setFormData({ ...formData, targetGender: e.target.value as TargetGender })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="all">כולם</option>
                  <option value="male">גברים בלבד</option>
                  <option value="female">נשים בלבד</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 block">גיל מינימלי</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={formData.targetAgeRange?.min ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      targetAgeRange: {
                        ...formData.targetAgeRange,
                        min: e.target.value === '' ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="ללא"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 block">גיל מקסימלי</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={formData.targetAgeRange?.max ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      targetAgeRange: {
                        ...formData.targetAgeRange,
                        max: e.target.value === '' ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="ללא"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600"
              >
                {editingGroup ? 'עדכן' : 'צור'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingGroup(null);
                  resetForm();
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Groups List — official / authority-managed only */}
      {officialGroups.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Users size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין קבוצות רשמיות</h3>
          <p className="text-gray-500">צור את הקבוצה הרשמית הראשונה</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {officialGroups.map((group) => (
            <div
              key={group.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Compact image preview */}
              <div className="h-36 bg-gray-100 relative overflow-hidden">
                {group.images && group.images.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={group.images[0]}
                    alt={group.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-300">
                    <ImageOff size={28} />
                    <span className="text-[10px] font-bold mt-1">אין תמונה</span>
                  </div>
                )}
                {group.images && group.images.length > 1 && (
                  <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    +{group.images.length - 1}
                  </span>
                )}
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                  group.isActive ? 'bg-green-500/90 text-white' : 'bg-gray-600/80 text-white'
                }`}>
                  {group.isActive ? 'פעיל' : 'לא פעיל'}
                </div>
              </div>

              <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{group.name}</h3>
                  <span className="inline-block px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold">
                    {CATEGORY_LABELS[group.category]}
                  </span>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{group.description}</p>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs text-gray-500">
                {group.meetingLocation?.address && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} className="text-cyan-500" />
                    <span className="truncate max-w-[140px]">{group.meetingLocation.address}</span>
                  </span>
                )}
                {group.scheduleSlots && group.scheduleSlots.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock size={13} className="text-blue-500" />
                    {group.scheduleSlots.map((s) => `${DAY_LABELS[s.dayOfWeek]} ${s.time}`).join(', ')}
                  </span>
                )}
                {group.targetGender && group.targetGender !== 'all' && (
                  <span className="flex items-center gap-1">
                    <Users size={13} className="text-pink-500" />
                    {group.targetGender === 'male' ? 'גברים' : 'נשים'}
                  </span>
                )}
                {group.targetAgeRange && (group.targetAgeRange.min || group.targetAgeRange.max) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={13} className="text-amber-500" />
                    {group.targetAgeRange.min ?? '0'}–{group.targetAgeRange.max ?? '∞'}
                  </span>
                )}
                {group.isCityOnly && (
                  <span className="flex items-center gap-1">
                    <Building2 size={13} className="text-purple-500" />
                    עיר בלבד
                  </span>
                )}
                {group.restrictedNeighborhoodId && (
                  <span className="flex items-center gap-1">
                    <MapPinned size={13} className="text-purple-500" />
                    שכונה
                  </span>
                )}
                {group.isOfficial && (
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={13} className="text-cyan-500" />
                    רשמי
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users size={16} />
                  <span>
                    {group.currentParticipants}
                    {group.maxParticipants ? ` / ${group.maxParticipants}` : ''} משתתפים
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSessionGroupId(group.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                    title="הוסף מפגש בודד"
                  >
                    <CalendarPlus size={15} />
                    <span className="hidden md:inline">מפגש בודד</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditingGroup(group);
                      setFormData(group);
                      setShowForm(true);
                    }}
                    className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(group.id, group.name)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              </div>{/* end p-6 wrapper */}
            </div>
          ))}
        </div>
      )}

      {/* ── Standalone Session Form (inline CommunityEvents) ── */}
      {sessionGroupId && (
        <div ref={sessionFormRef} className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-amber-800 flex items-center gap-2">
              <CalendarPlus size={18} />
              מפגש בודד לקבוצה
            </h3>
            <button
              onClick={() => setSessionGroupId(null)}
              className="text-sm font-bold text-gray-500 hover:text-gray-700 px-3 py-1 rounded-lg hover:bg-white/60"
            >
              סגור
            </button>
          </div>
          <CommunityEvents
            authorityId={authorityId}
            prefillGroupId={sessionGroupId}
            authorityCoordinates={authorityCoordinates}
            onSessionFormClose={() => setSessionGroupId(null)}
            neighborhoods={neighborhoods}
          />
        </div>
      )}

      {/* ── Media Library Modal ── */}
      <MediaLibraryModal
        isOpen={mediaModalOpen || slotMediaIdx != null}
        onClose={() => { setMediaModalOpen(false); setSlotMediaIdx(null); }}
        onSelect={handleMediaSelect}
        assetType="image"
        title={slotMediaIdx != null ? 'בחר תמונה למפגש' : 'בחר תמונה לקהילה'}
        authorityId={authorityId}
        scope="community"
      />
      </>
      )}
    </div>
  );
}
