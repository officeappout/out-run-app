/**
 * Exercise Mapping Utilities
 * 
 * Handles sanitization, normalization, and field mapping for exercise data.
 * Contains pure functions with no Firebase dependencies.
 */

import { Timestamp } from 'firebase/firestore';
import { 
  Exercise, 
  ExerciseFormData, 
  LocalizedText, 
  ExecutionLocation, 
  ExecutionMethod,
  getLocalizedText,
} from '../core/exercise.types';

// ============================================================================
// LOCALIZED TEXT HELPERS
// ============================================================================

/**
 * Sanitize localized text object - ensure no undefined values, use empty strings instead
 */
export function sanitizeLocalizedText(text: LocalizedText | undefined): LocalizedText {
  if (!text) {
    return { he: '', en: '', es: '' };
  }
  return {
    he: text.he ?? '',
    en: text.en ?? '',
    es: text.es ?? '',
  };
}

// ============================================================================
// TIMESTAMP CONVERSION
// ============================================================================

/**
 * Convert Firestore timestamp to Date
 */
export function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

// ============================================================================
// NULL-SAFE FIELD MAPPING
// ============================================================================

/**
 * Null-safe mapping for movementType field
 * Handles: compound, isolation, Compound, Isolation, and Hebrew equivalents
 * Case-insensitive - all inputs are normalized to lowercase
 */
export function mapMovementType(value: unknown): 'compound' | 'isolation' | undefined {
  if (value === undefined || value === null) return undefined;
  
  // Use optional chaining for maximum null-safety
  const mt = value?.toString?.()?.toLowerCase?.()?.trim?.() ?? '';
  
  if (mt === 'compound' || mt === 'מורכב') {
    return 'compound';
  } else if (mt === 'isolation' || mt === 'מבודד' || mt === 'isolated') {
    return 'isolation';
  }
  
  if (mt !== '') {
    console.warn(`[mapMovementType] Unrecognized value: "${value}" - field will be undefined`);
  }
  return undefined;
}

/**
 * Null-safe mapping for symmetry field
 * Handles: bilateral, unilateral, Bilateral, Unilateral, and Hebrew/abbreviation equivalents
 * Case-insensitive - all inputs are normalized to lowercase
 */
export function mapSymmetry(value: unknown): 'bilateral' | 'unilateral' | undefined {
  if (value === undefined || value === null) return undefined;
  
  // Use optional chaining for maximum null-safety
  const sym = value?.toString?.()?.toLowerCase?.()?.trim?.() ?? '';
  
  if (sym === 'bilateral' || sym === 'דו-צדדי' || sym === 'bi') {
    return 'bilateral';
  } else if (sym === 'unilateral' || sym === 'חד-צדדי' || sym === 'uni') {
    return 'unilateral';
  }
  
  if (sym !== '') {
    console.warn(`[mapSymmetry] Unrecognized value: "${value}" - field will be undefined`);
  }
  return undefined;
}

/**
 * Null-safe mapping for mechanicalType field
 * Handles: straight_arm (SA), bent_arm (BA), hybrid, Hybrid, none, and Hebrew equivalents
 * Case-insensitive - all inputs are normalized to lowercase
 * 
 * Mapping:
 *   - 'SA' | 'sa' | 'straight_arm' | 'יד ישרה' -> 'straight_arm'
 *   - 'BA' | 'ba' | 'bent_arm' | 'יד כפופה' -> 'bent_arm'
 *   - 'Hybrid' | 'hybrid' | 'היברידי' -> 'hybrid'
 *   - 'none' | 'n/a' | 'ללא' -> 'none'
 */
