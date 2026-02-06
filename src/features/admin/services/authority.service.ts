/**
 * Firestore Service for Managing Authorities (Cities/Regions)
 * Enhanced with CRM capabilities: contacts, pipeline status, activity log, tasks
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
  Timestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  Authority, 
  AuthorityType, 
  AuthorityContact, 
  ActivityLogEntry, 
  AuthorityTask,
  AuthorityFinancials,
  Installment,
  PipelineStatus,
  TaskStatus,
  URGENT_PIPELINE_STATUSES,
  hasOverdueTasks
} from '@/types/admin-types';
import { logAction } from './audit.service';

/**
 * Convert Date to Firestore-safe format (ISO string for nested objects)
 * Firestore handles Date objects in top-level fields but nested arrays need special care
 */
function toFirestoreDate(date: Date | undefined | null): string | null {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString();
  return null;
}

/**
 * Serialize contact for Firestore storage
 */
function serializeContact(contact: AuthorityContact): Record<string, any> {
  return {
    id: contact.id,
    name: contact.name || '',
    role: contact.role || 'other',
    phone: contact.phone || null,
    email: contact.email || null,
    isPrimary: contact.isPrimary || false,
    notes: contact.notes || null,
    createdAt: toFirestoreDate(contact.createdAt),
  };
}

/**
 * Serialize activity log entry for Firestore storage
 */
function serializeActivityEntry(entry: ActivityLogEntry): Record<string, any> {
  return {
    id: entry.id,
    content: entry.content || '',
    createdAt: toFirestoreDate(entry.createdAt),
    createdBy: entry.createdBy || null,
    createdByName: entry.createdByName || null,
  };
}

/**
 * Serialize task for Firestore storage
 */
function serializeTask(task: AuthorityTask): Record<string, any> {
  return {
    id: task.id,
    title: task.title || '',
    description: task.description || null,
    status: task.status || 'pending',
    dueDate: toFirestoreDate(task.dueDate),
    assignedTo: task.assignedTo || null,
    assignedToName: task.assignedToName || null,
    createdAt: toFirestoreDate(task.createdAt),
    completedAt: toFirestoreDate(task.completedAt),
  };
}

/**
 * Serialize installment for Firestore storage
 */
function serializeInstallment(installment: Installment): Record<string, any> {
  return {
    id: installment.id,
    amount: installment.amount || 0,
    targetMonth: installment.targetMonth || '',
    status: installment.status || 'pending',
  };
}

/**
 * Serialize financials for Firestore storage
 */
function serializeFinancials(financials: AuthorityFinancials): Record<string, any> {
  return {
    totalQuoteAmount: financials.totalQuoteAmount || 0,
    installments: (financials.installments || []).map(serializeInstallment),
  };
}

const AUTHORITIES_COLLECTION = 'authorities';

/**
 * Convert Firestore timestamp or ISO string to Date
 */
function toDate(timestamp: Timestamp | Date | string | undefined | null): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (typeof timestamp === 'object' && 'toDate' in timestamp) return timestamp.toDate();
  return undefined;
}

/**
 * Sanitize authority name - ensure it's always a string
 */
function sanitizeAuthorityName(name: any): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  if (typeof name === 'object' && name !== null) {
    // If it's a LocalizedText object, extract Hebrew first, then English
    return name.he || name.en || name.es || String(name);
  }
  return String(name);
}

/**
 * Normalize contact data from Firestore
 */
function normalizeContact(data: any): AuthorityContact {
  return {
    id: data?.id || crypto.randomUUID(),
    name: data?.name || '',
    role: data?.role || 'other',
    phone: data?.phone || undefined,
    email: data?.email || undefined,
    isPrimary: data?.isPrimary || false,
    notes: data?.notes || undefined,
    createdAt: toDate(data?.createdAt),
  };
}

/**
 * Normalize activity log entry from Firestore
 */
function normalizeActivityEntry(data: any): ActivityLogEntry {
  return {
    id: data?.id || crypto.randomUUID(),
    content: data?.content || '',
    createdAt: toDate(data?.createdAt) || new Date(),
    createdBy: data?.createdBy || undefined,
    createdByName: data?.createdByName || undefined,
  };
}

/**
 * Normalize task data from Firestore
 */
function normalizeTask(data: any): AuthorityTask {
  return {
    id: data?.id || crypto.randomUUID(),
    title: data?.title || '',
    description: data?.description || undefined,
    status: data?.status || 'pending',
    dueDate: toDate(data?.dueDate),
    assignedTo: data?.assignedTo || undefined,
    assignedToName: data?.assignedToName || undefined,
    createdAt: toDate(data?.createdAt) || new Date(),
    completedAt: toDate(data?.completedAt),
  };
}

