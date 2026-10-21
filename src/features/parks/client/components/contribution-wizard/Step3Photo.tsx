'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera as CameraIcon, Upload, Loader2, Image as ImageIcon, Trash2, MapPin, Tag, Dumbbell, CircleCheck, type LucideIcon } from 'lucide-react';
import { useWizardV2, V2_LABEL, V2BackButton, V2PrimaryButton } from './wizard-v2';
import type { ParkFacilityCategory } from '@/features/parks/core/types/park.types';
import { ref, uploadBytes, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useToast } from '@/components/ui/Toast';
import { getGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import type { WizardData } from './index';
import { currentUiGender } from '@/hooks/useUiGender';
import { pickGendered } from '@/lib/i18n/gender-copy';

interface Props {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

/** v2 summary shows the facility's Hebrew name instead of its raw id. */
const FACILITY_V2_LABELS: Record<ParkFacilityCategory, string> = {
  gym_park: 'גינת כושר',
  court: 'מגרש ספורט',
  route: 'מסלול',
  zen_spot: 'פינת גוף-נפש',
  urban_spot: 'אורבן / אקסטרים',
  nature_community: 'טבע וקהילה',
};

const MAX_UPLOAD_DIMENSION = 1600;
const UPLOAD_JPEG_QUALITY = 0.85;
// Capacitor Camera's own `quality` option is 0-100, not the 0-1 scale
// canvas.toBlob uses — keep both resize paths at the same effective
// compression instead of accidentally shipping a heavier native capture.
const CAMERA_JPEG_QUALITY = 85;

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Client-side resize/re-encode before upload (SPEC-05 image-memory #4) — a
 * camera photo can be 12MP+ (~48MB decoded in memory at full resolution,
 * regardless of stored file size), and nothing downstream (no client
 * resize, no server-side function — verified, no `sharp` anywhere in
 * functions/) ever shrinks it once it lands in Storage. This is the one
 * item in this batch that prevents the problem rather than papering over
 * an already-oversized image.
 *
 * `imageOrientation: 'from-image'` bakes in the EXIF rotation at decode
 * time — required here because canvas.toBlob's output carries no EXIF tag
 * of its own, so without this a portrait phone photo would silently come
 * out sideways after resize (a worse regression than the blur this is
 * meant to avoid). Falls back to the original file untouched on any
 * failure (older WebView, decode error) rather than blocking the upload —
 * resize is an optimization, not a requirement for the contribution to
 * succeed.
 *
 * Only reached on the web fallback path now — native goes through
 * Capacitor Camera's own `width`/`quality` options instead (resized before
 * the oversized bitmap ever exists in JS memory, which is strictly better
 * than resizing after the fact).
 */
async function resizeImageForUpload(file: File): Promise<File | Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY),
    );
    return blob ?? file;
  } catch (err) {
    console.warn('[Step3Photo] Client-side resize failed, uploading original file:', err);
    return file;
  }
}

/**
 * Best-effort delete of an orphaned upload at `path`. We swallow
 * `storage/object-not-found` (object already gone — common when the user
 * trashes a photo whose upload errored) and log everything else; the UI
 * state must always be cleared regardless so the user is not stuck with
 * a stale preview if Storage is temporarily unreachable.
 */
async function deleteStorageObject(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (err: any) {
    if (err?.code === 'storage/object-not-found') return;
    console.warn('[Step3Photo] deleteObject failed for', path, err);
  }
}