export function mapMechanicalType(value: unknown): 'straight_arm' | 'bent_arm' | 'hybrid' | 'none' | undefined {
  if (value === undefined || value === null) return undefined;
  
  // Use optional chaining for maximum null-safety
  const mech = value?.toString?.()?.toLowerCase?.()?.trim?.() ?? '';
  
  // SA / Straight Arm
  if (mech === 'straight_arm' || mech === 'sa' || mech === 'יד ישרה' || mech === 'straightarm') {
    return 'straight_arm';
  }
  // BA / Bent Arm
  if (mech === 'bent_arm' || mech === 'ba' || mech === 'יד כפופה' || mech === 'bentarm') {
    return 'bent_arm';
  }
  // Hybrid
  if (mech === 'hybrid' || mech === 'היברידי') {
    return 'hybrid';
  }
  // None / N/A
  if (mech === 'none' || mech === 'n/a' || mech === 'ללא' || mech === '') {
    return 'none';
  }
  
  console.warn(`[mapMechanicalType] Unrecognized value: "${value}" - field will be undefined`);
  return undefined;
}

// ============================================================================
// ARRAY SANITIZATION
// ============================================================================

/**
 * Ensure a value is an array (or empty array if not)
 */
export function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Sanitize highlights array - ensure all items are strings
 */
export function sanitizeHighlights(highlights: unknown): string[] {
  if (!Array.isArray(highlights)) return [];
  return highlights.map((h) => {
    if (typeof h === 'string') return h;
    if (typeof h === 'object' && h !== null) {
      return (h as any).he || (h as any).en || String(h);
    }
    return String(h || '');
  });
}

// ============================================================================
// EXECUTION METHOD SANITIZATION
// ============================================================================

const VALID_LOCATIONS: ExecutionLocation[] = ['home', 'park', 'street', 'office', 'school', 'gym', 'airport'];

/**
 * Sanitize execution method - ensure methodName is always a string
 */
export function sanitizeExecutionMethod(method: any): any {
  if (!method || typeof method !== 'object') return method;
  
  const sanitized = { ...method };
  
  // CRITICAL: Ensure methodName is always a string (fix for React Error #31)
  if (sanitized.methodName !== undefined) {
    if (typeof sanitized.methodName === 'object' && sanitized.methodName !== null) {
      // If it's a LocalizedText object, extract Hebrew
      sanitized.methodName = sanitized.methodName.he || sanitized.methodName.en || '';
      console.warn('[sanitizeExecutionMethod] Sanitized methodName from object to string:', sanitized.methodName);
    } else if (typeof sanitized.methodName !== 'string') {
      sanitized.methodName = String(sanitized.methodName || '');
    }
  } else {
    sanitized.methodName = '';
  }
  
  // Ensure arrays are properly typed and contain valid values
  if (sanitized.locationMapping !== undefined) {
    if (!Array.isArray(sanitized.locationMapping)) {
      sanitized.locationMapping = [];
    } else {
      // Validate that all location values are valid ExecutionLocation types
      sanitized.locationMapping = sanitized.locationMapping.filter((loc: any) => 
        typeof loc === 'string' && VALID_LOCATIONS.includes(loc as ExecutionLocation)
      ) as ExecutionLocation[];
    }
  }
  if (sanitized.lifestyleTags !== undefined && !Array.isArray(sanitized.lifestyleTags)) {
    sanitized.lifestyleTags = [];
  }
  
  // ========================================================================
  // EQUIPMENT/GEAR MIGRATION (for reading): Ensure arrays are populated
  // This ensures backward compatibility when reading legacy data
  // ========================================================================
  
  // Migrate gearId -> gearIds for display
  if (Array.isArray(sanitized.gearIds)) {
    // Already in array format - filter empty values
    sanitized.gearIds = sanitized.gearIds.filter((id: any) => typeof id === 'string' && id.trim() !== '');
  } else if (sanitized.gearId && typeof sanitized.gearId === 'string' && sanitized.gearId.trim() !== '') {
    // Legacy single value - convert to array
    sanitized.gearIds = [sanitized.gearId];
  } else {
    sanitized.gearIds = [];
  }
  
  // Migrate equipmentId -> equipmentIds for display
  if (Array.isArray(sanitized.equipmentIds)) {
    // Already in array format - filter empty values
    sanitized.equipmentIds = sanitized.equipmentIds.filter((id: any) => typeof id === 'string' && id.trim() !== '');
  } else if (sanitized.equipmentId && typeof sanitized.equipmentId === 'string' && sanitized.equipmentId.trim() !== '') {
    // Legacy single value - convert to array
    sanitized.equipmentIds = [sanitized.equipmentId];
  } else {
    sanitized.equipmentIds = [];
  }
  
  return sanitized;
}

