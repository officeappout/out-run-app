/**
 * Maintenance Reports Service
 * For Authority Managers to view and manage user-reported equipment issues
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
import { MaintenanceReport, MaintenanceStatus } from '@/types/maintenance.types';

const MAINTENANCE_COLLECTION = 'maintenance_reports';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Normalize maintenance report data
 */
function normalizeReport(docId: string, data: any): MaintenanceReport {
  return {
    id: docId,
    parkId: data?.parkId ?? '',
    authorityId: data?.authorityId ?? '',
    equipmentId: data?.equipmentId ?? undefined,
    equipmentName: data?.equipmentName ?? undefined,
    issueType: data?.issueType ?? 'other',
    description: data?.description ?? '',
    reportedBy: data?.reportedBy ?? '',
    status: (data?.status as MaintenanceStatus) ?? 'reported',
    priority: data?.priority ?? 'medium',
    reportedAt: toDate(data?.reportedAt) ?? new Date(),
    resolvedAt: toDate(data?.resolvedAt),
    resolvedBy: data?.resolvedBy ?? undefined,
    notes: data?.notes ?? undefined,
  };
}

/**
 * Get maintenance reports by authority ID
 */
export async function getReportsByAuthority(authorityId: string): Promise<MaintenanceReport[]> {
  try {
    const q = query(
      collection(db, MAINTENANCE_COLLECTION),
      where('authorityId', '==', authorityId),
      orderBy('reportedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizeReport(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching maintenance reports:', error);
    throw error;
  }
}

/**
 * Get maintenance reports by park ID
 */
export async function getReportsByPark(parkId: string): Promise<MaintenanceReport[]> {
  try {
    const q = query(
      collection(db, MAINTENANCE_COLLECTION),
      where('parkId', '==', parkId),
      orderBy('reportedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizeReport(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching maintenance reports by park:', error);
    throw error;
  }
}

/**
 * Get all maintenance reports (for CPO dashboard)
 */
export async function getAllMaintenanceReports(): Promise<MaintenanceReport[]> {
  try {
    const q = query(
      collection(db, MAINTENANCE_COLLECTION),
      orderBy('reportedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizeReport(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching all maintenance reports:', error);
    throw error;
  }
}

/**
 * Update maintenance report status
 */
export async function updateReportStatus(
  reportId: string,
  status: MaintenanceStatus,
  resolvedBy?: string,
  notes?: string
): Promise<void> {
  try {
    const docRef = doc(db, MAINTENANCE_COLLECTION, reportId);
    const updateData: any = {
      status,
    };

    if (status === 'resolved') {
      updateData.resolvedAt = serverTimestamp();
      if (resolvedBy) {
        updateData.resolvedBy = resolvedBy;
      }
    }

    if (notes) {
      updateData.notes = notes;
    }

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating maintenance report:', error);
    throw error;
  }
}
