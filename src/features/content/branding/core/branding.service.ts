/**
 * Branding & Messaging Service
 * Handles content retrieval and emotional context logic
 */

import { UserFullProfile } from '@/features/user';

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