/**
 * Sanitize execution method for saving - full sanitization including media and workflow
 */
function sanitizeExecutionMethodForSave(method: any): any {
  const sanitizedMethod: any = { ...method };
  
  // Ensure methodName is a string (fix for React crash #31)
  if (sanitizedMethod.methodName !== undefined) {
    if (typeof sanitizedMethod.methodName === 'object' && sanitizedMethod.methodName !== null) {
      // If it's a LocalizedText object, extract Hebrew
      sanitizedMethod.methodName = sanitizedMethod.methodName.he || sanitizedMethod.methodName.en || '';
    } else if (typeof sanitizedMethod.methodName !== 'string') {
      sanitizedMethod.methodName = '';
    }
  } else {
    sanitizedMethod.methodName = '';
  }
  
  // Sanitize media URLs - convert undefined to null to track missing media
  if (sanitizedMethod.media !== undefined) {
    const cleanedMedia: any = {};
    
    // mainVideoUrl - convert empty/undefined to null for tracking
    if (sanitizedMethod.media.mainVideoUrl && 
        typeof sanitizedMethod.media.mainVideoUrl === 'string' && 
        sanitizedMethod.media.mainVideoUrl.trim() !== '') {
      cleanedMedia.mainVideoUrl = sanitizedMethod.media.mainVideoUrl.trim();
    } else {
      cleanedMedia.mainVideoUrl = null; // Track as missing media
    }
    
    // imageUrl - convert empty/undefined to null for tracking
    if (sanitizedMethod.media.imageUrl && 
        typeof sanitizedMethod.media.imageUrl === 'string' && 
        sanitizedMethod.media.imageUrl.trim() !== '') {
      cleanedMedia.imageUrl = sanitizedMethod.media.imageUrl.trim();
    } else {
      cleanedMedia.imageUrl = null; // Track as missing media
    }
    
    // videoDurationSeconds - keep as number or null
    if (sanitizedMethod.media.videoDurationSeconds !== undefined && 
        sanitizedMethod.media.videoDurationSeconds !== null) {
      const duration = Number(sanitizedMethod.media.videoDurationSeconds);
      if (!isNaN(duration) && duration > 0) {
        cleanedMedia.videoDurationSeconds = duration;
      } else {
        cleanedMedia.videoDurationSeconds = null;
      }
    } else {
      cleanedMedia.videoDurationSeconds = null;
    }
    
    // Copy other media properties, converting undefined to null
    Object.keys(sanitizedMethod.media).forEach((key) => {
      if (!['mainVideoUrl', 'imageUrl', 'videoDurationSeconds'].includes(key)) {
        const value = sanitizedMethod.media[key];
        cleanedMedia[key] = value !== undefined ? value : null;
      }
    });
    
    sanitizedMethod.media = cleanedMedia;
  } else {
    // No media provided - create empty structure with null values
    sanitizedMethod.media = {
      mainVideoUrl: null,
      imageUrl: null,
      videoDurationSeconds: null,
    };
  }
  
  // Ensure locationMapping is an array with valid ExecutionLocation values
  if (sanitizedMethod.locationMapping !== undefined) {
    if (!Array.isArray(sanitizedMethod.locationMapping)) {
      sanitizedMethod.locationMapping = [];
    } else {
      sanitizedMethod.locationMapping = sanitizedMethod.locationMapping.filter((loc: any) => 
        typeof loc === 'string' && VALID_LOCATIONS.includes(loc as ExecutionLocation)
      ) as ExecutionLocation[];
    }
  }
  
  // Ensure lifestyleTags is an array
  if (sanitizedMethod.lifestyleTags !== undefined) {
    sanitizedMethod.lifestyleTags = Array.isArray(sanitizedMethod.lifestyleTags) 
      ? sanitizedMethod.lifestyleTags 
      : [];
  }
  
  // ========================================================================
  // EQUIPMENT/GEAR MIGRATION: Single IDs -> Array IDs
  // Supports backward compatibility while enabling multiple selections
  // ========================================================================
  
  // Migrate gearId (single) -> gearIds (array)
  if (sanitizedMethod.gearIds !== undefined && Array.isArray(sanitizedMethod.gearIds)) {
    // New format: gearIds array is already present - filter empty strings
    sanitizedMethod.gearIds = sanitizedMethod.gearIds.filter((id: any) => 
      typeof id === 'string' && id.trim() !== ''
    );
  } else if (sanitizedMethod.gearId !== undefined && typeof sanitizedMethod.gearId === 'string' && sanitizedMethod.gearId.trim() !== '') {
    // Legacy format: migrate single gearId to gearIds array
    sanitizedMethod.gearIds = [sanitizedMethod.gearId.trim()];
    console.log('[sanitizeExecutionMethod] Migrated legacy gearId to gearIds:', sanitizedMethod.gearIds);
  } else {
    // No gear specified - empty array
    sanitizedMethod.gearIds = [];
  }
  
  // Migrate equipmentId (single) -> equipmentIds (array)
  if (sanitizedMethod.equipmentIds !== undefined && Array.isArray(sanitizedMethod.equipmentIds)) {
    // New format: equipmentIds array is already present - filter empty strings
    sanitizedMethod.equipmentIds = sanitizedMethod.equipmentIds.filter((id: any) => 
      typeof id === 'string' && id.trim() !== ''
    );
  } else if (sanitizedMethod.equipmentId !== undefined && typeof sanitizedMethod.equipmentId === 'string' && sanitizedMethod.equipmentId.trim() !== '') {
    // Legacy format: migrate single equipmentId to equipmentIds array
    sanitizedMethod.equipmentIds = [sanitizedMethod.equipmentId.trim()];
    console.log('[sanitizeExecutionMethod] Migrated legacy equipmentId to equipmentIds:', sanitizedMethod.equipmentIds);
  } else {
    // No equipment specified - empty array
    sanitizedMethod.equipmentIds = [];
  }
  
  // Remove legacy single fields after migration (keep the arrays only)
  delete sanitizedMethod.gearId;
  delete sanitizedMethod.equipmentId;
  
  // ========================================================================
  // PRODUCTION WORKFLOW - Initialize workflow tracking fields
  // ========================================================================
  
  // Ensure workflow object exists with proper defaults
  if (sanitizedMethod.workflow === undefined || sanitizedMethod.workflow === null) {
    sanitizedMethod.workflow = {
      filmed: false,
      filmedAt: null,
      audio: false,
      audioAt: null,
      edited: false,
      editedAt: null,
      uploaded: false,
      uploadedAt: null,
    };
  } else {
    // Sanitize existing workflow - ensure all fields exist
    sanitizedMethod.workflow = {
      filmed: !!sanitizedMethod.workflow.filmed,
      filmedAt: sanitizedMethod.workflow.filmedAt || null,
      audio: !!sanitizedMethod.workflow.audio,
      audioAt: sanitizedMethod.workflow.audioAt || null,
      edited: !!sanitizedMethod.workflow.edited,
      editedAt: sanitizedMethod.workflow.editedAt || null,
      uploaded: !!sanitizedMethod.workflow.uploaded,
      uploadedAt: sanitizedMethod.workflow.uploadedAt || null,
    };
  }
  
  // Ensure needsLongExplanation defaults to false
  if (sanitizedMethod.needsLongExplanation === undefined) {
    sanitizedMethod.needsLongExplanation = false;
  } else {
    sanitizedMethod.needsLongExplanation = !!sanitizedMethod.needsLongExplanation;
  }
  
  // Ensure explanationStatus defaults to 'missing' if needsLongExplanation is true
  if (sanitizedMethod.explanationStatus === undefined) {
    sanitizedMethod.explanationStatus = sanitizedMethod.needsLongExplanation ? 'missing' : null;
  } else if (sanitizedMethod.explanationStatus !== 'missing' && sanitizedMethod.explanationStatus !== 'ready') {
    sanitizedMethod.explanationStatus = 'missing';
  }
  
  return sanitizedMethod;
}

