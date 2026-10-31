'use client';

/**
 * Camera scan, park mapping: what is uploaded on submit, and only then. A photo with people in it
 * is never uploaded (owner 31.10: recognize from it, never save it): the cover is the first
 * people-free shot, or none; each unknown object gets a crop of its box from
 * its shot, for the admin's "מתקן חדש להוסיף לקטלוג" queue. Same owner-scoped folder and rule as
 * the wizard's photo step (contribution-photos/{uid}/…).
 */
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import type { ScanBox } from '@/lib/ai/scan/scan-types';
import type { ParkShot } from './useParkScan';

const CROP_PAD = 0.06;
const CROP_MAX = 640;

async function uploadJpeg(uid: string, base64: string, tag: string): Promise<{ url: string; path: string }> {
  const path = `contribution-photos/${uid}/${Date.now()}_${tag}.jpg`;
  const r = ref(storage, path);
  await uploadString(r, base64, 'base64', { contentType: 'image/jpeg' });
  return { url: await getDownloadURL(r), path };
}

async function cropBase64(base64: string, box: ScanBox): Promise<string | null> {
  try {
    const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const x = Math.max(0, box.x - CROP_PAD) * bmp.width;
    const y = Math.max(0, box.y - CROP_PAD) * bmp.height;
    const w = Math.min(1, box.w + 2 * CROP_PAD) * bmp.width;
    const h = Math.min(1, box.h + 2 * CROP_PAD) * bmp.height;
    const scale = Math.min(1, CROP_MAX / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d')?.drawImage(bmp, x, y, w, h, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const url = canvas.toDataURL('image/jpeg', 0.85);
    return url.slice(url.indexOf(',') + 1);
  } catch {
    return null;
  }
}

/** The shot used as the cover: the first without people, or none. */
export function coverShot(shots: readonly ParkShot[]): ParkShot | null {
  return shots.find((s) => !s.result.hasPeople) ?? null;
}

export async function uploadCover(uid: string, shots: readonly ParkShot[]): Promise<{ url: string; path: string } | null> {
  const first = coverShot(shots);
  if (!first) return null;
  try {
    return await uploadJpeg(uid, first.base64, 'scan');
  } catch (err) {
    console.warn('[scan-upload] cover upload failed', err);
    return null;
  }
}

/** Never throws: an unknown item without a photo is still worth sending. */
export async function uploadUnknownCrops(
  uid: string,
  shots: readonly ParkShot[],
  unknown: ReadonlyArray<{ description: string; shot: number; box?: ScanBox }>,
): Promise<Array<{ description: string; photoUrl?: string }>> {
  const out: Array<{ description: string; photoUrl?: string }> = [];
  for (const u of unknown) {
    const shot = shots[u.shot];
    // A photo with people is never uploaded, so its unknown object goes without a crop.
    const src = shot && !shot.result.hasPeople ? shot.base64 : undefined;
    let photoUrl: string | undefined;
    if (src) {
      const crop = u.box ? await cropBase64(src, u.box) : src;
      if (crop) photoUrl = await uploadJpeg(uid, crop, 'unknown').then((r) => r.url).catch(() => undefined);
    }
    out.push({ description: u.description, ...(photoUrl ? { photoUrl } : {}) });
  }
  return out;
}
