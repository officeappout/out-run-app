'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getParksByAuthority, approvePark } from '@/features/admin/services/parks.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import type { Park, ParkFacilityCategory, ParkSportType, ParkFeatureTag } from '@/features/parks';
import ParkDetailDrawer from '@/features/admin/components/parks/ParkDetailDrawer';
import {
  Plus,
  MapPin,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  Pencil,
  ShieldCheck,
  Building,
  ImageOff,
  Map,
  Trophy,
  Trees,
  Footprints,
  ArrowUpDown,
  Search,
  Dumbbell,
} from 'lucide-react';

// ── Tab system (no branding tab for authority) ──────────────────────

type LocationTab = 'all' | 'parks' | 'courts' | 'nature_community' | 'urban';

interface TabConfig {
  id: LocationTab;
  label: string;
  icon: React.ElementType;
  facilityTypes: ParkFacilityCategory[];
  color: string;
}

const TABS: TabConfig[] = [
  { id: 'all',              label: 'הכל',           icon: Map,        facilityTypes: [],                                color: '#475569' },
  { id: 'parks',            label: 'פארקים וגינות', icon: Dumbbell,   facilityTypes: ['gym_park'],                       color: '#8B5CF6' },
  { id: 'courts',           label: 'מגרשי ספורט',   icon: Trophy,     facilityTypes: ['court'],                          color: '#F59E0B' },
  { id: 'nature_community', label: 'טבע וקהילה',    icon: Trees,      facilityTypes: ['nature_community', 'zen_spot'],   color: '#10B981' },
  { id: 'urban',            label: 'תשתית עירונית', icon: Footprints, facilityTypes: ['urban_spot'],                     color: '#6366F1' },
];

// ── Labels & icons ──────────────────────────────────────────────────

const FACILITY_TYPE_LABELS: Record<string, string> = {
  gym_park:         'גינת כושר',
  court:            'מגרש ספורט',
  route:            'מסלול',
  zen_spot:         'פינת גוף-נפש',
  urban_spot:       'אורבן / אקסטרים',
  nature_community: 'טבע וקהילה',
};

const FEATURE_TAG_OPTIONS: { id: ParkFeatureTag; label: string; icon: string }[] = [
  { id: 'shaded',               label: 'מוצל',              icon: '☀️' },
  { id: 'night_lighting',       label: 'תאורת לילה',        icon: '💡' },
  { id: 'water_fountain',       label: 'ברזיית מים',        icon: '🚰' },
  { id: 'has_toilets',          label: 'שירותים',           icon: '🚻' },
  { id: 'has_benches',          label: 'ספסלים',            icon: '🪑' },
  { id: 'parkour_friendly',     label: 'ידידותי לפארקור',   icon: '🤸' },
  { id: 'stairs_training',      label: 'מדרגות לאימון',     icon: '🪜' },
  { id: 'rubber_floor',         label: 'ריצפת גומי',       icon: '🟫' },
  { id: 'near_water',           label: 'ליד מים',           icon: '🌊' },
  { id: 'dog_friendly',         label: 'ידידותי לכלבים',    icon: '🐕' },
  { id: 'wheelchair_accessible', label: 'נגיש לכיסא גלגלים', icon: '♿' },
  { id: 'safe_zone',            label: 'אזור בטוח / מיגונית', icon: '🛡️' },
];

const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  gym_park: '🏋️', court: '🏀', route: '🛤️', zen_spot: '🧘',
  urban_spot: '🏙️', nature_community: '🌿',
  basketball: '🏀', football: '⚽', tennis: '🎾', padel: '🏓', multi: '🏟️',
  stairs: '🪜', bench: '🪑', skatepark: '🛹',
  water_fountain: '🚰', toilets: '🚻', parking: '🅿️', bike_rack: '🚲',
  spring: '🌊', observation_point: '🏔️', dog_park: '🐕',
};

const COURT_TYPE_LABELS: Record<string, string> = {
  basketball: 'כדורסל', football: 'כדורגל', tennis: 'טניס', padel: 'פאדל', multi: 'רב תכליתי',
};

const URBAN_TYPE_LABELS: Record<string, string> = {
  stairs: 'מדרגות', bench: 'ספסלים', skatepark: 'סקייטפארק',
  water_fountain: 'ברזייה', toilets: 'שירותים', parking: 'חנייה', bike_rack: 'אופניים',
};

type SortKey = 'name' | 'facilityType' | 'status';

function statusBadge(park: Park, isSuperView = false) {
  const isPublished = park.published === true || park.contentStatus === 'published';
  const isPending   = park.contentStatus === 'pending_review' || park.published === false;
  if (isPublished) return { label: 'פורסם', cls: 'bg-emerald-100 text-emerald-700' };
  if (isPending)   return { label: isSuperView ? 'ממתין לאישורך' : 'ממתין לאישור', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'טיוטה', cls: 'bg-gray-100 text-gray-600' };
}