// ============================================================================
// UNDEFINED TO NULL CONVERSION
// ============================================================================

/**
 * Convert any remaining undefined values to null - Firebase doesn't accept undefined
 * null values are valid Firestore values and help us track missing data
 * 
 * IMPORTANT: Empty arrays [] are preserved as empty arrays (NOT converted to null)
 * This ensures Firestore correctly clears array fields when intended
 */
export function convertUndefinedToNull(obj: any): any {
  if (obj === undefined) return null; // Convert undefined to null
  if (obj === null) return null; // Keep null as valid Firestore value
  
  // CRITICAL: Preserve empty arrays as empty arrays (do NOT convert to null)
  // This allows Firestore to properly clear array fields when user removes all items
  if (Array.isArray(obj)) {
    return obj.map(convertUndefinedToNull); // Returns [] for empty arrays
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      cleaned[key] = convertUndefinedToNull(value);
    });
    return cleaned;
  }
  return obj;
}

// ============================================================================
// MAIN SANITIZATION FUNCTION
// ============================================================================

/**
 * Sanitize exercise form data before sending to Firestore
 * Removes undefined values and ensures localized fields use empty strings
 */
export function sanitizeExerciseData(data: ExerciseFormData | Partial<ExerciseFormData>): any {
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
  if ((data as any).baseMovementId !== undefined) {
    sanitized.base_movement_id = (data as any).baseMovementId || null;
  }
  
  // Ensure movementGroup is set (can be undefined/null)
  if (data.movementGroup !== undefined) {
    sanitized.movementGroup = data.movementGroup || null;
  }

  // Sanitize timing fields
  if (data.secondsPerRep !== undefined) {
    const secondsPerRep = typeof data.secondsPerRep === 'number' ? data.secondsPerRep : parseInt(String(data.secondsPerRep || 3), 10);
    sanitized.secondsPerRep = isNaN(secondsPerRep) ? undefined : Math.max(1, Math.min(60, secondsPerRep));
  }
  if (data.defaultRestSeconds !== undefined) {
    const restSeconds = typeof data.defaultRestSeconds === 'number' ? data.defaultRestSeconds : parseInt(String(data.defaultRestSeconds || 30), 10);
    sanitized.defaultRestSeconds = isNaN(restSeconds) ? undefined : Math.max(0, Math.min(300, restSeconds));
  }

  // =========================================================================
  // MOVEMENT CLASSIFICATION - Null-safe case-insensitive validation
  // =========================================================================
  
  // movementType: Map various formats to lowercase canonical values
  if (data.movementType !== undefined) {
    sanitized.movementType = mapMovementType(data.movementType);
  }
  
  // symmetry: Map various formats to lowercase canonical values
  if (data.symmetry !== undefined) {
    sanitized.symmetry = mapSymmetry(data.symmetry);
  }
  
  // mechanicalType: Map abbreviations and various formats
  if (data.mechanicalType !== undefined) {
    sanitized.mechanicalType = mapMechanicalType(data.mechanicalType);
  }
  
  // =========================================================================
  // ARRAY FIELDS - Ensure arrays are properly preserved (even if empty)
  // =========================================================================
  
  // secondaryMuscles: Always preserve as array (even empty)
  if (data.secondaryMuscles !== undefined) {
    sanitized.secondaryMuscles = Array.isArray(data.secondaryMuscles) ? data.secondaryMuscles : [];
  }
  
  // injuryShield: Always preserve as array (even empty)
  if (data.injuryShield !== undefined) {
    sanitized.injuryShield = Array.isArray(data.injuryShield) ? data.injuryShield : [];
  }
  
  // tags: Always preserve as array (even empty)
  if (data.tags !== undefined) {
    sanitized.tags = Array.isArray(data.tags) ? data.tags : [];
  }
  
  // requiredLocations: Always preserve as array (even empty)
  if (data.requiredLocations !== undefined) {
    sanitized.requiredLocations = Array.isArray(data.requiredLocations) ? data.requiredLocations : [];
  }
  
  // muscleGroups: Always preserve as array (even empty)
  if (data.muscleGroups !== undefined) {
    sanitized.muscleGroups = Array.isArray(data.muscleGroups) ? data.muscleGroups : [];
  }
  
  // requiredUserGear: Always preserve as array (even empty)
  if (data.requiredUserGear !== undefined) {
    sanitized.requiredUserGear = Array.isArray(data.requiredUserGear) ? data.requiredUserGear : [];
  }
  
  // =========================================================================
  // SCALAR METADATA FIELDS - Explicit handling to prevent loss
  // =========================================================================
  
  // primaryMuscle: Preserve as-is
  if (data.primaryMuscle !== undefined) {
    sanitized.primaryMuscle = data.primaryMuscle;
  }
  
  // noiseLevel: Validate 1-3 range
  if (data.noiseLevel !== undefined && data.noiseLevel !== null) {
    const level = Number(data.noiseLevel);
    if ([1, 2, 3].includes(level)) {
      sanitized.noiseLevel = level;
    }
  }
  
  // sweatLevel: Validate 1-3 range
  if (data.sweatLevel !== undefined && data.sweatLevel !== null) {
    const level = Number(data.sweatLevel);
    if ([1, 2, 3].includes(level)) {
      sanitized.sweatLevel = level;
    }
  }
  
  // fieldReady: Boolean field
  if (data.fieldReady !== undefined) {
    sanitized.fieldReady = !!data.fieldReady;
  }

  // Sanitize execution_methods - ensure methodName is always a string, not an object
  if (data.execution_methods !== undefined && Array.isArray(data.execution_methods)) {
    sanitized.execution_methods = data.execution_methods.map(sanitizeExecutionMethodForSave);
  }

  // Sanitize media object - convert undefined to null for tracking missing media
  if (data.media !== undefined) {
    sanitized.media = {};
    
    // videoUrl - convert empty/undefined to null for tracking
    if (data.media.videoUrl && typeof data.media.videoUrl === 'string' && data.media.videoUrl.trim() !== '') {
      sanitized.media.videoUrl = data.media.videoUrl.trim();
    } else {
      sanitized.media.videoUrl = null; // Track as missing media
    }
    
    // imageUrl - convert empty/undefined to null for tracking
    if (data.media.imageUrl && typeof data.media.imageUrl === 'string' && data.media.imageUrl.trim() !== '') {
      sanitized.media.imageUrl = data.media.imageUrl.trim();
    } else {
      sanitized.media.imageUrl = null; // Track as missing media
    }
    
    // Copy other media properties, converting undefined to null
    Object.keys(data.media).forEach((key) => {
      if (key !== 'videoUrl' && key !== 'imageUrl') {
        const value = (data.media as any)[key];
        sanitized.media[key] = value !== undefined ? value : null;
      }
    });
  } else {
    // No media provided - create empty structure with null values for tracking
    sanitized.media = {
      videoUrl: null,
      imageUrl: null,
    };
  }

  // Remove alternativeEquipmentRequirements (deprecated - now automated)
  if (sanitized.alternativeEquipmentRequirements !== undefined) {
    delete sanitized.alternativeEquipmentRequirements;
  }

  return convertUndefinedToNull(sanitized);
}

