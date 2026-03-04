/**
 * Firestore service for Running Admin: PaceMapConfig, RunWorkoutTemplate, RunProgramTemplate.
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type {
  PaceMapConfig,
  RunWorkoutTemplate,
  RunProgramTemplate,
} from '../types/running.types';
import { DEFAULT_PACE_MAP_CONFIG } from '../config/pace-map-config';

const CONFIG_COLLECTION = 'config';
const PACE_MAP_CONFIG_ID = 'paceMapConfig';
const WORKOUT_TEMPLATES_COLLECTION = 'runWorkoutTemplates';
const PROGRAM_TEMPLATES_COLLECTION = 'runProgramTemplates';

// ── PaceMapConfig ─────────────────────────────────────────────────────

export async function getPaceMapConfig(): Promise<PaceMapConfig> {
  const ref = doc(db, CONFIG_COLLECTION, PACE_MAP_CONFIG_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as PaceMapConfig;
  }
  return DEFAULT_PACE_MAP_CONFIG;
}

export async function savePaceMapConfig(config: PaceMapConfig): Promise<boolean> {
  try {
    const ref = doc(db, CONFIG_COLLECTION, PACE_MAP_CONFIG_ID);
    const uid = auth.currentUser?.uid ?? 'system';
    await setDoc(ref, {
      ...config,
      lastUpdatedBy: uid,
      version: (config.version ?? 1) + 1,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[RunningAdmin] savePaceMapConfig:', err);
    return false;
  }
}

// ── RunWorkoutTemplate ───────────────────────────────────────────────

export async function getRunWorkoutTemplates(): Promise<RunWorkoutTemplate[]> {
  const ref = collection(db, WORKOUT_TEMPLATES_COLLECTION);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RunWorkoutTemplate));
}

export async function getRunWorkoutTemplate(id: string): Promise<RunWorkoutTemplate | null> {
  const ref = doc(db, WORKOUT_TEMPLATES_COLLECTION, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as RunWorkoutTemplate;
  }
  return null;
}

export async function createRunWorkoutTemplate(
  template: Omit<RunWorkoutTemplate, 'id'>,
): Promise<string | null> {
  try {
    const ref = doc(collection(db, WORKOUT_TEMPLATES_COLLECTION));
    await setDoc(ref, {
      ...template,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[RunningAdmin] createRunWorkoutTemplate:', err);
    return null;
  }
}

export async function updateRunWorkoutTemplate(
  id: string,
  template: Partial<RunWorkoutTemplate>,
): Promise<boolean> {
  try {
    const ref = doc(db, WORKOUT_TEMPLATES_COLLECTION, id);
    await updateDoc(ref, {
      ...template,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[RunningAdmin] updateRunWorkoutTemplate:', err);
    return false;
  }
}

export async function deleteRunWorkoutTemplate(id: string): Promise<boolean> {
  try {
    const ref = doc(db, WORKOUT_TEMPLATES_COLLECTION, id);
    await deleteDoc(ref);
    return true;
  } catch (err) {
    console.error('[RunningAdmin] deleteRunWorkoutTemplate:', err);
    return false;
  }
}

// ── RunProgramTemplate ───────────────────────────────────────────────

export async function getRunProgramTemplates(): Promise<RunProgramTemplate[]> {
  const ref = collection(db, PROGRAM_TEMPLATES_COLLECTION);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RunProgramTemplate));
}

export async function getRunProgramTemplate(id: string): Promise<RunProgramTemplate | null> {
  const ref = doc(db, PROGRAM_TEMPLATES_COLLECTION, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as RunProgramTemplate;
  }
  return null;
}

export async function createRunProgramTemplate(
  template: Omit<RunProgramTemplate, 'id'>,
): Promise<string | null> {
  try {
    const ref = doc(collection(db, PROGRAM_TEMPLATES_COLLECTION));
    await setDoc(ref, {
      ...template,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[RunningAdmin] createRunProgramTemplate:', err);
    return null;
  }
}

export async function updateRunProgramTemplate(
  id: string,
  template: Partial<RunProgramTemplate>,
): Promise<boolean> {
  try {
    const ref = doc(db, PROGRAM_TEMPLATES_COLLECTION, id);
    await updateDoc(ref, {
      ...template,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[RunningAdmin] updateRunProgramTemplate:', err);
    return false;
  }
}

export async function deleteRunProgramTemplate(id: string): Promise<boolean> {
  try {
    const ref = doc(db, PROGRAM_TEMPLATES_COLLECTION, id);
    await deleteDoc(ref);
    return true;
  } catch (err) {
    console.error('[RunningAdmin] deleteRunProgramTemplate:', err);
    return false;
  }
}
