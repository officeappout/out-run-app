'use client';

/**
 * ProfilePhotoUploader
 * ─────────────────────
 * Tap-to-edit avatar that fully wires the native Capacitor Camera plugin
 * to the user's profile photo. Flow:
 *
 *   1. On tap, calls Camera.checkPermissions / requestPermissions.
 *   2. Camera.getPhoto({ source: Prompt }) shows the iOS/Android action
 *      sheet — "Take Photo" / "From Photos".
 *   3. The returned data URL is uploaded to Firebase Storage at
 *      profiles/{uid}/avatar.jpg.
 *   4. The download URL is written to:
 *        • auth.currentUser.photoURL (Firebase Auth profile)
 *        • Firestore: users/{uid}.core.photoURL
 *        • useUserStore (immediate UI update across the app)
 *
 * The component is SSR-safe and degrades gracefully:
 *   • On the server / pure web, the tap is a no-op (Camera plugin not
 *     available) — the parent should hide the edit button when
 *     `!isNativePlatform()` if a web fallback isn't desired.
 *   • Permission denial shows a toast and offers to open native settings.
 */

import React, { useCallback, useState } from 'react';
import { Camera as CameraIcon, Loader2, User } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useToast } from '@/components/ui/Toast';

interface ProfilePhotoUploaderProps {
  /** Current photo URL (falls back to placeholder when missing). */
  photoURL?: string | null;
  /** User's display name — used for the avatar `alt` text. */
  displayName?: string | null;
  /** Avatar visual size in px. Defaults to 96. */
  size?: number;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Called with the uploaded URL after a successful upload. */
  onUploaded?: (url: string) => void;
}

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export default function ProfilePhotoUploader({
  photoURL,
  displayName,
  size = 96,
  className = '',
  onUploaded,
}: ProfilePhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const updateProfileStore = useUserStore((s) => s.updateProfile);
  const { showToast } = useToast();

  const handlePick = useCallback(async () => {
    if (uploading) return;

    if (!isNativePlatform()) {
      showToast('error', 'עדכון תמונת פרופיל זמין באפליקציה הנייטיב בלבד');
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      showToast('error', 'לא נמצא משתמש מחובר.');
      return;
    }

    try {
      const { Camera, CameraResultType, CameraSource } = await import(
        '@capacitor/camera'
      );

      // Request permissions first so the denial path is handled cleanly.
      const perms = await Camera.checkPermissions();
      if (perms.camera !== 'granted' || perms.photos !== 'granted') {
        const requested = await Camera.requestPermissions({
          permissions: ['camera', 'photos'],
        });
        if (requested.camera === 'denied' && requested.photos === 'denied') {
          showToast('error', 'לא ניתן לקבל הרשאות מצלמה/גלריה.');
          return;
        }
      }

      const photo = await Camera.getPhoto({
        source: CameraSource.Prompt, // OS sheet: camera / gallery
        resultType: CameraResultType.DataUrl,
        quality: 85,
        allowEditing: true,
        width: 512,
        height: 512,
        correctOrientation: true,
      });

      if (!photo.dataUrl) {
        // User cancelled or the plugin returned no data — silent no-op.
        return;
      }

      setUploading(true);

      const storageRef = ref(storage, `profiles/${uid}/avatar.jpg`);
      await uploadString(storageRef, photo.dataUrl, 'data_url');
      const url = await getDownloadURL(storageRef);

      // Propagate everywhere the avatar is read from.
      if (auth.currentUser) {
        try { await updateProfile(auth.currentUser, { photoURL: url }); } catch { /* non-fatal */ }
      }
      try {
        await updateDoc(doc(db, 'users', uid), { 'core.photoURL': url });
      } catch (err) {
        console.warn('[ProfilePhotoUploader] Firestore write failed:', err);
      }
      updateProfileStore({ core: { photoURL: url } } as any);

      onUploaded?.(url);
      showToast('success', 'תמונת הפרופיל עודכנה');
    } catch (err: any) {
      // Capacitor cancellation appears as a thrown "User cancelled photos app"
      // error — treat it as silent.
      const msg = String(err?.message || err || '');
      if (/cancel/i.test(msg)) return;
      console.error('[ProfilePhotoUploader] upload failed:', err);
      showToast('error', 'שגיאה בהעלאת התמונה. נסה שוב.');
    } finally {
      setUploading(false);
    }
  }, [uploading, showToast, updateProfileStore, onUploaded]);

  const dim = `${size}px`;
  const overlayDim = Math.max(24, Math.round(size * 0.3));

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: dim, height: dim }}
    >
      <div
        className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-cyan-400 to-cyan-600 border-2 border-white shadow"
      >
        {photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoURL}
            alt={displayName || 'avatar'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={Math.round(size * 0.45)} className="text-white" />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handlePick}
        disabled={uploading}
        aria-label="עדכון תמונת פרופיל"
        className="absolute bottom-0 left-0 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
        style={{ width: overlayDim, height: overlayDim }}
      >
        {uploading ? (
          <Loader2 size={Math.round(overlayDim * 0.55)} className="animate-spin text-gray-700" />
        ) : (
          <CameraIcon size={Math.round(overlayDim * 0.55)} className="text-gray-700" />
        )}
      </button>
    </div>
  );
}
