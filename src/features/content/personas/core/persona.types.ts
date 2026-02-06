/**
 * Persona (Lemur) Management Types
 * Defines the structure for personas in the 'personas' collection
 */
import { LocalizedText } from '../../shared/localized-text.types';

/**
 * Persona document structure in Firestore
 */
export interface Persona {
  id: string;
  name: LocalizedText; // e.g., { he: 'הלמור המשרדי', en: 'Office Lemur' }
  description: LocalizedText; // e.g., { he: 'מושלם לעובדי משרד...', en: 'Perfect for office workers...' }
  imageUrl: string; // URL to lemur character image
  linkedLifestyleTags: string[]; // e.g., ['office_worker', 'remote_worker']
  themeColor: string; // Hex color code (e.g., '#3B82F6')
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Form data for creating/editing personas
 */
export type PersonaFormData = Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>;