export default function Step3Photo({ data, updateData, onBack, onSubmit, submitting }: Props) {
  const v2 = useWizardV2();
  const { profile } = useUserStore();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(data.photoUrl);
  const [equipmentNames, setEquipmentNames] = useState<string[]>([]);

  // Resolve the selected gymEquipment ids to display names for the summary
  // below — the wizard only ever stores ids, so this is the same
  // id→name lookup ApprovalDetailModal/ParkDetailSheet already do. The
  // summary previously said nothing about equipment at all; this is a new
  // line, not a count-to-names conversion of an existing one.
  useEffect(() => {
    if (!data.gymEquipment || data.gymEquipment.length === 0) {
      setEquipmentNames([]);
      return;
    }
    let cancelled = false;
    Promise.all(data.gymEquipment.map((g) => getGymEquipment(g.equipmentId).catch(() => null)))
      .then((items) => {
        if (!cancelled) setEquipmentNames(items.filter((x): x is NonNullable<typeof x> => x !== null).map((x) => x.name));
      });
    return () => { cancelled = true; };
  }, [data.gymEquipment]);

  const replacePreviousUpload = useCallback(async () => {
    const previousPath = data.photoStoragePath;
    if (previousPath) await deleteStorageObject(previousPath);
  }, [data.photoStoragePath]);

  /**
   * Native path — Capacitor Camera plugin, CameraSource.Prompt shows the
   * OS action sheet ("Take Photo" / "From Photos"), same pattern already
   * proven in ProfilePhotoUploader.tsx. Replaces the plain
   * `<input type="file" capture="environment">` this step used to render,
   * which on a Capacitor WebView forces the camera directly and never
   * offers the gallery — the exact bug this fixes.
   *
   * `width: 1600` (no `height`, no `allowEditing`) resizes proportionally
   * without cropping — a park photo should keep its natural aspect ratio,
   * unlike the square avatar crop ProfilePhotoUploader wants.
   */
  const handleCameraPick = useCallback(async () => {
    if (!profile?.id) return;

    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

      const perms = await Camera.checkPermissions();
      if (perms.camera !== 'granted' || perms.photos !== 'granted') {
        const requested = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
        if (requested.camera === 'denied' && requested.photos === 'denied') {
          showToast('error', 'לא ניתן לקבל הרשאות מצלמה/גלריה.');
          return;
        }
      }

      const photo = await Camera.getPhoto({
        source: CameraSource.Prompt,
        resultType: CameraResultType.DataUrl,
        quality: CAMERA_JPEG_QUALITY,
        width: MAX_UPLOAD_DIMENSION,
        correctOrientation: true,
      });

      if (!photo.dataUrl) return; // user cancelled

      setPreview(photo.dataUrl);
      setUploading(true);

      await replacePreviousUpload();

      const path = `contribution-photos/${profile.id}/${Date.now()}.jpg`;
      const storageRef = ref(storage, path);
      await uploadString(storageRef, photo.dataUrl, 'data_url');
      const url = await getDownloadURL(storageRef);
      updateData({ photoUrl: url, photoStoragePath: path });
      setPreview(url);
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/cancel/i.test(msg)) return; // Capacitor cancellation — silent, same as ProfilePhotoUploader
      console.error('[Step3Photo] Camera capture failed:', err);
      showToast('error', pickGendered(currentUiGender(), { male: 'שגיאה בהעלאת התמונה. נסה שוב.', female: 'שגיאה בהעלאת התמונה. נסי שוב.', other: 'שגיאה בהעלאת התמונה. נסו שוב.' }));
      setPreview(data.photoUrl);
      updateData({ photoUrl: null, photoStoragePath: null });
    } finally {
      setUploading(false);
    }
  }, [profile?.id, showToast, replacePreviousUpload, updateData, data.photoUrl]);

  /** Web fallback only — plain file input, no `capture` attribute so the
   *  browser's normal picker (camera + gallery) is offered. */
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);

    try {
      await replacePreviousUpload();

      const uploadPayload = await resizeImageForUpload(file);
      const path = `contribution-photos/${profile.id}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, uploadPayload);
      const url = await getDownloadURL(storageRef);
      updateData({ photoUrl: url, photoStoragePath: path });
      setPreview(url);
    } catch (err) {
      console.error('[Step3Photo] Upload failed:', err);
      setPreview(null);
      updateData({ photoUrl: null, photoStoragePath: null });
    } finally {
      setUploading(false);
    }
  }, [profile?.id, updateData, replacePreviousUpload]);

  const handlePick = useCallback(() => {
    if (isNativePlatform()) {
      handleCameraPick();
    } else {
      fileInputRef.current?.click();
    }
  }, [handleCameraPick]);

  const handleRemove = useCallback(async () => {
    const pathToDelete = data.photoStoragePath;

    // Delete the Storage object FIRST so the orphan never exists; only
    // then clear the UI / wizard state. This is the bug-fix called out
    // in Phase 6.1: previously the UI was cleared first and the Storage
    // object was leaked forever.
    if (pathToDelete) {
      await deleteStorageObject(pathToDelete);
    }

    setPreview(null);
    updateData({ photoUrl: null, photoStoragePath: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [data.photoStoragePath, updateData]);

  if (v2) {
    const summary: { Icon: LucideIcon; text: string }[] = [
      { Icon: MapPin, text: data.parkName || 'ללא שם' },
      ...(data.facilityType ? [{ Icon: Tag, text: FACILITY_V2_LABELS[data.facilityType] ?? data.facilityType }] : []),
      ...(equipmentNames.length > 0 ? [{ Icon: Dumbbell, text: `מתקנים: ${equipmentNames.join(', ')}` }] : []),
      ...(data.featureTags.length > 0 ? [{ Icon: CircleCheck, text: `${data.featureTags.length} תכונות` }] : []),
      ...(data.photoUrl ? [{ Icon: CameraIcon, text: 'תמונה צורפה' }] : []),
    ];
    return (
      <div className="flex h-full flex-col px-4 pb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <p className={V2_LABEL}>תמונה (לא חובה)</p>

        {/* Preview or upload area */}
        {preview ? (
          <div className="relative mb-4 overflow-hidden rounded-[20px] shadow-v2-ring">
            <img src={preview} alt="תצוגה מקדימה" className="h-52 w-full object-cover" />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 size={28} className="animate-spin text-v2-accent" />
              </div>
            )}
            <button
              type="button"
              onClick={handleRemove}
              aria-label="הסרת תמונה"
              className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-v2-down shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <Trash2 size={17} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handlePick}
            className="mb-4 flex h-52 flex-col items-center justify-center gap-3 rounded-[20px] bg-v2-surface ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.98]"
          >
            <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring">
              <CameraIcon size={24} strokeWidth={2.4} />
            </div>
            <div className="text-center">
              <p className="whitespace-nowrap text-[15px] font-extrabold text-v2-ink">צלמו או בחרו תמונה</p>
              <p className="mt-1 text-[12px] font-bold text-v2-muted">JPG, PNG עד 10MB</p>
            </div>
          </button>
        )}

        {/* Submit summary */}
        <div className="mb-4 rounded-[20px] bg-white p-4 shadow-v2-ring">
          <p className="mb-2.5 text-[13px] font-extrabold text-v2-deep">סיכום</p>
          <div className="space-y-2">
            {summary.map(({ Icon, text }, i) => (
              <p key={i} className="flex items-start gap-2 text-[14px] font-bold text-v2-ink-2">
                <Icon size={16} strokeWidth={2.4} className="mt-0.5 flex-shrink-0 text-v2-muted" />
                <span className="min-w-0">{text}</span>
              </p>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-3">
          <V2BackButton onClick={onBack} />
          <V2PrimaryButton onClick={onSubmit} disabled={submitting || uploading} loading={submitting} arrow={false}>
            {submitting ? 'שולח...' : 'שלח לאישור'}
          </V2PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-4 pb-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <p className="text-slate-500 text-xs font-bold mb-3">תמונה (לא חובה)</p>

      {/* Preview or upload area */}
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden mb-4 border border-slate-200">
          <img src={preview} alt="תצוגה מקדימה" className="w-full h-52 object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 size={28} className="text-[#00E5FF] animate-spin" />
            </div>
          )}
          <button
            onClick={handleRemove}
            className="absolute top-3 left-3 p-2 rounded-full bg-red-500/80 text-white active:scale-90 transition-transform"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={handlePick}
          className="flex flex-col items-center justify-center gap-3 h-52 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 mb-4 active:bg-slate-100 transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <CameraIcon size={24} className="text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-slate-500 text-sm font-medium">צלמו או בחרו תמונה</p>
            <p className="text-slate-400 text-[11px] mt-1">JPG, PNG עד 10MB</p>
          </div>
        </button>
      )}

      {/* Submit summary */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
        <p className="text-slate-400 text-[11px] font-bold mb-2">סיכום:</p>
        <div className="space-y-1 text-slate-600 text-xs">
          <p>📍 {data.parkName || 'ללא שם'}</p>
          {data.facilityType && <p>🏷️ {data.facilityType}</p>}
          {equipmentNames.length > 0 && (
            <p>🏋️ מתקנים: {equipmentNames.join(', ')}</p>
          )}
          {data.featureTags.length > 0 && (
            <p>✅ {data.featureTags.length} תכונות</p>
          )}
          {data.photoUrl && <p>📸 תמונה צורפה</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-auto">
        <button
          onClick={onBack}
          className="px-6 py-3.5 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-[0.98]"
        >
          חזרה
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || uploading}
          className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            submitting || uploading
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-[#00E5FF] text-slate-900 active:scale-[0.97] shadow-lg shadow-cyan-500/25'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              שולח...
            </>
          ) : (
            'שלח לאישור 🚀'
          )}
        </button>
      </div>
    </div>
  );
}
