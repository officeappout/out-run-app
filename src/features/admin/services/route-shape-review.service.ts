/**
 * route-shape-review.service.ts — writes the ✅/❓/❌ training decision for
 * the shape-review screen. Deliberately separate from moderation.service.ts's
 * approveEntity/rejectEntity — those publish/reject the route for real (the
 * production approval workflow); this writes ONLY `shapeTrainingReview`,
 * additive, single field, never touches `published`/`status`. A route can
 * be labeled here without being published or rejected from the queue at all
 * — this is training-data capture, not a moderation action.
 *
 * Direct client write (same pattern as approveEntity/rejectEntity — no API
 * route needed; official_routes' Firestore rule already allows isAdmin()
 * writes, confirmed before building this, not assumed).
 */
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ShapeReviewDecision = 'approved' | 'maybe' | 'rejected';

export interface ShapeReviewSubmission {
  decision: ShapeReviewDecision;
  reasonChips: string[];
  reasonFreeText: string | null;
}

export async function submitShapeReviewDecision(
  routeId: string,
  submission: ShapeReviewSubmission,
  admin: { adminId: string; adminName: string },
): Promise<void> {
  await updateDoc(doc(db, 'official_routes', routeId), {
    shapeTrainingReview: {
      decision: submission.decision,
      reasonChips: submission.reasonChips,
      reasonFreeText: submission.reasonFreeText || null,
      decidedAt: serverTimestamp(),
      decidedByUid: admin.adminId,
      decidedByName: admin.adminName,
    },
    updatedAt: serverTimestamp(),
  });
}
