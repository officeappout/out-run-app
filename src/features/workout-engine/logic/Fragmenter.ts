/**
 * Fragmenter - Workout Splitting Logic
 * 
 * Based on TRAINING_LOGIC.md Rule #1 (Fragmented Mode)
 * and WORKOUT_ENGINE_SPECS.md Section 3.3 (Dynamic Context)
 * 
 * When user cannot complete a full session ("No Time" / "Office Mode"):
 * - Split Strategy: Break the daily workout into two mini-sessions:
 *   - Part A (Office/Morning): Mobility, Core, or Accessories (Low Sweat, No Equipment).
 *   - Part B (Home/Evening): Main Compound Lifts (Push/Pull) requiring equipment.
 * - Completion: The day is marked "Done" only when Part A + Part B are completed.
 * 
 * If Context.timeAvailable < Blueprint.minDuration:
 *   Part A (Office): Extract SweatLevel: 1 + Equipment: None exercises
 *   Part B (Home): Keep the heavy compounds
 */

import {
  WorkoutBlueprint,
  BlueprintSlot,
  FilledSlot,
  WorkoutFragment,
  GeneratedSession,
  GenerationContext,
} from '../core/types/blueprint.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the fragmenter
 */
export interface FragmenterConfig {
  /** Minimum duration for Part A (Office) in minutes */
  minPartADuration: number;
  
  /** Maximum duration for Part A (Office) in minutes */
  maxPartADuration: number;
  
  /** Max sweat level for Part A (Office) */
  partAMaxSweatLevel: number;
  
  /** Equipment allowed for Part A (empty = no equipment) */
  partAAllowedEquipment: string[];
}

/**
 * Result of fragmentation analysis
 */
export interface FragmentationResult {
  /** Whether the workout should be fragmented */
  shouldFragment: boolean;
  
  /** Reason for decision */
  reason: 'time_constraint' | 'user_preference' | 'location_mismatch' | 'full_workout';
  
  /** Part A slots */
  partASlots: BlueprintSlot[];
  
  /** Part B slots */
  partBSlots: BlueprintSlot[];
  
  /** Estimated duration for Part A */
  partADuration: number;
  
  /** Estimated duration for Part B */
  partBDuration: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: FragmenterConfig = {
  minPartADuration: 10,
  maxPartADuration: 20,
  partAMaxSweatLevel: 1,
  partAAllowedEquipment: [], // Bodyweight only
};

/**
 * Slot types that belong to Part A (Office/Low Impact)
 */
const PART_A_SLOT_TYPES = ['warmup', 'cooldown', 'accessory'];

/**
 * Movement patterns suitable for Part A (Low Sweat)
 */
const PART_A_MOVEMENT_PATTERNS = [
  'core_anti_extension',
  'core_anti_rotation',
  'core_flexion',
  'mobility_upper',
  'mobility_lower',
  'handstand_balance', // Skills can be done without heavy sweating
];

// ============================================================================
// FRAGMENTER CLASS
// ============================================================================

/**
 * Fragmenter - Pure TypeScript class for workout splitting
 * ISOMORPHIC: No React hooks, no browser APIs
 */
export class Fragmenter {
  private config: FragmenterConfig;
  