/**
 * Normalize installment data from Firestore
 */
function normalizeInstallment(data: any): Installment {
  return {
    id: data?.id || crypto.randomUUID(),
    amount: typeof data?.amount === 'number' ? data.amount : 0,
    targetMonth: data?.targetMonth || '',
    status: data?.status === 'paid' ? 'paid' : 'pending',
  };
}

/**
 * Normalize financials data from Firestore
 */
function normalizeFinancials(data: any): AuthorityFinancials | undefined {
  if (!data) return undefined;
  return {
    totalQuoteAmount: typeof data.totalQuoteAmount === 'number' ? data.totalQuoteAmount : 0,
    installments: Array.isArray(data.installments) ? data.installments.map(normalizeInstallment) : [],
  };
}

/**
 * Normalize authority data from Firestore
 */
function normalizeAuthority(docId: string, data: any): Authority {
  // CRITICAL: Sanitize name to prevent Error #31
  const sanitizedName = sanitizeAuthorityName(data?.name);
  
  return {
    id: docId,
    name: sanitizedName,
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
    // CRM Fields
    contacts: Array.isArray(data?.contacts) ? data.contacts.map(normalizeContact) : [],
    pipelineStatus: data?.pipelineStatus || 'lead',
    activityLog: Array.isArray(data?.activityLog) ? data.activityLog.map(normalizeActivityEntry) : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks.map(normalizeTask) : [],
    financials: normalizeFinancials(data?.financials),
    createdAt: toDate(data?.createdAt),
    updatedAt: toDate(data?.updatedAt),
  };
}

/**
 * Sort authorities by urgency (urgent pipeline statuses + overdue tasks first)
 */
export function sortAuthoritiesByUrgency(authorities: Authority[]): Authority[] {
  return [...authorities].sort((a, b) => {
    // 1. Check for overdue tasks (highest priority)
    const aHasOverdue = hasOverdueTasks(a);
    const bHasOverdue = hasOverdueTasks(b);
    if (aHasOverdue && !bHasOverdue) return -1;
    if (!aHasOverdue && bHasOverdue) return 1;
    
    // 2. Check for urgent pipeline statuses
    const aIsUrgent = URGENT_PIPELINE_STATUSES.includes(a.pipelineStatus || 'lead');
    const bIsUrgent = URGENT_PIPELINE_STATUSES.includes(b.pipelineStatus || 'lead');
    if (aIsUrgent && !bIsUrgent) return -1;
    if (!aIsUrgent && bIsUrgent) return 1;
    
    // 3. Fall back to alphabetical by name
    return a.name.localeCompare(b.name, 'he');
  });
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
    const authorities = snapshot.docs
      .filter(doc => !doc.id.includes('__SCHEMA_INIT__') && doc.data()?.name !== '__SCHEMA_INIT__')
      .map(doc => normalizeAuthority(doc.id, doc.data()));
    
    // Return sorted by urgency
    return sortAuthoritiesByUrgency(authorities);
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
      // CRM Fields
      contacts: data.contacts || [],
      pipelineStatus: data.pipelineStatus || 'lead',
      activityLog: data.activityLog || [],
      tasks: data.tasks || [],
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
  console.log('[Authority] updateAuthority called:', { authorityId, data, adminInfo });
  
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
    // CRM Fields - serialize nested objects for Firestore
    if (data.contacts !== undefined) {
      updateData.contacts = data.contacts.map(serializeContact);
      details += `: contacts updated`;
    }
    if (data.pipelineStatus !== undefined) {
      updateData.pipelineStatus = data.pipelineStatus;
      details += `: pipeline status changed to "${data.pipelineStatus}"`;
    }
    if (data.activityLog !== undefined) {
      updateData.activityLog = data.activityLog.map(serializeActivityEntry);
      details += `: activity log updated`;
    }
    if (data.tasks !== undefined) {
      updateData.tasks = data.tasks.map(serializeTask);
      details += `: tasks updated`;
    }
    if (data.financials !== undefined) {
      updateData.financials = serializeFinancials(data.financials);
      details += `: financials updated`;
    }
    
    console.log('[Authority] Saving to Firestore:', updateData);
    await updateDoc(docRef, updateData);
    console.log('[Authority] Update successful');
    
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
 * Update pipeline status for an authority
 */
export async function updatePipelineStatus(
  authorityId: string,
  status: PipelineStatus,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  return updateAuthority(authorityId, { pipelineStatus: status }, adminInfo);
}

/**
 * Add a contact to an authority
 */
export async function addContact(
  authorityId: string,
  contact: Omit<AuthorityContact, 'id' | 'createdAt'>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const newContact: AuthorityContact = {
    ...contact,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };
  
  // If this is the first contact or marked as primary, ensure only one primary
  const updatedContacts = [...(authority.contacts || [])];
  if (newContact.isPrimary) {
    updatedContacts.forEach(c => c.isPrimary = false);
  }
  updatedContacts.push(newContact);
  
  await updateAuthority(authorityId, { contacts: updatedContacts }, adminInfo);
  return newContact.id;
}

/**
 * Update a contact in an authority
 */
export async function updateContact(
  authorityId: string,
  contactId: string,
  updates: Partial<Omit<AuthorityContact, 'id' | 'createdAt'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const updatedContacts = (authority.contacts || []).map(c => {
    if (c.id === contactId) {
      // If setting this as primary, unset others
      if (updates.isPrimary) {
        return { ...c, ...updates };
      }
      return { ...c, ...updates };
    }
    // If another contact is being set as primary, unset this one
    if (updates.isPrimary) {
      return { ...c, isPrimary: false };
    }
    return c;
  });
  
  await updateAuthority(authorityId, { contacts: updatedContacts }, adminInfo);
}

/**
 * Delete a contact from an authority
 */
export async function deleteContact(
  authorityId: string,
  contactId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const updatedContacts = (authority.contacts || []).filter(c => c.id !== contactId);
  await updateAuthority(authorityId, { contacts: updatedContacts }, adminInfo);
}

/**
 * Add an activity log entry
 */
export async function addActivityLogEntry(
  authorityId: string,
  content: string,
  adminInfo: { adminId: string; adminName: string }
): Promise<string> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const newEntry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    content,
    createdAt: new Date(),
    createdBy: adminInfo.adminId,
    createdByName: adminInfo.adminName,
  };
  
  const updatedLog = [newEntry, ...(authority.activityLog || [])]; // New entries at top
  await updateAuthority(authorityId, { activityLog: updatedLog }, adminInfo);
  return newEntry.id;
}

