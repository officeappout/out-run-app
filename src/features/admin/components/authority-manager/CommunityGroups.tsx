'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  getGroupsByAuthority,
  createGroup,
  updateGroup,
  deleteGroup,
  migrateLegacyGroupsToAuthority,
  getEventsByGroup,
  getGroupMembers,
  cleanupStaleMaterializedEvents,
} from '@/features/admin/services/community.service';
import { getParksByAuthority } from '@/features/parks';
import { CommunityGroup, CommunityGroupCategory, CommunityEvent, ScheduleSlot, TargetGender } from '@/types/community.types';
import { Park } from '@/types/admin-types';
import { Plus, Edit2, Trash2, Users, Calendar, MapPin, ShieldCheck, Dumbbell, Target, DollarSign, Clock, CalendarPlus, ImagePlus, X, Building2, MapPinned, Search, ChevronDown, ImageOff, Route as RouteIcon, HeartPulse } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { MediaAsset } from '@/features/admin/services/media-assets.service';
import CommunityEvents from './CommunityEvents';
import dynamic from 'next/dynamic';

const MiniLocationPicker = dynamic(
  () => import('@/features/admin/components/MiniLocationPicker'),
  { ssr: false, loading: () => <div className="h-40 bg-gray-100 animate-pulse rounded-xl" /> },
);

