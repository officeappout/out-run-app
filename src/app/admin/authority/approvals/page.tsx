'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import {
  getContributionsByAuthority,
  getAllContributions,
  approveNewLocation,
  approveSuggestEdit,
  rejectContribution,
} from '@/features/parks/core/services/contribution.service';
import type { UserContribution, ContributionType } from '@/types/contribution.types';
import { XP_REWARDS } from '@/types/contribution.types';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  MapPin,
  Pencil,
  AlertTriangle,
  Star,
  RefreshCw,
  Search,
  Image as ImageIcon,
  Plus,
  Minus,
} from 'lucide-react';

// ── Feature tag labels ──────────────────────────────────────────────

const TAG_LABELS: Record<string, string> = {
  shaded: 'מוצל ☀️',
  night_lighting: 'תאורה 💡',
  water_fountain: 'מים 🚰',
  has_toilets: 'שירותים 🚻',
  has_benches: 'ספסלים 🪑',
  rubber_floor: 'גומי 🟫',
  parkour_friendly: 'פארקור 🤸',
  stairs_training: 'מדרגות 🪜',
  near_water: 'ליד מים 🌊',
  dog_friendly: 'כלבים 🐕',
  wheelchair_accessible: 'נגישות ♿',
  safe_zone: 'מיגונית 🛡️',
  nearby_shelter: 'מקלט 🏠',
};

const FACILITY_LABELS: Record<string, string> = {
  gym_park: 'גינת כושר',
  court: 'מגרש ספורט',
  route: 'מסלול',
  zen_spot: 'פינת גוף-נפש',
  urban_spot: 'אורבן / אקסטרים',
  nature_community: 'טבע וקהילה',
};

const ISSUE_LABELS: Record<string, string> = {
  broken_equipment: 'ציוד פגום 🔧',
  no_lighting: 'תאורה לא עובדת 💡',
  no_water: 'חוסר מים 🚰',
  vandalism: 'ונדליזם 🚫',
  cleanliness: 'ניקיון 🧹',
  safety: 'בעיית בטיחות ⚠️',
  other: 'אחר 📝',
};

type TabId = 'new_location' | 'suggest_edit' | 'report';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'new_location', label: 'מיקומים חדשים', icon: <MapPin size={14} /> },
  { id: 'suggest_edit', label: 'עדכונים', icon: <Pencil size={14} /> },
  { id: 'report', label: 'דיווחים', icon: <AlertTriangle size={14} /> },
];

