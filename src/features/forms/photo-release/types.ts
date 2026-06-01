/**
 * Shared types for the public Photo Release (אישור צילום) feature.
 *
 * The form is submitted by unauthenticated parents from
 * `/public/forms/photo-release` and stored in the top-level Firestore
 * collection `photo_release_submissions`. Admins review submissions and
 * download a stamped PDF from the admin dashboard.
 */

/** Top-level Firestore collection name. */
export const PHOTO_RELEASE_COLLECTION = 'photo_release_submissions';

/**
 * The raw payload persisted by the public form. Runtime-agnostic — the
 * `createdAt` timestamp is left as `unknown` because it is a Firestore client
 * `Timestamp` on the browser and an Admin SDK `Timestamp` on the server.
 */
export interface PhotoReleaseSubmissionData {
  studentName: string;
  school: string;
  studentClass: string;
  parentName: string;
  /** NOT collected by the public form anymore — kept optional for legacy docs. */
  parentId?: string;
  /** Base64 PNG data URL of the signature canvas. */
  signatureData: string;
  consentAccepted?: boolean;
  consentText?: string;
  formType?: string;
  status?: string;
  submittedAtClient?: string;
}

/** A submission as read on the client (admin table), including the doc id. */
export interface PhotoReleaseSubmission extends PhotoReleaseSubmissionData {
  id: string;
  /** Firestore Timestamp — narrowed via `toDate()` at the call site. */
  createdAt?: { toDate: () => Date } | null;
}
