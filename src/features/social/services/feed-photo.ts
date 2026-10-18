/**
 * One photo on a feed post (home v2). Same pick + upload pattern as the park
 * contribution wizard (Step3Photo.tsx): Capacitor Camera with the OS
 * "camera / gallery" prompt on native, a plain <input type=file> on the web;
 * resized client-side to ≤ FEED_PHOTO_MAX px, JPEG FEED_PHOTO_QUALITY.
 *
 * Storage path: feed-photos/{uid}/{timestamp}.jpg (owner-scoped, like
 * contribution-photos/{uid}/…). NOTE: storage.rules has no match for this
 * path yet — until it's added every upload is denied (storage/unauthorized)
 * and createWorkoutPost publishes the post without the photo.
 *
 * No automatic face processing: blurring minors is a policy decision, not
 * done here.
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export const FEED_PHOTO_MAX = 1600;
export const FEED_PHOTO_QUALITY = 0.8;

export interface PickedPhoto {
  blob: Blob;
  /** Object URL for previews — revoke with URL.revokeObjectURL when done. */
  previewUrl: string;
}

/** Target size that fits inside max×max, never upscaled. Pure. */
export function fitWithin(width: number, height: number, max = FEED_PHOTO_MAX): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Decode → resize → JPEG. Falls back to the original blob on any failure. */
export async function compressPhoto(input: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return input;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', FEED_PHOTO_QUALITY));
    return out ?? input;
  } catch (err) {
    console.warn('[feed-photo] resize failed, keeping the original:', err);
    return input;
  }
}

async function pickNative(): Promise<Blob | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const perms = await Camera.checkPermissions();
  if (perms.camera !== 'granted' || perms.photos !== 'granted') {
    const req = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    if (req.camera === 'denied' && req.photos === 'denied') throw new Error('permission-denied');
  }
  const photo = await Camera.getPhoto({
    source: CameraSource.Prompt,
    resultType: CameraResultType.DataUrl,
    quality: Math.round(FEED_PHOTO_QUALITY * 100),
    width: FEED_PHOTO_MAX,
    correctOrientation: true,
  });
  if (!photo.dataUrl) return null;
  return (await fetch(photo.dataUrl)).blob();
}

function pickWeb(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // A cancelled picker never fires change on some browsers — resolves
    // null the next time the window regains focus without a file.
    window.addEventListener(
      'focus',
      () => setTimeout(() => { if (!input.files?.length) resolve(null); }, 600),
      { once: true },
    );
    input.click();
  });
}

/** Camera / gallery → a compressed JPEG + a preview URL. null = cancelled. */
export async function pickFeedPhoto(): Promise<PickedPhoto | null> {
  try {
    const raw = isNativePlatform() ? await pickNative() : await pickWeb();
    if (!raw) return null;
    const blob = await compressPhoto(raw);
    return { blob, previewUrl: URL.createObjectURL(blob) };
  } catch (err) {
    const msg = String((err as { message?: unknown })?.message ?? err ?? '');
    if (/cancel/i.test(msg)) return null;
    throw err;
  }
}

export function feedPhotoPath(uid: string, now = Date.now()): string {
  return `feed-photos/${uid}/${now}.jpg`;
}

export async function uploadFeedPhoto(uid: string, blob: Blob): Promise<{ url: string; path: string }> {
  const path = feedPhotoPath(uid);
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return { url: await getDownloadURL(r), path };
}

/** Best-effort — the post is already gone; an orphan is logged, not thrown. */
export async function deleteFeedPhoto(path: string | undefined | null): Promise<void> {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if ((err as { code?: string })?.code === 'storage/object-not-found') return;
    console.warn('[feed-photo] delete failed for', path, err);
  }
}
