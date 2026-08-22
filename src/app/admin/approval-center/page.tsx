'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import {
  approveEntity,
  rejectEntity,
  bulkApproveEntities,
  bulkRejectEntities,
  unsuppressAmenity,
  type ModerationEntityType,
} from '@/features/admin/services/moderation.service';
import {
  getAllContributions,
  getContributionsByAuthority,
} from '@/features/parks/core/services/contribution.service';
import {
  fetchAmenitiesByStatus, amenityEmoji,
} from '@/features/admin/services/osm-amenity-admin.service';
import type { AmenityCategory, CourtSport } from '@/features/parks/core/types/osm-amenity.types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  MapPin,
  Route as RouteIcon,
  Dumbbell,
  Building2,
  RefreshCw,
  User,
  Mountain,
  Users,
  Landmark,
  X,
  ChevronLeft,
  RotateCcw,
  Search,
} from 'lucide-react';
import dynamicImport from 'next/dynamic';
import ApprovalDetailModal, { type ApprovalDetailItem } from '@/features/admin/components/approval/ApprovalDetailModal';
import {
  CLIMB_TYPE_LABELS, CONTRIB_TYPE_LABELS, FACILITY_LABELS, AMENITY_CATEGORY_LABELS, COURT_SPORT_LABELS,
  formatDistance, climbDisplayName,
} from '@/features/admin/components/approval/approval-labels';

// Map is client-only (react-map-gl) — load lazily, same pattern as ApprovalDetailModal.
const AmenitiesQueueMap = dynamicImport(() => import('@/features/admin/components/approval/AmenitiesQueueMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-3xl" />,
});

type ApprovalTab = 'locations' | 'routes' | 'climbs' | 'ugc' | 'amenities';

// A row in the queue, normalised across entity types.
interface QueueItem {
  entityType: ModerationEntityType;
  id: string;
  title: string;
  subtitle: string;
  origin?: string;
  authorityId?: string;
  createdByUser?: string;
  climbType?: string;
  category?: AmenityCategory;
  sport?: CourtSport;
  city?: string;
  activityType?: string;
  location?: { lat: number; lng: number };
  suppressedDuplicateOfParkId?: string | null;
}

