/**
 * Exercise Analysis Service
 * 
 * Handles production readiness checks, content matrix analysis, and gap detection.
 * No direct Firestore dependencies - works with Exercise objects.
 */

import { Exercise, ExecutionLocation, getLocalizedText } from '../core/exercise.types';

// ============================================================================
// PRODUCTION READINESS TYPES
// ============================================================================

/**
 * Media status for an exercise or execution method
 */
export type MediaStatus = 'complete' | 'partial' | 'missing';

/**
 * Production readiness status
 */
export interface ProductionReadiness {
  status: 'production_ready' | 'pending_filming' | 'missing_all_media';
  hasMainImage: boolean;
  hasMainVideo: boolean;
  executionMethodsStatus: {
    methodName: string;
    hasImage: boolean;
    hasVideo: boolean;
  }[];
  missingCount: number;
  totalMediaSlots: number;
}

// ============================================================================
// PRODUCTION READINESS FUNCTIONS
// ============================================================================

/**
 * Check if an exercise is production ready (has all required media)
 */
export function getExerciseProductionReadiness(exercise: Exercise): ProductionReadiness {
  const result: ProductionReadiness = {
    status: 'production_ready',
    hasMainImage: false,
    hasMainVideo: false,
    executionMethodsStatus: [],
    missingCount: 0,
    totalMediaSlots: 2, // Main image + main video
  };

  // Check main media
  result.hasMainImage = !!(exercise.media?.imageUrl && exercise.media.imageUrl.trim() !== '');
  result.hasMainVideo = !!(exercise.media?.videoUrl && exercise.media.videoUrl.trim() !== '');

  if (!result.hasMainImage) result.missingCount++;
  if (!result.hasMainVideo) result.missingCount++;

  // Check execution methods media
  const methods = exercise.execution_methods || exercise.executionMethods || [];
  for (const method of methods) {
    const methodStatus = {
      methodName: typeof method.methodName === 'string' ? method.methodName : '',
      hasImage: !!(method.media?.imageUrl && method.media.imageUrl.trim() !== ''),
      hasVideo: !!(method.media?.mainVideoUrl && method.media.mainVideoUrl.trim() !== ''),
    };
    result.executionMethodsStatus.push(methodStatus);
    result.totalMediaSlots += 2; // Each method has image + video slots
    if (!methodStatus.hasImage) result.missingCount++;
    if (!methodStatus.hasVideo) result.missingCount++;
  }

  // Determine overall status
  if (result.missingCount === 0) {
    result.status = 'production_ready';
  } else if (result.missingCount === result.totalMediaSlots) {
    result.status = 'missing_all_media';
  } else {
    result.status = 'pending_filming';
  }

  return result;
}

/**
 * Check if an exercise is production ready (shorthand)
 */
export function isExerciseProductionReady(exercise: Exercise): boolean {
  return getExerciseProductionReadiness(exercise).status === 'production_ready';
}

/**
 * Check if an exercise is pending filming
 */
export function isExercisePendingFilming(exercise: Exercise): boolean {
  const status = getExerciseProductionReadiness(exercise).status;
  return status === 'pending_filming' || status === 'missing_all_media';
}

// ============================================================================
// CONTENT MATRIX TYPES
// ============================================================================

export const CONTENT_LOCATIONS: ExecutionLocation[] = ['home', 'park', 'office', 'gym', 'street'];

/**
 * Production status for a method at a specific location
 * - 'ready': workflow.uploaded === true AND media exists
 * - 'in_post_production': filmed === true but uploaded === false
 * - 'needs_media': method exists but no video/image uploaded yet
 * - 'not_started': workflow not started
 */
export type MethodProductionStatus = 'ready' | 'in_post_production' | 'needs_media' | 'not_started';

/**
 * Gap type classification for content matrix
 * - 'missing_media': Method exists but media is null (RED - must film)
 * - 'missing_required_method': No method for a REQUIRED location (RED - strategic gap)
 * - 'missing_optional_method': No method for an optional location (GREY - can add if desired)
 * - 'incomplete_workflow': Workflow started but not complete (AMBER)
 */
export type GapType = 'missing_media' | 'missing_required_method' | 'missing_optional_method' | 'incomplete_workflow';

export interface ContentMatrixGap {
  type: GapType;
  location?: ExecutionLocation;
  message: string;
}

