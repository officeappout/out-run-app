/**
 * Edit Requests Service
 * Handles edit request creation, approval, and rejection for Authority Managers
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logAction } from './audit.service';
import { updatePark } from './parks.service';

const EDIT_REQUESTS_COLLECTION = 'edit_requests';

export type EditRequestStatus = 'pending' | 'approved' | 'rejected';

export type EditRequestEntityType = 'park' | 'route';

export interface EditRequest {
  id: string;
  entityType: EditRequestEntityType;
  entityId: string;
  entityName: string; // For display purposes
  originalData: any; // Original document data
  newData: any; // Proposed changes
  requestedBy: string; // User ID
  requestedByName?: string; // User name for display
  requestedByEmail?: string; // User email for display
  authorityId?: string; // Authority ID (for filtering)
  status: EditRequestStatus;
  reviewedBy?: string; // Admin ID who reviewed
  reviewedByName?: string; // Admin name who reviewed
  reviewNote?: string; // Optional note from reviewer
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date;
}

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Normalize edit request data
 */
function normalizeEditRequest(docId: string, data: any): EditRequest {
  return {
    id: docId,
    entityType: data?.entityType || 'park',
    entityId: data?.entityId || '',
    entityName: data?.entityName || '',
    originalData: data?.originalData || {},
    newData: data?.newData || {},
    requestedBy: data?.requestedBy || '',
    requestedByName: data?.requestedByName,
    requestedByEmail: data?.requestedByEmail,
    authorityId: data?.authorityId,
    status: (data?.status as EditRequestStatus) || 'pending',
    reviewedBy: data?.reviewedBy,
    reviewedByName: data?.reviewedByName,
    reviewNote: data?.reviewNote,
    createdAt: toDate(data?.createdAt) || new Date(),
    updatedAt: toDate(data?.updatedAt) || new Date(),
    reviewedAt: toDate(data?.reviewedAt),
  };
}

/**
 * Create an edit request (for Authority Managers)
 */
export async function createEditRequest(params: {
  entityType: EditRequestEntityType;
  entityId: string;
  entityName: string;
  originalData: any;
  newData: any;
  requestedBy: string;
  requestedByName?: string;
  requestedByEmail?: string;
  authorityId?: string;
}): Promise<string> {
  try {
    const requestData = {
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      originalData: params.originalData,
      newData: params.newData,
      requestedBy: params.requestedBy,
      requestedByName: params.requestedByName,
      requestedByEmail: params.requestedByEmail,
      authorityId: params.authorityId || null,
      status: 'pending' as EditRequestStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, EDIT_REQUESTS_COLLECTION), requestData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating edit request:', error);
    throw error;
  }
}

/**
 * Get all edit requests (for Super Admin)
 */
export async function getAllEditRequests(
  status?: EditRequestStatus
): Promise<EditRequest[]> {
  try {
    let q;
    if (status) {
      q = query(
        collection(db, EDIT_REQUESTS_COLLECTION),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, EDIT_REQUESTS_COLLECTION),
        orderBy('createdAt', 'desc')
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizeEditRequest(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching edit requests:', error);
    throw error;
  }
}

/**
 * Get edit requests by authority ID (for filtering)
 */
export async function getEditRequestsByAuthority(
  authorityId: string,
  status?: EditRequestStatus
): Promise<EditRequest[]> {
  try {
    let q;
    if (status) {
      q = query(
        collection(db, EDIT_REQUESTS_COLLECTION),
        where('authorityId', '==', authorityId),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, EDIT_REQUESTS_COLLECTION),
        where('authorityId', '==', authorityId),
        orderBy('createdAt', 'desc')
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizeEditRequest(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching edit requests by authority:', error);
    throw error;
  }
}

/**
 * Get a single edit request by ID
 */
export async function getEditRequest(requestId: string): Promise<EditRequest | null> {
  try {
    const docRef = doc(db, EDIT_REQUESTS_COLLECTION, requestId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return normalizeEditRequest(docSnap.id, docSnap.data());
  } catch (error) {
    console.error('Error fetching edit request:', error);
    throw error;
  }
}

/**
 * Approve an edit request
 * Updates the main document and marks the request as approved
 */
export async function approveEditRequest(
  requestId: string,
  adminInfo: { adminId: string; adminName: string },
  reviewNote?: string
): Promise<void> {
  try {
    const request = await getEditRequest(requestId);

    if (!request) {
      throw new Error('Edit request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Edit request is not pending');
    }

    // Update the main document based on entity type
    if (request.entityType === 'park') {
      // Update park using parks service
      await updatePark(
        request.entityId,
        request.newData,
        adminInfo
      );
    } else if (request.entityType === 'route') {
      // Update route (would need routes service)
      // For now, we'll update directly
      const routeRef = doc(db, 'official_routes', request.entityId);
      await updateDoc(routeRef, {
        ...request.newData,
        updatedAt: serverTimestamp(),
      });

      // Log audit action
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Route',
        targetId: request.entityId,
        details: `Approved edit request for route: ${request.entityName}`,
      });
    }

    // Mark request as approved
    const requestRef = doc(db, EDIT_REQUESTS_COLLECTION, requestId);
    await updateDoc(requestRef, {
      status: 'approved' as EditRequestStatus,
      reviewedBy: adminInfo.adminId,
      reviewedByName: adminInfo.adminName,
      reviewNote: reviewNote || null,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Log audit action
    await logAction({
      adminId: adminInfo.adminId,
      adminName: adminInfo.adminName,
      actionType: 'APPROVE',
      targetEntity: 'EditRequest',
      targetId: requestId,
      details: `Approved edit request for ${request.entityType}: ${request.entityName}`,
    });
  } catch (error) {
    console.error('Error approving edit request:', error);
    throw error;
  }
}

/**
 * Reject an edit request
 */
export async function rejectEditRequest(
  requestId: string,
  adminInfo: { adminId: string; adminName: string },
  reviewNote?: string
): Promise<void> {
  try {
    const request = await getEditRequest(requestId);

    if (!request) {
      throw new Error('Edit request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Edit request is not pending');
    }

    // Mark request as rejected
    const requestRef = doc(db, EDIT_REQUESTS_COLLECTION, requestId);
    await updateDoc(requestRef, {
      status: 'rejected' as EditRequestStatus,
      reviewedBy: adminInfo.adminId,
      reviewedByName: adminInfo.adminName,
      reviewNote: reviewNote || null,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Log audit action
    await logAction({
      adminId: adminInfo.adminId,
      adminName: adminInfo.adminName,
      actionType: 'REJECT',
      targetEntity: 'EditRequest',
      targetId: requestId,
      details: `Rejected edit request for ${request.entityType}: ${request.entityName}${reviewNote ? ` - ${reviewNote}` : ''}`,
    });
  } catch (error) {
    console.error('Error rejecting edit request:', error);
    throw error;
  }
}