  constructor(config?: Partial<FragmenterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Analyze whether a workout should be fragmented
   */
  analyze(
    blueprint: WorkoutBlueprint,
    context: GenerationContext
  ): FragmentationResult {
    // Decision 1: Time constraint
    const timeConstrained = context.timeAvailable < blueprint.minDuration;
    
    // Decision 2: Location mismatch (at office but workout needs equipment)
    const atOffice = context.location === 'office';
    const needsEquipment = this.blueprintNeedsEquipment(blueprint);
    const locationMismatch = atOffice && needsEquipment;
    
    // Decision 3: Blueprint explicitly supports fragmentation
    const canFragment = blueprint.canFragment;
    
    // Determine if we should fragment
    const shouldFragment = canFragment && (timeConstrained || locationMismatch);
    
    if (!shouldFragment) {
      return {
        shouldFragment: false,
        reason: 'full_workout',
        partASlots: [],
        partBSlots: blueprint.slots,
        partADuration: 0,
        partBDuration: blueprint.targetDuration,
      };
    }
    
    // Fragment the slots
    const { partA, partB } = this.splitSlots(blueprint.slots);
    
    return {
      shouldFragment: true,
      reason: timeConstrained ? 'time_constraint' : 'location_mismatch',
      partASlots: partA,
      partBSlots: partB,
      partADuration: this.estimateDuration(partA),
      partBDuration: this.estimateDuration(partB),
    };
  }
  
  /**
   * Split slots into Part A and Part B
   */
  private splitSlots(slots: BlueprintSlot[]): { partA: BlueprintSlot[]; partB: BlueprintSlot[] } {
    const partA: BlueprintSlot[] = [];
    const partB: BlueprintSlot[] = [];
    
    for (const slot of slots) {
      // Check explicit fragmentPart assignment first
      if (slot.fragmentPart === 'A') {
        partA.push(slot);
        continue;
      }
      if (slot.fragmentPart === 'B') {
        partB.push(slot);
        continue;
      }
      
      // Otherwise, use automatic classification
      if (this.isPartASlot(slot)) {
        partA.push(slot);
      } else {
        partB.push(slot);
      }
    }
    
    return { partA, partB };
  }
  
  /**
   * Determine if a slot belongs to Part A (Office/Low Impact)
   */
  private isPartASlot(slot: BlueprintSlot): boolean {
    // Check slot type
    if (PART_A_SLOT_TYPES.includes(slot.type)) {
      return true;
    }
    
    // Check movement pattern
    if (PART_A_MOVEMENT_PATTERNS.includes(slot.movementPattern)) {
      return true;
    }
    
    // Check sweat level constraint
    if (slot.maxSweatLevel && slot.maxSweatLevel <= this.config.partAMaxSweatLevel) {
      return true;
    }
    
    // Check if slot requires equipment
    if (slot.preferredEquipment && slot.preferredEquipment.length > 0) {
      // Has equipment requirements -> Part B
      return false;
    }
    
    // Optional slots are more likely to be Part A (can skip if needed)
    if (slot.isOptional) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if blueprint needs equipment
   */
  private blueprintNeedsEquipment(blueprint: WorkoutBlueprint): boolean {
    return blueprint.slots.some(slot => 
      slot.preferredEquipment && slot.preferredEquipment.length > 0
    );
  }
  
  /**
   * Estimate duration for a set of slots (in minutes)
   * Simple estimation: 2 minutes per set + rest time
   */
  private estimateDuration(slots: BlueprintSlot[]): number {
    let totalMinutes = 0;
    
    for (const slot of slots) {
      // Rough estimation: 2 minutes per set for compound/accessory
      // 3 minutes per set for golden (skills need more rest)
      const minutesPerSet = slot.type === 'golden' ? 3 : 2;
      totalMinutes += slot.sets * minutesPerSet;
      
      // Add warmup/cooldown flat time
      if (slot.type === 'warmup' || slot.type === 'cooldown') {
        totalMinutes += 5; // 5 minutes for warmup/cooldown
      }
    }
    
    return Math.round(totalMinutes);
  }
  
  /**
   * Create WorkoutFragments from a fragmentation result
   */
  createFragments(
    result: FragmentationResult,
    filledSlotsA: FilledSlot[],
    filledSlotsB: FilledSlot[]
  ): WorkoutFragment[] {
    if (!result.shouldFragment) {
      return [];
    }
    
    return [
      {
        part: 'A',
        name: 'Office Session',
        slots: filledSlotsA,
        estimatedDuration: result.partADuration,
        isCompleted: false,
      },
      {
        part: 'B',
        name: 'Home Session',
        slots: filledSlotsB,
        estimatedDuration: result.partBDuration,
        isCompleted: false,
      },
    ];
  }
  
  /**
   * Check if a session is complete (both fragments done)
   */
  isSessionComplete(session: GeneratedSession): boolean {
    if (!session.isFragmented) {
      // Non-fragmented sessions are complete when all slots are done
      return true; // Completion is tracked elsewhere
    }
    
    return session.fragments.every(f => f.isCompleted);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new Fragmenter instance
 * ISOMORPHIC: Can be called from server or client
 */
export function createFragmenter(config?: Partial<FragmenterConfig>): Fragmenter {
  return new Fragmenter(config);
}

/**
 * Quick check if context requires fragmentation
 */
export function shouldFragmentWorkout(
  blueprint: WorkoutBlueprint,
  context: GenerationContext
): boolean {
  const fragmenter = createFragmenter();
  const result = fragmenter.analyze(blueprint, context);
  return result.shouldFragment;
}