// ============================================================================
// NORMALIZATION FUNCTION
// ============================================================================

/**
 * Normalize exercise data with default values for missing fields
 * CRITICAL: This is the "border control" - ALL string fields MUST be sanitized here
 * CRITICAL: All metadata fields MUST be explicitly included to prevent data loss
 */
export function normalizeExercise(docId: string, data: any): Exercise {
  // CRITICAL: Sanitize execution_methods before creating exercise object
  // This ensures methodName is ALWAYS a string, never an object
  let sanitizedExecutionMethods: any[] | undefined;
  if (Array.isArray(data.execution_methods)) {
    sanitizedExecutionMethods = data.execution_methods.map((method: any) => {
      const sanitized = sanitizeExecutionMethod(method);
      // DOUBLE-CHECK: Ensure methodName is definitely a string
      if (typeof sanitized.methodName !== 'string') {
        sanitized.methodName = '';
      }
      // Ensure gearIds and equipmentIds are arrays (sanitizeExecutionMethod handles migration)
      if (!Array.isArray(sanitized.gearIds)) {
        sanitized.gearIds = [];
      }
      if (!Array.isArray(sanitized.equipmentIds)) {
        sanitized.equipmentIds = [];
      }
      return sanitized;
    });
  }
  
  // CRITICAL: Sanitize highlights - ensure all items are strings
  const sanitizedHighlights = sanitizeHighlights(data.content?.highlights);
  
  // Set default isFollowAlong based on exerciseRole
  const exerciseRole = data.exerciseRole || 'main';
  const defaultIsFollowAlong = exerciseRole === 'warmup' || exerciseRole === 'cooldown';

  // =========================================================================
  // NORMALIZE CLASSIFICATION FIELDS - Null-safe handling of case variations
  // =========================================================================
  
  const normalizedMovementType = mapMovementType(data.movementType);
  const normalizedSymmetry = mapSymmetry(data.symmetry);
  const normalizedMechanicalType = mapMechanicalType(data.mechanicalType);

  const exercise: Exercise = {
    id: docId,
    name: data.name || { he: '', en: '', es: '' },
    type: data.type || 'reps',
    loggingMode: data.loggingMode || 'reps',
    exerciseRole: exerciseRole,
    isFollowAlong: data.isFollowAlong !== undefined ? data.isFollowAlong : defaultIsFollowAlong,
    secondsPerRep: data.secondsPerRep !== undefined ? data.secondsPerRep : (data.loggingMode === 'reps' ? 3 : undefined),
    defaultRestSeconds: data.defaultRestSeconds !== undefined ? data.defaultRestSeconds : (data.loggingMode === 'reps' ? 30 : undefined),
    movementType: normalizedMovementType,
    symmetry: normalizedSymmetry,
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
    muscleGroups: Array.isArray(data.muscleGroups) ? data.muscleGroups : [],
    programIds: Array.isArray(data.programIds) ? data.programIds : [],
    media: data.media || {},
    execution_methods: sanitizedExecutionMethods,
    executionMethods: sanitizedExecutionMethods, // Alias for camelCase access
    content: {
      ...(data.content || {}),
      highlights: sanitizedHighlights,
    },
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
    
    // ========================================================================
    // METADATA FIELDS - All must be explicitly included to prevent data loss
    // ========================================================================
    
    // === MUSCLE CLASSIFICATION ===
    primaryMuscle: data.primaryMuscle || undefined,
    secondaryMuscles: Array.isArray(data.secondaryMuscles) ? data.secondaryMuscles : undefined,
    
    // === GENERAL METRICS (Effort/Indicators) ===
    noiseLevel: [1, 2, 3].includes(data.noiseLevel) ? data.noiseLevel : undefined,
    sweatLevel: [1, 2, 3].includes(data.sweatLevel) ? data.sweatLevel : undefined,
    
    // === SAFETY / SENSITIVITY ZONES ===
    injuryShield: Array.isArray(data.injuryShield) ? data.injuryShield : undefined,
    
    // === TECHNICAL CLASSIFICATION ===
    mechanicalType: normalizedMechanicalType,
    fieldReady: typeof data.fieldReady === 'boolean' ? data.fieldReady : undefined,
    
    // === TAGS ===
    tags: Array.isArray(data.tags) ? data.tags : undefined,
    
    // === PRODUCTION REQUIREMENTS ===
    requiredLocations: Array.isArray(data.requiredLocations) ? data.requiredLocations : undefined,
  };

  // Log warning if base_movement_id is missing and exercise has execution_methods (needed for Smart Swap)
  if (!exercise.base_movement_id && exercise.execution_methods && exercise.execution_methods.length > 0) {
    console.warn(
      `[normalizeExercise] Missing base_movement_id for exercise "${getLocalizedText(exercise.name)}" (ID: ${docId}). ` +
        `This field is required for Smart Swap functionality. Please add it in the admin panel.`
    );
  }

  return exercise;
}

