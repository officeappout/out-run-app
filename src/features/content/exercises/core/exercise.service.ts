/**
 * Firestore Service for Managing Exercises
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exercise, ExerciseFormData, getLocalizedText, LocalizedText } from './exercise.types';
import { logAction } from '@/features/admin/services/audit.service';

const EXERCISES_COLLECTION = 'exercises';

/**
 * Sanitize localized text object - ensure no undefined values, use empty strings instead
 */
function sanitizeLocalizedText(text: LocalizedText | undefined): LocalizedText {
  if (!text) {
    return { he: '', en: '', es: '' };
  }
  return {
    he: text.he ?? '',
    en: text.en ?? '',
    es: text.es ?? '',
  };
}

/**
 * Sanitize exercise form data before sending to Firestore
 * Removes undefined values and ensures localized fields use empty strings
 */
function sanitizeExerciseData(data: ExerciseFormData | Partial<ExerciseFormData>): any {
  const sanitized: any = {};

  // Sanitize name
  if (data.name !== undefined) {
    sanitized.name = sanitizeLocalizedText(data.name);
  }

  // Sanitize content object
  if (data.content !== undefined) {
    sanitized.content = {};
    if (data.content.description !== undefined) {
      sanitized.content.description = sanitizeLocalizedText(data.content.description);
    }
    if (data.content.instructions !== undefined) {
      sanitized.content.instructions = sanitizeLocalizedText(data.content.instructions);
    }
    // Copy other content fields (goal, notes, highlights) if they exist
    if (data.content.goal !== undefined) {
      sanitized.content.goal = data.content.goal;
    }
    if (data.content.notes !== undefined) {
      sanitized.content.notes = data.content.notes;
    }
    // Ensure highlights is always an array (never undefined)
    if (data.content.highlights !== undefined) {
      sanitized.content.highlights = Array.isArray(data.content.highlights) 
        ? data.content.highlights 
        : [];
    }
  }

  // Copy other fields, excluding undefined values and deprecated fields
  const fieldsToSkip = ['name', 'content', 'alternativeEquipmentRequirements'];
  Object.keys(data).forEach((key) => {
    if (fieldsToSkip.includes(key)) return;
    
    const value = (data as any)[key];
    if (value !== undefined) {
      sanitized[key] = value;
    }
  });

  // Handle base_movement_id - set to null if empty string or undefined
  if (sanitized.base_movement_id !== undefined) {
    sanitized.base_movement_id = sanitized.base_movement_id || null;
  }
  
  // Ensure baseMovementId is also set (alias for base_movement_id)
  if (data.baseMovementId !== undefined) {
    sanitized.base_movement_id = data.baseMovementId || null;
  }
  
  // Ensure movementGroup is set (can be undefined/null)
  if (data.movementGroup !== undefined) {
    sanitized.movementGroup = data.movementGroup || null;
  }

  // Remove alternativeEquipmentRequirements (deprecated - now automated)
  if (sanitized.alternativeEquipmentRequirements !== undefined) {
    delete sanitized.alternativeEquipmentRequirements;
  }

  // Remove any remaining undefined values recursively
  const cleanUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return obj.map(cleanUndefined);
    }
    if (typeof obj === 'object') {
      const cleaned: any = {};
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (value !== undefined) {
          cleaned[key] = cleanUndefined(value);
        }
      });
      return cleaned;
    }
    return obj;
  };

  return cleanUndefined(sanitized);
}

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Normalize exercise data with default values for missing fields
 */
function normalizeExercise(docId: string, data: any): Exercise {
  const exercise: Exercise = {
    id: docId,
    name: data.name || { he: '', en: '', es: '' },
    type: data.type || 'reps',
    loggingMode: data.loggingMode || 'reps',
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
    muscleGroups: Array.isArray(data.muscleGroups) ? data.muscleGroups : [],
    programIds: Array.isArray(data.programIds) ? data.programIds : [],
    media: data.media || {},
    execution_methods: Array.isArray(data.execution_methods) ? data.execution_methods : undefined,
    content: data.content || {},
    stats: data.stats || { views: 0 },
    requiredGymEquipment: data.requiredGymEquipment,
    requiredUserGear: Array.isArray(data.requiredUserGear) ? data.requiredUserGear : undefined,
    alternativeEquipmentRequirements: Array.isArray(data.alternativeEquipmentRequirements)
      ? data.alternativeEquipmentRequirements
      : undefined,
    base_movement_id: data.base_movement_id || undefined, // Optional field
    targetPrograms: Array.isArray(data.targetPrograms) ? data.targetPrograms : undefined,
    movementGroup: data.movementGroup || undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    // Legacy field - kept for backward compatibility
    recommendedLevel: data.recommendedLevel,
  };

  // Log warning if base_movement_id is missing and exercise has execution_methods (needed for Smart Swap)
  if (!exercise.base_movement_id && exercise.execution_methods && exercise.execution_methods.length > 0) {
    console.warn(
      `[Exercise Service] Missing base_movement_id for exercise "${getLocalizedText(exercise.name)}" (ID: ${docId}). ` +
        `This field is required for Smart Swap functionality. Please add it in the admin panel.`
    );
  }

  return exercise;
}