export interface ContentMatrixLocation {
  methodIndex: number;
  methodName: string;
  workflow: {
    filmed: boolean;
    audio: boolean;
    edited: boolean;
    uploaded: boolean;
  };
  needsLongExplanation: boolean;
  explanationStatus: 'missing' | 'ready' | null;
  hasVideo: boolean;
  hasImage: boolean;
  /** Computed production status based on workflow + media */
  productionStatus: MethodProductionStatus;
}

/**
 * Content Matrix row data structure
 */
export interface ContentMatrixRow {
  exercise: Exercise;
  exerciseId: string;
  name: string;
  level: number;
  descriptionStatus: 'complete' | 'partial' | 'missing';
  generalCuesStatus: 'complete' | 'partial' | 'missing';
  productionReadiness: ProductionReadiness;
  /** 
   * Map of location to array of methods at that location.
   * An exercise can have multiple methods for the same location (e.g., Home with Rings vs Home with Towel).
   * Empty array means no methods exist for that location.
   */
  locations: Record<ExecutionLocation, ContentMatrixLocation[]>;
  /** Which locations are required for this exercise */
  requiredLocations: ExecutionLocation[];
  /** Detailed gap analysis with type classification */
  gapsDetailed: ContentMatrixGap[];
  /** Legacy string array for backward compatibility */
  gaps: string[];
  /** Count of critical gaps (missing media or missing required methods) */
  criticalGapCount: number;
  /** Count of workflow gaps (in post-production) */
  workflowGapCount: number;
}

/**
 * Generate task list for filming/editing team
 */
export interface TaskListSummary {
  forFilming: Array<{ exerciseId: string; exerciseName: string; location: ExecutionLocation; methodName: string }>;
  forAudio: Array<{ exerciseId: string; exerciseName: string; location: ExecutionLocation; methodName: string }>;
  forEditing: Array<{ exerciseId: string; exerciseName: string; location: ExecutionLocation; methodName: string }>;
  forUpload: Array<{ exerciseId: string; exerciseName: string; location: ExecutionLocation; methodName: string }>;
}

// ============================================================================
// CONTENT MATRIX FUNCTIONS
// ============================================================================

/**
 * Determine production status for a method based on workflow and media
 */
function getMethodProductionStatus(
  workflow: ContentMatrixLocation['workflow'],
  hasVideo: boolean,
  hasImage: boolean
): MethodProductionStatus {
  // Ready = uploaded AND has media
  if (workflow.uploaded && (hasVideo || hasImage)) {
    return 'ready';
  }
  
  // In post-production = filmed but not uploaded yet
  if (workflow.filmed && !workflow.uploaded) {
    return 'in_post_production';
  }
  
  // Needs media = method exists but no media uploaded
  if (!hasVideo && !hasImage) {
    return 'needs_media';
  }
  
  // Not started
  return 'not_started';
}

/**
 * Analyze an exercise and return its content matrix row data
 */
