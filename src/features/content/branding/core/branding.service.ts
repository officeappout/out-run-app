/**
 * Branding & Messaging Service
 * Handles persona selection, content retrieval, and emotional context logic
 */

import { UserFullProfile } from '@/features/user';
import { ExecutionLocation } from '@/features/content/exercises';

export type PersonaType = 'parent' | 'student' | 'office_worker' | 'remote_worker' | 'athlete' | 'senior' | 'high-tech';

export interface PersonaSelectionContext {
  currentLocation: ExecutionLocation;
  currentTime: Date;
  userProfile: UserFullProfile;
  assignedPersonas?: PersonaType[]; // User's assigned personas from profile
}

/**
 * Select active persona based on Priority Scale logic
 * Priority:
 * 1. IF currentLocation is 'office' OR 'work' -> Persona = 'high-tech'
 * 2. IF currentTime is 17:00-21:00 OR Location is 'park' -> Persona = 'parent'
 * 3. Default to rotation or hybrid of assigned personas
 */
export function selectActivePersona(context: PersonaSelectionContext): PersonaType {
  const { currentLocation, currentTime, userProfile, assignedPersonas } = context;
  
  const currentHour = currentTime.getHours();
  const isEvening = currentHour >= 17 && currentHour < 21; // 17:00-21:00
  
  // Priority 1: Office/Work location -> high-tech persona
  if (currentLocation === 'office' || currentLocation === 'work') {
    return 'high-tech';
  }
  
  // Priority 2: Evening time (17:00-21:00) OR Park location -> parent persona
  if (isEvening || currentLocation === 'park') {
    return 'parent';
  }
  
  // Priority 3: Use assigned personas or default
  if (assignedPersonas && assignedPersonas.length > 0) {
    // Rotate based on day of week for variety
    const dayOfWeek = currentTime.getDay();
    const personaIndex = dayOfWeek % assignedPersonas.length;
    return assignedPersonas[personaIndex];
  }
  
  // Fallback: Check user profile for persona
  if (userProfile.personaId) {
    // Map personaId to PersonaType if needed
    const personaMap: Record<string, PersonaType> = {
      'parent': 'parent',
      'student': 'student',
      'office_worker': 'office_worker',
      'remote_worker': 'remote_worker',
      'athlete': 'athlete',
      'senior': 'senior',
    };
    return personaMap[userProfile.personaId] || 'parent';
  }
  
  // Default fallback
  return 'parent';
}

/**
 * Get user's first name from profile
 */
export function getUserFirstName(userProfile: UserFullProfile | null | undefined): string {
  if (!userProfile) return 'משתמש';
  
  const fullName = userProfile.core?.name || '';
  if (!fullName) return 'משתמש';
  
  // Extract first name (split by space and take first part)
  const firstName = fullName.split(' ')[0].trim();
  return firstName || 'משתמש';
}

/**
 * Get user's goal in Hebrew
 */
export function getUserGoalHebrew(userProfile: UserFullProfile | null | undefined): string {
  if (!userProfile) return 'אימון';
  
  const mainGoal = userProfile.core?.mainGoal;
  if (!mainGoal) return 'אימון';
  
  const goalMap: Record<string, string> = {
    'healthy_lifestyle': 'אורח חיים בריא',
    'performance_boost': 'שיפור ביצועים',
    'weight_loss': 'ירידה במשקל',
    'skill_mastery': 'שליטה במיומנויות',
  };
  
  return goalMap[mainGoal] || 'אימון';
}
