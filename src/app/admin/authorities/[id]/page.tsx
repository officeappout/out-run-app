'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getAuthority, updateAuthority, createAuthority } from '@/features/admin/services/authority.service';
import { Authority, AuthorityType } from '@/types/admin-types';
import { Save, X, Loader2, ArrowRight, Upload, Building2, Users, Search } from 'lucide-react';
import Link from 'next/link';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const storage = getStorage();

interface User {
  id: string;
  name: string;
  email?: string;
}

export default function EditAuthorityPage() {
  const router = useRouter();
  const params = useParams();
  const authorityId = params.id as string;
  const isNew = authorityId === 'new';
  
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'city' as AuthorityType,
    logoUrl: '',
    managerIds: [] as string[],
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [coordinatorSearch, setCoordinatorSearch] = useState('');

  useEffect(() => {
    loadUsers();
    if (!isNew) {
      loadAuthority();
    } else {
      setLoading(false);
    }
  }, [authorityId]);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const q = query(collection(db, 'users'), orderBy('core.name', 'asc'));
      const snapshot = await getDocs(q);
      const fetchedUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().core?.name || 'משתמש ללא שם',
        email: doc.data().core?.email,
      }));
      setUsers(fetchedUsers);
      setFilteredUsers(fetchedUsers);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadAuthority = async () => {
    try {
      setLoading(true);
      const data = await getAuthority(authorityId);
      if (!data) {
        alert('רשות לא נמצאה');
        router.push('/admin/authorities');
        return;
      }
      setAuthority(data);
      setFormData({
        name: data.name,
        type: data.type,
        logoUrl: data.logoUrl || '',
        managerIds: data.managerIds || [],
      });
    } catch (error) {
      console.error('Error loading authority:', error);
      alert('שגיאה בטעינת הרשות');
      router.push('/admin/authorities');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      setUploadingLogo(true);
      setUploadProgress(0);
      
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `authorities/logos/${Date.now()}-${safeName}`;
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error('Error uploading logo:', error);
          alert('שגיאה בהעלאת הלוגו');
          setUploadingLogo(false);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            setFormData({ ...formData, logoUrl: downloadUrl });
          } catch (err) {
            console.error('Error getting download URL:', err);
            alert('שגיאה בקבלת כתובת הלוגו');
          } finally {
            setUploadingLogo(false);
            setUploadProgress(0);
          }
        }
      );
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('שגיאה בהעלאת הלוגו');
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('אנא הזן שם רשות');
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (isNew) {
        await createAuthority({
          name: formData.name,
          type: formData.type,
          logoUrl: formData.logoUrl || undefined,
          managerIds: formData.managerIds,
          userCount: 0, // Will be calculated separately
        });
      } else {
        await updateAuthority(authorityId, {
          name: formData.name,
          type: formData.type,
          logoUrl: formData.logoUrl || undefined,
          managerIds: formData.managerIds,
        });
      }
      
      router.push('/admin/authorities');
    } catch (error) {
      console.error('Error saving authority:', error);
      alert('שגיאה בשמירת הרשות');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleManager = (userId: string) => {
    setFormData({
      ...formData,
      managerIds: formData.managerIds.includes(userId)
        ? formData.managerIds.filter(id => id !== userId)
        : [...formData.managerIds, userId],
    });
  };

  // Filter users based on search query
  useEffect(() => {
    if (!coordinatorSearch.trim()) {
      setFilteredUsers(users);
      return;
    }

    const searchLower = coordinatorSearch.toLowerCase();
    const filtered = users.filter(user => {
      const nameMatch = user.name.toLowerCase().includes(searchLower);
      const emailMatch = user.email?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch;
    });
    setFilteredUsers(filtered);
  }, [coordinatorSearch, users]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/authorities"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowRight size={18} />
            חזור לרשימת הרשויות
          </Link>
          <h1 className="text-3xl font-black text-gray-900">
            {isNew ? 'יצירת רשות חדשה' : 'עריכת רשות'}
          </h1>
          {authority && (
            <p className="text-gray-500 mt-2">{authority.name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/authorities"
            className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
          >
            <X size={18} />
            ביטול
          </Link>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 shadow-lg"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {isSubmitting ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
            <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
            פרטים בסיסיים
          </h2>

          <div className="space-y-6">
            {/* Authority Name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                שם הרשות *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black bg-white"
                placeholder="לדוגמה: תל אביב-יפו"
              />
            </div>

            {/* Authority Type */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                סוג רשות *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as AuthorityType })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black bg-white"
              >
                <option value="city">עירייה</option>
                <option value="regional_council">מועצה אזורית</option>
                <option value="local_council">מועצה מקומית</option>
                <option value="neighborhood">שכונה</option>
                <option value="settlement">יישוב</option>
              </select>
            </div>

            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                לוגו הרשות
              </label>
              <div className="space-y-4">
                {formData.logoUrl && (
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={formData.logoUrl}
                      alt="Logo"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, logoUrl: '' })}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      title="הסר לוגו"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                
                <label className="inline-flex items-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl cursor-pointer transition-colors">
                  <Upload size={18} className="text-gray-600" />
                  <span className="font-bold text-sm text-gray-700">
                    {uploadingLogo ? `מעלה... ${uploadProgress}%` : formData.logoUrl ? 'החלף לוגו' : 'העלה לוגו'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleLogoUpload(file);
                      }
                    }}
                    disabled={uploadingLogo}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Health Coordinators */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-6">
            <Users size={20} className="text-purple-600" />
            <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
            רכזי בריאות (Health Coordinators)
          </h2>

          {/* Search Bar */}
          {!loadingUsers && users.length > 0 && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={coordinatorSearch}
                  onChange={(e) => setCoordinatorSearch(e.target.value)}
                  placeholder="חפש לפי שם או אימייל..."
                  className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-right"
                  dir="rtl"
                />
                {coordinatorSearch && (
                  <button
                    type="button"
                    onClick={() => setCoordinatorSearch('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                )}
              </div>
              {coordinatorSearch && (
                <div className="mt-2 text-sm text-gray-500">
                  נמצאו {filteredUsers.length} משתמשים
                </div>
              )}
            </div>
          )}

          {loadingUsers ? (
            <div className="text-center py-8 text-gray-500">טוען משתמשים...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {coordinatorSearch ? 'לא נמצאו תוצאות' : 'לא נמצאו משתמשים במערכת'}
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50/50 transition-all cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={formData.managerIds.includes(user.id)}
                    onChange={() => toggleManager(user.id)}
                    className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">{user.name}</div>
                    {user.email && (
                      <div className="text-xs text-gray-500">{user.email}</div>
                    )}
                  </div>
                  {formData.managerIds.includes(user.id) && (
                    <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                      מנהל
                    </div>
                  )}
                </label>
              ))}
            </div>
          )}
          
          {formData.managerIds.length > 0 && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl">
              <p className="text-sm text-purple-700 font-bold">
                נבחרו {formData.managerIds.length} רכזי בריאות
              </p>
            </div>
          )}
        </div>

        {/* User Count Info */}
        {!isNew && authority && (
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3">
              <Users size={24} className="text-gray-600" />
              <div>
                <div className="font-bold text-gray-900">מספר משתמשים</div>
                <div className="text-2xl font-black text-gray-700 mt-1">
                  {authority.userCount || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  מספר זה מתעדכן אוטומטית על פי המשתמשים המקושרים לרשות זו
                </p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