export function analyzeExerciseForMatrix(exercise: Exercise): ContentMatrixRow {
  const methods = exercise.execution_methods || exercise.executionMethods || [];
  
  // Get level from targetPrograms (default to 1)
  const level = exercise.targetPrograms?.[0]?.level || 1;
  
  // Get required locations (empty array if not set)
  const requiredLocations = exercise.requiredLocations || [];
  
  // Check description status
  const descriptionStatus: 'complete' | 'partial' | 'missing' = 
    (exercise.content?.description?.he && exercise.content?.description?.en) ? 'complete' :
    (exercise.content?.description?.he || exercise.content?.description?.en || exercise.content?.goal) ? 'partial' :
    'missing';
  
  // Check general cues status
  const cues = exercise.content?.specificCues || [];
  const highlights = exercise.content?.highlights || [];
  const generalCuesStatus: 'complete' | 'partial' | 'missing' = 
    (cues.length >= 3 || highlights.length >= 3) ? 'complete' :
    (cues.length > 0 || highlights.length > 0) ? 'partial' :
    'missing';
  
  // Build locations map - each location can have MULTIPLE methods (e.g., Home with Rings vs Home with Towel)
  const locations: Record<ExecutionLocation, ContentMatrixLocation[]> = {
    home: [],
    park: [],
    street: [],
    office: [],
    school: [],
    gym: [],
    airport: [],
  };
  
  methods.forEach((method, index) => {
    const locs = method.locationMapping || [method.location];
    locs.forEach((loc) => {
      if (loc) {
        const hasVideo = !!(method.media?.mainVideoUrl && method.media.mainVideoUrl.trim() !== '');
        const hasImage = !!(method.media?.imageUrl && method.media.imageUrl.trim() !== '');
        const workflow = {
          filmed: method.workflow?.filmed || false,
          audio: method.workflow?.audio || false,
          edited: method.workflow?.edited || false,
          uploaded: method.workflow?.uploaded || false,
        };
        
        // Push ALL methods for this location (supports multiple methods per location)
        locations[loc].push({
          methodIndex: index,
          methodName: method.methodName || `Method ${index + 1}`,
          workflow,
          needsLongExplanation: method.needsLongExplanation || false,
          explanationStatus: method.explanationStatus || null,
          hasVideo,
          hasImage,
          productionStatus: getMethodProductionStatus(workflow, hasVideo, hasImage),
        });
      }
    });
  });
  
  // Analyze gaps with type classification
  const gapsDetailed: ContentMatrixGap[] = [];
  const gaps: string[] = []; // Legacy format
  let criticalGapCount = 0;
  let workflowGapCount = 0;
  
  // Check each location
  CONTENT_LOCATIONS.forEach((loc) => {
    const locMethods = locations[loc];
    const isRequired = requiredLocations.includes(loc);
    
    if (locMethods.length > 0) {
      // Methods exist - check each method for gaps
      locMethods.forEach((locData, methodIdx) => {
        const methodLabel = locMethods.length > 1 ? `${loc}/${locData.methodName}` : loc;
        
        // Check for missing media (RED)
        if (!locData.hasVideo && !locData.hasImage) {
          gapsDetailed.push({
            type: 'missing_media',
            location: loc,
            message: `${methodLabel}: חסרה מדיה`,
          });
          gaps.push(`${methodLabel}: חסרה מדיה`);
          criticalGapCount++;
        }
        
        // Check for incomplete workflow (AMBER - in post-production)
        if (locData.productionStatus === 'in_post_production') {
          if (locData.workflow.filmed && !locData.workflow.edited) {
            gapsDetailed.push({
              type: 'incomplete_workflow',
              location: loc,
              message: `${methodLabel}: בפוסט-פרודקשן (צולם, לא נערך)`,
            });
            gaps.push(`${methodLabel}: צולם אך לא נערך`);
            workflowGapCount++;
          } else if (locData.workflow.edited && !locData.workflow.uploaded) {
            gapsDetailed.push({
              type: 'incomplete_workflow',
              location: loc,
              message: `${methodLabel}: בפוסט-פרודקשן (נערך, לא הועלה)`,
            });
            gaps.push(`${methodLabel}: נערך אך לא הועלה`);
            workflowGapCount++;
          }
        }
      });
    } else {
      // No methods for this location
      if (isRequired) {
        // Missing REQUIRED location (RED - strategic gap)
        gapsDetailed.push({
          type: 'missing_required_method',
          location: loc,
          message: `${loc}: חסרה שיטת ביצוע נדרשת`,
        });
        gaps.push(`${loc}: חסרה שיטה נדרשת`);
        criticalGapCount++;
      }
      // If not required, don't add to gaps - just show "Add" button in UI
    }
  });
  
  return {
    exercise,
    exerciseId: exercise.id,
    name: getLocalizedText(exercise.name, 'he'),
    level,
    descriptionStatus,
    generalCuesStatus,
    productionReadiness: getExerciseProductionReadiness(exercise),
    locations,
    requiredLocations,
    gapsDetailed,
    gaps,
    criticalGapCount,
    workflowGapCount,
  };
}

/**
 * Generate task list for filming/editing team
 */
export function generateTaskList(rows: ContentMatrixRow[]): TaskListSummary {
  const result: TaskListSummary = {
    forFilming: [],
    forAudio: [],
    forEditing: [],
    forUpload: [],
  };
  
  for (const row of rows) {
    for (const loc of CONTENT_LOCATIONS) {
      const locMethods = row.locations[loc];
      // Now iterates over ALL methods at this location
      for (const locData of locMethods) {
        const base = {
          exerciseId: row.exerciseId,
          exerciseName: row.name,
          location: loc,
          methodName: locData.methodName,
        };
        
        if (!locData.workflow.filmed) {
          result.forFilming.push(base);
        } else if (!locData.workflow.audio) {
          result.forAudio.push(base);
        } else if (!locData.workflow.edited) {
          result.forEditing.push(base);
        } else if (!locData.workflow.uploaded) {
          result.forUpload.push(base);
        }
      }
    }
  }
  
  return result;
}
