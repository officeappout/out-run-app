import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAllAuthorities,
  getAuthoritiesGrouped,
  deleteAuthority,
  updateAuthority,
} from '@/features/admin/services/authority.service';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { initializeAuthoritiesSchema } from '@/features/admin/services/schema-initializer.service';
import { seedIsraeliAuthorities } from '@/features/admin/services/seed-israeli-authorities';
import { reSeedIsraeliAuthorities } from '@/features/admin/services/re-seed-authorities';
import { repairTelAvivAuthorities, formatRepairReport } from '@/features/admin/services/repair-authorities';
import { Authority, AuthorityType, PipelineStatus, hasOverdueInstallments } from '@/types/admin-types';
import { ISRAELI_LOCATIONS, SubLocation } from '@/lib/data/israel-locations';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import { getUserFromFirestore } from '@/lib/firestore.service';

const USERS_COLLECTION = 'users';

// Enhanced authority with sub-locations and aggregated stats
export interface AuthorityWithSubLocations extends Authority {
  subLocations?: (SubLocation & { parksCount?: number; usersCount?: number })[];
  aggregatedParksCount?: number;
  aggregatedUsersCount?: number;
}

// Sub-location stats type
export type SubLocationStats = Map<string, { parksCount: number; usersCount: number }>;