// ============================================================================
// SMART SWAP: BASE MOVEMENT ID INFERENCE
// ============================================================================

/**
 * Heuristic map: movementGroup → best-guess base_movement_id.
 * Used when an exercise is missing base_movement_id.
 */
const MOVEMENT_GROUP_TO_BASE: Record<string, string> = {
  horizontal_push: 'push_up',
  vertical_push: 'handstand',
  horizontal_pull: 'row',
  vertical_pull: 'pull_up',
  squat: 'pistol_squat',
  hinge: 'pistol_squat',
  core: 'l_sit',
  isolation: 'ring_work',
};

/**
 * Attempt to infer base_movement_id from movementGroup.
 * Returns the inferred ID, or null if no mapping exists.
 */
export function inferBaseMovementId(exercise: Pick<Exercise, 'movementGroup' | 'base_movement_id'>): string | null {
  if (exercise.base_movement_id) return exercise.base_movement_id;
  if (!exercise.movementGroup) return null;
  return MOVEMENT_GROUP_TO_BASE[exercise.movementGroup] || null;
}

/**
 * Diagnose all exercises that are missing base_movement_id.
 * Returns exercises split into auto-assignable (have movementGroup) and manual-only.
 */
export function diagnoseSmartSwapGaps(exercises: Exercise[]): {
  missing: Exercise[];
  autoAssignable: Array<{ exercise: Exercise; suggestedId: string }>;
  manualOnly: Exercise[];
} {
  const missing: Exercise[] = [];
  const autoAssignable: Array<{ exercise: Exercise; suggestedId: string }> = [];
  const manualOnly: Exercise[] = [];

  for (const ex of exercises) {
    if (ex.base_movement_id) continue;
    missing.push(ex);
    const inferred = inferBaseMovementId(ex);
    if (inferred) {
      autoAssignable.push({ exercise: ex, suggestedId: inferred });
    } else {
      manualOnly.push(ex);
    }
  }

  return { missing, autoAssignable, manualOnly };
}