const RoutePicker = dynamic(
  () => import('@/features/admin/components/RoutePicker'),
  { ssr: false, loading: () => <div className="h-10 bg-gray-100 animate-pulse rounded-lg" /> },
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

export default function CommunityGroups({ authorityId, authorityCoordinates, neighborhoods = [], inspectGroupId }: CommunityGroupsProps) {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CommunityGroup | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessionGroupId, setSessionGroupId] = useState<string | null>(null);
  const sessionFormRef = useRef<HTMLDivElement>(null);
  const [locationMode, setLocationMode] = useState<'park' | 'route' | 'manual'>('park');
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
  const [activePicker, setActivePicker] = useState<'general' | number | string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  // Master-Card: sessions accordion + inline participants
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupSessions, setGroupSessions] = useState<Record<string, CommunityEvent[]>>({});
  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, { uid: string; name: string; photoURL?: string }[]>>({});
  const [sessionsLoading, setSessionsLoading] = useState(false);

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

  /**
   * Admin list shows ONLY official / authority-managed groups.
   * User-created (source === 'user') and professional groups are hidden here.
   */
  const officialGroups = useMemo(
    () => groups.filter((g) => g.source !== 'user' && g.source !== 'professional'),
    [groups],
  );

  // Eagerly load member avatars for every visible group
  const groupIds = useMemo(() => officialGroups.map((g) => g.id).join(','), [officialGroups]);
  useEffect(() => {
    if (!groupIds) return;
    const ids = groupIds.split(',');
    Promise.all(
      ids.map(async (id) => {
        const members = await getGroupMembers(id, 6);
        return [id, members] as const;
      }),
    ).then((entries) => setGroupMembersMap(Object.fromEntries(entries)));
  }, [groupIds]);

  const handleToggleSessions = async (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
      return;
    }
    setExpandedGroupId(groupId);
    if (!groupSessions[groupId]) {
      setSessionsLoading(true);
      try {
        const sessions = await getEventsByGroup(groupId);
        setGroupSessions((prev) => ({ ...prev, [groupId]: sessions }));
      } catch (err) {
        console.error('Error loading group sessions:', err);
      } finally {
        setSessionsLoading(false);
      }
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

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען קבוצות...</div>;
  }

  return (
    <div className="space-y-6">
      <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">קבוצות קהילה</h2>
        <div className="flex items-center gap-2">
          {/* Database Health: delete stale materialized events */}
          <button
            onClick={async () => {
              if (!confirm('פעולה זו תמחק אירועי "צטרפות אוטומטית" ישנים מ-48 שעות ומעלה ללא נרשמים. להמשיך?')) return;
              try {
                const count = await cleanupStaleMaterializedEvents(authorityId);
                alert(`✅ נמחקו ${count} אירועים אוטומטיים ישנים.`);
              } catch (err) {
                console.error('Cleanup failed:', err);
                alert('שגיאה בניקוי. בדוק את הקונסול.');
              }
            }}
            className="flex items-center gap-2 px-3 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-semibold hover:bg-rose-100 transition-colors border border-rose-200"
            title="ניקוי אירועים אוטומטיים ישנים"
          >
            <HeartPulse size={14} />
            בריאות DB
          </button>
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
                    onClick={() => setLocationMode('route')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                      locationMode === 'route' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <RouteIcon size={12} />
                    מסלול
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
                {locationMode === 'route' ? (
                  <RoutePicker
                    authorityId={authorityId}
                    value={formData.meetingLocation?.routeId ?? null}
                    onChange={(routeId, route) => {
                      const [lng, lat] = route.path[0];
                      setFormData({
                        ...formData,
                        meetingLocation: {
                          routeId,
                          parkId: undefined,
                          address: route.name,
                          location: { lat, lng },
                        },
                      });
                    }}
                    onClear={() => {
                      setFormData({
                        ...formData,
                        meetingLocation: {
                          ...formData.meetingLocation,
                          routeId: undefined,
                        },
                      });
                    }}
                  />
                ) : locationMode === 'park' ? (
                  <div className="relative">
                    {formData.meetingLocation?.parkId ? (
                      <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl" dir="rtl">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <MapPin size={18} className="text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-emerald-800 truncate">{formData.meetingLocation.address || 'פארק נבחר'}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button type="button" onClick={() => { setActivePicker('general'); setParkSearch(''); }}
                            className="px-2 py-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                          >שנה</button>
                          <button type="button" onClick={() => {
                            setFormData({ ...formData, meetingLocation: { ...formData.meetingLocation, parkId: undefined, address: '', location: formData.meetingLocation?.location } });
                            setActivePicker(null);
                          }} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { setActivePicker(activePicker === 'general' ? null : 'general'); setParkSearch(''); }}
                          className="w-full flex items-center justify-between px-4 py-3 border-2 border-dashed border-emerald-300 rounded-xl text-sm bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-400 transition-colors"
                        >
                          <span className="flex items-center gap-2 text-emerald-600 font-bold">
                            <MapPin size={16} />
                            בחר פארק
                          </span>
                          <ChevronDown size={14} className={`text-emerald-400 transition-transform ${activePicker === 'general' ? 'rotate-180' : ''}`} />
                        </button>
                        {activePicker === 'general' && (
                          <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                            <div className="relative p-2.5 border-b border-gray-100">
                              <Search size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              <input
                                type="text"
                                value={parkSearch}
                                onChange={(e) => setParkSearch(e.target.value)}
                                className="w-full pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
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
                                    className="w-full text-right px-3 py-2.5 text-sm hover:bg-emerald-50 transition-colors flex items-center gap-2 border-b border-gray-50 last:border-0"
                                  >
                                    <MapPin size={14} className="text-emerald-400 flex-shrink-0" />
                                    <span className="truncate">{park.name} - {park.city}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </>
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
                      {slot.location?.address && (
                        <span className={`px-1.5 py-0.5 rounded-full ${slot.location.routeId ? 'bg-cyan-50 text-cyan-700' : 'bg-orange-50 text-orange-600'}`}>
                          {slot.location.routeId ? '🛤️' : '📍'} {slot.location.address}
                        </span>
                      )}
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

                        {/* Per-slot location override — park / route / manual */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                            <MapPin size={10} className="text-orange-500" />
                            מיקום מפגש <span className="text-gray-300 font-normal">(ריק = ברירת מחדל)</span>
                          </label>

                          {/* Mini mode tabs */}
                          <div className="flex items-center gap-1 mb-1.5">
                            <button
                              type="button"
                              onClick={() => { setActivePicker(activePicker === idx ? null : idx); setParkSearch(''); }}
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all ${
                                activePicker === idx && !slot.location?.routeId ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              פארק
                            </button>
                            <button
                              type="button"
                              onClick={() => setActivePicker(activePicker === `route-${idx}` ? null : `route-${idx}` as any)}
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all flex items-center gap-0.5 ${
                                activePicker === `route-${idx}` || slot.location?.routeId ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              <RouteIcon size={8} />
                              מסלול
                            </button>
                            {slot.location?.address && (
                              <button
                                type="button"
                                onClick={() => updateSlot({ location: undefined })}
                                className="px-2 py-0.5 rounded-full text-[9px] font-bold text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 transition-all"
                              >
                                נקה
                              </button>
                            )}
                          </div>

                          {/* Route picker for slot */}
                          {activePicker === `route-${idx}` && (
                            <div className="mt-1">
                              <RoutePicker
                                authorityId={authorityId}
                                value={slot.location?.routeId ?? null}
                                onChange={(routeId, route) => {
                                  const [lng, lat] = route.path[0];
                                  updateSlot({
                                    location: {
                                      routeId,
                                      address: route.name,
                                      lat,
                                      lng,
                                    },
                                  });
                                  setActivePicker(null);
                                }}
                                onClear={() => {
                                  updateSlot({ location: undefined });
                                }}
                              />
                            </div>
                          )}

                          {/* Park picker for slot (existing dropdown) */}
                          {activePicker === idx && (
                            <div className="relative mt-0.5">
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
                            </div>
                          )}

                          {/* Selected location display (when not editing) */}
                          {slot.location?.routeId && activePicker !== `route-${idx}` && (
                            <div className="mt-1 flex items-center gap-1.5 px-2 py-1 bg-cyan-50 rounded-lg text-[10px] text-cyan-700 font-bold border border-cyan-200">
                              <RouteIcon size={10} />
                              <span className="truncate">{slot.location.address}</span>
                            </div>
                          )}
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

      {/* Groups List — Master-Card Architecture */}
      {officialGroups.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Users size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין קבוצות רשמיות</h3>
          <p className="text-gray-500">צור את הקבוצה הרשמית הראשונה</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {officialGroups.map((group) => {
            const members = groupMembersMap[group.id] ?? [];
            const isExpanded = expandedGroupId === group.id;
            const sessions = groupSessions[group.id] ?? [];
            return (
              <div
                key={group.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Compact header: thumbnail + info */}
                <div className="flex gap-3 p-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                    {group.images && group.images.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={group.images[0]} alt={group.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-300">
                        <ImageOff size={18} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-black text-gray-900 truncate">{group.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                        group.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {group.isActive ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-full text-[10px] font-bold">
                        {CATEGORY_LABELS[group.category]}
                      </span>
                      {group.isOfficial && (
                        <span className="flex items-center gap-0.5 text-[10px] text-cyan-600 font-bold">
                          <ShieldCheck size={10} /> רשמי
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-400">
                      {group.meetingLocation?.address && (
                        <span className="flex items-center gap-0.5 truncate max-w-[160px]">
                          <MapPin size={11} className="text-emerald-400" />
                          {group.meetingLocation.address}
                        </span>
                      )}
                      {group.scheduleSlots && group.scheduleSlots.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Clock size={11} className="text-blue-400" />
                          {group.scheduleSlots.map((s) => `${DAY_LABELS[s.dayOfWeek]} ${s.time}`).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline avatar stack + participant count */}
                <div className="px-3 pb-2 flex items-center justify-between">
                  <AdminAvatarStack people={members} total={group.currentParticipants} />
                  <span className="text-[11px] text-gray-400 font-semibold">
                    {group.currentParticipants}{group.maxParticipants ? ` / ${group.maxParticipants}` : ''} חברים
                  </span>
                </div>

                {/* Sessions accordion toggle */}
                <button
                  onClick={() => handleToggleSessions(group.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                    <Calendar size={12} className="text-purple-500" />
                    מפגשים קרובים
                    {groupSessions[group.id] && (
                      <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full text-[10px]">
                        {sessions.length}
                      </span>
                    )}
                  </span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded sessions list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 max-h-56 overflow-y-auto">
                    {sessionsLoading && !groupSessions[group.id] ? (
                      <div className="p-3 text-center text-xs text-gray-400 animate-pulse">טוען מפגשים...</div>
                    ) : sessions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-gray-400">אין מפגשים קרובים</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {sessions.map((session) => (
                          <div key={session.id} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50/50">
                            <div className="flex items-center gap-3">
                              <span className="text-gray-600 font-semibold" dir="ltr">
                                {new Date(session.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                              </span>
                              <span className="text-gray-400">{session.startTime}</span>
                              {session.source === 'virtual_materialized' && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-bold">אוטומטי</span>
                              )}
                            </div>
                            <span className="text-gray-500 font-semibold">
                              {session.currentRegistrations ?? 0} נרשמו
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-gray-100">
                  <button
                    onClick={() => setSessionGroupId(group.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                    title="הוסף מפגש בודד"
                  >
                    <CalendarPlus size={13} />
                    <span className="hidden md:inline">מפגש בודד</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditingGroup(group);
                      setFormData(group);
                      setShowForm(true);
                    }}
                    className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded-lg"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(group.id, group.name)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
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
    </div>
  );
}

function AdminAvatarStack({ people, total }: { people: { name: string; photoURL?: string }[]; total?: number }) {
  if (!people || people.length === 0) {
    return <span className="text-[10px] text-gray-300">אין חברים עדיין</span>;
  }
  const display = people.slice(0, 5);
  const remaining = Math.max(0, (total ?? people.length) - display.length);
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2 rtl:space-x-reverse">
        {display.map((p, i) => (
          <div key={i} className="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-gray-200 flex-shrink-0" title={p.name}>
            {p.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-gray-500 bg-gradient-to-br from-gray-100 to-gray-200">
                {p.name.charAt(0)}
              </div>
            )}
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <span className="text-[10px] text-gray-400 font-bold ms-1">+{remaining}</span>
      )}
    </div>
  );
}
