'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getEventsByAuthority,
  createEvent,
  updateEvent,
  deleteEvent,
} from '@/features/admin/services/community.service';
import { getParksByAuthority } from '@/features/parks';
import { CommunityEvent, EventCategory, TargetGender } from '@/types/community.types';
import { Park } from '@/types/admin-types';
import { Plus, Edit2, Trash2, Calendar, MapPin, Clock, ShieldCheck, Dumbbell, Target, DollarSign, AlertTriangle, UsersRound, Link2, Users, ImagePlus, X, ExternalLink, Building2, MapPinned, Search, ImageOff } from 'lucide-react';
import { MediaAsset } from '@/features/admin/services/media-assets.service';

const MUSCLE_OPTIONS = ['חזה', 'גב', 'כתפיים', 'זרועות', 'בטן', 'רגליים', 'ירכיים', 'גוף מלא'];
const EQUIPMENT_OPTIONS = ['מתח', 'מקבילים', 'טבעות', 'TRX', 'גומיות', 'משקולות', 'ללא ציוד'];
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import dynamic from 'next/dynamic';

const MiniLocationPicker = dynamic(
  () => import('@/features/admin/components/MiniLocationPicker'),
  { ssr: false, loading: () => <div className="h-40 bg-gray-100 animate-pulse rounded-xl" /> },
);

const MediaLibraryModal = dynamic(
  () => import('@/features/admin/components/MediaLibraryModal'),
  { ssr: false },
);

interface CommunityEventsProps {
  authorityId: string;
  /** Pre-fill groupId when creating a session from a group */
  prefillGroupId?: string;
  /** Callback when the embedded form closes after create/cancel */
  onSessionFormClose?: () => void;
  /** Authority center coordinates for the map picker default */
  authorityCoordinates?: { lat: number; lng: number };
  /** Child neighborhood authorities for the dropdown */
  neighborhoods?: { id: string; name: string }[];
}

const CATEGORY_LABELS: Record<EventCategory, string> = {
  race: 'מרוץ',
  fitness_day: 'יום כושר',
  workshop: 'סדנה',
  community_meetup: 'מפגש קהילה',
  other: 'אחר',
};