export default function ApprovalCenterPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ApprovalTab>('locations');

  const [parks, setParks] = useState<QueueItem[]>([]);
  const [routes, setRoutes] = useState<QueueItem[]>([]);
  const [climbs, setClimbs] = useState<QueueItem[]>([]);
  const [ugc, setUgc] = useState<QueueItem[]>([]);
  const [amenities, setAmenities] = useState<QueueItem[]>([]);
  // Amenities are lazy-loaded (only when the tab is first opened this session)
  // — TLV alone is ~1,556 pending docs, an order of magnitude above every
  // other tab's typical volume; paying that read on every page load/refresh
  // regardless of whether the tab is opened would be wasteful. Consequence:
  // the header's total-pending count under-counts amenities until the tab
  // has been opened once (accepted trade-off).
  const [amenitiesLoaded, setAmenitiesLoaded] = useState(false);
  const [loadingAmenities, setLoadingAmenities] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ApprovalDetailItem | null>(null);
  const [climbFilter, setClimbFilter] = useState<string>('all');
  // Routes tab filters — client-side over the already-fetched pending queue (mirrors
  // admin/routes/page.tsx's inventory-tab invFilterCity/invFilterActivity pattern).
  // Makes reviewing one city's routes practical among a mixed-city queue (e.g. 118
  // Haifa routes among 216 total). Tab-local, same convention as amenity*Filter below.
  const [routeCityFilter, setRouteCityFilter] = useState<string>('all');
  const [routeActivityFilter, setRouteActivityFilter] = useState<'all' | 'pedestrian' | 'cycling'>('all');
  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  // Bulk-reject selection — climbs tab only (Stage 6, 17.08.2026): triaging
  // structural noise at scale means selecting many, not clicking "דחה" 175 times.
  const [selectedClimbIds, setSelectedClimbIds] = useState<Set<string>>(new Set());
  const [bulkRejecting, setBulkRejecting] = useState(false);
  // Amenities tab filters — category/sport chips + city dropdown. Tab-local:
  // no other tab has a per-city concept today (parks/routes/contributions are
  // already role-scoped by authority; climbs carry no city at all).
  const [amenityCategoryFilter, setAmenityCategoryFilter] = useState<'all' | AmenityCategory>('all');
  const [amenitySportFilter, setAmenitySportFilter] = useState<'all' | CourtSport>('all');
  const [amenityCityFilter, setAmenityCityFilter] = useState<string>('all');
  // Bulk approve/reject selection — amenities tab, separate Set from
  // selectedClimbIds so this addition can't perturb the existing climbs path.
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<Set<string>>(new Set());
  const [bulkApprovingAmenities, setBulkApprovingAmenities] = useState(false);
  const [bulkRejectingAmenities, setBulkRejectingAmenities] = useState(false);
  // List/map toggle — amenities tab only. No clustering lib in this codebase,
  // so the map caps rendered markers (see AmenitiesQueueMap's own comment).
  const [amenityViewMode, setAmenityViewMode] = useState<'list' | 'map'>('list');
  // Suppressed sub-view (Phase 4) — the garden-dedup-suppressed items
  // (status:'rejected' + suppressedDuplicateOfParkId set at ingestion time).
  // Separate lazy fetch from the main pending queue; unfiltered by
  // category/city (the ~113-item scale doesn't need it — keep this addition
  // small, matching "minimal usable moderation first, polish later").
  const [amenitySubView, setAmenitySubView] = useState<'pending' | 'suppressed'>('pending');
  const [suppressedAmenities, setSuppressedAmenities] = useState<QueueItem[]>([]);
  const [suppressedLoaded, setSuppressedLoaded] = useState(false);
  const [loadingSuppressed, setLoadingSuppressed] = useState(false);
  const [unsuppressingId, setUnsuppressingId] = useState<string | null>(null);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authorityIds, setAuthorityIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/login'); return; }
      try {
        const roleInfo = await checkUserRole(user.uid);
        const isSA = !!roleInfo.isSuperAdmin || !!roleInfo.isSystemAdmin;
        setIsSuperAdmin(isSA);
        setCurrentUserId(user.uid);
        if (!isSA && !roleInfo.isAuthorityManager) { router.push('/admin'); return; }
        const userProfile = await getUserFromFirestore(user.uid);
        setAdminName(userProfile?.core?.name || user.email || '');
        const authIds = (!isSA && roleInfo.authorityIds?.length) ? roleInfo.authorityIds : [];
        setAuthorityIds(authIds);
        await loadPendingItems(isSA, authIds, user.uid);
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/admin');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const loadPendingItems = async (superAdmin?: boolean, authIds?: string[], userId?: string) => {
    const sa = superAdmin ?? isSuperAdmin;
    const aids = authIds ?? authorityIds;
    const uid = userId ?? currentUserId;
    setLoading(true);
    try {
      const [p, r, c, u] = await Promise.all([
        loadPendingParks(sa, aids, uid),
        loadPendingRoutes(sa, aids, uid),
        loadPendingClimbs(sa),
        loadPendingContributions(sa, aids),
      ]);
      setParks(p); setRoutes(r); setClimbs(c); setUgc(u);
      // Amenities are lazy — only refetch on refresh if the tab was already
      // opened once this session; never on the initial page load.
      if (amenitiesLoaded) {
        setLoadingAmenities(true);
        try { setAmenities(await loadPendingAmenities(sa, aids, uid)); }
        finally { setLoadingAmenities(false); }
      }
    } catch (err) {
      console.error('Error loading pending items:', err);
    } finally {
      setLoading(false);
    }
  };

  const scoped = (docs: QueueItem[], sa: boolean, aids: string[], uid: string | null) =>
    sa ? docs : docs.filter(d =>
      (aids.length > 0 && d.authorityId != null && aids.includes(d.authorityId)) ||
      (d.createdByUser != null && d.createdByUser === uid));

  const loadPendingParks = async (sa: boolean, aids: string[], uid: string | null): Promise<QueueItem[]> => {
    try {
      const snap = await getDocs(query(collection(db, 'parks'), where('published', '==', false)));
      const items = snap.docs
        // Guard: a rejected park is published:false + contentStatus:'draft' — keep it out of
        // the pending queue. Legacy parks with no contentStatus still show (backward compat).
        .filter(d => { const cs = (d.data() as any).contentStatus; return cs !== 'draft' && cs !== 'rejected'; })
        .map(d => {
        const x: any = d.data();
        return {
          entityType: 'park' as const, id: d.id,
          title: x.name || '(ללא שם)',
          subtitle: FACILITY_LABELS[x.facilityType] || x.facilityType || 'מיקום',
          origin: x.origin, authorityId: x.authorityId, createdByUser: x.createdByUser,
        };
      });
      return scoped(items, sa, aids, uid);
    } catch { return []; }
  };

  const loadPendingRoutes = async (sa: boolean, aids: string[], uid: string | null): Promise<QueueItem[]> => {
    try {
      const snap = await getDocs(query(collection(db, 'official_routes'), where('published', '==', false)));
      const items = snap.docs
        // Guard: a rejected route is published:false + status:'archived' — keep it out of the
        // pending queue. Legacy routes with no status still show (backward compat).
        .filter(d => { const st = (d.data() as any).status; return st !== 'archived' && st !== 'rejected'; })
        .map(d => {
        const x: any = d.data();
        const dist = formatDistance(x.distance);
        const act = x.activityType === 'running' ? 'ריצה' : x.activityType === 'walking' ? 'הליכה' : (x.activityType || '');
        return {
          entityType: 'route' as const, id: d.id,
          title: x.name || '(ללא שם)',
          subtitle: [dist, act].filter(Boolean).join(' · '),
          origin: x.origin, authorityId: x.authorityId, createdByUser: x.createdByUser,
          city: x.city, activityType: x.activityType,
        };
      });
      return scoped(items, sa, aids, uid);
    } catch { return []; }
  };

  // Climbs carry no authorityId — only super admins moderate them.
  const loadPendingClimbs = async (sa: boolean): Promise<QueueItem[]> => {
    if (!sa) return [];
    try {
      const snap = await getDocs(query(collection(db, 'climb_segments'), where('status', '==', 'pending')));
      return snap.docs.map(d => {
        const x: any = d.data();
        return {
          entityType: 'climb' as const, id: d.id,
          title: climbDisplayName(x),
          // Secondary line: type · length · grade% (climbType stays a field, not the title).
          subtitle: [
            CLIMB_TYPE_LABELS[x.climbType] || x.climbType,
            x.lengthM ? `${x.lengthM}מ׳` : '',
            x.avgGrade != null ? `${x.avgGrade}%` : '',
          ].filter(Boolean).join(' · '),
          origin: x.origin, climbType: x.climbType,
        };
      });
    } catch { return []; }
  };

  const loadPendingContributions = async (sa: boolean, aids: string[]): Promise<QueueItem[]> => {
    try {
      const list = sa
        ? await getAllContributions('pending')
        : (await Promise.all(aids.map(a => getContributionsByAuthority(a, undefined, 'pending')))).flat();
      return list.map(c => ({
        entityType: 'contribution' as const, id: c.id!,
        title: c.parkName || CONTRIB_TYPE_LABELS[c.type] || 'תרומה',
        subtitle: [CONTRIB_TYPE_LABELS[c.type] || c.type, c.facilityType ? FACILITY_LABELS[c.facilityType] || c.facilityType : ''].filter(Boolean).join(' · '),
        authorityId: c.authorityId, createdByUser: c.userId,
      }));
    } catch { return []; }
  };

  // Amenities carry authorityId exactly like parks/routes (unlike climbs, which
  // have none and are super-admin-only) — the existing scoped() helper applies
  // unchanged, no new role logic needed.
  const loadPendingAmenities = async (sa: boolean, aids: string[], uid: string | null): Promise<QueueItem[]> => {
    try {
      const list = await fetchAmenitiesByStatus('pending');
      const items: QueueItem[] = list.map(a => ({
        entityType: 'amenity' as const,
        id: a.id,
        title: a.name || AMENITY_CATEGORY_LABELS[a.category] || a.category,
        subtitle: [
          AMENITY_CATEGORY_LABELS[a.category] || a.category,
          a.sport ? COURT_SPORT_LABELS[a.sport] || a.sport : '',
          a.city,
        ].filter(Boolean).join(' · '),
        origin: 'osm_import',
        authorityId: a.authorityId,
        city: a.city,
        category: a.category,
        sport: a.sport,
        location: a.location,
      }));
      return scoped(items, sa, aids, uid);
    } catch { return []; }
  };

  // Garden-dedup-suppressed amenities only (rejected + suppressedDuplicateOfParkId
  // set) — a plain human rejection (suppressedDuplicateOfParkId == null) is NOT
  // shown here, out of scope for this sub-view.
  const loadSuppressedAmenities = async (sa: boolean, aids: string[], uid: string | null): Promise<QueueItem[]> => {
    try {
      const list = await fetchAmenitiesByStatus('rejected');
      const items: QueueItem[] = list
        .filter(a => a.suppressedDuplicateOfParkId != null)
        .map(a => ({
          entityType: 'amenity' as const,
          id: a.id,
          title: a.name || AMENITY_CATEGORY_LABELS[a.category] || a.category,
          subtitle: [
            AMENITY_CATEGORY_LABELS[a.category] || a.category,
            a.sport ? COURT_SPORT_LABELS[a.sport] || a.sport : '',
            a.city,
          ].filter(Boolean).join(' · '),
          origin: 'osm_import',
          authorityId: a.authorityId,
          city: a.city,
          category: a.category,
          sport: a.sport,
          location: a.location,
          suppressedDuplicateOfParkId: a.suppressedDuplicateOfParkId,
        }));
      return scoped(items, sa, aids, uid);
    } catch { return []; }
  };

  const removeFromState = (entityType: ModerationEntityType, id: string) => {
    const setter = { park: setParks, route: setRoutes, climb: setClimbs, contribution: setUgc, amenity: setAmenities }[entityType];
    setter(prev => prev.filter(i => i.id !== id));
  };

  const handleApprove = async (entityType: ModerationEntityType, id: string) => {
    setProcessingId(id);
    try {
      await approveEntity(entityType, id, { adminId: currentUserId || '', adminName });
      removeFromState(entityType, id);
      setSelectedItem(prev => (prev?.id === id ? null : prev));
    } catch (e) {
      console.error(e);
      alert('שגיאה באישור הפריט');
    } finally { setProcessingId(null); }
  };

  const handleReject = async (entityType: ModerationEntityType, id: string) => {
    const reason = window.prompt('סיבת הדחייה (אופציונלי, יירשם ב-audit):');
    if (reason === null) return; // cancelled
    setProcessingId(id);
    try {
      await rejectEntity(entityType, id, reason, { adminId: currentUserId || '', adminName });
      removeFromState(entityType, id);
      setSelectedItem(prev => (prev?.id === id ? null : prev));
    } catch (e) {
      console.error(e);
      alert('שגיאה בדחיית הפריט');
    } finally { setProcessingId(null); }
  };

  const handleTabChange = (tab: ApprovalTab) => {
    setActiveTab(tab);
    setSelectedClimbIds(new Set()); // selection is climbs-tab-scoped, don't carry stale ids across tabs
    setSelectedAmenityIds(new Set()); // same — amenities-tab-scoped
    setAmenitySubView('pending'); // always land on the main queue, not wherever the sub-view was left
    if (tab === 'amenities' && !amenitiesLoaded) {
      setLoadingAmenities(true);
      loadPendingAmenities(isSuperAdmin, authorityIds, currentUserId)
        .then(items => { setAmenities(items); setAmenitiesLoaded(true); })
        .finally(() => setLoadingAmenities(false));
    }
  };

  const toggleClimbSelected = (id: string) => {
    setSelectedClimbIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkRejectClimbs = async () => {
    if (selectedClimbIds.size === 0) return;
    const reason = window.prompt(`דחיית ${selectedClimbIds.size} עליות — סיבה (אופציונלי, יחול על כולן):`);
    if (reason === null) return; // cancelled
    setBulkRejecting(true);
    try {
      const ids = Array.from(selectedClimbIds);
      await bulkRejectEntities('climb', ids, reason || null, { adminId: currentUserId || '', adminName });
      setClimbs(prev => prev.filter(c => !selectedClimbIds.has(c.id)));
      setSelectedClimbIds(new Set());
    } catch (e) {
      console.error(e);
      alert('שגיאה בדחייה מרוכזת');
    } finally {
      setBulkRejecting(false);
    }
  };

  const toggleAmenitySelected = (id: string) => {
    setSelectedAmenityIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkApproveAmenities = async () => {
    if (selectedAmenityIds.size === 0) return;
    if (!window.confirm(`לאשר ${selectedAmenityIds.size} פריטים נבחרים?`)) return;
    setBulkApprovingAmenities(true);
    try {
      const ids = Array.from(selectedAmenityIds);
      await bulkApproveEntities('amenity', ids, { adminId: currentUserId || '', adminName });
      setAmenities(prev => prev.filter(a => !selectedAmenityIds.has(a.id)));
      setSelectedAmenityIds(new Set());
    } catch (e) {
      console.error(e);
      alert('שגיאה באישור מרוכז');
    } finally {
      setBulkApprovingAmenities(false);
    }
  };

  const handleBulkRejectAmenities = async () => {
    if (selectedAmenityIds.size === 0) return;
    const reason = window.prompt(`דחיית ${selectedAmenityIds.size} מתקנים — סיבה (אופציונלי, יחול על כולם):`);
    if (reason === null) return; // cancelled
    setBulkRejectingAmenities(true);
    try {
      const ids = Array.from(selectedAmenityIds);
      await bulkRejectEntities('amenity', ids, reason || null, { adminId: currentUserId || '', adminName });
      setAmenities(prev => prev.filter(a => !selectedAmenityIds.has(a.id)));
      setSelectedAmenityIds(new Set());
    } catch (e) {
      console.error(e);
      alert('שגיאה בדחייה מרוכזת');
    } finally {
      setBulkRejectingAmenities(false);
    }
  };

  const handleAmenitySubViewChange = (view: 'pending' | 'suppressed') => {
    setAmenitySubView(view);
    setSelectedAmenityIds(new Set()); // selection is pending-sub-view-scoped
    // The list/map toggle only renders in the pending sub-view — force list
    // mode so switching to 'suppressed' can never strand map mode with no
    // visible control to switch back.
    setAmenityViewMode('list');
    if (view === 'suppressed' && !suppressedLoaded) {
      setLoadingSuppressed(true);
      loadSuppressedAmenities(isSuperAdmin, authorityIds, currentUserId)
        .then(items => { setSuppressedAmenities(items); setSuppressedLoaded(true); })
        .finally(() => setLoadingSuppressed(false));
    }
  };

  const handleUnsuppress = async (id: string) => {
    setUnsuppressingId(id);
    try {
      await unsuppressAmenity(id, { adminId: currentUserId || '', adminName });
      setSuppressedAmenities(prev => prev.filter(a => a.id !== id));
      // The item is 'pending' again now — drop the cached pending list's
      // staleness by forcing a re-fetch next time the pending sub-view is
      // viewed. Simplest correct fix: just re-run the amenities loader now.
      setAmenities(await loadPendingAmenities(isSuperAdmin, authorityIds, currentUserId));
    } catch (e) {
      console.error(e);
      alert('שגיאה בהחזרה לבדיקה');
    } finally {
      setUnsuppressingId(null);
    }
  };

  const totalPending = parks.length + routes.length + climbs.length + ugc.length + amenities.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
        <span className="mr-3 text-gray-600">טוען פריטים ממתינים...</span>
      </div>
    );
  }

  // group: 'agent' = auto-generated map content (QA-style review) ·
  //        'user'  = user submissions (trust-style review). Presentational only.
  const TABS = [
    { id: 'locations' as const, group: 'agent' as const, label: 'מיקומים', icon: MapPin, items: parks, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', rowIcon: Dumbbell },
    { id: 'routes' as const, group: 'agent' as const, label: 'מסלולים', icon: RouteIcon, items: routes, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600', rowIcon: RouteIcon },
    { id: 'climbs' as const, group: 'agent' as const, label: 'עליות', icon: Mountain, items: climbs, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', rowIcon: Mountain },
    { id: 'amenities' as const, group: 'agent' as const, label: 'מתקנים', icon: Landmark, items: amenities, iconBg: 'bg-teal-50', iconColor: 'text-teal-600', rowIcon: Landmark },
    { id: 'ugc' as const, group: 'user' as const, label: 'תרומות משתמשים', icon: Users, items: ugc, iconBg: 'bg-purple-50', iconColor: 'text-purple-600', rowIcon: Users },
  ];
  const TAB_GROUPS = [
    { key: 'agent' as const, icon: '🤖', label: 'סוכן חכם', hint: 'נוצר אוטומטית — ביקורת איכות' },
    { key: 'user' as const, icon: '👤', label: 'משתמשים', hint: 'המלצות משתמשים — ביקורת אמון' },
  ];
  const active = TABS.find(t => t.id === activeTab)!;

  // climbType sub-filter (climbs tab) — find the ~real training climbs without scrolling 196.
  const CLIMB_FILTERS = ['all', 'short-sharp', 'repeats', 'long-gentle', 'structure-ramp', 'stairs'];
  const climbCount = (t: string) => t === 'all' ? climbs.length : climbs.filter(c => c.climbType === t).length;

  // Amenities sub-filters — category chips, sport sub-chips (courts only), city dropdown.
  const AMENITY_CATEGORIES: Array<'all' | AmenityCategory> = ['all', 'court', 'bench', 'drinking_water', 'fitness_station'];
  const amenityCategoryCount = (c: 'all' | AmenityCategory) =>
    c === 'all' ? amenities.length : amenities.filter(a => a.category === c).length;
  const COURT_SPORTS: Array<'all' | CourtSport> = ['all', 'basketball', 'football', 'tennis', 'padel', 'multi', 'unknown'];
  const amenitySportCount = (s: 'all' | CourtSport) => s === 'all'
    ? amenities.filter(a => a.category === 'court').length
    : amenities.filter(a => a.category === 'court' && a.sport === s).length;
  const amenityCities = Array.from(new Set(amenities.map(a => a.city).filter(Boolean) as string[])).sort();
  const filteredAmenities = amenities.filter(a =>
    (amenityCategoryFilter === 'all' || a.category === amenityCategoryFilter) &&
    (amenityCategoryFilter !== 'court' || amenitySportFilter === 'all' || a.sport === amenitySportFilter) &&
    (amenityCityFilter === 'all' || a.city === amenityCityFilter),
  );

  // Routes tab — city/activity/name filters, same "distinct values from the loaded
  // list" approach as uniqueCities/filteredInventoryRoutes in admin/routes/page.tsx.
  const routeCities = Array.from(new Set(routes.map(r => r.city).filter(Boolean) as string[])).sort();
  const filteredRoutes = routes.filter(r => {
    if (routeCityFilter !== 'all' && r.city !== routeCityFilter) return false;
    if (routeActivityFilter !== 'all') {
      const act = r.activityType || '';
      if (routeActivityFilter === 'cycling' && act !== 'cycling') return false;
      if (routeActivityFilter === 'pedestrian' && act !== 'walking' && act !== 'running') return false;
    }
    if (routeSearchQuery.trim() && !r.title.toLowerCase().includes(routeSearchQuery.trim().toLowerCase())) return false;
    return true;
  });

  const shownItems = activeTab === 'climbs' && climbFilter !== 'all'
    ? active.items.filter(i => i.climbType === climbFilter)
    : activeTab === 'amenities'
    ? (amenitySubView === 'suppressed' ? suppressedAmenities : filteredAmenities)
    : activeTab === 'routes'
    ? filteredRoutes
    : active.items;

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
            <ShieldCheck className="text-cyan-500" size={30} />
            מרכז אישורים
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {isSuperAdmin
              ? totalPending > 0 ? `${totalPending} פריטים ממתינים לאישורך` : 'אין פריטים ממתינים — הכל מאושר!'
              : totalPending > 0 ? `${totalPending} פריטים שהגשת ממתינים לאישור` : 'אין בקשות ממתינות — הכל אושר!'}
          </p>
        </div>
        <button
          onClick={() => loadPendingItems()}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm"
        >
          <RefreshCw size={15} /> רענן
        </button>
      </div>

      {/* Role indicator */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
        isSuperAdmin ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
      }`}>
        {isSuperAdmin ? <ShieldCheck size={14} /> : <User size={14} />}
        {isSuperAdmin ? 'מנהל ראשי — מוצגים כל הפריטים הממתינים לאישור' : 'מנהל רשות — מוצגים הפריטים שהגשת לאישור'}
      </div>

      {/* Tabs — grouped by review nature: 🤖 agent-generated vs 👤 user-submitted.
          Same tabs, same approval logic; purely a visual separation because the
          two demand different review mindsets (quality-check vs trust-check). */}
      <div className="space-y-2.5">
        {TAB_GROUPS.map(group => (
          <div key={group.key}>
            <div className="flex items-center gap-1.5 px-1.5 mb-1.5 text-[11px] font-black text-gray-400">
              <span className="text-sm">{group.icon}</span>
              <span>{group.label}</span>
              <span className="font-medium text-gray-300 truncate">· {group.hint}</span>
            </div>
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-2xl p-1">
              {TABS.filter(tab => tab.group === group.key).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                  {tab.items.length > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                      {tab.items.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* climbType sub-filter — only on the climbs tab */}
      {activeTab === 'climbs' && climbs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {CLIMB_FILTERS.map(t => {
            const count = climbCount(t);
            if (t !== 'all' && count === 0) return null;
            const label = t === 'all' ? 'הכל' : (CLIMB_TYPE_LABELS[t] || t);
            return (
              <button
                key={t}
                onClick={() => setClimbFilter(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  climbFilter === t ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-orange-50'
                }`}
              >
                {label}
                <span className={`text-[10px] font-black ${climbFilter === t ? 'text-white/90' : 'text-gray-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* City / activity / name filters — routes tab only, client-side over the already-
          fetched pending queue. No new query, no moderation-logic change. */}
      {activeTab === 'routes' && routes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={routeSearchQuery}
              onChange={(e) => setRouteSearchQuery(e.target.value)}
              placeholder="חיפוש לפי שם מסלול..."
              className="w-full pr-9 pl-3 py-1.5 bg-white rounded-lg border border-gray-200 focus:border-cyan-400 outline-none text-xs"
            />
          </div>
          <select
            value={routeCityFilter}
            onChange={(e) => setRouteCityFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-gray-700 focus:border-cyan-400 focus:outline-none cursor-pointer"
          >
            <option value="all">כל הערים ({routeCities.length})</option>
            {routeCities.map(c => (
              <option key={c} value={c}>{c} ({routes.filter(r => r.city === c).length})</option>
            ))}
          </select>
          <select
            value={routeActivityFilter}
            onChange={(e) => setRouteActivityFilter(e.target.value as 'all' | 'pedestrian' | 'cycling')}
            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-gray-700 focus:border-cyan-400 focus:outline-none cursor-pointer"
          >
            <option value="all">כל הפעילויות</option>
            <option value="pedestrian">🚶 הולכי רגל / ריצה</option>
            <option value="cycling">🚴 רכיבה</option>
          </select>
          {(routeCityFilter !== 'all' || routeActivityFilter !== 'all' || routeSearchQuery) && (
            <button
              onClick={() => { setRouteCityFilter('all'); setRouteActivityFilter('all'); setRouteSearchQuery(''); }}
              className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors"
            >
              <X size={12} />
              נקה סינון
            </button>
          )}
          <span className="text-[10px] font-bold text-gray-400 mr-auto">{filteredRoutes.length} מתוך {routes.length}</span>
        </div>
      )}

      {/* Sub-view toggle — pending queue vs garden-dedup-suppressed items (Phase 4) */}
      {activeTab === 'amenities' && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
          <button
            type="button"
            onClick={() => handleAmenitySubViewChange('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${amenitySubView === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            תור בדיקה
          </button>
          <button
            type="button"
            onClick={() => handleAmenitySubViewChange('suppressed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${amenitySubView === 'suppressed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            הוסתרו אוטומטית{suppressedLoaded && suppressedAmenities.length > 0 ? ` (${suppressedAmenities.length})` : ''}
          </button>
        </div>
      )}

      {/* Explanatory banner for the suppressed sub-view */}
      {activeTab === 'amenities' && amenitySubView === 'suppressed' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-2xl px-4 py-3">
          פריטים אלו הוסתרו אוטומטית בזמן הייבוא כי הם נמצאו במרחק קרוב (עד 40 מ׳) לפארק קיים במערכת.
          בדקו שלא הוסתר בטעות מתקן אמיתי — ניתן להחזיר כל פריט לבדיקה רגילה.
        </div>
      )}

      {/* Amenity category + sport sub-filter, and per-city filter — amenities tab, pending sub-view only */}
      {activeTab === 'amenities' && amenitySubView === 'pending' && amenities.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {AMENITY_CATEGORIES.map(c => {
              const count = amenityCategoryCount(c);
              if (c !== 'all' && count === 0) return null;
              const label = c === 'all' ? 'הכל' : (AMENITY_CATEGORY_LABELS[c] || c);
              return (
                <button
                  key={c}
                  onClick={() => { setAmenityCategoryFilter(c); setAmenitySportFilter('all'); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    amenityCategoryFilter === c ? 'bg-teal-500 text-white border-teal-500 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-teal-50'
                  }`}
                >
                  {c !== 'all' && <span>{amenityEmoji(c)}</span>}
                  {label}
                  <span className={`text-[10px] font-black ${amenityCategoryFilter === c ? 'text-white/90' : 'text-gray-400'}`}>{count}</span>
                </button>
              );
            })}
            <select
              value={amenityCityFilter}
              onChange={e => setAmenityCityFilter(e.target.value)}
              className="px-3 py-1.5 rounded-full text-xs font-bold border border-gray-200 bg-white text-gray-600"
            >
              <option value="all">כל הערים</option>
              {amenityCities.map(city => <option key={city} value={city}>{city}</option>)}
            </select>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-full p-0.5 mr-auto">
              <button
                type="button"
                onClick={() => setAmenityViewMode('list')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${amenityViewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                רשימה
              </button>
              <button
                type="button"
                onClick={() => setAmenityViewMode('map')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${amenityViewMode === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                מפה
              </button>
            </div>
          </div>
          {amenityCategoryFilter === 'court' && (
            <div className="flex flex-wrap gap-1.5 pr-2">
              {COURT_SPORTS.map(s => {
                const count = amenitySportCount(s);
                if (s !== 'all' && count === 0) return null;
                const label = s === 'all' ? 'כל הענפים' : (COURT_SPORT_LABELS[s] || s);
                return (
                  <button
                    key={s}
                    onClick={() => setAmenitySportFilter(s)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                      amenitySportFilter === s ? 'bg-teal-100 text-teal-800 border-teal-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-teal-50'
                    }`}
                  >
                    {s !== 'all' && <span>{amenityEmoji('court', s)}</span>}
                    {label}
                    <span className="text-[10px] font-black text-gray-400">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bulk-reject bar — climbs tab only. Triaging noise (stairs / construction-
          ramp false positives) at 175-item scale needs select-many, not 175 clicks. */}
      {activeTab === 'climbs' && isSuperAdmin && shownItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
          <button
            type="button"
            onClick={() => setSelectedClimbIds(
              selectedClimbIds.size === shownItems.length
                ? new Set()
                : new Set(shownItems.map(i => i.id)),
            )}
            className="text-xs font-bold text-orange-700 hover:text-orange-900 transition-colors"
          >
            {selectedClimbIds.size === shownItems.length ? 'נקה בחירה' : `בחר הכל (${shownItems.length} מוצגים)`}
          </button>
          {selectedClimbIds.size > 0 && (
            <>
              <span className="text-xs font-bold text-orange-600">{selectedClimbIds.size} נבחרו</span>
              <button
                type="button"
                onClick={handleBulkRejectClimbs}
                disabled={bulkRejecting}
                className="flex items-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60 mr-auto"
              >
                {bulkRejecting ? <Loader2 className="animate-spin" size={12} /> : <X size={12} />}
                {bulkRejecting ? 'דוחה...' : `דחה ${selectedClimbIds.size} נבחרות`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Bulk approve/reject bar — amenities tab, pending sub-view only. "Approve
          all 649 benches" needs select-many + bulk approve, not 649 clicks. */}
      {activeTab === 'amenities' && amenitySubView === 'pending' && isSuperAdmin && shownItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
          <button
            type="button"
            onClick={() => setSelectedAmenityIds(
              selectedAmenityIds.size === shownItems.length
                ? new Set()
                : new Set(shownItems.map(i => i.id)),
            )}
            className="text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors"
          >
            {selectedAmenityIds.size === shownItems.length ? 'נקה בחירה' : `בחר הכל (${shownItems.length} מוצגים)`}
          </button>
          {selectedAmenityIds.size > 0 && (
            <>
              <span className="text-xs font-bold text-teal-600">{selectedAmenityIds.size} נבחרו</span>
              <div className="flex items-center gap-2 mr-auto">
                <button
                  type="button"
                  onClick={handleBulkApproveAmenities}
                  disabled={bulkApprovingAmenities || bulkRejectingAmenities}
                  className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                >
                  {bulkApprovingAmenities ? <Loader2 className="animate-spin" size={12} /> : <ShieldCheck size={12} />}
                  {bulkApprovingAmenities ? 'מאשר...' : `אשר ${selectedAmenityIds.size} נבחרים`}
                </button>
                <button
                  type="button"
                  onClick={handleBulkRejectAmenities}
                  disabled={bulkApprovingAmenities || bulkRejectingAmenities}
                  className="flex items-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                >
                  {bulkRejectingAmenities ? <Loader2 className="animate-spin" size={12} /> : <X size={12} />}
                  {bulkRejectingAmenities ? 'דוחה...' : `דחה ${selectedAmenityIds.size} נבחרים`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Active tab list */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {activeTab === 'amenities' && (amenitySubView === 'suppressed' ? loadingSuppressed : loadingAmenities) ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            <p className="text-sm text-gray-400">{amenitySubView === 'suppressed' ? 'טוען פריטים מוסתרים...' : 'טוען מתקנים...'}</p>
          </div>
        ) : shownItems.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 size={40} className="text-green-400" />
            <p className="text-lg font-black text-gray-700">
              {activeTab === 'amenities' && amenitySubView === 'suppressed' ? 'אין פריטים מוסתרים' : `אין ${active.label} ממתינים`}
            </p>
            <p className="text-sm text-gray-400">
              {activeTab === 'amenities' && amenitySubView === 'suppressed'
                ? 'שום מתקן לא הוסתר אוטומטית בייבוא הנוכחי'
                : activeTab === 'climbs' && !isSuperAdmin ? 'עליות מנוהלות ע״י מנהל ראשי בלבד' : isSuperAdmin ? 'הכל אושר' : 'לא הגשת פריטים לאישור'}
            </p>
          </div>
        ) : activeTab === 'amenities' && amenityViewMode === 'map' ? (
          <div className="h-[480px]">
            <AmenitiesQueueMap
              items={shownItems
                .filter(i => i.category && i.location)
                .map(i => ({ id: i.id, category: i.category!, sport: i.sport, location: i.location!, name: i.title }))}
              onSelect={id => {
                const found = shownItems.find(i => i.id === id);
                if (found) setSelectedItem({ entityType: 'amenity', id, title: found.title });
              }}
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {shownItems.map(item => (
              <div key={item.id} className="px-6 py-4 flex items-center gap-4 hover:bg-amber-50/30 transition-colors">
                {activeTab === 'climbs' && isSuperAdmin && (
                  <input
                    type="checkbox"
                    checked={selectedClimbIds.has(item.id)}
                    onChange={() => toggleClimbSelected(item.id)}
                    className="w-4 h-4 flex-shrink-0 accent-orange-500 cursor-pointer"
                  />
                )}
                {activeTab === 'amenities' && amenitySubView === 'pending' && isSuperAdmin && (
                  <input
                    type="checkbox"
                    checked={selectedAmenityIds.has(item.id)}
                    onChange={() => toggleAmenitySelected(item.id)}
                    className="w-4 h-4 flex-shrink-0 accent-teal-500 cursor-pointer"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSelectedItem({ entityType: item.entityType, id: item.id, title: item.title })}
                  className="flex items-center gap-4 flex-1 min-w-0 text-right group"
                >
                  <div className={`w-10 h-10 rounded-xl ${active.iconBg} flex items-center justify-center ${active.iconColor} flex-shrink-0`}>
                    {activeTab === 'amenities' && item.category
                      ? <span className="text-lg leading-none">{amenityEmoji(item.category, item.sport)}</span>
                      : <active.rowIcon size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate group-hover:text-cyan-700 transition-colors">{item.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                      {item.origin === 'authority_admin' && (
                        <span className="flex items-center gap-1 text-purple-600"><Building2 size={10} /> מקור: רשות</span>
                      )}
                      {item.origin === 'super_admin' && (
                        <span className="flex items-center gap-1 text-blue-600"><ShieldCheck size={10} /> מנהל ראשי</span>
                      )}
                      {item.origin === 'osm_import' && (
                        <span className="flex items-center gap-1 text-orange-600"><Mountain size={10} /> ייבוא OSM</span>
                      )}
                      {item.subtitle && <span>{item.subtitle}</span>}
                      {item.createdByUser && (
                        <span className="text-gray-400">מגיש: {item.createdByUser.slice(0, 8)}…</span>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-cyan-600 font-bold flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    פירוט <ChevronLeft size={13} />
                  </span>
                </button>
                {activeTab === 'amenities' && amenitySubView === 'suppressed' ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                      הוסתר אוטומטית — כפילות אפשרית
                    </span>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleUnsuppress(item.id)}
                        disabled={unsuppressingId === item.id}
                        className="flex items-center gap-1.5 bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                      >
                        {unsuppressingId === item.id ? <Loader2 className="animate-spin" size={12} /> : <RotateCcw size={12} />}
                        {unsuppressingId === item.id ? 'מעבד...' : 'החזר לבדיקה'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                      <Clock size={9} /> {isSuperAdmin ? 'ממתין לאישורך' : 'ממתין לאישור'}
                    </span>
                    {isSuperAdmin && (
                      <>
                        <button
                          onClick={() => handleApprove(item.entityType, item.id)}
                          disabled={processingId === item.id}
                          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60 shadow-sm"
                        >
                          {processingId === item.id ? <Loader2 className="animate-spin" size={12} /> : <ShieldCheck size={12} />}
                          {processingId === item.id ? 'מעבד...' : 'אשר'}
                        </button>
                        <button
                          onClick={() => handleReject(item.entityType, item.id)}
                          disabled={processingId === item.id}
                          className="flex items-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                        >
                          <X size={12} /> דחה
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPending > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {parks.length} מיקומים · {routes.length} מסלולים · {climbs.length} עליות · {amenities.length} מתקנים · {ugc.length} תרומות = {totalPending} פריטים {isSuperAdmin ? 'ממתינים לאישורך' : 'ממתינים לאישור'}
        </p>
      )}

      {/* Detail preview — verify location/geometry before approving */}
      <ApprovalDetailModal
        item={selectedItem}
        isSuperAdmin={isSuperAdmin}
        processingId={processingId}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
