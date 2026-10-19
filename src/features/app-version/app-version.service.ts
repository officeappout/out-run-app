/**
 * Force update — Firestore read (shell, any user) and write (admin panel).
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseAppVersionConfig } from './app-version.logic';
import { APP_VERSION_DOC, type AppVersionConfig } from './app-version.types';

const ref = () => doc(db, APP_VERSION_DOC.collection, APP_VERSION_DOC.id);

/** Never throws — a failed read means "don't block" (defaults). */
export async function loadAppVersionConfig(): Promise<AppVersionConfig> {
  try {
    const snap = await getDoc(ref());
    return parseAppVersionConfig(snap.exists() ? snap.data() : null);
  } catch {
    return parseAppVersionConfig(null);
  }
}

export async function saveAppVersionConfig(config: AppVersionConfig, updatedBy: string | null): Promise<void> {
  await setDoc(ref(), { ...config, updatedAt: serverTimestamp(), updatedBy: updatedBy ?? null });
}
