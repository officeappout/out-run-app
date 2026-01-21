'use client';

import { useState, useEffect } from 'react';
import {
  getEventsByAuthority,
  createEvent,
  updateEvent,
  deleteEvent,
} from '@/features/admin/services/community.service';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { CommunityEvent, EventCategory } from '@/types/community.types';
import { Park } from '@/types/admin-types';
import { Plus, Edit2, Trash2, Calendar, MapPin, Clock } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface CommunityEventsProps {
  authorityId: string;
}

const CATEGORY_LABELS: Record<EventCategory, string> = {
  race: 'מרוץ',
  fitness_day: 'יום כושר',
  workshop: 'סדנה',
  community_meetup: 'מפגש קהילה',
  other: 'אחר',
};

export default function CommunityEvents({ authorityId }: CommunityEventsProps) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CommunityEvent>>({
    name: '',
    description: '',
    category: 'race',
    date: new Date(),
    startTime: '09:00',
    location: { address: '', location: { lat: 0, lng: 0 } },
    registrationRequired: false,
    isActive: true,
    currentRegistrations: 0,
  });

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
    setFormData({
      name: '',
      description: '',
      category: 'race',
      date: new Date(),
      startTime: '09:00',
      location: { address: '', location: { lat: 0, lng: 0 } },
      registrationRequired: false,
      isActive: true,
      currentRegistrations: 0,
    });
  };

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
                <label className="block text-sm font-bold text-gray-700 mb-1">מיקום (פארק או כתובת)</label>
                <select
                  value={formData.location?.parkId || ''}
                  onChange={(e) => {
                    const selectedPark = parks.find((p) => p.id === e.target.value);
                    setFormData({
                      ...formData,
                      location: {
                        parkId: e.target.value || undefined,
                        address: selectedPark ? `${selectedPark.name}, ${selectedPark.city}` : formData.location?.address || '',
                        location: selectedPark?.location || formData.location?.location || { lat: 0, lng: 0 },
                      },
                    });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 mb-2"
                >
                  <option value="">בחר פארק...</option>
                  {parks.map((park) => (
                    <option key={park.id} value={park.id}>
                      {park.name} - {park.city}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={formData.location?.address || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      location: { ...formData.location, address: e.target.value, location: { lat: 0, lng: 0 } },
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="או הזן כתובת ידנית"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.registrationRequired || false}
                  onChange={(e) => setFormData({ ...formData, registrationRequired: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm font-bold text-gray-700">נדרשת הרשמה מראש</span>
              </label>
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
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Events List */}
      {events.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Calendar size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין אירועים</h3>
          <p className="text-gray-500">צור את האירוע הראשון</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{event.name}</h3>
                  <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                    {CATEGORY_LABELS[event.category]}
                  </span>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  event.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {event.isActive ? 'פעיל' : 'לא פעיל'}
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">{event.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar size={16} />
                  <span>{new Date(event.date).toLocaleDateString('he-IL')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock size={16} />
                  <span>{event.startTime}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin size={16} />
                  <span className="truncate">{event.location.address}</span>
                </div>
                {event.registrationRequired && (
                  <div className="text-sm text-gray-600">
                    {event.currentRegistrations}
                    {event.maxParticipants ? ` / ${event.maxParticipants}` : ''} נרשמו
                  </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