/**
 * Get all exercises (sorted by name)
 */
export async function getAllExercises(): Promise<Exercise[]> {
  try {
    const q = query(collection(db, EXERCISES_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => normalizeExercise(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching exercises:', error);
    throw error;
  }
}

/**
 * Get exercises by search term (searches in name)
 */
export async function searchExercises(searchTerm: string): Promise<Exercise[]> {
  try {
    const allExercises = await getAllExercises();
    const lowerSearchTerm = searchTerm.toLowerCase();

    return allExercises.filter(
      (exercise) =>
        getLocalizedText(exercise.name).toLowerCase().includes(lowerSearchTerm) ||
        exercise.content?.goal?.toLowerCase().includes(lowerSearchTerm)
    );
  } catch (error) {
    console.error('Error searching exercises:', error);
    throw error;
  }
}

/**
 * Get exercises by program ID (filters by targetPrograms)
 */
export async function getExercisesByProgram(programId: string): Promise<Exercise[]> {
  try {
    const allExercises = await getAllExercises();
    return allExercises.filter(
      (exercise) =>
        exercise.targetPrograms?.some((tp) => tp.programId === programId) ||
        exercise.programIds?.includes(programId)
    );
  } catch (error) {
    console.error('Error fetching exercises by program:', error);
    throw error;
  }
}

/**
 * Get a single exercise by ID
 */
export async function getExercise(exerciseId: string): Promise<Exercise | null> {
  try {
    const docRef = doc(db, EXERCISES_COLLECTION, exerciseId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return normalizeExercise(docSnap.id, docSnap.data());
  } catch (error) {
    console.error('Error fetching exercise:', error);
    throw error;
  }
}

/**
 * Create a new exercise
 */
export async function createExercise(
  data: ExerciseFormData,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  try {
    const sanitized = sanitizeExerciseData(data);
    
    const exerciseData: any = {
      ...sanitized,
      // Ensure base_movement_id and movementGroup are always present (even if null)
      base_movement_id: sanitized.base_movement_id ?? null,
      movementGroup: sanitized.movementGroup ?? null,
      // Ensure content.description and highlights are always present
      content: {
        description: sanitized.content?.description ?? { he: '', en: '', es: '' },
        highlights: Array.isArray(sanitized.content?.highlights) ? sanitized.content.highlights : [],
        ...sanitized.content,
      },
      stats: {
        views: 0,
        ...sanitized.stats,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, EXERCISES_COLLECTION), exerciseData);
    
    // Log audit action
    if (adminInfo) {
      const exerciseName = getLocalizedText(data.name);
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'CREATE',
        targetEntity: 'Exercise',
        targetId: docRef.id,
        details: `Created exercise: ${exerciseName}`,
      });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error creating exercise:', error);
    throw error;
  }
}

/**
 * Update an exercise
 */
export async function updateExercise(
  exerciseId: string,
  data: Partial<ExerciseFormData>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const docRef = doc(db, EXERCISES_COLLECTION, exerciseId);
    const sanitized = sanitizeExerciseData(data);
    
    const updateData: any = {
      ...sanitized,
      updatedAt: serverTimestamp(),
    };

    // Ensure base_movement_id and movementGroup are set if provided (even if null)
    if (data.base_movement_id !== undefined || data.baseMovementId !== undefined) {
      updateData.base_movement_id = sanitized.base_movement_id ?? null;
    }
    if (data.movementGroup !== undefined) {
      updateData.movementGroup = sanitized.movementGroup ?? null;
    }

    // Ensure content.description and highlights are properly set if content is being updated
    if (data.content !== undefined) {
      updateData.content = {
        ...(sanitized.content || {}),
        description: data.content.description !== undefined 
          ? sanitizeLocalizedText(data.content.description)
          : (sanitized.content?.description || { he: '', en: '', es: '' }),
        highlights: data.content.highlights !== undefined
          ? (Array.isArray(data.content.highlights) ? data.content.highlights : [])
          : (Array.isArray(sanitized.content?.highlights) ? sanitized.content.highlights : []),
      };
    }

    // Don't update stats if not provided
    if (data.stats) {
      updateData.stats = data.stats;
    }

    await updateDoc(docRef, updateData);
    
    // Log audit action
    if (adminInfo) {
      const exercise = await getExercise(exerciseId);
      const exerciseName = exercise ? getLocalizedText(exercise.name) : exerciseId;
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Exercise',
        targetId: exerciseId,
        details: `Updated exercise: ${exerciseName}`,
      });
    }
  } catch (error) {
    console.error('Error updating exercise:', error);
    throw error;
  }
}