export function useAuthorities() {
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [enhancedAuthorities, setEnhancedAuthorities] = useState<AuthorityWithSubLocations[]>([]);
  const [groupedData, setGroupedData] = useState<{
    regionalCouncils: (Authority & { settlements: Authority[] })[];
    cities: (Authority & { neighborhoods: Authority[] })[];
    standaloneAuthorities: Authority[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [reSeeding, setReSeeding] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<AuthorityType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat' | 'board'>('flat');
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<PipelineStatus | 'all'>('all');
  const [overdueInstallmentsFilter, setOverdueInstallmentsFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [authorityIdsFilter, setAuthorityIdsFilter] = useState<string[] | null>(null);
  const [expandedCouncils, setExpandedCouncils] = useState<Set<string>>(new Set());
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [loadingSubLocations, setLoadingSubLocations] = useState<Set<string>>(new Set());
  const [subLocationStats, setSubLocationStats] = useState<SubLocationStats>(new Map());

  // Get sub-locations from static data for an authority
  const getSubLocationsFromStatic = useCallback((authorityId: string): SubLocation[] | undefined => {
    const staticLocation = ISRAELI_LOCATIONS.find(loc => loc.id === authorityId);
    return staticLocation?.subLocations;
  }, []);

  // Get users count for an authority/sub-location by authority ID
  const getUsersCountForAuthority = useCallback(async (authorityId: string): Promise<number> => {
    try {
      const usersQuery = query(
        collection(db, USERS_COLLECTION),
        where('core.authorityId', '==', authorityId)
      );
      const snapshot = await getDocs(usersQuery);
      return snapshot.size;
    } catch (error) {
      console.error(`Error fetching users for authority ${authorityId}:`, error);
      return 0;
    }
  }, []);

  // Get parks count for an authority/sub-location
  const getParksCountForAuthority = useCallback(async (authorityId: string): Promise<number> => {
    try {
      const parks = await getParksByAuthority(authorityId);
      return parks.length;
    } catch (error) {
      console.error(`Error fetching parks for authority ${authorityId}:`, error);
      return 0;
    }
  }, []);

  // Load sub-location stats on demand when expanded
  const loadSubLocationStats = useCallback(async (authorityId: string, subLocationIds: string[]) => {
    if (loadingSubLocations.has(authorityId)) return; // Already loading
    
    setLoadingSubLocations(prev => new Set(prev).add(authorityId));
    
    try {
      const statsMap = new Map<string, { parksCount: number; usersCount: number }>();
      
      // Load stats for each sub-location in parallel
      const statsPromises = subLocationIds.map(async (subId) => {
        // For sub-locations, use parent authority ID for parks/users lookup
        const parksCount = await getParksCountForAuthority(authorityId);
        const usersCount = await getUsersCountForAuthority(authorityId);
        
        return { subId, parksCount, usersCount };
      });
      
      const statsResults = await Promise.all(statsPromises);
      statsResults.forEach(({ subId, parksCount, usersCount }) => {
        statsMap.set(`${authorityId}_${subId}`, { parksCount, usersCount });
      });
      
      setSubLocationStats(prev => {
        const newMap = new Map(prev);
        statsMap.forEach((value, key) => newMap.set(key, value));
        return newMap;
      });
    } catch (error) {
      console.error(`Error loading sub-location stats for ${authorityId}:`, error);
    } finally {
      setLoadingSubLocations(prev => {
        const newSet = new Set(prev);
        newSet.delete(authorityId);
        return newSet;
      });
    }
  }, [loadingSubLocations, getParksCountForAuthority, getUsersCountForAuthority]);

  const loadAuthorities = useCallback(async () => {
    try {
      setLoading(true);
      const allData = await getAllAuthorities();
      setAuthorities(allData);
      
      // Enhance authorities with sub-locations from static data
      const enhanced: AuthorityWithSubLocations[] = allData.map(auth => {
        const staticSubLocations = getSubLocationsFromStatic(auth.id);
        return {
          ...auth,
          subLocations: staticSubLocations?.map(sub => ({
            ...sub,
            parksCount: undefined,
            usersCount: undefined,
          })),
        };
      });
      
      // Load aggregated stats for parent authorities
      const enhancedWithStats = await Promise.all(enhanced.map(async (auth) => {
        if (auth.subLocations && auth.subLocations.length > 0) {
          // For parent authorities, aggregate parks and users
          const parksCount = await getParksCountForAuthority(auth.id);
          const usersCount = await getUsersCountForAuthority(auth.id);
          
          return {
            ...auth,
            aggregatedParksCount: parksCount,
            aggregatedUsersCount: usersCount,
          };
        }
        return auth;
      }));
      
      setEnhancedAuthorities(enhancedWithStats);
      
      // Load grouped data for hierarchical view
      const grouped = await getAuthoritiesGrouped();
      setGroupedData(grouped);
    } catch (error) {
      console.error('Error loading authorities:', error);
      alert('שגיאה בטעינת הרשויות');
    } finally {
      setLoading(false);
    }
  }, [getSubLocationsFromStatic, getParksCountForAuthority, getUsersCountForAuthority]);

  useEffect(() => {
    loadAuthorities();
  }, [loadAuthorities]);

  const toggleCouncil = useCallback((councilId: string) => {
    setExpandedCouncils(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(councilId)) {
        newExpanded.delete(councilId);
      } else {
        newExpanded.add(councilId);
      }
      return newExpanded;
    });
  }, []);

  const toggleCity = useCallback(async (cityId: string) => {
    setExpandedCities(prev => {
      const newExpanded = new Set(prev);
      const wasExpanded = newExpanded.has(cityId);
      
      if (wasExpanded) {
        newExpanded.delete(cityId);
      } else {
        newExpanded.add(cityId);
        
        // Load sub-location stats when expanding
        const authority = enhancedAuthorities.find(a => a.id === cityId);
        if (authority?.subLocations && authority.subLocations.length > 0) {
          const subLocationIds = authority.subLocations.map(sub => sub.id);
          loadSubLocationStats(cityId, subLocationIds);
        }
      }
      
      return newExpanded;
    });
  }, [enhancedAuthorities, loadSubLocationStats]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הרשות "${name}"?`)) return;

    try {
      await deleteAuthority(id);
      await loadAuthorities();
    } catch (error) {
      console.error('Error deleting authority:', error);
      alert('שגיאה במחיקת הרשות');
    }
  }, [loadAuthorities]);

  // Get current admin info for audit logging
  const getCurrentAdminInfo = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return null;
    
    try {
      const profile = await getUserFromFirestore(user.uid);
      return {
        adminId: user.uid,
        adminName: profile?.core?.name || user.displayName || 'System Admin',
      };
    } catch (error) {
      return {
        adminId: user.uid,
        adminName: 'System Admin',
      };
    }
  }, []);

  // Toggle active client status
  const handleToggleActiveClient = useCallback(async (id: string, currentValue: boolean) => {
    try {
      const adminInfo = await getCurrentAdminInfo();
      await updateAuthority(
        id,
        { isActiveClient: !currentValue },
        adminInfo || undefined
      );
      await loadAuthorities();
    } catch (error) {
      console.error('Error toggling active client status:', error);
      alert('שגיאה בעדכון סטטוס לקוח פעיל');
    }
  }, [getCurrentAdminInfo, loadAuthorities]);

  const handleInitializeSchema = useCallback(async () => {
    if (!confirm('פעולה זו תיצור מסמך דמה עם כל השדות הנדרשים כדי לאתחל את הסכמה ב-Firebase. האם להמשיך?')) return;

    try {
      setLoading(true);
      const docId = await initializeAuthoritiesSchema();
      alert(`הסכמה אותחלה בהצלחה! מזהה המסמך: ${docId}\n\nניתן למחוק את המסמך הזה עכשיו - השדות כבר מוגדרים ב-Firebase.`);
      await loadAuthorities();
    } catch (error) {
      console.error('Error initializing schema:', error);
      alert('שגיאה באתחול הסכמה');
    } finally {
      setLoading(false);
    }
  }, [loadAuthorities]);

  const handleSeedAuthorities = useCallback(async () => {
    if (!confirm('פעולה זו תיצור רשויות ישראליות עם מבנה היררכי (ערים, מועצות אזוריות, יישובים ושכונות). האם להמשיך?')) return;

    try {
      setSeeding(true);
      const result = await seedIsraeliAuthorities();
      
      let message = `הטעינה הושלמה!\n`;
      message += `✓ נוצרו: ${result.created} רשויות\n`;
      if (result.skipped > 0) {
        message += `⊘ דולגו: ${result.skipped} רשויות (כבר קיימות)\n`;
      }
      if (result.errors > 0) {
        message += `✗ שגיאות: ${result.errors}`;
      }
      
      alert(message);
      
      // Refresh the table to show new authorities
      await loadAuthorities();
    } catch (error) {
      console.error('Error seeding authorities:', error);
      alert('שגיאה בטעינת רשויות אוטומטית');
    } finally {
      setSeeding(false);
    }
  }, [loadAuthorities]);

  const handleReSeedAuthorities = useCallback(async () => {
    if (!confirm('⚠️ אזהרה: פעולה זו תמחק את כל הרשויות הקיימות ותיצור אותן מחדש עם מבנה היררכי תקין.\n\nפעולה זו אינה ניתנת לביטול!\n\nהאם אתה בטוח שברצונך להמשיך?')) return;

    try {
      setReSeeding(true);
      const result = await reSeedIsraeliAuthorities();
      
      let message = `הטעינה מחדש הושלמה!\n`;
      message += `🗑️ נמחקו: ${result.deleted} רשויות\n`;
      message += `✓ נוצרו: ${result.created} רשויות\n`;
      if (result.errors > 0) {
        message += `✗ שגיאות: ${result.errors}\n\n${result.report}`;
      }
      
      alert(message);
      
      // Refresh the table to show new authorities
      await loadAuthorities();
    } catch (error: any) {
      console.error('Error re-seeding authorities:', error);
      alert(`שגיאה בטעינת רשויות מחדש: ${error.message}`);
    } finally {
      setReSeeding(false);
    }
  }, [loadAuthorities]);

  const handleRepairTelAviv = useCallback(async () => {
    if (!confirm('פעולה זו תמצא ותתקן רשויות כפולות של "תל אביב-יפו". אחת תישאר כהורה (עירייה) והשאר יהפכו לשכונות עם parentAuthorityId. האם להמשיך?')) return;

    try {
      setRepairing(true);
      const adminInfo = await getCurrentAdminInfo();
      const result = await repairTelAvivAuthorities(adminInfo || undefined);
      
      const report = formatRepairReport(result);
      alert(report);
      
      // Refresh the table to show repaired authorities
      await loadAuthorities();
    } catch (error) {
      console.error('Error repairing Tel Aviv authorities:', error);
      alert('שגיאה בתיקון רשויות תל אביב');
    } finally {
      setRepairing(false);
    }
  }, [getCurrentAdminInfo, loadAuthorities]);

  // Get cities with sub-locations (from static data)
  const citiesWithSubLocations = useMemo(() => {
    return enhancedAuthorities.filter(a => 
      a.type === 'city' && a.subLocations && a.subLocations.length > 0
    );
  }, [enhancedAuthorities]);

  const matchesOwner = useCallback(
    (authority: Authority) => !ownerFilter || authority.managerIds?.includes(ownerFilter),
    [ownerFilter]
  );

  const matchesPipelineStatus = useCallback(
    (authority: Authority) =>
      pipelineStatusFilter === 'all' ||
      (authority.pipelineStatus || 'lead') === pipelineStatusFilter,
    [pipelineStatusFilter]
  );

  const matchesOverdueInstallmentsFilterFn = useCallback(
    (authority: Authority) =>
      !overdueInstallmentsFilter || hasOverdueInstallments(authority),
    [overdueInstallmentsFilter]
  );

  const matchesAuthorityIdsFilterFn = useCallback(
    (authority: Authority) =>
      !authorityIdsFilter || authorityIdsFilter.length === 0 || authorityIdsFilter.includes(authority.id),
    [authorityIdsFilter]
  );

  // Clear authority IDs filter (used to reset after clicking on forecast)
  const clearAuthorityIdsFilter = useCallback(() => {
    setAuthorityIdsFilter(null);
  }, []);

  // CRITICAL FIX: Filter cities with sub-locations based on type filter and search query
  const filteredCitiesWithSubLocations = useMemo(() => {
    let filtered = citiesWithSubLocations.filter(auth => 
      typeFilter === 'all' || typeFilter === 'city'
    );
    
    // Filter by search query
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(auth => 
        auth.name.toLowerCase().includes(queryLower) ||
        auth.subLocations?.some(sub => sub.name.toLowerCase().includes(queryLower))
      );
    }
    
    // Filter out internal technical records
    filtered = filtered.filter(auth => 
      !auth.id.includes('__SCHEMA_INIT__') && 
      !auth.name.includes('__SCHEMA_INIT__')
    );

    // Filter by owner, pipeline status, overdue installments, and authority IDs
    filtered = filtered.filter(auth => 
      matchesOwner(auth) && matchesPipelineStatus(auth) && matchesOverdueInstallmentsFilterFn(auth) && matchesAuthorityIdsFilterFn(auth)
    );
    
    return filtered;
  }, [citiesWithSubLocations, typeFilter, searchQuery, matchesOwner, matchesPipelineStatus, matchesOverdueInstallmentsFilterFn, matchesAuthorityIdsFilterFn]);

  // Filter authorities based on type filter and search query
  // In flat view, hide neighborhoods/settlements unless searching
  const filteredAuthorities = useMemo(() => {
    let filtered = enhancedAuthorities;
    
    // Filter by type
    if (typeFilter !== 'all') {
      filtered = filtered.filter(a => a.type === typeFilter);
    }
    
    // In flat view: Hide neighborhoods and settlements (with parentAuthorityId) unless searching
    const hasSearchQuery = searchQuery.trim().length > 0;
    if (!hasSearchQuery) {
      // Show only top-level authorities (Cities, Regional Councils, and standalone local councils)
      filtered = filtered.filter(a => !a.parentAuthorityId);
    }
    
    // Filter by search query (name)
    if (hasSearchQuery) {
      const queryLower = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(queryLower) ||
        // Also search in parent name if exists
        (a.parentAuthorityId && enhancedAuthorities.find(p => p.id === a.parentAuthorityId)?.name.toLowerCase().includes(queryLower))
      );
    }
    
    // Filter out internal technical records
    filtered = filtered.filter(a => 
      !a.id.includes('__SCHEMA_INIT__') && 
      !a.name.includes('__SCHEMA_INIT__')
    );

    // Filter by owner, pipeline status, overdue installments, and authority IDs
    filtered = filtered.filter(a => 
      matchesOwner(a) && matchesPipelineStatus(a) && matchesOverdueInstallmentsFilterFn(a) && matchesAuthorityIdsFilterFn(a)
    );
    
    return filtered;
  }, [enhancedAuthorities, typeFilter, searchQuery, matchesOwner, matchesPipelineStatus, matchesOverdueInstallmentsFilterFn, matchesAuthorityIdsFilterFn]);

  const filteredGroupedData = useMemo(() => {
    if (!groupedData) return null;
    
    const queryLower = searchQuery.toLowerCase().trim();
    
    const matchesGroupedFilters = (authority: Authority) =>
      matchesOwner(authority) && matchesPipelineStatus(authority) && matchesOverdueInstallmentsFilterFn(authority) && matchesAuthorityIdsFilterFn(authority);

    return {
      regionalCouncils: groupedData.regionalCouncils
        .filter(council => {
          // Filter out internal technical records
          if (council.id.includes('__SCHEMA_INIT__') || council.name.includes('__SCHEMA_INIT__')) {
            return false;
          }
          
          // Filter by type
          const matchesType = typeFilter === 'all' || council.type === typeFilter || 
                (typeFilter === 'regional_council' && council.type === 'regional_council') ||
                (typeFilter !== 'regional_council' && council.settlements.some(s => s.type === typeFilter));
          
          // Filter by search query
          const matchesSearch = !queryLower || 
                council.name.toLowerCase().includes(queryLower) ||
                council.settlements.some(s => s.name.toLowerCase().includes(queryLower));

          const matchesSelf = matchesGroupedFilters(council) && matchesType && matchesSearch;
          const matchesChildren = council.settlements.some(settlement =>
            (typeFilter === 'all' || settlement.type === typeFilter) &&
            (!queryLower || settlement.name.toLowerCase().includes(queryLower)) &&
            matchesGroupedFilters(settlement)
          );
          
          return matchesSelf || matchesChildren;
        })
        .map(council => ({
          ...council,
          settlements: (typeFilter === 'all' || typeFilter === 'regional_council'
            ? council.settlements
            : council.settlements.filter(s => s.type === typeFilter)
          ).filter(settlement => 
            (!queryLower || settlement.name.toLowerCase().includes(queryLower)) &&
            matchesGroupedFilters(settlement)
          ),
        })),
      cities: (groupedData.cities || [])
        .filter(city => {
          // Filter out internal technical records
          if (city.id.includes('__SCHEMA_INIT__') || city.name.includes('__SCHEMA_INIT__')) {
            return false;
          }
          
          // Filter by type
          const matchesType = typeFilter === 'all' || typeFilter === 'city' || 
                (typeFilter === 'local_council' && city.neighborhoods.some(n => n.type === typeFilter));
          
          // Filter by search query
          const matchesSearch = !queryLower || 
                city.name.toLowerCase().includes(queryLower) ||
                city.neighborhoods.some(n => n.name.toLowerCase().includes(queryLower));

          const matchesSelf = matchesGroupedFilters(city) && matchesType && matchesSearch;
          const matchesChildren = city.neighborhoods.some(neighborhood =>
            (typeFilter === 'all' || neighborhood.type === typeFilter) &&
            (!queryLower || neighborhood.name.toLowerCase().includes(queryLower)) &&
            matchesGroupedFilters(neighborhood)
          );
          
          return matchesSelf || matchesChildren;
        })
        .map(city => ({
          ...city,
          neighborhoods: (typeFilter === 'all' || typeFilter === 'city'
            ? city.neighborhoods
            : city.neighborhoods.filter(n => n.type === typeFilter)
          ).filter(neighborhood => 
            (!queryLower || neighborhood.name.toLowerCase().includes(queryLower)) &&
            matchesGroupedFilters(neighborhood)
          ),
        })),
      standaloneAuthorities: groupedData.standaloneAuthorities
        .filter(a => {
          // Filter out internal technical records
          if (a.id.includes('__SCHEMA_INIT__') || a.name.includes('__SCHEMA_INIT__')) {
            return false;
          }
          
          // Filter out cities that are already shown in cities array
          if (a.type === 'city' && groupedData.cities?.some(c => c.id === a.id)) {
            return false;
          }
          
          // Filter by type
          const matchesType = typeFilter === 'all' || a.type === typeFilter;
          
          // Filter by search query
          const matchesSearch = !queryLower || a.name.toLowerCase().includes(queryLower);
          
          return matchesType && matchesSearch && matchesGroupedFilters(a);
        }),
    };
  }, [groupedData, typeFilter, searchQuery, matchesOwner, matchesPipelineStatus, matchesOverdueInstallmentsFilterFn, matchesAuthorityIdsFilterFn]);

  return {
    // State
    authorities,
    enhancedAuthorities,
    groupedData,
    loading,
    seeding,
    reSeeding,
    repairing,
    typeFilter,
    viewMode,
    expandedCouncils,
    expandedCities,
    loadingSubLocations,
    subLocationStats,
    // Filtered data
    filteredAuthorities,
    filteredCitiesWithSubLocations,
    filteredGroupedData,
    searchQuery,
    ownerFilter,
    pipelineStatusFilter,
    overdueInstallmentsFilter,
    authorityIdsFilter,
    // Actions
    setTypeFilter,
    setViewMode,
    setSearchQuery,
    setOwnerFilter,
    setPipelineStatusFilter,
    setOverdueInstallmentsFilter,
    setAuthorityIdsFilter,
    clearAuthorityIdsFilter,
    toggleCouncil,
    toggleCity,
    handleDelete,
    handleToggleActiveClient,
    handleInitializeSchema,
    handleSeedAuthorities,
    handleReSeedAuthorities,
    handleRepairTelAviv,
    loadAuthorities,
  };
}
