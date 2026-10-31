/**
 * Edit a published workout post (board PostFeed "עריכה", PostPhotoFeed): the author changes the
 * caption and adds, replaces or removes the photo. One updateDoc on the author's own post (the
 * existing author-only update rule); a replaced or removed photo is deleted from Storage after.
 */
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MAX_CAPTION } from './feed-post-details';
import { deleteFeedPhoto, uploadFeedPhoto } from './feed-photo';

export type PhotoEdit = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; blob: Blob };

export interface FeedPostEdit {
  caption: string;
  photo: PhotoEdit;
}

export interface FeedPostEditResult {
  caption?: string;
  photoUrl?: string;
  photoPath?: string;
}

export async function saveFeedPostEdit(
  postId: string,
  uid: string,
  current: { photoPath?: string },
  edit: FeedPostEdit,
): Promise<FeedPostEditResult> {
  const caption = edit.caption.trim().slice(0, MAX_CAPTION);
  const patch: Record<string, unknown> = { caption: caption || deleteField() };
  const result: FeedPostEditResult = caption ? { caption } : {};
  if (edit.photo.kind === 'replace') {
    const up = await uploadFeedPhoto(uid, edit.photo.blob);
    patch.photoUrl = up.url;
    patch.photoPath = up.path;
    result.photoUrl = up.url;
    result.photoPath = up.path;
  } else if (edit.photo.kind === 'remove') {
    patch.photoUrl = deleteField();
    patch.photoPath = deleteField();
  }
  await updateDoc(doc(db, 'feed_posts', postId), patch);
  if (edit.photo.kind !== 'keep') void deleteFeedPhoto(current.photoPath);
  return result;
}
