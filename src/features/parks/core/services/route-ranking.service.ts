// ==========================================
// שירות דירוג מסלולים (Route Ranking)
// משתמש בנתוני המשתמש כדי לדרג מסלולים
// ==========================================

import { Route, MapPark } from '../types/map-objects.type';
import { UserFullProfile } from '@/types/user-profile';

export interface RankedRoute extends Route {
  matchScore: number; // ציון התאמה 0-10
  estimatedCalories: number;
  estimatedCoins: number;
  isRecommended: boolean; // האם זה המסלול המומלץ ביותר
}

// ==========================================
// חישוב MET (Metabolic Equivalent of Task)
// ==========================================
function getMET(activityType: 'running' | 'walking' | 'cycling' | 'workout', difficulty: 'easy' | 'medium' | 'hard'): number {
  const baseMET: Record<'running' | 'walking' | 'cycling' | 'workout', number> = {
    walking: 3.5,
    running: 8.0,
    cycling: 7.5,
    workout: 6.0,
  };

  const difficultyMultiplier: Record<string, number> = {
    easy: 0.8,
    medium: 1.0,
    hard: 1.3,
  };

  return baseMET[activityType] * difficultyMultiplier[difficulty];
}

// ==========================================
// חישוב קלוריות ומטבעות
// ==========================================
export function calculateRouteRewards(
  route: Route,
  userWeight: number, // ק"ג
  activityType?: 'running' | 'walking' | 'cycling' | 'workout'
): { calories: number; coins: number } {
  // השתמש ב-activityType מהנתיב אם לא צוין
  const routeActivityType = activityType || route.activityType || route.type;
  const MET = getMET(routeActivityType, route.difficulty);
  const durationHours = route.duration / 60; // דקות -> שעות

  // נוסחת קלוריות: MET * weight(kg) * time(hours)
  const calories = Math.round(MET * userWeight * durationHours);

  // נוסחת מטבעות: מרחק (ק"מ) * מקדם פעילות
  // ריצה: 20 מטבעות לק"מ
  // רכיבה: 15 מטבעות לק"מ
  // הליכה: 10 מטבעות לק"מ
  let coinMultiplier = 10; // Default (Walking)
  if (routeActivityType === 'running') coinMultiplier = 20;
  if (routeActivityType === 'cycling') coinMultiplier = 15;

  const coins = Math.round(route.distance * coinMultiplier);

  return { calories, coins };
}

// ==========================================
// חישוב ציון התאמה (Match Score)
// ==========================================
function calculateMatchScore(
  route: Route,
  userProfile: UserFullProfile,
  targetDuration?: number
): number {
  let score = 0;

  // 1. התאמה לרמת קושי (0-4 נקודות)
  // עבור אופניים, נשתמש בגרסה מקלה יותר של ההתאמה
  const userLevel = userProfile.progression.domains.upper_body?.currentLevel || 1;
  const routeLevel = route.difficulty === 'easy' ? 1 : route.difficulty === 'medium' ? 3 : 5;
  const levelDiff = Math.abs(userLevel - routeLevel);
  // אופניים בדרך כלל קלים יותר מבחינת קושי גופני
  const adjustedDiff = (route.activityType === 'cycling' || route.type === 'cycling') ? levelDiff * 0.7 : levelDiff;
  const difficultyScore = Math.max(0, 4 - adjustedDiff);
  score += difficultyScore;

  // 2. התאמה לזמן (0-3 נקודות)
  if (targetDuration) {
    const timeDiff = Math.abs(route.duration - targetDuration);
    const timeScore = Math.max(0, 3 - (timeDiff / 10)); // 10 דקות = נקודה אחת
    score += timeScore;
  } else {
    score += 1.5; // בונוס אם אין דרישת זמן
  }

  // 3. איכות המסלול (0-2 נקודות)
  const qualityScore = Math.min(2, route.score / 100); // score גבוה = איכות טובה
  score += qualityScore;

  // 4. מרחק (0-1 נקודה) - מסלולים בינוניים עדיפים
  if (route.distance >= 2 && route.distance <= 5) {
    score += 1;
  } else if (route.distance > 0 && route.distance < 10) {
    score += 0.5;
  }

  return Math.min(10, Math.round(score * 10) / 10); // עיגול ל-10
}

// ==========================================
// דירוג מסלולים (עם Curator Mode - Hybrid Formula)
// ==========================================
export function rankRoutes(
  routes: Route[],
  userProfile: UserFullProfile,
  targetDuration?: number
): RankedRoute[] {
  const userWeight = userProfile.core.weight || 70;

  // חישוב ציון התאמה לכל מסלול
  const ranked = routes.map((route) => {
    // ציון התאמה למשתמש (0-10)
    const userMatchScore = calculateMatchScore(route, userProfile, targetDuration);

    // ציון אדמין (0-10), ברירת מחדל 0
    const adminRating = route.adminRating ?? 0;

    // נוסחת Hybrid: 70% ציון משתמש + 30% ציון אדמין
    let finalScore = (userMatchScore * 0.7) + (adminRating * 0.3);

    // בונוס למסלולים מקודמים
    if (route.isPromoted) {
      finalScore += 1.5;
    }

    // הגבל את הציון ל-10
    const matchScore = Math.min(10, finalScore);

    const rewards = calculateRouteRewards(route, userWeight);

    return {
      ...route,
      matchScore,
      estimatedCalories: rewards.calories,
      estimatedCoins: rewards.coins,
      isRecommended: false, // נקבע בהמשך
    };
  });

  // מיון לפי ציון התאמה (גבוה -> נמוך)
  ranked.sort((a, b) => b.matchScore - a.matchScore);

  // סימון המסלול המומלץ ביותר
  if (ranked.length > 0) {
    ranked[0].isRecommended = true;
  }

  return ranked;
}