/**
 * Add a task to an authority
 */
export async function addTask(
  authorityId: string,
  task: Omit<AuthorityTask, 'id' | 'createdAt' | 'completedAt'>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const newTask: AuthorityTask = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };
  
  const updatedTasks = [...(authority.tasks || []), newTask];
  await updateAuthority(authorityId, { tasks: updatedTasks }, adminInfo);
  return newTask.id;
}

/**
 * Update a task in an authority
 */
export async function updateTask(
  authorityId: string,
  taskId: string,
  updates: Partial<Omit<AuthorityTask, 'id' | 'createdAt'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const updatedTasks = (authority.tasks || []).map(t => {
    if (t.id === taskId) {
      const updated = { ...t, ...updates };
      // If marking as done, set completedAt
      if (updates.status === 'done' && !t.completedAt) {
        updated.completedAt = new Date();
      }
      return updated;
    }
    return t;
  });
  
  await updateAuthority(authorityId, { tasks: updatedTasks }, adminInfo);
}

/**
 * Delete a task from an authority
 */
export async function deleteTask(
  authorityId: string,
  taskId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const updatedTasks = (authority.tasks || []).filter(t => t.id !== taskId);
  await updateAuthority(authorityId, { tasks: updatedTasks }, adminInfo);
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
        // CRITICAL: Use sanitized name for logging (name is already sanitized in normalizeAuthority)
        const authorityName = allAuthorities[0].name;
        console.log('[getAuthoritiesByManager] Super Admin detected - returning first authority:', authorityName);
        console.log('[getAuthoritiesByManager] DEBUG: Authority name type:', typeof authorityName, authorityName);
        return [allAuthorities[0]]; // Return first authority
      }
      // Fallback: return all if no top-level found
      const all = await getAllAuthorities();
      if (all.length > 0) {
        // CRITICAL: Use sanitized name for logging
        const authorityName = all[0].name;
        console.log('[getAuthoritiesByManager] Super Admin - returning first from all:', authorityName);
        console.log('[getAuthoritiesByManager] DEBUG: Authority name type:', typeof authorityName, authorityName);
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
    
    const authorities = snapshot.docs.map(doc => normalizeAuthority(doc.id, doc.data()));
    return sortAuthoritiesByUrgency(authorities);
  } catch (error) {
    console.error('Error fetching authorities by manager:', error);
    throw error;
  }
}

