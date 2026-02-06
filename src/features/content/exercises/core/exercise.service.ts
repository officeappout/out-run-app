/**
 * Firestore Service for Managing Exercises
 * 
 * This module handles all CRUD operations and workflow updates for exercises.
 * Sanitization and normalization logic is in ../services/exercise-mapping.utils.ts
 * Analysis and matrix logic is in ../services/exercise-analysis.service.ts
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
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exercise, ExerciseFormData, getLocalizedText } from './exercise.types';
import { logAction } from '@/features/admin/services/audit.service';

// Import sanitization and normalization utilities
import {
  sanitizeExerciseData,
  sanitizeLocalizedText,
  normalizeExercise,
  deepMergeForUpdate,
} from '../services/exercise-mapping.utils';

// Re-export analysis functions for backward compatibility
export type {
  MediaStatus,
  ProductionReadiness,
  MethodProductionStatus,
  GapType,
  ContentMatrixGap,
  ContentMatrixLocation,
  ContentMatrixRow,
  TaskListSummary,
} from '../services/exercise-analysis.service';

export {
  getExerciseProductionReadiness,
  isExerciseProductionReady,
  isExercisePendingFilming,
  CONTENT_LOCATIONS,
  analyzeExerciseForMatrix,
  generateTaskList,
} from '../services/exercise-analysis.service';

// Re-export mapping utilities that may be used externally
export {
  sanitizeExerciseData,
  sanitizeLocalizedText,
  normalizeExercise,
  sanitizeHighlights,
  sanitizeExecutionMethod,
  mapMovementType,
  mapSymmetry,
  mapMechanicalType,
} from '../services/exercise-mapping.utils';

const EXERCISES_COLLECTION = 'exercises';

// ============================================================================
// READ OPERATIONS
// ============================================================================

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

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new exercise
 */
