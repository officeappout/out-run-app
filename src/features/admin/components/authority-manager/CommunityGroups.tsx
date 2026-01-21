'use client';

import { useState, useEffect } from 'react';
import {
  getGroupsByAuthority,
  createGroup,
  updateGroup,
  deleteGroup,
} from '@/features/admin/services/community.service';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { CommunityGroup, CommunityGroupCategory } from '@/types/community.types';
import { Park } from '@/types/admin-types';
import { Plus, Edit2, Trash2, Users, Calendar, MapPin } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface CommunityGroupsProps {
  authorityId: string;
}

const CATEGORY_LABELS: Record<CommunityGroupCategory, string> = {
  walking: 'הליכה',
  running: 'ריצה',
  yoga: 'יוגה',
  calisthenics: 'קליסטניקס',
  cycling: 'אופניים',
  other: 'אחר',
};

export default function CommunityGroups({ authorityId }: CommunityGroupsProps) {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CommunityGroup | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CommunityGroup>>({
    name: '',
    description: '',
    category: 'walking',
    isActive: true,
    currentParticipants: 0,
  });

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
        await updateGroup(editingGroup.id, formData);
      } else {
        if (!currentUserId) {
          alert('נא להתחבר למערכת');
          return;
        }
        await createGroup({
          ...formData,
          authorityId,
          createdBy: currentUserId,
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
    setFormData({
      name: '',
      description: '',
      category: 'walking',
      isActive: true,
      currentParticipants: 0,
    });
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען קבוצות...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">קבוצות קהילה</h2>
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

      {/* Form */}
      {(showForm || editingGroup) && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {editingGroup ? 'ערוך קבוצה' : 'קבוצה חדשה'}
          </h3>
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
                <label className="block text-sm font-bold text-gray-700 mb-1">מיקום מפגש (פארק)</label>
                <select
                  value={formData.meetingLocation?.parkId || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      meetingLocation: {
                        ...formData.meetingLocation,
                        parkId: e.target.value || undefined,
                        location: parks.find((p) => p.id === e.target.value)?.location,
                      },
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">בחר פארק...</option>
                  {parks.map((park) => (
                    <option key={park.id} value={park.id}>
                      {park.name} - {park.city}
                    </option>
                  ))}
                </select>
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

      {/* Groups List */}
      {groups.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Users size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין קבוצות</h3>
          <p className="text-gray-500">צור את הקבוצה הראשונה</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{group.name}</h3>
                  <span className="inline-block px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold">
                    {CATEGORY_LABELS[group.category]}
                  </span>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  group.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {group.isActive ? 'פעיל' : 'לא פעיל'}
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">{group.description}</p>

              <div className="space-y-2 mb-4">
                {group.schedule && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar size={16} />
                    <span>
                      יום {group.schedule.dayOfWeek === 0 ? 'ראשון' : group.schedule.dayOfWeek === 1 ? 'שני' : '...'} בשעה {group.schedule.time}
                    </span>
                  </div>
                )}
                {group.meetingLocation?.address && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={16} />
                    <span>{group.meetingLocation.address}</span>
                  </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