function getCategoryIcon(park: Park): string {
  if ((park as any).courtType) return DEFAULT_CATEGORY_ICONS[(park as any).courtType] || '🏟️';
  if (park.urbanType) return DEFAULT_CATEGORY_ICONS[park.urbanType] || '🏙️';
  if (park.communityType) return DEFAULT_CATEGORY_ICONS[park.communityType] || '🌿';
  if (park.natureType) return DEFAULT_CATEGORY_ICONS[park.natureType] || '🌿';
  return DEFAULT_CATEGORY_ICONS[park.facilityType || 'gym_park'] || '📍';
}

// ── Page ─────────────────────────────────────────────────────────────

export default function AuthorityLocationsPage() {
  const router = useRouter();
  const [authorityId, setAuthorityId]     = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [parks, setParks]                 = useState<Park[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [approvingId, setApprovingId]     = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin]   = useState(false);

  const [activeTab, setActiveTab]     = useState<LocationTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey]         = useState<SortKey>('name');
  const [sortAsc, setSortAsc]         = useState(true);
  const [detailParkId, setDetailParkId] = useState<string | null>(null);

  // ── Load authority + parks ─────────────────────────────────────────
  const loadParks = useCallback(async (aId: string) => {
    setLoading(true);
    try {
      const data = await getParksByAuthority(aId);
      setParks(data);
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);
        let aId: string | null = null;
        let aName = '';

        setIsSuperAdmin(!!role.isSuperAdmin);

        if (role.isSuperAdmin) {
          const allAuths = await getAllAuthorities(undefined, true);
          if (allAuths.length > 0) {
            const stored = typeof window !== 'undefined'
              ? localStorage.getItem('admin_selected_authority_id') : null;
            const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
            aId   = target.id;
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

        if (!aId) { setError('לא נמצאה רשות משויכת לחשבון זה'); setLoading(false); return; }

        setAuthorityId(aId);
        setAuthorityName(aName);
        await loadParks(aId);
      } catch (err: any) {
        setError(err?.message || 'שגיאה בטעינת הנתונים');
        setLoading(false);
      }
    });
    return () => unsub();
  }, [loadParks]);

  const handleApprove = async (parkId: string) => {
    setApprovingId(parkId);
    try {
      await approvePark(parkId);
      setParks(prev => prev.map(p =>
        p.id === parkId ? { ...p, published: true, contentStatus: 'published' as const } : p
      ));
    } catch {
      alert('שגיאה באישור המיקום');
    } finally {
      setApprovingId(null);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  // ── Filtered & sorted parks ────────────────────────────────────────
  const filteredParks = useMemo(() => {
    let list = parks;

    // Filter by tab
    if (activeTab !== 'all') {
      const tabConfig = TABS.find(t => t.id === activeTab)!;
      list = list.filter(p => {
        if (p.facilityType) return tabConfig.facilityTypes.includes(p.facilityType);
        return activeTab === 'parks';
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '');
          break;
        case 'facilityType':
          cmp = (a.facilityType || '').localeCompare(b.facilityType || '');
          break;
        case 'status': {
          const aPublished = a.published === true || a.contentStatus === 'published';
          const bPublished = b.published === true || b.contentStatus === 'published';
          cmp = Number(bPublished) - Number(aPublished);
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [parks, activeTab, searchQuery, sortKey, sortAsc]);

  // ── Category counts for summary cards ──────────────────────────────
  const counts = useMemo(() => {
    const total = parks.length;
    const urban = parks.filter(p => p.facilityType === 'urban_spot').length;
    const nature = parks.filter(p => p.facilityType === 'nature_community' || p.facilityType === 'zen_spot').length;
    const courts = parks.filter(p => p.facilityType === 'court').length;
    const gymParks = parks.filter(p => p.facilityType === 'gym_park' || !p.facilityType).length;
    const published = parks.filter(p => p.published === true || p.contentStatus === 'published').length;
    const pending = parks.filter(p => p.contentStatus === 'pending_review' || (p.published === false && p.contentStatus !== 'published')).length;
    return { total, urban, nature, courts, gymParks, published, pending };
  }, [parks]);

  // ── Tab counts ─────────────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const map: Record<LocationTab, number> = { all: parks.length, parks: 0, courts: 0, nature_community: 0, urban: 0 };
    for (const p of parks) {
      const ft = p.facilityType;
      if (ft === 'gym_park' || !ft) map.parks++;
      else if (ft === 'court') map.courts++;
      else if (ft === 'nature_community' || ft === 'zen_spot') map.nature_community++;
      else if (ft === 'urban_spot') map.urban++;
    }
    return map;
  }, [parks]);

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  const currentTabConfig = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center">
            <Map size={24} className="text-cyan-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">ניהול מיקומים על המפה</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {authorityName && <span className="font-bold text-cyan-600">{authorityName}</span>}
              {authorityName && ' · '}
              {parks.length} מיקומים · {filteredParks.length} ב{currentTabConfig.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => authorityId && loadParks(authorityId)}
            className="flex items-center gap-2 bg-white text-gray-600 px-4 py-2.5 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={16} />
            <span className="text-sm">רענן</span>
          </button>
          <Link
            href="/admin/authority/locations/new"
            className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all"
            style={{ backgroundColor: currentTabConfig.color }}
          >
            <Plus size={18} />
            <span>הוסף מיקום</span>
          </Link>
        </div>
      </div>

      {/* ═══ Summary Cards ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'סך הכל מיקומים',   value: counts.total,  color: '#475569', bg: 'bg-slate-50',   border: 'border-slate-200' },
          { label: 'תשתית עירונית',    value: counts.urban,  color: '#6366F1', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
          { label: 'טבע וקהילה',       value: counts.nature, color: '#10B981', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'מגרשי ספורט',      value: counts.courts, color: '#F59E0B', bg: 'bg-amber-50',   border: 'border-amber-200' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} border ${card.border} rounded-2xl p-4 text-center shadow-sm`}>
            <p className="text-3xl font-black" style={{ color: card.color }}>{card.value}</p>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ═══ Pending Notice ═══ */}
      {counts.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <Clock size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-amber-800 text-sm font-medium">
            {counts.pending} מיקום{counts.pending > 1 ? 'ים' : ''} ממתינ{counts.pending > 1 ? 'ים' : ''} לאישור מנהל המערכת לפני פרסום לאפליקציה.
          </p>
        </div>
      )}

      {/* ═══ Tabs ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5">
        <div className="flex gap-1">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const count = tabCounts[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-bold text-sm transition-all ${
                  isActive
                    ? 'text-white shadow-md'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
                style={{ backgroundColor: isActive ? tab.color : undefined }}
              >
                <tab.icon size={16} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Search Bar ═══ */}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="חפש לפי שם, תיאור או עיר..."
          className="w-full pr-10 pl-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent shadow-sm"
        />
      </div>

      {/* ═══ Location Table ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredParks.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="inline-flex p-4 rounded-full mb-4"
              style={{ backgroundColor: `${currentTabConfig.color}15` }}
            >
              <currentTabConfig.icon size={32} style={{ color: currentTabConfig.color }} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {searchQuery ? 'לא נמצאו תוצאות' : `אין ${currentTabConfig.label} במערכת`}
            </h3>
            <p className="text-gray-500 mt-2">
              {searchQuery ? 'נסו חיפוש אחר' : 'התחל על ידי הוספת הראשון'}
            </p>
            {!searchQuery && (
              <Link
                href="/admin/authority/locations/new"
                className="mt-4 inline-flex items-center gap-2 text-white px-6 py-3 rounded-xl font-bold transition-all"
                style={{ backgroundColor: currentTabConfig.color }}
              >
                <Plus size={18} />
                <span>הוסף מיקום</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0">
                <tr>
                  <th className="px-4 py-4 rounded-tr-2xl w-16">תמונה</th>
                  <th className="px-5 py-4">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                      שם
                      <ArrowUpDown size={12} className={sortKey === 'name' ? 'text-cyan-500' : 'text-gray-300'} />
                    </button>
                  </th>
                  <th className="px-5 py-4">
                    <button onClick={() => handleSort('facilityType')} className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                      סיווג
                      <ArrowUpDown size={12} className={sortKey === 'facilityType' ? 'text-cyan-500' : 'text-gray-300'} />
                    </button>
                  </th>
                  <th className="px-5 py-4">תגיות / פרטים</th>
                  <th className="px-5 py-4">
                    <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                      סטטוס
                      <ArrowUpDown size={12} className={sortKey === 'status' ? 'text-cyan-500' : 'text-gray-300'} />
                    </button>
                  </th>
                  <th className="px-5 py-4 rounded-tl-2xl text-center">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredParks.map(park => {
                  const badge = statusBadge(park, isSuperAdmin);
                  const icon = getCategoryIcon(park);

                  return (
                    <tr key={park.id} className="hover:bg-blue-50/50 transition-colors group">
                      {/* Thumbnail */}
                      <td className="px-4 py-4">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden">
                          {(park.images?.[0] || park.image || park.imageUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={park.images?.[0] || park.image || park.imageUrl || ''}
                              alt={park.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <ImageOff size={16} />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Name + category icon */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                            style={{ backgroundColor: `${currentTabConfig.color}15` }}
                          >
                            {icon}
                          </div>
                          <div className="min-w-0">
                            <button
                              onClick={() => setDetailParkId(park.id)}
                              className="font-bold text-gray-900 block truncate hover:text-cyan-600 transition-colors text-right"
                            >
                              {park.name}
                            </button>
                            {park.featureTags && park.featureTags.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {park.featureTags.slice(0, 3).map(tag => {
                                  const t = FEATURE_TAG_OPTIONS.find(o => o.id === tag);
                                  return t ? <span key={tag} className="text-xs" title={t.label}>{t.icon}</span> : null;
                                })}
                                {park.featureTags.length > 3 && (
                                  <span className="text-xs text-gray-400">+{park.featureTags.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Facility type */}
                      <td className="px-5 py-4">
                        {park.facilityType ? (
                          <span
                            className="text-xs font-bold px-3 py-1 rounded-full"
                            style={{ backgroundColor: `${currentTabConfig.color}15`, color: currentTabConfig.color }}
                          >
                            {FACILITY_TYPE_LABELS[park.facilityType] || park.facilityType}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">לא מסווג</span>
                        )}
                      </td>

                      {/* Tags / details */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {/* Court sub-type */}
                          {(park as any).courtType && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                              {DEFAULT_CATEGORY_ICONS[(park as any).courtType] || '🏟️'}
                              {' '}{COURT_TYPE_LABELS[(park as any).courtType] || (park as any).courtType}
                            </span>
                          )}
                          {/* Urban sub-type */}
                          {park.urbanType && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                              {DEFAULT_CATEGORY_ICONS[park.urbanType] || '🏙️'}
                              {' '}{URBAN_TYPE_LABELS[park.urbanType] || park.urbanType}
                            </span>
                          )}
                          {/* Nature sub-type */}
                          {park.natureType && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                              {DEFAULT_CATEGORY_ICONS[park.natureType] || '🌿'}
                              {' '}{park.natureType === 'spring' ? 'מעיין' : 'תצפית'}
                            </span>
                          )}
                          {park.communityType === 'dog_park' && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                              🐕 גינת כלבים
                            </span>
                          )}
                          {/* Sport types */}
                          {!park.urbanType && !park.natureType && !park.communityType && !(park as any).courtType && park.sportTypes && park.sportTypes.length > 0 && (
                            <>
                              {park.sportTypes.slice(0, 2).map(sport => (
                                <span key={sport} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                                  {sport}
                                </span>
                              ))}
                              {park.sportTypes.length > 2 && (
                                <span className="text-xs text-gray-400">+{park.sportTypes.length - 2}</span>
                              )}
                            </>
                          )}
                          {/* Feature tags for parks */}
                          {park.facilityType === 'gym_park' && park.featureTags && park.featureTags.length > 0 && !park.sportTypes?.length && (
                            <>
                              {park.featureTags.slice(0, 3).map(tag => {
                                const t = FEATURE_TAG_OPTIONS.find(o => o.id === tag);
                                return t ? (
                                  <span key={tag} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                                    {t.icon} {t.label}
                                  </span>
                                ) : null;
                              })}
                            </>
                          )}
                          {/* Fallback */}
                          {!park.urbanType && !park.natureType && !park.communityType && !(park as any).courtType && !park.sportTypes?.length && !park.featureTags?.length && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {/* Origin badge */}
                          {(park as any).origin === 'super_admin' && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                              <ShieldCheck size={10} />
                              מנהל ראשי
                            </span>
                          )}
                          {(park as any).origin === 'authority_admin' && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5">
                              <Building size={10} />
                              מקור: רשות
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {/* Approve (super admin only) */}
                          {isSuperAdmin && (park.contentStatus === 'pending_review' || park.published === false) && park.contentStatus !== 'published' && (
                            <button
                              onClick={() => handleApprove(park.id)}
                              disabled={approvingId === park.id}
                              className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-60 shadow-sm"
                            >
                              {approvingId === park.id
                                ? <Loader2 className="animate-spin" size={10} />
                                : <ShieldCheck size={10} />}
                              {approvingId === park.id ? 'מאשר...' : 'אשר'}
                            </button>
                          )}
                          <Link
                            href={`/admin/authority/locations/${park.id}/edit`}
                            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors font-bold"
                          >
                            <Pencil size={12} />
                            עריכה
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ParkDetailDrawer
        parkId={detailParkId}
        onClose={() => setDetailParkId(null)}
      />
    </div>
  );
}