/**
 * Delete an exercise
 */
export async function deleteExercise(
  exerciseId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    // Get exercise name before deleting for audit log
    let exerciseName = exerciseId;
    if (adminInfo) {
      const exercise = await getExercise(exerciseId);
      if (exercise) {
        exerciseName = getLocalizedText(exercise.name);
      }
    }
    
    const docRef = doc(db, EXERCISES_COLLECTION, exerciseId);
    await deleteDoc(docRef);
    
    // Log audit action
    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'DELETE',
        targetEntity: 'Exercise',
        targetId: exerciseId,
        details: `Deleted exercise: ${exerciseName}`,
      });
    }
  } catch (error) {
    console.error('Error deleting exercise:', error);
    throw error;
  }
}

/**
 * Duplicate an exercise (create a copy with "Copy of" prefix)
 */
export async function duplicateExercise(exerciseId: string): Promise<string> {
  try {
    const originalExercise = await getExercise(exerciseId);
    if (!originalExercise) {
      throw new Error('Exercise not found');
    }

    const duplicateData: ExerciseFormData = {
      name: {
        he: `עותק של ${originalExercise.name.he || originalExercise.name.en || ''}`,
        en: `Copy of ${originalExercise.name.en || originalExercise.name.he || ''}`,
        es: originalExercise.name.es,
      },
      type: originalExercise.type,
      loggingMode: originalExercise.loggingMode || 'reps',
      equipment: [...originalExercise.equipment],
      muscleGroups: [...originalExercise.muscleGroups],
      programIds: [...originalExercise.programIds],
      media: {
        videoUrl: originalExercise.media?.videoUrl,
        imageUrl: originalExercise.media?.imageUrl,
      },
      content: {
        goal: originalExercise.content?.goal,
        notes: originalExercise.content?.notes ? [...originalExercise.content.notes] : [],
        highlights: originalExercise.content?.highlights
          ? [...originalExercise.content.highlights]
          : [],
      },
      stats: {
        views: 0, // Reset views for duplicate
      },
      base_movement_id: originalExercise.base_movement_id, // Preserve base_movement_id
      execution_methods: originalExercise.execution_methods, // Preserve execution methods
      targetPrograms: originalExercise.targetPrograms, // Preserve target programs
      movementGroup: originalExercise.movementGroup, // Preserve movement group
    };

    return await createExercise(duplicateData);
  } catch (error) {
    console.error('Error duplicating exercise:', error);
    throw error;
  }
}

/**
 * Increment exercise views
 */
export async function incrementExerciseViews(exerciseId: string): Promise<void> {
  try {
    const exercise = await getExercise(exerciseId);
    if (!exercise) return;

    const docRef = doc(db, EXERCISES_COLLECTION, exerciseId);
    await updateDoc(docRef, {
      'stats.views': (exercise.stats.views || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error incrementing exercise views:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Get all unique base_movement_id values from exercises
 */
export async function getAllBaseMovementIds(): Promise<string[]> {
  const snapshot = await getDocs(collection(db, EXERCISES_COLLECTION));
  const ids = new Set<string>();
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as any;
    if (data.base_movement_id && typeof data.base_movement_id === 'string') {
      ids.add(data.base_movement_id);
    }
  });
  return Array.from(ids).sort();
}