// ============================================================================
// DEEP MERGE FOR UPDATES
// ============================================================================

/**
 * Deep merge two objects, preserving nested fields from existing data
 * When merging arrays (like execution_methods), merge by index to preserve workflow states
 */
export function deepMergeForUpdate(existing: any, incoming: any): any {
  if (incoming === null || incoming === undefined) return incoming;
  if (typeof incoming !== 'object' || incoming instanceof Date) return incoming;
  if (typeof existing !== 'object' || existing === null || existing instanceof Date) return incoming;
  
  // Handle arrays - special case for execution_methods
  if (Array.isArray(incoming)) {
    if (!Array.isArray(existing)) return incoming;
    
    // Merge arrays by index, preserving existing fields that aren't in incoming
    return incoming.map((incomingItem, index) => {
      const existingItem = existing[index];
      if (!existingItem) return incomingItem;
      
      // Deep merge the items
      return deepMergeForUpdate(existingItem, incomingItem);
    });
  }
  
  // Handle objects - merge all keys
  const merged: any = { ...existing };
  for (const key of Object.keys(incoming)) {
    const incomingValue = incoming[key];
    const existingValue = existing[key];
    
    // Special handling: never overwrite workflow with undefined/null if it exists
    if (key === 'workflow' && existingValue && !incomingValue) {
      continue; // Preserve existing workflow
    }
    
    // Deep merge nested objects
    if (typeof incomingValue === 'object' && incomingValue !== null && !Array.isArray(incomingValue) && !(incomingValue instanceof Date)) {
      merged[key] = deepMergeForUpdate(existingValue, incomingValue);
    } else if (Array.isArray(incomingValue)) {
      merged[key] = deepMergeForUpdate(existingValue, incomingValue);
    } else {
      merged[key] = incomingValue;
    }
  }
  
  return merged;
}
