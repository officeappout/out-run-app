'use client';

/**
 * Camera scan capture (enable_equipment_scan_v1): one photo from the camera (native: Capacitor
 * Camera straight to the camera; web: a file input), resized to ≤ SCAN_PHOTO_MAX and re-encoded
 * as JPEG. Re-encoding through a canvas drops every EXIF field (location, device). Also measures
 * the mean brightness, so a dark photo is caught before any upload (ScanEdges board).
 *
 * Nothing here is stored: the base64 goes to /api/scan/equipment and the preview is an object URL
 * the caller revokes.
 */
import { fitWithin, isNativePlatform } from '@/features/social/services/feed-photo';
import { meanLuma } from './scan-brightness';

export const SCAN_PHOTO_MAX = 1024;
const SCAN_JPEG_QUALITY = 0.8;

export interface ScanShot {
  /** base64 JPEG, no data: prefix. */
  base64: string;
  previewUrl: string;
  /** 0..255 mean luma. */
  brightness: number;
}

async function pickNative(): Promise<Blob | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const perms = await Camera.checkPermissions();
  if (perms.camera !== 'granted') {
    const req = await Camera.requestPermissions({ permissions: ['camera'] });
    if (req.camera === 'denied') throw new Error('permission-denied');
  }
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.DataUrl,
    quality: Math.round(SCAN_JPEG_QUALITY * 100),
    width: SCAN_PHOTO_MAX,
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
    input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) resolve(null); }, 600), { once: true });
    input.click();
  });
}

async function encode(raw: Blob): Promise<ScanShot> {
  const bitmap = await createImageBitmap(raw, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, SCAN_PHOTO_MAX);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // A 32×32 sample is plenty for a mean.
  const sample = document.createElement('canvas');
  sample.width = 32;
  sample.height = 32;
  const sctx = sample.getContext('2d');
  sctx?.drawImage(canvas, 0, 0, 32, 32);
  const brightness = sctx ? meanLuma(sctx.getImageData(0, 0, 32, 32).data) : 128;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', SCAN_JPEG_QUALITY));
  if (!blob) throw new Error('encode-failed');
  const dataUrl = canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: URL.createObjectURL(blob), brightness };
}

/** null = the user cancelled. Throws 'permission-denied' when the camera is refused. */
export async function captureScanShot(): Promise<ScanShot | null> {
  try {
    const raw = isNativePlatform() ? await pickNative() : await pickWeb();
    return raw ? await encode(raw) : null;
  } catch (err) {
    if (/cancel/i.test(String((err as { message?: unknown })?.message ?? err ?? ''))) return null;
    throw err;
  }
}