/**
 * Placeholder function for future email integration
 * Will be connected to a notification service (e.g., SendGrid, Firebase Functions)
 */
export async function sendTaskReminderEmail(
  authorityId: string,
  taskId: string,
  recipientEmail: string
): Promise<{ success: boolean; message: string }> {
  // TODO: Integrate with email service (SendGrid, Firebase Functions, etc.)
  console.log(`[Placeholder] Would send task reminder for task ${taskId} to ${recipientEmail}`);
  
  return {
    success: true,
    message: 'Email reminder scheduled (placeholder - not yet implemented)',
  };
}

/**
 * Get all overdue tasks across all authorities (for dashboard/alerts)
 */
export async function getAllOverdueTasks(): Promise<Array<{ authority: Authority; task: AuthorityTask }>> {
  const authorities = await getAllAuthorities();
  const now = new Date();
  const overdueTasks: Array<{ authority: Authority; task: AuthorityTask }> = [];
  
  for (const authority of authorities) {
    if (authority.tasks) {
      for (const task of authority.tasks) {
        if (
          task.status !== 'done' && 
          task.status !== 'cancelled' && 
          task.dueDate && 
          new Date(task.dueDate) < now
        ) {
          overdueTasks.push({ authority, task });
        }
      }
    }
  }
  
  // Sort by due date (oldest first)
  return overdueTasks.sort((a, b) => {
    const dateA = a.task.dueDate ? new Date(a.task.dueDate).getTime() : 0;
    const dateB = b.task.dueDate ? new Date(b.task.dueDate).getTime() : 0;
    return dateA - dateB;
  });
}

/**
 * Update financials for an authority
 */
export async function updateFinancials(
  authorityId: string,
  financials: AuthorityFinancials,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  console.log('[Authority] updateFinancials called:', { authorityId, financials, adminInfo });
  return updateAuthority(authorityId, { financials }, adminInfo);
}

/**
 * Add an installment to an authority
 */
export async function addInstallment(
  authorityId: string,
  installment: Omit<Installment, 'id'>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  console.log('[Authority] addInstallment called:', { authorityId, installment, adminInfo });
  
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const newInstallment: Installment = {
    ...installment,
    id: crypto.randomUUID(),
  };
  
  const currentFinancials = authority.financials || { totalQuoteAmount: 0, installments: [] };
  const updatedFinancials: AuthorityFinancials = {
    ...currentFinancials,
    installments: [...currentFinancials.installments, newInstallment],
  };
  
  console.log('[Authority] Saving updated financials:', updatedFinancials);
  await updateAuthority(authorityId, { financials: updatedFinancials }, adminInfo);
  console.log('[Authority] Installment saved with ID:', newInstallment.id);
  return newInstallment.id;
}

/**
 * Update an installment in an authority
 */
export async function updateInstallment(
  authorityId: string,
  installmentId: string,
  updates: Partial<Omit<Installment, 'id'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const currentFinancials = authority.financials || { totalQuoteAmount: 0, installments: [] };
  const updatedInstallments = currentFinancials.installments.map(inst => 
    inst.id === installmentId ? { ...inst, ...updates } : inst
  );
  
  const updatedFinancials: AuthorityFinancials = {
    ...currentFinancials,
    installments: updatedInstallments,
  };
  
  await updateAuthority(authorityId, { financials: updatedFinancials }, adminInfo);
}

/**
 * Delete an installment from an authority
 */
export async function deleteInstallment(
  authorityId: string,
  installmentId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  const authority = await getAuthority(authorityId);
  if (!authority) throw new Error('Authority not found');
  
  const currentFinancials = authority.financials || { totalQuoteAmount: 0, installments: [] };
  const updatedInstallments = currentFinancials.installments.filter(inst => inst.id !== installmentId);
  
  const updatedFinancials: AuthorityFinancials = {
    ...currentFinancials,
    installments: updatedInstallments,
  };
  
  await updateAuthority(authorityId, { financials: updatedFinancials }, adminInfo);
}

/**
 * Get monthly revenue forecast from all pending installments
 */
export async function getMonthlyRevenueForecast(): Promise<Map<string, number>> {
  const authorities = await getAllAuthorities();
  const forecast = new Map<string, number>();
  
  for (const authority of authorities) {
    if (authority.financials?.installments) {
      for (const inst of authority.financials.installments) {
        if (inst.status === 'pending' && inst.targetMonth) {
          const current = forecast.get(inst.targetMonth) || 0;
          forecast.set(inst.targetMonth, current + inst.amount);
        }
      }
    }
  }
  
  // Sort by month
  return new Map([...forecast.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}
