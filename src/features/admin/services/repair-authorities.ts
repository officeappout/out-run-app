/**
 * Data Repair Script: Fix Duplicate Tel Aviv Authorities
 * 
 * This script finds all authorities named "תל אביב-יפו", keeps one as the parent (type: city),
 * and sets all others as children (type: local_council/neighborhood) with parentAuthorityId.
 * 
 * Usage: Import and call repairTelAvivAuthorities() from an admin page or script runner.
 */

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Authority, AuthorityType } from '@/types/admin-types';
import { logAction } from './audit.service';

const AUTHORITIES_COLLECTION = 'authorities';
const TEL_AVIV_NAME = 'תל אביב-יפו';

interface RepairResult {
  totalFound: number;
  parentKept: string | null;
  childrenUpdated: string[];
  errors: string[];
  skipped: string[];
}

/**
 * Find all authorities with the name "תל אביב-יפו"
 */
async function findTelAvivAuthorities(): Promise<Authority[]> {
  try {
    const q = query(
      collection(db, AUTHORITIES_COLLECTION),
      where('name', '==', TEL_AVIV_NAME)
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data()?.name || '',
      type: (doc.data()?.type as AuthorityType) || 'city',
      parentAuthorityId: doc.data()?.parentAuthorityId || undefined,
      logoUrl: doc.data()?.logoUrl || undefined,
      managerIds: Array.isArray(doc.data()?.managerIds) ? doc.data()?.managerIds : [],
      userCount: typeof doc.data()?.userCount === 'number' ? doc.data()?.userCount : 0,
      status: doc.data()?.status || undefined,
      isActiveClient: typeof doc.data()?.isActiveClient === 'boolean' ? doc.data()?.isActiveClient : false,
      coordinates: doc.data()?.coordinates || undefined,
      createdAt: doc.data()?.createdAt?.toDate?.() || undefined,
      updatedAt: doc.data()?.updatedAt?.toDate?.() || undefined,
    }));
  } catch (error) {
    console.error('Error finding Tel Aviv authorities:', error);
    throw error;
  }
}

/**
 * Repair duplicate Tel Aviv authorities
 * 
 * Strategy:
 * 1. Find all authorities named "תל אביב-יפו"
 * 2. Choose the "best" one as parent (prioritize: has no parentAuthorityId, type is 'city', oldest created date)
 * 3. Convert all others to children (type: 'local_council', set parentAuthorityId)
 */
export async function repairTelAvivAuthorities(
  adminInfo?: { adminId: string; adminName: string }
): Promise<RepairResult> {
  const result: RepairResult = {
    totalFound: 0,
    parentKept: null,
    childrenUpdated: [],
    errors: [],
    skipped: [],
  };

  try {
    // Step 1: Find all Tel Aviv authorities
    const telAvivAuthorities = await findTelAvivAuthorities();
    result.totalFound = telAvivAuthorities.length;

    if (telAvivAuthorities.length === 0) {
      console.log('No Tel Aviv authorities found. Nothing to repair.');
      return result;
    }

    if (telAvivAuthorities.length === 1) {
      // Only one found - check if it's correctly configured
      const auth = telAvivAuthorities[0];
      if (auth.type === 'city' && !auth.parentAuthorityId) {
        console.log('Tel Aviv authority is already correctly configured.');
        result.parentKept = auth.id;
        return result;
      } else {
        // Fix it to be a parent city
        const docRef = doc(db, AUTHORITIES_COLLECTION, auth.id);
        await updateDoc(docRef, {
          type: 'city',
          parentAuthorityId: null,
          updatedAt: serverTimestamp(),
        });
        result.parentKept = auth.id;
        return result;
      }
    }

    // Step 2: Choose the best parent candidate
    // Priority: 1) type is 'city' and no parentAuthorityId, 2) no parentAuthorityId, 3) oldest created date
    let parentCandidate = telAvivAuthorities.find(
      a => a.type === 'city' && !a.parentAuthorityId
    );

    if (!parentCandidate) {
      parentCandidate = telAvivAuthorities.find(a => !a.parentAuthorityId);
    }

    if (!parentCandidate) {
      // All have parentAuthorityId or we couldn't find one - use the first one with oldest date
      parentCandidate = telAvivAuthorities.reduce((oldest, current) => {
        if (!oldest.createdAt) return current;
        if (!current.createdAt) return oldest;
        return current.createdAt < oldest.createdAt ? current : oldest;
      });
    }

    result.parentKept = parentCandidate.id;

    // Step 3: Update parent to ensure it's correct
    if (parentCandidate.type !== 'city' || parentCandidate.parentAuthorityId) {
      try {
        const docRef = doc(db, AUTHORITIES_COLLECTION, parentCandidate.id);
        await updateDoc(docRef, {
          type: 'city',
          parentAuthorityId: null,
          updatedAt: serverTimestamp(),
        });
        
        if (adminInfo) {
          await logAction({
            adminId: adminInfo.adminId,
            adminName: adminInfo.adminName,
            actionType: 'UPDATE',
            targetEntity: 'Authority',
            targetId: parentCandidate.id,
            details: `Repaired Tel Aviv authority: Set as parent city (type: city, parentAuthorityId: null)`,
          });
        }
      } catch (error) {
        result.errors.push(`Failed to update parent ${parentCandidate.id}: ${error}`);
      }
    }

    // Step 4: Convert all others to children (neighborhoods)
    const children = telAvivAuthorities.filter(a => a.id !== parentCandidate.id);
    
    for (const child of children) {
      // Skip if already correctly configured as child
      if (child.parentAuthorityId === parentCandidate.id && child.type === 'local_council') {
        result.skipped.push(child.id);
        continue;
      }

      try {
        const docRef = doc(db, AUTHORITIES_COLLECTION, child.id);
        await updateDoc(docRef, {
          type: 'local_council',
          parentAuthorityId: parentCandidate.id,
          updatedAt: serverTimestamp(),
        });

        result.childrenUpdated.push(child.id);

        if (adminInfo) {
          await logAction({
            adminId: adminInfo.adminId,
            adminName: adminInfo.adminName,
            actionType: 'UPDATE',
            targetEntity: 'Authority',
            targetId: child.id,
            details: `Repaired Tel Aviv authority: Set as child neighborhood (type: local_council, parentAuthorityId: ${parentCandidate.id})`,
          });
        }
      } catch (error) {
        result.errors.push(`Failed to update child ${child.id}: ${error}`);
      }
    }

    console.log('Tel Aviv repair completed:', result);
    return result;

  } catch (error) {
    console.error('Error repairing Tel Aviv authorities:', error);
    result.errors.push(`Fatal error: ${error}`);
    throw error;
  }
}

/**
 * Get repair report as a formatted string
 */
export function formatRepairReport(result: RepairResult): string {
  let report = `\n=== Tel Aviv Authority Repair Report ===\n`;
  report += `Total found: ${result.totalFound}\n`;
  report += `Parent kept: ${result.parentKept || 'None'}\n`;
  report += `Children updated: ${result.childrenUpdated.length}\n`;
  report += `Skipped (already correct): ${result.skipped.length}\n`;
  report += `Errors: ${result.errors.length}\n`;
  
  if (result.childrenUpdated.length > 0) {
    report += `\nUpdated children IDs:\n`;
    result.childrenUpdated.forEach(id => report += `  - ${id}\n`);
  }
  
  if (result.errors.length > 0) {
    report += `\nErrors:\n`;
    result.errors.forEach(error => report += `  - ${error}\n`);
  }
  
  return report;
}