export default function CommunityEvents({
  authorityId,
  prefillGroupId,
  onSessionFormClose,
  authorityCoordinates,
  neighborhoods = [],
}: CommunityEventsProps) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [locationMode, setLocationMode] = useState<'park' | 'manual'>('park');
  const [formData, setFormData] = useState<Partial<CommunityEvent>>({
    name: '',
    description: '',
    category: 'race',
    date: new Date(),
    startTime: '09:00',
    endTime: '',
    location: { address: '', location: { lat: 0, lng: 0 } },
    registrationRequired: false,
    isActive: true,
    currentRegistrations: 0,
    isOfficial: false,
    targetMuscles: [],
    equipment: [],
    price: null,
    maxParticipants: undefined,
    specialNotice: '',
    groupId: prefillGroupId ?? undefined,
    targetGender: 'all',
    targetAgeRange: undefined,
    images: [],
    externalLink: '',
    isCityOnly: false,
    restrictedNeighborhoodId: undefined,
  });
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [parkSearch, setParkSearch] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadEvents();
    loadParks();
  }, [authorityId]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await getEventsByAuthority(authorityId);
      setEvents(data);
    } catch (error) {
      console.error('Error loading events:', error);
      alert('שגיאה בטעינת האירועים');
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
      if (editingEvent) {
        await updateEvent(editingEvent.id, formData);
      } else {
        if (!currentUserId) {
          alert('נא להתחבר למערכת');
          return;
        }
        await createEvent({
          ...formData,
          authorityId,
          createdBy: currentUserId,
        } as Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>);
      }
      await loadEvents();
      setShowForm(false);
      setEditingEvent(null);
      resetForm();
      onSessionFormClose?.();
    } catch (error) {
      console.error('Error saving event:', error);
      alert('שגיאה בשמירת האירוע');
    }
  };

  const handleDelete = async (eventId: string, eventName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את האירוע "${eventName}"?`)) return;

    try {
      await deleteEvent(eventId);
      await loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('שגיאה במחיקת האירוע');
    }
  };

  const resetForm = () => {
    setLocationMode('park');
    setFormData({
      name: '',
      description: '',
      category: 'race',
      date: new Date(),
      startTime: '09:00',
      endTime: '',
      location: { address: '', location: { lat: 0, lng: 0 } },
      registrationRequired: false,
      isActive: true,
      currentRegistrations: 0,
      isOfficial: false,
      targetMuscles: [],
      equipment: [],
      price: null,
      maxParticipants: undefined,
      specialNotice: '',
      groupId: prefillGroupId ?? undefined,
      targetGender: 'all',
      targetAgeRange: undefined,
      images: [],
      externalLink: '',
      isCityOnly: false,
      restrictedNeighborhoodId: undefined,
    });
  };

  const handleMediaSelect = (asset: MediaAsset) => {
    setFormData((prev) => ({ ...prev, images: [...(prev.images ?? []), asset.url] }));
    setMediaModalOpen(false);
  };

  const filteredParks = useMemo(() => {
    if (!parkSearch.trim()) return parks;
    const term = parkSearch.toLowerCase();
    return parks.filter((p) => p.name.toLowerCase().includes(term) || p.city?.toLowerCase().includes(term));
  }, [parks, parkSearch]);

  // Auto-open form when prefillGroupId is provided
  useEffect(() => {
    if (prefillGroupId && !showForm) {
      resetForm();
      setShowForm(true);
    }
  }, [prefillGroupId]);

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען אירועים...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">אירועים קהילתיים</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingEvent(null);
            resetForm();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
        >
          <Plus size={18} />
          צור אירוע חדש
        </button>
      </div>

      {/* Form */}
      {(showForm || editingEvent) && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {editingEvent ? 'ערוך אירוע' : 'אירוע חדש'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">שם האירוע</label>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">קטגוריה</label>
                <select
                  value={formData.category || 'race'}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as EventCategory })}
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
                <label className="block text-sm font-bold text-gray-700 mb-1">תאריך</label>
                <input
                  type="date"
                  value={formData.date instanceof Date ? formData.date.toISOString().split('T')[0] : ''}
                  onChange={(e) => setFormData({ ...formData, date: new Date(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">שעת התחלה</label>
                <input
                  type="time"
                  value={formData.startTime || '09:00'}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">מיקום</label>
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
                    <div className="relative">
                      <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={parkSearch}
                        onChange={(e) => setParkSearch(e.target.value)}
                        className="w-full pl-4 pr-9 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
                        placeholder="חפש פארק..."
                      />
                    </div>
                    <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                      {filteredParks.length === 0 ? (
                        <div className="p-2 text-xs text-gray-400 text-center">לא נמצאו פארקים</div>
                      ) : (
                        filteredParks.map((park) => (
                          <button
                            key={park.id}
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                location: {
                                  parkId: park.id,
                                  address: `${park.name}, ${park.city}`,
                                  location: park.location || { lat: 0, lng: 0 },
                                },
                              });
                              setParkSearch('');
                            }}
                            className={`w-full text-right px-3 py-2 text-sm hover:bg-cyan-50 transition-colors flex items-center justify-between ${
                              formData.location?.parkId === park.id ? 'bg-cyan-50 font-bold text-cyan-700' : 'text-gray-700'
                            }`}
                          >
                            <span>{park.name} - {park.city}</span>
                            {formData.location?.parkId === park.id && <span className="text-cyan-500 text-xs">✓</span>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={formData.location?.address || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          location: {
                            ...formData.location,
                            parkId: undefined,
                            address: e.target.value,
                            location: formData.location?.location || authorityCoordinates || { lat: 0, lng: 0 },
                          },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      placeholder="שם המיקום (למשל: שער הכניסה הראשי)"
                    />
                    <MiniLocationPicker
                      value={formData.location?.location || authorityCoordinates || { lat: 31.525, lng: 34.5955 }}
                      onChange={(coords) =>
                        setFormData({
                          ...formData,
                          location: {
                            ...formData.location,
                            parkId: undefined,
                            address: formData.location?.address || '',
                            location: coords,
                          },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── End Time ─────────────────────────────────── */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">שעת סיום (אופציונלי)</label>
              <input
                type="time"
                value={formData.endTime || ''}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value || undefined })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            {/* ── Group Link (read-only when prefilled) ────── */}
            {formData.groupId && (
              <div className="flex items-center gap-2 p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                <Link2 size={14} className="text-cyan-600" />
                <span className="text-sm font-bold text-cyan-700">
                  משויך לקבוצה: {formData.groupId}
                </span>
              </div>
            )}

            {/* ── Special Notice ──────────────────────────── */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-500" />
                הודעה מיוחדת (אופציונלי)
              </label>
              <input
                type="text"
                value={formData.specialNotice || ''}
                onChange={(e) => setFormData({ ...formData, specialNotice: e.target.value || undefined })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400"
                placeholder="למשל: היום נפגשים באולם הסגור בגלל גשם"
              />
            </div>

            {/* ── Max Participants ─────────────────────────── */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <UsersRound size={14} />
                מקסימום משתתפים (אופציונלי)
              </label>
              <input
                type="number"
                min={1}
                value={formData.maxParticipants ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxParticipants: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                placeholder="ללא הגבלה (ריק)"
              />
            </div>

            {/* ── Target Muscles (chips) ──────────────────── */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Target size={14} />
                קבוצות שרירים (אופציונלי)
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

            {/* ── Equipment (chips) ───────────────────────── */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Dumbbell size={14} />
                ציוד נדרש (אופציונלי)
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

            {/* ── External Link ─────────────────────────────── */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <ExternalLink size={14} className="text-blue-500" />
                קישור להרשמה חיצונית (אופציונלי)
              </label>
              <input
                type="url"
                value={formData.externalLink || ''}
                onChange={(e) => setFormData({ ...formData, externalLink: e.target.value || undefined })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="https://..."
                dir="ltr"
              />
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
                  הגבלת שכונה
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

            {/* ── Price, Official, Registration ───────────── */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <DollarSign size={14} />
                  מחיר
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
                  placeholder="חינם"
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
                    רשמי
                  </span>
                </label>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.registrationRequired || false}
                    onChange={(e) => setFormData({ ...formData, registrationRequired: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-bold text-gray-700">הרשמה מראש</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600"
              >
                {editingEvent ? 'עדכן' : 'צור'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingEvent(null);
                  resetForm();
                  onSessionFormClose?.();
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Events List — filter by groupId when embedded from CommunityGroups */}
      {(() => {
        const displayedEvents = prefillGroupId
          ? events.filter((e) => e.groupId === prefillGroupId)
          : events;
        return displayedEvents.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Calendar size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין אירועים</h3>
          <p className="text-gray-500">צור את האירוע הראשון</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedEvents.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Compact image preview */}
              <div className="h-36 bg-gray-100 relative overflow-hidden">
                {event.images && event.images.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.images[0]}
                    alt={event.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-50 to-gray-100 text-gray-300">
                    <ImageOff size={28} />
                    <span className="text-[10px] font-bold mt-1">אין תמונה</span>
                  </div>
                )}
                {/* Date chip overlaid */}
                <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm text-gray-800 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                  {new Date(event.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} · {event.startTime}
                </div>
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                  event.isActive ? 'bg-green-500/90 text-white' : 'bg-gray-600/80 text-white'
                }`}>
                  {event.isActive ? 'פעיל' : 'לא פעיל'}
                </div>
                {event.isOfficial && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-cyan-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                    <ShieldCheck size={10} />
                    רשמי
                  </div>
                )}
              </div>

              <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{event.name}</h3>
                  <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                    {CATEGORY_LABELS[event.category]}
                  </span>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{event.description}</p>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar size={13} className="text-cyan-500" />
                  {new Date(event.date).toLocaleDateString('he-IL')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={13} className="text-blue-500" />
                  {event.startTime}{event.endTime ? `–${event.endTime}` : ''}
                </span>
                {event.location?.address && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} className="text-emerald-500" />
                    <span className="truncate max-w-[140px]">{event.location.address}</span>
                  </span>
                )}
                {event.targetGender && event.targetGender !== 'all' && (
                  <span className="flex items-center gap-1">
                    <Users size={13} className="text-pink-500" />
                    {event.targetGender === 'male' ? 'גברים' : 'נשים'}
                  </span>
                )}
                {event.targetAgeRange && (event.targetAgeRange.min || event.targetAgeRange.max) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={13} className="text-amber-500" />
                    {event.targetAgeRange.min ?? '0'}–{event.targetAgeRange.max ?? '∞'}
                  </span>
                )}
                {event.isCityOnly && (
                  <span className="flex items-center gap-1">
                    <Building2 size={13} className="text-purple-500" />
                    עיר בלבד
                  </span>
                )}
                {event.isOfficial && (
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={13} className="text-cyan-500" />
                    רשמי
                  </span>
                )}
                {event.registrationRequired && (
                  <span className="flex items-center gap-1">
                    <UsersRound size={13} className="text-gray-500" />
                    {event.currentRegistrations}{event.maxParticipants ? ` / ${event.maxParticipants}` : ''} נרשמו
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setEditingEvent(event);
                    setFormData(event);
                    setShowForm(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200"
                >
                  <Edit2 size={16} />
                  ערוך
                </button>
                <button
                  onClick={() => handleDelete(event.id, event.name)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100"
                >
                  <Trash2 size={16} />
                  מחק
                </button>
              </div>
              </div>{/* end p-5 wrapper */}
            </div>
          ))}
        </div>
      );
      })()}

      {/* ── Media Library Modal ── */}
      <MediaLibraryModal
        isOpen={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        onSelect={handleMediaSelect}
        assetType="image"
        title="בחר תמונה לאירוע"
        authorityId={authorityId}
        scope="community"
      />
    </div>
  );
}