export default function ApprovalsPage() {
  const router = useRouter();
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [contributions, setContributions] = useState<UserContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('new_location');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminUid, setAdminUid] = useState('');

  const loadContributions = useCallback(async (aId: string, isSuper: boolean) => {
    setLoading(true);
    try {
      const data = isSuper
        ? await getAllContributions('pending')
        : await getContributionsByAuthority(aId, undefined, 'pending');
      setContributions(data);
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }
      setAdminUid(user.uid);

      try {
        const role = await checkUserRole(user.uid);
        let aId: string | null = null;
        let aName = '';
        const isSuper = !!role.isSuperAdmin;
        setIsSuperAdmin(isSuper);

        if (isSuper) {
          const allAuths = await getAllAuthorities(undefined, true);
          if (allAuths.length > 0) {
            const stored = typeof window !== 'undefined'
              ? localStorage.getItem('admin_selected_authority_id') : null;
            const target = (stored && allAuths.find((a: any) => a.id === stored)) ?? allAuths[0];
            aId = target.id;
            aName = typeof target.name === 'string' ? target.name : (target.name?.he || '');
          }
        } else if (role.isAuthorityManager && role.authorityIds?.length) {
          aId = role.authorityIds[0];
          const auths = await getAuthoritiesByManager(user.uid);
          if (auths.length > 0) {
            const a = auths[0];
            aName = typeof a.name === 'string' ? a.name : (a.name?.he || a.name?.en || '');
          }
        }

        if (!aId) { setError('לא נמצאה רשות משויכת'); setLoading(false); return; }

        setAuthorityId(aId);
        setAuthorityName(aName);
        await loadContributions(aId, isSuper);
      } catch (err: any) {
        setError(err?.message || 'שגיאה');
        setLoading(false);
      }
    });
    return () => unsub();
  }, [loadContributions]);

  const handleApprove = async (c: UserContribution) => {
    if (!c.id) return;
    setProcessingId(c.id);
    try {
      if (c.type === 'new_location') {
        await approveNewLocation(c, adminUid);
      } else if (c.type === 'suggest_edit') {
        await approveSuggestEdit(c, adminUid);
      }
      setContributions((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      console.error('[Approvals] Approve failed:', err);
      alert('שגיאה באישור');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await rejectContribution(id);
      setContributions((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error('[Approvals] Reject failed:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRefresh = () => {
    if (authorityId) loadContributions(authorityId, isSuperAdmin);
  };

  const filtered = useMemo(() => {
    let list = contributions.filter((c) => c.type === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) =>
        (c.parkName?.toLowerCase().includes(q)) ||
        (c.editSummary?.toLowerCase().includes(q)) ||
        (c.description?.toLowerCase().includes(q)) ||
        (c.userId?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [contributions, activeTab, searchQuery]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = { new_location: 0, suggest_edit: 0, report: 0 };
    contributions.forEach((c) => {
      if (c.type in counts) counts[c.type as TabId]++;
    });
    return counts;
  }, [contributions]);

  // ── Loading / Error ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]" dir="rtl">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
        <span className="mr-3 text-gray-500 font-medium">טוען תרומות...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <AlertTriangle size={40} className="text-red-400 mb-3" />
        <p className="text-gray-600 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מרכז אישורים</h1>
          <p className="text-gray-500 text-sm mt-1">{authorityName} — תרומות קהילה</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} />
          רענן
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tabCounts[tab.id] > 0 && (
              <span className="mr-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">
                {tabCounts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="חפש לפי שם, משתמש, תיאור..."
          className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:border-cyan-300 transition-colors"
        />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-100">
          <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-gray-500 font-medium">אין תרומות ממתינות בקטגוריה זו</p>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            {/* Photo */}
            {c.photoUrl ? (
              <div className="h-40 bg-gray-100 relative">
                <img src={c.photoUrl} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="h-20 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                <ImageIcon size={24} className="text-gray-300" />
              </div>
            )}

            <div className="p-4">
              {/* Type badge */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  c.type === 'new_location' ? 'bg-emerald-100 text-emerald-700' :
                  c.type === 'suggest_edit' ? 'bg-cyan-100 text-cyan-700' :
                  c.type === 'report' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {c.type === 'new_location' ? 'מיקום חדש' :
                   c.type === 'suggest_edit' ? 'עדכון' :
                   c.type === 'report' ? 'דיווח' : 'ביקורת'}
                </span>
                {c.facilityType && (
                  <span className="text-[10px] text-gray-400 font-medium">
                    {FACILITY_LABELS[c.facilityType] || c.facilityType}
                  </span>
                )}
              </div>

              {/* Title */}
              {c.parkName && (
                <h3 className="font-bold text-gray-900 mb-1">{c.parkName}</h3>
              )}

              {/* Location */}
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                <MapPin size={12} />
                <span>{c.location.lat.toFixed(4)}, {c.location.lng.toFixed(4)}</span>
              </div>

              {/* Feature tags for new_location */}
              {c.type === 'new_location' && c.featureTags && c.featureTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {c.featureTags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-medium text-gray-600">
                      {TAG_LABELS[tag] || tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Diff view for suggest_edit */}
              {c.type === 'suggest_edit' && c.editDiff && (
                <div className="bg-gray-50 rounded-xl p-3 mb-3 border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 mb-2">שינויים מוצעים:</p>
                  {c.editSummary && (
                    <p className="text-xs text-gray-700 mb-2">{c.editSummary}</p>
                  )}
                  {c.editDiff.featureTags && (
                    <div className="flex flex-wrap gap-1">
                      {(c.editDiff.featureTags as ParkFeatureTag[]).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold flex items-center gap-0.5">
                          <Plus size={8} />
                          {TAG_LABELS[tag] || tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.linkedParkId && (
                    <p className="text-[10px] text-gray-400 mt-2">פארק: {c.linkedParkId}</p>
                  )}
                </div>
              )}

              {/* Report details */}
              {c.type === 'report' && (
                <div className="mb-3">
                  {c.issueType && (
                    <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold mb-1">
                      {ISSUE_LABELS[c.issueType] || c.issueType}
                    </span>
                  )}
                  {c.description && (
                    <p className="text-xs text-gray-600 mt-1">{c.description}</p>
                  )}
                </div>
              )}

              {/* Review details */}
              {c.type === 'review' && (
                <div className="flex items-center gap-2 mb-3">
                  {c.rating && (
                    <div className="flex items-center gap-1">
                      <Star size={14} className="text-amber-400" fill="#FBBF24" />
                      <span className="text-sm font-bold text-gray-900">{c.rating}/5</span>
                    </div>
                  )}
                  {c.comment && <p className="text-xs text-gray-500">{c.comment}</p>}
                </div>
              )}

              {/* Meta */}
              <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-3">
                <span>משתמש: {c.userId?.slice(0, 8)}...</span>
                {c.createdAt && <span>{new Date(c.createdAt).toLocaleDateString('he-IL')}</span>}
              </div>

              {/* XP badge */}
              <div className="text-[10px] font-bold text-cyan-500 mb-3">
                +{XP_REWARDS[c.type]} XP למשתמש עם אישור
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(c)}
                  disabled={processingId === c.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {processingId === c.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {c.type === 'report' ? 'סמן כטופל' : 'אשר'}
                </button>
                <button
                  onClick={() => c.id && handleReject(c.id)}
                  disabled={processingId === c.id}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <XCircle size={14} />
                  דחה
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
