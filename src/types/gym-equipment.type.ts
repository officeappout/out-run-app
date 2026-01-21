/**
 * Gym Equipment Management Types
 * Defines the structure for gym equipment in the 'gym_equipment' collection
 */
import { ExerciseType, MuscleGroup } from './exercise.type';

export interface EquipmentBrand {
  brandName: string; // e.g., "Ludos", "Urbanics"
  imageUrl?: string;
  videoUrl?: string;
}

/**
 * Gym Equipment document structure in Firestore
 */
export interface GymEquipment {
  id: string;
  name: string; // e.g., "Bench Press Machine", "ספסל רחוב"
  type: ExerciseType; // 'reps' | 'time' | 'rest'
  recommendedLevel: number; // 1-20
  isFunctional: boolean; // Functional equipment toggle
  muscleGroups: MuscleGroup[]; // Array of muscle groups this equipment targets
  brands: EquipmentBrand[]; // Array of manufacturers/brands for this equipment
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Gym Equipment reference in a Park
 * Stores equipmentId and selected brand
 */
export interface ParkGymEquipment {
  equipmentId: string;
  brandName: string; // Selected brand name from the equipment's brands array
}

/**
 * Form data for creating/editing gym equipment
 */
export type GymEquipmentFormData = Omit<GymEquipment, 'id' | 'createdAt' | 'updatedAt'>;
