/**
 * Firestore Service for Managing Authorities (Cities/Regions)
 */
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  where,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Authority, AuthorityType } from '@/types/admin-types';
import { logAction } from './audit.service';

const AUTHORITIES_COLLECTION = 'authorities';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Normalize authority data from Firestore
 */
function normalizeAuthority(docId: string, data: any): Authority {
  return {
    id: docId,
    name: data?.name ?? '',
    type: (data?.type === 'city' || 
           data?.type === 'regional_council' || 
           data?.type === 'local_council' ||
           data?.type === 'neighborhood' ||
           data?.type === 'settlement') 
      ? data.type 
      : 'city', // Default to 'city' for backward compatibility (only for unknown types)
    parentAuthorityId: data?.parentAuthorityId || undefined,
    logoUrl: data?.logoUrl ?? undefined,
    managerIds: Array.isArray(data?.managerIds) ? data.managerIds : [],
    userCount: typeof data?.userCount === 'number' ? data.userCount : 0,
    status: data?.status === 'active' || data?.status === 'inactive' ? data.status : undefined,
    isActiveClient: typeof data?.isActiveClient === 'boolean' ? data.isActiveClient : false,
    coordinates: data?.coordinates && typeof data.coordinates === 'object' 
      ? { lat: data.coordinates.lat, lng: data.coordinates.lng }
      : undefined,
    createdAt: toDate(data?.createdAt),
    updatedAt: toDate(data?.updatedAt),
  };
}

/**
 * Get all authorities (sorted by name)
 * Filters out internal technical records like __SCHEMA_INIT__
 * 
 * @param type - Optional filter by authority type
 * @param topLevelOnly - If true, only return authorities with parentAuthorityId == null
 */