export async function createExercise(
  data: ExerciseFormData,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  try {
    const sanitized = sanitizeExerciseData(data);
    
    // Auto-sync imageUrl from execution_methods to top-level media for list view
    const firstImageUrl = 
      sanitized.execution_methods?.[0]?.media?.imageUrl ||
      sanitized.execution_methods?.[0]?.media?.mainVideoUrl;
    
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
      // Sync imageUrl to top-level media for easy access in list views
      media: {
        ...sanitized.media,
        imageUrl: firstImageUrl || sanitized.media?.imageUrl,
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

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update an exercise - uses deep merge to prevent data loss
 */
export async function updateExercise(
  exerciseId: string,
  data: Partial<ExerciseFormData>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    // =========================================================================
    // DEBUG: Log incoming data from form
    // =========================================================================
    console.log('='.repeat(80));
    console.log('[updateExercise] RECEIVED FROM FORM:');
    console.log('='.repeat(80));
    console.log('[updateExercise] Classification Fields from form:', {
      movementType: data.movementType,
      symmetry: data.symmetry,
      mechanicalType: data.mechanicalType,
      movementGroup: data.movementGroup,
    });
    console.log('[updateExercise] Array Fields from form:', {
      secondaryMuscles: data.secondaryMuscles,
      injuryShield: data.injuryShield,
    });
    
    const docRef = doc(db, EXERCISES_COLLECTION, exerciseId);
    
    // CRITICAL: Fetch existing exercise to preserve fields not being edited
    const existingExercise = await getExercise(exerciseId);
    if (!existingExercise) {
      throw new Error(`Exercise ${exerciseId} not found`);
    }
    
    const sanitized = sanitizeExerciseData(data);
    
    // DEBUG: Log after sanitization
    console.log('[updateExercise] AFTER SANITIZATION:', {
      movementType: sanitized.movementType,
      symmetry: sanitized.symmetry,
      mechanicalType: sanitized.mechanicalType,
      secondaryMuscles: sanitized.secondaryMuscles,
      injuryShield: sanitized.injuryShield,
    });
    
    // Auto-sync imageUrl from execution_methods to top-level media for list view
    const firstImageUrl = 
      sanitized.execution_methods?.[0]?.media?.imageUrl ||
      sanitized.execution_methods?.[0]?.media?.mainVideoUrl;
    
    // =========================================================================
    // CRITICAL: Deep merge execution_methods to preserve workflow states
    // =========================================================================
    let mergedExecutionMethods = sanitized.execution_methods;
    if (sanitized.execution_methods && existingExercise.execution_methods) {
      mergedExecutionMethods = sanitized.execution_methods.map((incomingMethod: any, index: number) => {
        const existingMethod = existingExercise.execution_methods?.[index];
        if (!existingMethod) return incomingMethod;
        
        // Deep merge to preserve workflow, needsLongExplanation, etc.
        return {
          ...existingMethod,
          ...incomingMethod,
          // CRITICAL: Preserve workflow if not explicitly provided
          workflow: incomingMethod.workflow || existingMethod.workflow || {
            filmed: false,
            filmedAt: null,
            audio: false,
            audioAt: null,
            edited: false,
            editedAt: null,
            uploaded: false,
            uploadedAt: null,
          },
          // Preserve needsLongExplanation if not explicitly set
          needsLongExplanation: incomingMethod.needsLongExplanation !== undefined 
            ? incomingMethod.needsLongExplanation 
            : existingMethod.needsLongExplanation,
          // Preserve explanationStatus
          explanationStatus: incomingMethod.explanationStatus !== undefined 
            ? incomingMethod.explanationStatus 
            : existingMethod.explanationStatus,
          // Merge media but preserve existing if not provided
          media: {
            ...(existingMethod.media || {}),
            ...(incomingMethod.media || {}),
          },
        };
      });
    }
    
    const updateData: any = {
      ...sanitized,
      execution_methods: mergedExecutionMethods,
      updatedAt: serverTimestamp(),
    };

    // =========================================================================
    // METADATA FIELD PRESERVATION - Preserve existing if not in incoming data
    // =========================================================================
    
    // Helper to preserve field if not explicitly provided
    const preserveField = (fieldName: string) => {
      const incomingValue = (data as any)[fieldName];
      const existingValue = (existingExercise as any)[fieldName];
      
      if (incomingValue !== undefined) {
        // Use incoming value (even if null/empty - it's explicitly set)
        updateData[fieldName] = (sanitized as any)[fieldName];
      } else if (existingValue !== undefined) {
        // Preserve existing value
        updateData[fieldName] = existingValue;
      }
      // If neither exists, field will not be in updateData
    };
    
    // === MOVEMENT CLASSIFICATION ===
    preserveField('base_movement_id');
    preserveField('movementGroup');
    preserveField('movementType');
    preserveField('symmetry');
    
    // === MUSCLE FIELDS ===
    preserveField('primaryMuscle');
    preserveField('secondaryMuscles');
    preserveField('muscleGroups');
    
    // === GENERAL METRICS ===
    preserveField('noiseLevel');
    preserveField('sweatLevel');
    
    // === SAFETY / SENSITIVITY ZONES ===
    preserveField('injuryShield');
    
    // === TECHNICAL CLASSIFICATION ===
    preserveField('mechanicalType');
    preserveField('fieldReady');
    
    // === TAGS & ROLE ===
    preserveField('tags');
    preserveField('exerciseRole');
    preserveField('isFollowAlong');
    
    // === TIMING ===
    preserveField('secondsPerRep');
    preserveField('defaultRestSeconds');
    
    // === PRODUCTION REQUIREMENTS ===
    preserveField('requiredLocations');
    
    // === EQUIPMENT ===
    preserveField('requiredGymEquipment');
    preserveField('requiredUserGear');

    // Ensure content.description and highlights are properly set if content is being updated
    if (data.content !== undefined) {
      updateData.content = {
        ...(existingExercise.content || {}), // Start with existing content
        ...(sanitized.content || {}),
        description: data.content.description !== undefined 
          ? sanitizeLocalizedText(data.content.description)
          : (existingExercise.content?.description || { he: '', en: '', es: '' }),
        instructions: data.content.instructions !== undefined
          ? sanitizeLocalizedText(data.content.instructions)
          : (existingExercise.content?.instructions || { he: '', en: '', es: '' }),
        specificCues: data.content.specificCues !== undefined
          ? data.content.specificCues
          : (existingExercise.content?.specificCues || []),
        highlights: data.content.highlights !== undefined
          ? (Array.isArray(data.content.highlights) ? data.content.highlights : [])
          : (existingExercise.content?.highlights || []),
      };
    }

    // Sync imageUrl to top-level media for easy access in list views
    if (data.media !== undefined || firstImageUrl) {
      updateData.media = {
        ...(existingExercise.media || {}), // Start with existing media
        ...(sanitized.media || {}),
        imageUrl: firstImageUrl || sanitized.media?.imageUrl || data.media?.imageUrl || existingExercise.media?.imageUrl,
      };
    }

    // Don't update stats if not provided
    if (data.stats) {
      updateData.stats = data.stats;
    } else {
      delete updateData.stats; // Don't overwrite existing stats
    }

    // =========================================================================
    // DETAILED LOGGING - Track what's being persisted
    // =========================================================================
    const metadataBeingSaved = {
      muscles: {
        primaryMuscle: updateData.primaryMuscle,
        secondaryMuscles: updateData.secondaryMuscles,
        muscleGroups: updateData.muscleGroups,
      },
      effort: {
        noiseLevel: updateData.noiseLevel,
        sweatLevel: updateData.sweatLevel,
      },
      technical: {
        mechanicalType: updateData.mechanicalType,
        movementType: updateData.movementType,
      },
      movement: {
        movementGroup: updateData.movementGroup,
        symmetry: updateData.symmetry,
      },
      safety: {
        injuryShield: updateData.injuryShield,
      },
      production: {
        requiredLocations: updateData.requiredLocations,
      },
    };
    
    console.log('[updateExercise] Fields being persisted:', metadataBeingSaved);
    
    // Check for potentially missing fields
    const missingFields: string[] = [];
    if (data.secondaryMuscles !== undefined && updateData.secondaryMuscles === undefined) {
      missingFields.push('secondaryMuscles');
    }
    if (data.injuryShield !== undefined && updateData.injuryShield === undefined) {
      missingFields.push('injuryShield');
    }
    if (data.tags !== undefined && updateData.tags === undefined) {
      missingFields.push('tags');
    }
    
    if (missingFields.length > 0) {
      console.warn('[updateExercise] WARNING: Missing metadata fields during save:', missingFields);
    }
    
    console.log('[updateExercise] Updating with preserved fields:', {
      exerciseId,
      executionMethodsCount: updateData.execution_methods?.length,
      workflowsPreserved: updateData.execution_methods?.map((m: any) => !!m?.workflow),
      allMetadataPreserved: Object.keys(metadataBeingSaved),
    });

    await updateDoc(docRef, updateData);
    
    // =========================================================================
    // VERIFICATION: Check that ALL metadata fields are still in the database
    // =========================================================================
    const verifyExercise = await getExercise(exerciseId);
    if (verifyExercise) {
      const methods = verifyExercise.execution_methods || [];
      const workflowsExist = methods.every((m) => m.workflow !== undefined);
      
      // Comprehensive verification of all metadata fields
      const verificationResult = {
        exerciseId,
        methodsCount: methods.length,
        allWorkflowsExist: workflowsExist,
        muscles: {
          primaryMuscle: verifyExercise.primaryMuscle,
          secondaryMuscles: verifyExercise.secondaryMuscles,
          muscleGroupsCount: verifyExercise.muscleGroups?.length || 0,
        },
        movement: {
          movementGroup: verifyExercise.movementGroup,
          movementType: verifyExercise.movementType,
          symmetry: verifyExercise.symmetry,
        },
        technical: {
          mechanicalType: verifyExercise.mechanicalType,
        },
        effort: {
          noiseLevel: verifyExercise.noiseLevel,
          sweatLevel: verifyExercise.sweatLevel,
        },
        safety: {
          injuryShieldCount: verifyExercise.injuryShield?.length || 0,
        },
        production: {
          requiredLocationsCount: verifyExercise.requiredLocations?.length || 0,
        },
      };
      
      console.log('[updateExercise] Verification after save:', verificationResult);
      
      // Check for data loss - only warn if we explicitly sent a non-empty value and it's missing after save
      const warnings: string[] = [];
      if (!workflowsExist && methods.length > 0) {
        warnings.push('Workflow data may have been lost');
      }
      
      // === MUSCLE FIELDS ===
      if (data.primaryMuscle !== undefined && data.primaryMuscle !== null && !verifyExercise.primaryMuscle) {
        warnings.push('primaryMuscle was not saved');
      }
      // Only warn about secondaryMuscles if we sent a non-empty array
      if (data.secondaryMuscles !== undefined && data.secondaryMuscles.length > 0 && 
          (!verifyExercise.secondaryMuscles || verifyExercise.secondaryMuscles.length === 0)) {
        warnings.push('secondaryMuscles was not saved');
      }
      
      // === MOVEMENT CLASSIFICATION ===
      if (data.movementType !== undefined && data.movementType !== null && !verifyExercise.movementType) {
        warnings.push('movementType was not saved');
      }
      if (data.symmetry !== undefined && data.symmetry !== null && !verifyExercise.symmetry) {
        warnings.push('symmetry was not saved');
      }
      if (data.movementGroup !== undefined && data.movementGroup !== null && !verifyExercise.movementGroup) {
        warnings.push('movementGroup was not saved');
      }
      
      // === TECHNICAL CLASSIFICATION ===
      if (data.mechanicalType !== undefined && data.mechanicalType !== null && !verifyExercise.mechanicalType) {
        warnings.push('mechanicalType was not saved');
      }
      
      // === SAFETY / INDICATORS ===
      // Only warn about injuryShield if we sent a non-empty array
      if (data.injuryShield !== undefined && data.injuryShield.length > 0 && 
          (!verifyExercise.injuryShield || verifyExercise.injuryShield.length === 0)) {
        warnings.push('injuryShield was not saved');
      }
      if (data.noiseLevel !== undefined && data.noiseLevel !== null && !verifyExercise.noiseLevel) {
        warnings.push('noiseLevel was not saved');
      }
      if (data.sweatLevel !== undefined && data.sweatLevel !== null && !verifyExercise.sweatLevel) {
        warnings.push('sweatLevel was not saved');
      }
      
      if (warnings.length > 0) {
        console.warn('[updateExercise] WARNING: Potential data loss detected:', warnings);
      } else {
        console.log('[updateExercise] ✓ All metadata fields verified successfully');
      }
    }
    
    // Log audit action
    if (adminInfo) {
      const exerciseName = verifyExercise ? getLocalizedText(verifyExercise.name) : exerciseId;
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

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

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

// ============================================================================
// PRODUCTION WORKFLOW FUNCTIONS
// ============================================================================

export type WorkflowStep = 'filmed' | 'audio' | 'edited' | 'uploaded';

/**
 * Update the workflow status for a specific execution method
 */
export async function updateMethodWorkflow(
  exerciseId: string,
  methodIndex: number,
  step: WorkflowStep,
  completed: boolean
): Promise<void> {
  try {
    const exercise = await getExercise(exerciseId);
    if (!exercise) {
      throw new Error('Exercise not found');
    }

    const methods = exercise.execution_methods || exercise.executionMethods || [];
    if (methodIndex < 0 || methodIndex >= methods.length) {
      throw new Error(`Invalid method index: ${methodIndex}`);
    }

    // Update the specific method's workflow
    const updatedMethods = methods.map((method, idx) => {
      if (idx !== methodIndex) return method;
      
      const workflow = method.workflow || {
        filmed: false,
        filmedAt: null,
        audio: false,
        audioAt: null,
        edited: false,
        editedAt: null,
        uploaded: false,
        uploadedAt: null,
      };
      
      const now = new Date();
      const timestampKey = `${step}At` as keyof typeof workflow;
      
      return {
        ...method,
        workflow: {
          ...workflow,
          [step]: completed,
          [timestampKey]: completed ? now : null,
        },
      };
    });

    const docRef = doc(db, EXERCISES_COLLECTION, exerciseId);
    await updateDoc(docRef, {
      execution_methods: updatedMethods,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating method workflow:', error);
    throw error;
  }
}

/**
 * Mark a method as filmed (quick action for field recording mode)
 */
export async function markMethodAsFilmed(
  exerciseId: string,
  methodIndex: number
): Promise<void> {
  return updateMethodWorkflow(exerciseId, methodIndex, 'filmed', true);
}

/**
 * Batch update workflow for multiple methods across exercises
 */
export async function batchUpdateWorkflow(
  updates: Array<{ exerciseId: string; methodIndex: number; step: WorkflowStep; completed: boolean }>
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const update of updates) {
    try {
      await updateMethodWorkflow(update.exerciseId, update.methodIndex, update.step, update.completed);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push(`${update.exerciseId}[${update.methodIndex}]: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

// ============================================================================
// CONTENT MATRIX DATA FETCHING
// ============================================================================

// Import the analysis function
import { analyzeExerciseForMatrix, ContentMatrixRow } from '../services/exercise-analysis.service';

/**
 * Get all exercises with content matrix analysis
 */
export async function getContentMatrixData(): Promise<ContentMatrixRow[]> {
  const exercises = await getAllExercises();
  return exercises.map(analyzeExerciseForMatrix);
}