export async function getAllAuthorities(type?: AuthorityType, topLevelOnly: boolean = false): Promise<Authority[]> {
  try {
    let q;
    const constraints: any[] = [];
    
    // Filter by type if provided
    if (type) {
      constraints.push(where('type', '==', type));
    }
    
    // Filter by top-level only if requested
    if (topLevelOnly) {
      constraints.push(where('parentAuthorityId', '==', null));
    }
    
    // Always order by name
    constraints.push(orderBy('name', 'asc'));
    
    q = query(collection(db, AUTHORITIES_COLLECTION), ...constraints);
    
    const snapshot = await getDocs(q);
    
    // Filter out internal technical records
    return snapshot.docs
      .filter(doc => !doc.id.includes('__SCHEMA_INIT__') && doc.data()?.name !== '__SCHEMA_INIT__')
      .map(doc => normalizeAuthority(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching authorities:', error);
    throw error;
  }
}

/**
 * Get all Regional Councils (type: 'regional_council')
 */
export async function getRegionalCouncils(): Promise<Authority[]> {
  return getAllAuthorities('regional_council');
}

/**
 * Get all children authorities by parent ID (neighborhoods, settlements)
 */
export async function getChildrenByParent(parentAuthorityId: string): Promise<Authority[]> {
  try {
    const q = query(
      collection(db, AUTHORITIES_COLLECTION),
      where('parentAuthorityId', '==', parentAuthorityId),
      orderBy('name', 'asc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs
      .filter(doc => !doc.id.includes('__SCHEMA_INIT__') && doc.data()?.name !== '__SCHEMA_INIT__')
      .map(doc => normalizeAuthority(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching children authorities:', error);
    throw error;
  }
}

/**
 * Get settlements (local_councils) by parent Regional Council
 * @deprecated Use getChildrenByParent instead
 */
export async function getSettlementsByRegionalCouncil(regionalCouncilId: string): Promise<Authority[]> {
  return getChildrenByParent(regionalCouncilId);
}

/**
 * Get all authorities grouped by Regional Councils and Cities (for hierarchical display)
 * Only Cities and Regional Councils appear as top-level items.
 * All Neighborhoods and Settlements must have parentAuthorityId pointing to their parent.
 */
export async function getAuthoritiesGrouped(): Promise<{
  regionalCouncils: (Authority & { settlements: Authority[] })[];
  cities: (Authority & { neighborhoods: Authority[] })[];
  standaloneAuthorities: Authority[]; // Local councils without parent (only top-level ones)
}> {
  try {
    const allAuthorities = await getAllAuthorities();
    
    // Top-level: Only Cities and Regional Councils (no parentAuthorityId)
    const cities = allAuthorities.filter(a => 
      a.type === 'city' && !a.parentAuthorityId
    );
    const regionalCouncils = allAuthorities.filter(a => 
      a.type === 'regional_council' && !a.parentAuthorityId
    );
    
    // Children: All authorities with parentAuthorityId (neighborhoods and settlements)
    const children = allAuthorities.filter(a => a.parentAuthorityId);
    
    // Group neighborhoods under their parent City
    const citiesWithNeighborhoods = cities.map(city => ({
      ...city,
      neighborhoods: children.filter(child => 
        child.parentAuthorityId === city.id
      ),
    }));
    
    // Group settlements under their parent Regional Council
    const groupedCouncils = regionalCouncils.map(council => ({
      ...council,
      settlements: children.filter(child => 
        child.parentAuthorityId === council.id
      ),
    }));
    
    // Standalone authorities: Only local_councils without parent (should be rare)
    const standalone = allAuthorities.filter(a => 
      a.type === 'local_council' && !a.parentAuthorityId
    );
    
    return {
      regionalCouncils: groupedCouncils,
      cities: citiesWithNeighborhoods,
      standaloneAuthorities: standalone,
    };
  } catch (error) {
    console.error('Error grouping authorities:', error);
    throw error;
  }
}

/**
 * Get a single authority by ID
 */
export async function getAuthority(authorityId: string): Promise<Authority | null> {
  try {
    // Null/undefined check for authorityId before using it
    if (!authorityId || typeof authorityId !== 'string' || authorityId.trim() === '') {
      console.warn('getAuthority: Invalid authorityId provided:', authorityId);
      return null;
    }
    
    const docRef = doc(db, AUTHORITIES_COLLECTION, authorityId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    const data = docSnap.data();
    if (!data) return null; // Null-check before processing
    
    return normalizeAuthority(docSnap.id, data);
  } catch (error) {
    console.error('Error fetching authority:', error);
    throw error;
  }
}

/**
 * Create a new authority
 */
export async function createAuthority(data: Omit<Authority, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, AUTHORITIES_COLLECTION), {
      name: data.name ?? '',
      type: data.type || 'city', // Default to 'city' if not specified
      parentAuthorityId: data.parentAuthorityId || null,
      logoUrl: data.logoUrl ?? null,
      managerIds: Array.isArray(data.managerIds) ? data.managerIds : [],
      userCount: typeof data.userCount === 'number' ? data.userCount : 0,
      status: data.status === 'active' || data.status === 'inactive' ? data.status : undefined,
      isActiveClient: typeof data.isActiveClient === 'boolean' ? data.isActiveClient : false,
      coordinates: data.coordinates && typeof data.coordinates === 'object' && 
        typeof data.coordinates.lat === 'number' && typeof data.coordinates.lng === 'number'
        ? { lat: data.coordinates.lat, lng: data.coordinates.lng }
        : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating authority:', error);
    throw error;
  }
}

/**
 * Update an authority
 */
export async function updateAuthority(
  authorityId: string, 
  data: Partial<Omit<Authority, 'id' | 'createdAt' | 'updatedAt'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const docRef = doc(db, AUTHORITIES_COLLECTION, authorityId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };
    
    let details = 'Updated authority';
    const authority = await getAuthority(authorityId);
    const authorityName = authority?.name || authorityId;
    
    if (data.name !== undefined) {
      updateData.name = data.name;
      details += `: name changed to "${data.name}"`;
    }
    if (data.type !== undefined) {
      updateData.type = data.type;
      details += `: type changed to "${data.type}"`;
    }
    if (data.parentAuthorityId !== undefined) {
      updateData.parentAuthorityId = data.parentAuthorityId || null;
      if (data.parentAuthorityId) {
        const parent = await getAuthority(data.parentAuthorityId);
        details += `: parent set to "${parent?.name || data.parentAuthorityId}"`;
      } else {
        details += `: parent removed`;
      }
    }
    if (data.logoUrl !== undefined) {
      updateData.logoUrl = data.logoUrl || null;
      details += data.logoUrl ? ': logo updated' : ': logo removed';
    }
    if (data.managerIds !== undefined) {
      updateData.managerIds = data.managerIds;
      const added = data.managerIds.length - (authority?.managerIds?.length || 0);
      if (added > 0) {
        details += `: ${added} manager(s) added`;
      } else if (added < 0) {
        details += `: ${Math.abs(added)} manager(s) removed`;
      }
    }
    if (data.userCount !== undefined) {
      updateData.userCount = data.userCount;
    }
    if (data.isActiveClient !== undefined) {
      updateData.isActiveClient = data.isActiveClient;
      details += `: isActiveClient changed to ${data.isActiveClient}`;
    }
    
    await updateDoc(docRef, updateData);
    
    // Log audit action
    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Authority',
        targetId: authorityId,
        details: `${details} - ${authorityName}`,
      });
    }
  } catch (error) {
    console.error('Error updating authority:', error);
    throw error;
  }
}

/**
 * Delete an authority
 */
export async function deleteAuthority(authorityId: string): Promise<void> {
  try {
    const docRef = doc(db, AUTHORITIES_COLLECTION, authorityId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting authority:', error);
    throw error;
  }
}

/**
 * Get authorities by manager ID
 * For Super Admins: Returns the first authority in the database (for testing purposes)
 * For Authority Managers: Returns only authorities where user is in managerIds
 */
export async function getAuthoritiesByManager(managerId: string): Promise<Authority[]> {
  try {
    // Check if user is Super Admin
    let isSuperAdmin = false;
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const userProfile = await getUserFromFirestore(managerId);
      if (userProfile?.core) {
        isSuperAdmin = (userProfile.core as any)?.isSuperAdmin === true;
      }
    } catch (error) {
      console.error('Error checking super admin status:', error);
    }

    // If Super Admin, return first authority for testing
    if (isSuperAdmin) {
      const allAuthorities = await getAllAuthorities(undefined, true); // Top-level only
      if (allAuthorities.length > 0) {
        console.log('[getAuthoritiesByManager] Super Admin detected - returning first authority:', allAuthorities[0].name);
        return [allAuthorities[0]]; // Return first authority
      }
      // Fallback: return all if no top-level found
      const all = await getAllAuthorities();
      if (all.length > 0) {
        console.log('[getAuthoritiesByManager] Super Admin - returning first from all:', all[0].name);
        return [all[0]];
      }
      return [];
    }

    // Regular Authority Manager: filter by managerIds
    const q = query(
      collection(db, AUTHORITIES_COLLECTION),
      where('managerIds', 'array-contains', managerId)
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => normalizeAuthority(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching authorities by manager:', error);
    throw error;
  }
}
