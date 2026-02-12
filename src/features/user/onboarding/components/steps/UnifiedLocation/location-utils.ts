/**
 * UnifiedLocation — Utility Functions
 * Pure helpers, scoring engine, data fetching, and copy matrix.
 */

import { getAllParks } from '@/features/parks';
import { InventoryService } from '@/features/parks';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { ISRAELI_LOCATIONS, type IsraeliLocation, type LocationType } from '@/lib/data/israel-locations';
import type { Map as MapboxGLMap } from 'mapbox-gl';

import type {
  NearbyFacility,
  RouteWithDistance,
  SportContext,
  TrainingContext,
  IdentityHookResult,
  SmartBadge,
  SettlementType,
  SettlementNaming,
  ActivityGroup,
  PersonaGroup,
  PioneerFallbackResult,
} from './location-types';

import {
  MAPBOX_TOKEN,
  CARDIO_SPORTS,
  STRENGTH_SPORTS,
  BODY_MIND_SPORTS,
  SPOT_BASED_SPORTS,
  ROUTE_BASED_SPORTS,
  CLIMBING_SPORTS,
  SPECIALIZED_PROGRAMS,
  BENCH_ELIGIBLE_PROGRAMS,
  STAIRS_ELIGIBLE_PROGRAMS,
  BALL_GAME_SPORTS,
  DEFAULT_COORDINATES,
} from './location-constants';


// ══════════════════════════════════════════════════════════════════════
// GEO UTILITIES
// ══════════════════════════════════════════════════════════════════════

/** Set map language to Hebrew (Mapbox GL v2 compatible) */
export function setMapLanguageToHebrew(map: MapboxGLMap) {
  try {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    style.layers.forEach((layer: any) => {
      if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
        try {
          map.setLayoutProperty(layer.id, 'text-field', [
            'coalesce',
            ['get', 'name_he'],
            ['get', 'name:he'],
            ['get', 'name'],
          ]);
        } catch {
          // Skip layers that can't be modified
        }
      }
    });
  } catch (error) {
    console.warn('Failed to set map language to Hebrew:', error);
  }
}

/** Haversine formula for distance calculation */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/** Format distance as walking minutes (~80m per minute) */
export function formatDistance(distanceMeters: number): string {
  const walkingMinutes = Math.round(distanceMeters / 80);
  if (walkingMinutes <= 1) return 'פחות מדקה הליכה ממך';
  return `כ-${walkingMinutes} דקות הליכה ממך`;
}

/** Reverse geocoding using Mapbox API */
export async function reverseGeocode(lat: number, lng: number): Promise<{
  city: string | null;
  neighborhood: string | null;
  displayName: string;
}> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=he&types=place,locality,neighborhood`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      return { city: null, neighborhood: null, displayName: 'מיקום לא ידוע' };
    }
    
    let city: string | null = null;
    let neighborhood: string | null = null;
    
    for (const feature of data.features) {
      if (feature.place_type.includes('place')) {
        city = feature.text_he || feature.text;
      }
      if (feature.place_type.includes('neighborhood') || feature.place_type.includes('locality')) {
        neighborhood = feature.text_he || feature.text;
      }
    }
    
    const displayName = neighborhood && city
      ? `${neighborhood}, ${city}`
      : city || neighborhood || 'מיקום לא ידוע';
    
    return { city, neighborhood, displayName };
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return { city: null, neighborhood: null, displayName: 'מיקום לא ידוע' };
  }
}


// ══════════════════════════════════════════════════════════════════════
// SETTLEMENT NAMING MATRIX
// ══════════════════════════════════════════════════════════════════════

export function getSettlementType(cityName: string | null): SettlementType {
  if (!cityName) return 'unknown';
  const lower = cityName.toLowerCase();
  if (lower.includes('מועצה') || lower.includes('אזורית')) return 'regional_council';
  if (lower.includes('קיבוץ') || lower.includes('kibbutz')) return 'kibbutz';
  if (lower.includes('מושב') || lower.includes('moshav')) return 'moshav';
  const matched = ISRAELI_LOCATIONS.find(loc =>
    loc.name === cityName || loc.name.includes(cityName) || cityName.includes(loc.name)
  );
  if (matched) return matched.type as SettlementType;
  return 'city';
}

export function getSettlementNaming(settlementType: SettlementType, cityName: string): SettlementNaming {
  switch (settlementType) {
    case 'city':
    case 'neighborhood':
      return {
        shortLabel: `לופ שכונתי – ${cityName}`,
        mediumLabel: `סיבוב עירוני – ${cityName}`,
        longLabel: `מסלול העיר – ${cityName}`,
        statsPrefix: 'תשתיות אופניים ורכיבה עירוניות',
      };
    case 'regional_council':
      return {
        shortLabel: `שביל קצר – ${cityName}`,
        mediumLabel: `שביל אזורי – ${cityName}`,
        longLabel: `שביל ארוך – ${cityName}`,
        statsPrefix: 'שבילים אזוריים',
      };
    case 'kibbutz':
      return {
        shortLabel: `שביל הקיבוץ – ${cityName}`,
        mediumLabel: `לופ הקיבוץ – ${cityName}`,
        longLabel: `מסלול הקיבוץ – ${cityName}`,
        statsPrefix: 'שבילי רכיבה והליכה',
      };
    case 'moshav':
      return {
        shortLabel: `שביל המושב – ${cityName}`,
        mediumLabel: `לופ המושב – ${cityName}`,
        longLabel: `מסלול המושב – ${cityName}`,
        statsPrefix: 'שבילי רכיבה והליכה',
      };
    case 'local_council':
    case 'settlement':
      return {
        shortLabel: `שביל קצר – ${cityName}`,
        mediumLabel: `לופ היישוב – ${cityName}`,
        longLabel: `מסלול ארוך – ${cityName}`,
        statsPrefix: 'שבילי רכיבה ותנועה',
      };
    default:
      return {
        shortLabel: `סיבוב קצר – ${cityName}`,
        mediumLabel: `סיבוב בינוני – ${cityName}`,
        longLabel: `מסלול ארוך – ${cityName}`,
        statsPrefix: 'מסלולי רכיבה והליכה',
      };
  }
}


// ══════════════════════════════════════════════════════════════════════
// AUTHORITY RESOLUTION
// ══════════════════════════════════════════════════════════════════════

export async function findAuthorityIdByCity(cityName: string): Promise<string | null> {
  if (!cityName) return null;
  try {
    const authorities = await getAllAuthorities();
    const normalised = (s: string) => s.replace(/[\s\-]/g, '').toLowerCase();
    const target = normalised(cityName);

    for (const a of authorities) {
      if (normalised(a.name) === target) return a.id;
    }
    for (const a of authorities) {
      const n = normalised(a.name);
      if (target.includes(n) || n.includes(target)) return a.id;
    }
    return null;
  } catch {
    return null;
  }
}


// ══════════════════════════════════════════════════════════════════════
// SPORT CLASSIFICATION
// ══════════════════════════════════════════════════════════════════════

/**
 * Classify ALL selected sports into a unified context.
 * Reads the full sport array (not just the first) to detect hybrid scenarios.
 */
export function classifySportContext(allSports: string[]): SportContext {
  if (allSports.length === 0) {
    return {
      activities: ['running', 'walking', 'cycling'],
      prefersHybrid: false,
      isSpotFocus: false,
      isScenicFocus: false,
      showBenches: false,
      climbingFallback: false,
    };
  }

  const hasCardio = allSports.some((s) => CARDIO_SPORTS.has(s));
  const hasStrength = allSports.some((s) => STRENGTH_SPORTS.has(s));
  const hasBodyMind = allSports.some((s) => BODY_MIND_SPORTS.has(s));
  const hasClimbing = allSports.some((s) => CLIMBING_SPORTS.has(s));

  const isSpotFocus = !hasCardio;

  const activities: string[] = [];
  if (hasCardio) {
    for (const s of allSports) {
      if (CARDIO_SPORTS.has(s)) activities.push(s);
    }
  }
  if (activities.length === 0) {
    activities.push('running', 'walking', 'cycling');
  }

  const hasWalking = allSports.includes('walking');
  const prefersHybrid = hasCardio && hasStrength;

  return {
    activities,
    prefersHybrid,
    isSpotFocus,
    isScenicFocus: hasBodyMind && !hasCardio,
    showBenches: hasWalking || hasBodyMind || prefersHybrid,
    climbingFallback: hasClimbing && !hasStrength,
  };
}

/**
 * Legacy adapter — maps a single sport ID for backward compat.
 */
export function sportToActivityTypes(sportId: string | null): { activities: string[]; prefersHybrid: boolean } {
  const ctx = classifySportContext(sportId ? [sportId] : []);
  return { activities: ctx.activities, prefersHybrid: ctx.prefersHybrid };
}


// ══════════════════════════════════════════════════════════════════════
// HUMAN-CENTRIC COPY MATRIX — Pain ➡️ Solution
// ══════════════════════════════════════════════════════════════════════

/** Get activity-specific verb for sport-aware copy */
export function getActivityVerb(sportId: string | null): string {
  if (!sportId) return 'להתחיל בו';
  
  const STRENGTH = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength']);
  const CARDIO = new Set(['running', 'walking', 'cycling']);
  const BALL = new Set(['basketball', 'football', 'tennis', 'padel']);
  const MIND = new Set(['yoga', 'pilates', 'stretching']);
  const NATURE = new Set(['climbing']);
  
  if (STRENGTH.has(sportId)) return 'להתחזק בו';
  if (CARDIO.has(sportId)) return 'לאימון שלך';
  if (BALL.has(sportId)) return 'למשחק הקרוב';
  if (MIND.has(sportId)) return 'לנשום בו';
  if (NATURE.has(sportId)) return 'לחיבור עם הסביבה';
  
  return 'להתחיל בו';
}

export function getIdentityHook(
  personaId: string,
  cityName: string,
  userGender: 'male' | 'female',
  selectedSportId: string | null = null
): IdentityHookResult {
  const isFemale = userGender === 'female';
  const city = cityName || 'האזור שלך';
  const verb = getActivityVerb(selectedSportId);

  // Dad
  if (personaId === 'parent' && !isFemale) {
    return {
      intro: 'בתור אבא, למצוא זמן לאימון רציני בין העבודה לזמן עם הילדים זה פרויקט בפני עצמו.',
      value: `אז מצאנו לך ב${city} את המקום המדויק ${verb} – בחינם, מתחת לבית ובזמן שהכי נוח לך.`,
    };
  }

  // Mom
  if (personaId === 'parent' && isFemale) {
    return {
      intro: 'אנחנו יודעים שבתור אמא, למצוא זמן לעצמך בתוך המרוץ היומיומי זה כמעט בלתי אפשרי.',
      value: `אז מצאנו לך ב${city} את המקום המדויק ${verb} – בחינם, מתחת לבית ובלי לוגיסטיקה מעייפת.`,
    };
  }

  // Reservist / Soldier
  if (personaId === 'reservist' || personaId === 'soldier') {
    return {
      intro: `בתור ${isFemale ? 'לוחמת' : 'לוחם'}, אנחנו יודעים כמה זה מאתגר לשמור על כושר היחידה בתוך השגרה הלחוצה בבית.`,
      value: `בדיוק בשביל זה, סימנו לך ב${city} את הנקודה האידיאלית ${verb} – בחינם, הכי קרוב לבית ובלי לבזבז זמן יקר.`,
    };
  }

  // Hi-Tech / Office Worker
  if (personaId === 'office_worker' || personaId === 'pro_athlete' || personaId === 'athlete') {
    return {
      intro: `בתור ${isFemale ? 'הייטקיסטית' : 'הייטקיסט'}, אחרי יום שלם של ישיבות מול המסך, הדבר האחרון שהגוף שלך צריך זה להמשיך לשבת.`,
      value: `לכן, מיפינו עבורך ב${city} את הנקודה האידיאלית ${verb} – בחינם, בדרך הביתה ובלי לבזבז זמן יקר.`,
    };
  }

  // Student / Pupil
  if (personaId === 'student' || personaId === 'pupil' || personaId === 'young_pro') {
    return {
      intro: 'בין הלימודים למבחנים, המוח שלך חייב הפסקה והתקציב בטח לא מאפשר חדר כושר יקר.',
      value: `בדיוק בשביל זה, מצאנו לך ב${city} את המקום המושלם ${verb} – בחינם, בשכונה שלך ועם החבר'ה.`,
    };
  }

  // Senior / Golden Age
  if (personaId === 'senior' || personaId === 'vatikim') {
    return {
      intro: `חשוב ${isFemale ? 'לך' : 'לך'} לשמור על הגוף פעיל וגמיש, בלי להתאמץ ולנסוע רחוק מדי מהבית.`,
      value: `לכן, מצאנו לך ב${city} את המקום הכי נוח ${verb} – בחינם, במרחק הליכה קצר ובסביבה בטוחה.`,
    };
  }

  // Default
  return {
    intro: 'אנחנו יודעים שהחלק הכי קשה באימון הוא פשוט לצאת מהבית.',
    value: `לכן, מצאנו לך ב${city} את המקום המדויק ${verb} – בחינם, הכי קרוב אליך ובלי תירוצים.`,
  };
}


// ══════════════════════════════════════════════════════════════════════
// SMART BADGE SELECTION (City Prestige)
// ══════════════════════════════════════════════════════════════════════

/**
 * Select top 2 badges for City Prestige display
 * Badge A: User's sport category (priority) — city-wide totals
 * Badge B: Most impressive overall stat (totalKm from infraStats)
 *
 * FIX: COURT_SPORTS now correctly lists 'tennis' and 'padel' separately.
 */
export function selectSmartBadges(
  cityAssetCounts: { gyms: number; courts: number; nature: number } | null,
  infraStats: { totalKm: number; segmentCount: number } | null,
  selectedSportId: string | null,
  detectedCity: string | null,
  sportContext: SportContext
): SmartBadge[] {
  const badges: SmartBadge[] = [];
  const cityLabel = detectedCity ? `ב${detectedCity}` : 'בסביבה';
  
  // Badge A: User's sport category (Priority)
  if (selectedSportId && cityAssetCounts) {
    const STRENGTH_SET = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength']);
    // FIX: Split tennis and padel separately (was 'tennis_padel')
    const COURT_SET = new Set(['basketball', 'football', 'tennis', 'padel']);
    const NATURE_SET = new Set(['yoga', 'pilates', 'stretching', 'climbing']);
    
    if (STRENGTH_SET.has(selectedSportId) && cityAssetCounts.gyms > 0) {
      badges.push({ 
        icon: '🏋️', 
        label: `${cityAssetCounts.gyms} מתקני עילית ${cityLabel}`,
        value: cityAssetCounts.gyms
      });
    } else if (COURT_SET.has(selectedSportId) && cityAssetCounts.courts > 0) {
      badges.push({ 
        icon: '⚽', 
        label: `${cityAssetCounts.courts} מגרשים ${cityLabel}`,
        value: cityAssetCounts.courts
      });
    } else if (NATURE_SET.has(selectedSportId) && cityAssetCounts.nature > 0) {
      badges.push({ 
        icon: '🌳', 
        label: `${cityAssetCounts.nature} נקודות טבע ${cityLabel}`,
        value: cityAssetCounts.nature
      });
    }
  }
  
  // Badge B: City's total KM (The Flex) - only if not spot-focus sport
  if (infraStats && infraStats.totalKm > 0 && !sportContext.isSpotFocus) {
    badges.push({ 
      icon: '🛣️', 
      label: `${infraStats.totalKm.toFixed(1)} ק״מ מסלולי תנועה`,
      value: infraStats.totalKm
    });
  }
  
  // If no sport-specific badge, show gyms as fallback
  if (badges.length === 0 && cityAssetCounts && cityAssetCounts.gyms > 0) {
    badges.push({ 
      icon: '🏋️', 
      label: `${cityAssetCounts.gyms} מתקני עילית ${cityLabel}`,
      value: cityAssetCounts.gyms
    });
  }
  
  return badges.slice(0, 2);
}


// ══════════════════════════════════════════════════════════════════════
// FACILITY NOUN (Hebrew label resolver)
// ══════════════════════════════════════════════════════════════════════

export function getFacilityNoun(sportId: string | null): string {
  if (!sportId) return 'גינות כושר ומתחמי אימון';

  const sportNames: Record<string, string> = {
    running: 'ריצה',
    walking: 'הליכה',
    cycling: 'רכיבה',
    basketball: 'כדורסל',
    football: 'כדורגל',
    tennis: 'טניס',
    padel: 'פאדל',
    yoga: 'יוגה',
    pilates: 'פילאטיס',
    stretching: 'מתיחות',
    climbing: 'טיפוס',
    skateboard: 'סקייטבורד',
  };

  if (['basketball', 'football', 'tennis', 'padel'].includes(sportId)) {
    return `מגרשי ${sportNames[sportId]}`;
  }
  if (['running', 'walking', 'cycling'].includes(sportId)) {
    return `מסלולי ${sportNames[sportId]}`;
  }
  if (['yoga', 'pilates', 'stretching'].includes(sportId)) {
    return `נקודות שקטות ל${sportNames[sportId]}`;
  }
  if (['climbing', 'skateboard'].includes(sportId)) {
    return `מתחמי ${sportNames[sportId]}`;
  }

  return 'גינות כושר ומתחמי אימון';
}


// ══════════════════════════════════════════════════════════════════════
// MASTER PERSONA-SPORT MATRIX — "The Soul"
// ══════════════════════════════════════════════════════════════════════

export function classifyActivityGroup(sportId: string | null, prefersHybrid: boolean): ActivityGroup {
  if (prefersHybrid) return 'hybrid';
  if (!sportId) return 'cardio_run';
  if (['yoga', 'pilates', 'stretching'].includes(sportId)) return 'zen';
  if (sportId === 'running') return 'cardio_run';
  if (sportId === 'cycling') return 'cardio_bike';
  if (sportId === 'walking') return 'cardio_walk';
  if (['calisthenics', 'crossfit', 'functional', 'movement', 'gym'].includes(sportId)) return 'power';
  if (['basketball', 'football', 'tennis', 'padel'].includes(sportId)) return 'ball';
  if (['climbing', 'skateboard'].includes(sportId)) return 'climb_move';
  if (['boxing', 'mma', 'self_defense'].includes(sportId)) return 'martial';
  return 'power';
}

export function classifyPersonaGroup(personaId: string | null, gender: 'male' | 'female'): PersonaGroup {
  if (!personaId) return 'default';
  if (['student', 'young_pro'].includes(personaId)) return 'single_young';
  if (personaId === 'pupil' || personaId === 'soldier') return 'highschooler';
  if (personaId === 'parent') return gender === 'female' ? 'mom' : 'dad';
  if (['senior', 'vatikim'].includes(personaId)) return 'senior';
  if (personaId === 'reservist') return 'reservist';
  if (['office_worker', 'pro_athlete', 'athlete'].includes(personaId)) return 'careerist';
  return 'default';
}

/** Replace Hebrew gender-neutral slashes with the correct gendered form. */
export function genderize(text: string, gender: 'male' | 'female'): string {
  const PARTNER_PLACEHOLDER = '⟪PARTNER⟫';
  let safe = text.replace(/פרטנר\/ית/g, PARTNER_PLACEHOLDER);

  if (gender === 'female') {
    safe = safe
      .replace(/בוא\/י/g, 'בואי')
      .replace(/תפגוש\/י/g, 'תפגשי')
      .replace(/עסוק\/ה/g, 'עסוקה')
      .replace(/מישהו\/י/g, 'מישהי')
      .replace(/את\/ה/g, 'את')
      .replace(/יכול\/ה/g, 'יכולה')
      .replace(/אוהב\/ת/g, 'אוהבת')
      .replace(/חדש\/ה/g, 'חדשה')
      .replace(/עקוף\/י/g, 'עקפי')
      .replace(/תגיע\/י/g, 'תגיעי')
      .replace(/הולך\/ת/g, 'הולכת')
      .replace(/חלוץ\/ה/g, 'חלוצה');
  } else {
    safe = safe
      .replace(/בוא\/י/g, 'בוא')
      .replace(/תפגוש\/י/g, 'תפגוש')
      .replace(/עסוק\/ה/g, 'עסוק')
      .replace(/מישהו\/י/g, 'מישהו')
      .replace(/את\/ה/g, 'אתה')
      .replace(/יכול\/ה/g, 'יכול')
      .replace(/אוהב\/ת/g, 'אוהב')
      .replace(/חדש\/ה/g, 'חדש')
      .replace(/עקוף\/י/g, 'עקוף')
      .replace(/תגיע\/י/g, 'תגיע')
      .replace(/הולך\/ת/g, 'הולך')
      .replace(/חלוץ\/ה/g, 'חלוץ');
  }

  return safe.replace(new RegExp(PARTNER_PLACEHOLDER, 'g'), 'פרטנר/ית');
}

export function getActivityValue(
  sportId: string | null,
  personaId: string,
  options?: {
    hasDogTag?: boolean;
    nearbyHasWaterFountain?: boolean;
    nearbyNaturePointName?: string;
    prefersHybrid?: boolean;
    gender?: 'male' | 'female';
  }
): { main: string; socialWink?: string } {
  const gender = options?.gender || 'male';
  const personaGroup = classifyPersonaGroup(personaId, gender);
  const activityGroup = classifyActivityGroup(sportId, options?.prefersHybrid || false);

  const matrix: Record<string, { main: string; socialWink?: string }> = {
    // ────── Student / Young Pro ──────
    'student__zen':        { main: 'הפסקה מושלמת מהמבחנים ממש ליד הבית. המוח שלך צריך את ה-Reset הזה מול הנוף.' },
    'student__cardio_run': { main: 'זמן לשרוף את הלחץ של התואר בשכונה שלך. הנה המסלול שינקה לך את הראש למבחן הבא.' },
    'student__cardio_bike':{ main: 'זמן לשרוף את הלחץ של התואר בשכונה שלך. הנה המסלול שינקה לך את הראש למבחן הבא.' },
    'student__cardio_walk':{ main: 'הליכה קצרה ליד הבית לנקות את הראש בין שיעורים. לפעמים זה כל מה שצריך.' },
    'student__power':      { main: 'הסט הבא שלך מחכה בגינה הכי חזקה ליד הבית. המקום המושלם להוציא אנרגיה בין השיעורים.' },
    'student__ball':       { main: 'זמן לאסוף את החבר\'ה מהלימודים למשחק שובר שגרה במגרש השכונתי. מי המנצח היום?' },
    'student__climb_move': { main: 'בוא/י להוציא את כל הכוח במתקנים הכי שווים ליד הבית. אתגר חדש מחכה לך בשכונה.' },
    'student__hybrid':     { main: 'למה לבחור? מצאנו לך מסלול היברידי ליד הבית שמשלב ריצה עם תחנות כוח — מושלם בין השיעורים.' },
    'student__martial':    { main: 'הסט הבא שלך מחכה בגינה הכי חזקה ליד הבית. המקום המושלם להוציא אנרגיה בין השיעורים.' },

    // ────── Mom (female parent) ──────
    'mom__zen':            { main: 'זמן איכות לעצמך (עם העגלה או בלי) ממש ליד הבית. מצאנו לך פינה שקטה ונעימה בקהילה.' },
    'mom__cardio_run':     { main: 'זמן לשים אוזניות ולשחרר לחץ קרוב לבית. הנה מסלול בטוח שמתאים בול ללו"ז שלך.' },
    'mom__cardio_bike':    { main: 'זמן לשים אוזניות ולשחרר לחץ קרוב לבית. הנה מסלול בטוח שמתאים בול ללו"ז שלך.' },
    'mom__cardio_walk':    { main: 'זמן איכות לעצמך (עם העגלה או בלי) ממש ליד הבית. מצאנו לך מסלול בטוח ונעים בקהילה.' },
    'mom__power':          { main: 'המקום המושלם לשלב אימון כוח ליד הבית, בזמן שהילדים נהנים מהמרחב הבטוח מסביב.' },
    'mom__ball':           { main: 'מקום מעולה למשחק שכונתי ליד הבית, בזמן שהילדים בפארק מסביב.' },
    'mom__climb_move':     { main: 'המקום המושלם לשלב אימון כוח ליד הבית, בזמן שהילדים נהנים מהמרחב הבטוח מסביב.' },
    'mom__hybrid':         { main: 'למה לבחור? מצאנו לך מסלול היברידי ליד הבית שמשלב תנועה עם תחנות כוח — מושלם לאמא עסוקה.' },
    'mom__martial':        { main: 'המקום המושלם לשלב אימון כוח ליד הבית, בזמן שהילדים נהנים מהמרחב הבטוח מסביב.' },

    // ────── Dad (male parent) ──────
    'dad__zen':            { main: 'זמן לנשום, לעצור ולהתחבר לעצמך בפינה שקטה ממש ליד הבית. גם אתה מגיע לרגע של שקט.' },
    'dad__cardio_run':     { main: 'הזמן שלך לשים אוזניות ולשחרר לחץ קרוב לבית. הנה מסלול בטוח שמתאים בול ללו"ז שלך.' },
    'dad__cardio_bike':    { main: 'הזמן שלך לשים אוזניות ולשחרר לחץ קרוב לבית. הנה מסלול בטוח שמתאים בול ללו"ז שלך.' },
    'dad__cardio_walk':    { main: 'הליכה קצרה ליד הבית — הדרך הכי פשוטה לנקות את הראש אחרי יום ארוך.' },
    'dad__power':          { main: 'לשמור על כושר בגינה מתחת לבית בלי לשלם שקל. בוא נראה אותך בסט הבא.' },
    'dad__ball':           { main: 'מקום מעולה למשחק שכונתי או לזרוק לסל ליד הבית, בזמן שהילדים בפארק מסביב.' },
    'dad__climb_move':     { main: 'לשמור על כושר בגינה מתחת לבית בלי לשלם שקל. בוא נראה אותך בסט הבא.' },
    'dad__hybrid':         { main: 'למה לבחור? מצאנו לך מסלול היברידי ליד הבית שמשלב ריצה עם תחנות כוח — לאבא שלא מתפשר.' },
    'dad__martial':        { main: 'לשמור על כושר בגינה מתחת לבית בלי לשלם שקל. בוא נראה אותך בסט הבא.' },

    // ────── Senior / Vatikim ──────
    'senior__zen':         { main: 'מסלול הליכה נעים, מישורי ובטוח בשכונה שלך. פינה שקטה ליוגה ולנשימה מול הנוף.' },
    'senior__cardio_run':  { main: 'מסלול הליכה נעים, מישורי ובטוח בשכונה שלך. זמן לפגוש את החברים באוויר הפתוח.' },
    'senior__cardio_bike': { main: 'מסלול רכיבה נוח ובטוח ליד הבית. הדרך הכי כיפית לשמור על בריאות בשכונה.' },
    'senior__cardio_walk': { main: 'מסלול הליכה נעים, מישורי ובטוח בשכונה שלך. זמן לפגוש את החברים באוויר הפתוח.' },
    'senior__power':       { main: 'מקום נגיש ונעים ממש ליד הבית לשמור על הגמישות והבריאות בסביבה שקטה וחברתית.' },
    'senior__ball':        { main: 'מגרש נגיש בשכונה שלך — הזדמנות מעולה לפעילות חברתית ותנועה באוויר הפתוח.' },
    'senior__climb_move':  { main: 'מקום נגיש ונעים ממש ליד הבית לשמור על הגמישות והבריאות בסביבה שקטה וחברתית.' },
    'senior__hybrid':      { main: 'מסלול הליכה משולב תחנות כושר ליד הבית — הדרך הכי נעימה לשמור על הבריאות בקהילה.' },
    'senior__martial':     { main: 'מקום נגיש ונעים ממש ליד הבית לשמור על הגמישות והבריאות בסביבה שקטה וחברתית.' },

    // ────── Reservist ──────
    'reservist__zen':      { main: 'זמן לשחרר את הגוף והראש בפינה שקטה בשכונה שלך. בוא/י נתחבר חזרה לשגרה בנחת.' },
    'reservist__cardio_run':{ main: 'החופש שחיכית לו ממש ליד הבית. מצאנו לך מסלול פתוח עם אוויר נקי לביצועי שיא.' },
    'reservist__cardio_bike':{ main: 'החופש שחיכית לו ממש ליד הבית. מצאנו לך מסלול פתוח עם אוויר נקי לביצועי שיא.' },
    'reservist__cardio_walk':{ main: 'זמן לשחרר את הגוף והראש בהליכה נעימה בשכונה שלך. בוא/י נתחבר חזרה לשגרה בנחת.' },
    'reservist__power':    { main: 'לשמור על הכושר מהיחידה בגינה מתחת לבית ובלי לשלם שקל. בוא/י נראה אותך בסט הבא.' },
    'reservist__ball':     { main: 'מקום מעולה למשחק שובר שגרה במגרש ליד הבית. הדרך הכי טובה להתפרק אחרי מילואים.' },
    'reservist__climb_move':{ main: 'לשמור על הכושר מהיחידה בגינה מתחת לבית ובלי לשלם שקל. בוא/י נראה אותך בסט הבא.' },
    'reservist__hybrid':   { main: 'מסלול היברידי ליד הבית — ריצה עם תחנות כוח. הדרך הכי טובה לשמור על כושר היחידה.' },
    'reservist__martial':  { main: 'לשמור על הכושר מהיחידה בגינה מתחת לבית ובלי לשלם שקל. בוא/י נראה אותך בסט הבא.' },

    // ────── Careerist ──────
    'careerist__zen':      { main: 'לפרוק את היום הארוך במשרד בפינה שקטה ליד הבית. רגע של שקט מושלם לפני שחוזרים למשפחה.' },
    'careerist__cardio_run':{ main: 'לפרוק את היום הארוך במשרד במסלול מושלם ליד הבית. אימון עוצמתי לפני שחוזרים למשפחה.' },
    'careerist__cardio_bike':{ main: 'הדרך הכי מהירה (והכי כיפית) מהבית למשרד. עקוף/י את הפקקים ותגיע/י עם אנרגיה שיא.' },
    'careerist__cardio_walk':{ main: 'הליכה קצרה ליד הבית — הדרך הכי יעילה לנקות את הראש אחרי יום עמוס.' },
    'careerist__power':    { main: 'לפרוק את היום הארוך במשרד בפינה מושלמת ליד הבית. אימון עוצמתי לפני שחוזרים למשפחה.' },
    'careerist__ball':     { main: 'משחק מהיר במגרש ליד הבית — הדרך הכי כיפית לשחרר אנרגיה אחרי יום במשרד.' },
    'careerist__climb_move':{ main: 'לפרוק את היום הארוך במשרד בפינה מושלמת ליד הבית. אימון עוצמתי לפני שחוזרים למשפחה.' },
    'careerist__hybrid':   { main: 'מסלול היברידי ליד הבית — ריצה עם תחנות כוח. אימון מקסימלי בזמן מינימלי לאנשים שלא מתפשרים.' },
    'careerist__martial':  { main: 'לפרוק את היום הארוך במשרד בפינה מושלמת ליד הבית. אימון עוצמתי לפני שחוזרים למשפחה.' },

    // ────── Single / Young ──────
    'single_young__zen':   { main: 'הפסקה מושלמת מהמבחנים ממש ליד הבית. המוח שלך צריך את ה-Reset הזה מול הנוף.',
                             socialWink: 'מי יודע, אולי בפינה השקטה תפגוש/י מישהו/י שגם צריך הפסקה 😏' },
    'single_young__cardio_run': { main: 'אולי פה תפגוש/י את הפרטנר/ית לחיים? הנה המסלול הכי חברתי שיוצא ממש מהשכונה שלך.',
                                  socialWink: 'זה המקום להכיר חברים חדשים ואולי אפילו למצוא את הפרטנר/ית לחיים (או לפחות לסט הבא 😉).' },
    'single_young__cardio_bike':{ main: 'אולי פה תפגוש/י את הפרטנר/ית לחיים? הנה המסלול הכי חברתי שיוצא ממש מהשכונה שלך.',
                                  socialWink: 'זה המקום להכיר חברים חדשים ואולי אפילו למצוא את הפרטנר/ית לחיים 😉' },
    'single_young__cardio_walk':{ main: 'הליכה קצרה בשכונה לנקות את הראש. לפעמים הדבר הכי חכם הוא פשוט לצאת מהבית.',
                                  socialWink: 'מי יודע מה קורה כשפשוט יוצאים מהדלת 😏' },
    'single_young__power': { main: 'מי יודע, אולי הסט הבא בגינה יהיה עם מישהו/י מעניין? הנה הספוט הכי \'חם\' ליד הבית.',
                             socialWink: 'זה המקום להכיר חברים חדשים ואולי אפילו למצוא את הפרטנר/ית לחיים (או לפחות לסט הבא 😉).' },
    'single_young__ball':  { main: 'זמן לאסוף את החבר\'ה למשחק שובר שגרה במגרש השכונתי. מי המנצח היום?',
                             socialWink: 'מי יודע, אולי המשחק הבא יביא פרטנר/ית חדש/ה 😏' },
    'single_young__climb_move':{ main: 'בוא/י להוציא את כל הכוח במתקנים הכי שווים ליד הבית. אתגר חדש מחכה לך בשכונה.',
                                  socialWink: 'ואולי תפגוש/י מישהו/י שאוהב/ת אדרנלין כמוך 😏' },
    'single_young__hybrid':{ main: 'למה לבחור? מצאנו לך מסלול היברידי ליד הבית שמשלב ריצה עם תחנות כוח לאימון מלא.',
                             socialWink: 'הספוט הכי חם בשכונה. מי יודע מי עוד מתאמן פה? 😉' },
    'single_young__martial':{ main: 'הסט הבא שלך מחכה בגינה ליד הבית. המקום המושלם להוציא אנרגיה.',
                              socialWink: 'מי יודע, אולי פה תפגוש/י את הפרטנר/ית לאימון 😉' },

    // ────── High Schooler / Soldier ──────
    'highschooler__zen':   { main: 'פינה שקטה ליד הבית להוריד לחץ. לפעמים הדבר הכי חכם הוא לעצור ולנשום.' },
    'highschooler__cardio_run':{ main: 'זמן לשרוף אנרגיה בשכונה שלך. הנה המסלול שינקה לך את הראש.' },
    'highschooler__cardio_bike':{ main: 'זמן לשרוף אנרגיה בשכונה שלך. הנה המסלול שינקה לך את הראש.' },
    'highschooler__cardio_walk':{ main: 'הליכה קצרה ליד הבית — הדרך הכי פשוטה לנקות את הראש.' },
    'highschooler__power': { main: 'בוא/י להוציא את כל הכוח במתקנים הכי שווים ליד הבית. אתגר חדש מחכה לך בשכונה.' },
    'highschooler__ball':  { main: 'המגרש הכי חם בשכונה שלך. זמן לאסוף את החברים ולראות מי המלך של המגרש היום.' },
    'highschooler__climb_move':{ main: 'בוא/י להוציא את כל הכוח במתקנים הכי שווים ליד הבית. אתגר חדש מחכה לך בשכונה.' },
    'highschooler__hybrid':{ main: 'מסלול היברידי ליד הבית — ריצה עם תחנות כוח. הדרך הכי אפקטיבית להתאמן בשכונה.' },
    'highschooler__martial':{ main: 'בוא/י להוציא את כל הכוח במתקנים הכי שווים ליד הבית. אתגר חדש מחכה לך בשכונה.' },

    // ────── Default ──────
    'default__zen':        { main: 'מצאנו לך פינה שקטה וירוקה ממש ליד הבית — המקום המושלם ליוגה מול הנוף.' },
    'default__cardio_run': { main: 'הנה המסלול הכי טוב ליד הבית. זמן לצאת לריצה ולנקות את הראש.' },
    'default__cardio_bike':{ main: 'הנה מסלול הרכיבה הכי טוב ליד הבית. זמן לצאת ולהנות מאוויר פתוח.' },
    'default__cardio_walk':{ main: 'מסלול הליכה נעים ובטוח ממש ליד הבית. זמן לצאת ולהתרענן.' },
    'default__power':      { main: 'הגינה הכי חזקה ליד הבית מחכה לך. זה הזמן להפוך אותה למגרש המשחקים הפרטי שלך.' },
    'default__ball':       { main: 'המגרש הכי טוב בשכונה שלך. זמן לאסוף חברים ולמשחק שובר שגרה.' },
    'default__climb_move': { main: 'מתקנים שווים ליד הבית מחכים לאתגר הבא שלך. בוא/י נראה מה את/ה יכול/ה.' },
    'default__hybrid':     { main: 'למה לבחור? מצאנו לך מסלול היברידי ליד הבית שמשלב ריצה עם תחנות כוח לאימון מלא.' },
    'default__martial':    { main: 'מצאנו מקום מושלם ליד הבית לאימון חזק ועוצמתי. בוא/י נתחיל.' },
  };

  const key = `${personaGroup}__${activityGroup}`;
  const raw = matrix[key] || matrix[`default__${activityGroup}`] || {
    main: 'מצאנו לך את המקום המושלם ליד הבית. בוא/י נתחיל לזרום עם האנרגיה של השכונה.',
  };

  return {
    main: genderize(raw.main, gender),
    socialWink: raw.socialWink ? genderize(raw.socialWink, gender) : undefined,
  };
}


// ══════════════════════════════════════════════════════════════════════
// QUALITY-FIRST SCORING — with Gym Bias Fix
// ══════════════════════════════════════════════════════════════════════

/**
 * Calculate a quality score for ranking nearby facilities.
 *
 * FIX (Gym Bias): The +10,000 bonus now also covers:
 *   - Body & Mind sports → nature spots (zen_spot, spring, observation_point)
 *   - Ball Games → courts with matching courtType
 *   - Routes → route-based sports get bonus on route facilities
 */
export function calculateQualityScore(
  facility: NearbyFacility,
  sportContext: SportContext,
  selectedSportId: string | null = null
): number {
  let score = 0;

  // CRITICAL: Sport-Specific Match Boost (+10,000 points)
  if (selectedSportId) {
    if (facility.kind === 'park') {
      const sportTypes = Array.isArray(facility.sportTypes) ? facility.sportTypes : [];
      const matchesSportTypes = sportTypes.includes(selectedSportId as any);
      const matchesCourtType = facility.courtType === selectedSportId;

      // FIX: Body & Mind → nature spots ARE the sport match
      const BODY_MIND_IDS = new Set(['yoga', 'pilates', 'stretching']);
      const isBodyMindNatureMatch = BODY_MIND_IDS.has(selectedSportId) && (
        facility.facilityType === 'zen_spot' ||
        facility.natureType === 'spring' ||
        facility.natureType === 'observation_point'
      );

      if (matchesSportTypes || matchesCourtType || isBodyMindNatureMatch) {
        score += 10000; // Guaranteed #1 position
      }
    }

    // Routes: +10,000 for matching route-based sports
    if (facility.kind === 'route') {
      const routeActivity = facility.activityType || facility.type;
      if (routeActivity === selectedSportId) {
        score += 10000;
      }
    }
  }

  // PRIMARY WEIGHT: Star Rating (100 points max)
  const rating = facility.rating;
  if (rating != null && typeof rating === 'number' && rating > 0) {
    score += rating * 20;
  }

  // SECONDARY WEIGHT: Premium Tags bonus (max +15 points)
  if (sportContext.isScenicFocus && facility.kind === 'park') {
    const featureTags = Array.isArray(facility.featureTags) ? facility.featureTags : [];
    const isZenSpot = facility.facilityType === 'zen_spot';
    const isNatureType = facility.natureType === 'spring' || facility.natureType === 'observation_point';
    const hasBeautifulView = featureTags.some((t: string) => ['beautiful_view', 'scenic_point'].includes(t));
    const hasQuietZone = featureTags.some((t: string) => ['quiet_zone', 'zen'].includes(t));

    if (isZenSpot) score += 15;
    else if (isNatureType) score += 12;
    else if (hasBeautifulView) score += 10;
    else if (hasQuietZone) score += 8;
  }

  // SPECIAL BOOSTS: Content-specific facility matches
  if (facility.kind === 'park') {
    // ── "True Gym" Priority (+1000) ──
    const strengthActivities = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength']);
    const isStrengthUser = sportContext.activities.some(a => strengthActivities.has(a)) || sportContext.isSpotFocus;
    if (isStrengthUser) {
      const isTrueGym =
        facility.facilityType === 'gym_park' ||
        facility.courtType === 'calisthenics' ||
        facility.courtType === 'fitness_station';
      if (isTrueGym) {
        score += 1000;
      }
    }

    // Climbing → climbing-tagged parks get massive boost
    if (sportContext.climbingFallback) {
      const sportTypes = Array.isArray(facility.sportTypes) ? facility.sportTypes : [];
      if (sportTypes.includes('climbing' as any) || facility.facilityType === 'urban_spot') {
        score += 500;
      }
    }
    // Body & Mind → zen_spot or observation_point gets massive boost
    if (sportContext.isScenicFocus) {
      if (facility.facilityType === 'zen_spot' || facility.natureType === 'observation_point') {
        score += 500;
      }
    }
  }

  // TIE-BREAKER: Proximity penalty (max -10 points)
  const distanceKm = facility.distanceMeters / 1000;
  const proximityPenalty = Math.min(distanceKm, 10);
  score -= proximityPenalty;

  return score;
}


// ══════════════════════════════════════════════════════════════════════
// TIERED STRENGTH FILTERING — "Smart Bench" Rule
// ══════════════════════════════════════════════════════════════════════

export function applyStrengthTierFilter(
  facilities: NearbyFacility[],
  selectedSport: string | null,
  trainingContext: TrainingContext | null
): NearbyFacility[] {
  const STRENGTH_IDS = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength']);
  if (!selectedSport || !STRENGTH_IDS.has(selectedSport)) return facilities;

  const isBench = (f: NearbyFacility) =>
    f.kind === 'park' && (f.urbanType === 'bench' || f.courtType === 'bench');
  const isStairs = (f: NearbyFacility) =>
    f.kind === 'park' && (f.urbanType === 'stairs' ||
      f.courtType === 'stairs' || f.courtType === 'public_steps');
  const removeBenchesAndStairs = (arr: NearbyFacility[]) =>
    arr.filter(f => !isBench(f) && !isStairs(f));

  const hasTier1 = facilities.some(f => {
    if (f.kind !== 'park') return false;
    return (
      f.facilityType === 'gym_park' ||
      f.courtType === 'calisthenics' ||
      f.courtType === 'fitness_station'
    );
  });

  if (hasTier1) {
    return removeBenchesAndStairs(facilities);
  }

  if (!trainingContext || !trainingContext.programTemplateId) {
    return facilities.filter(f => !isStairs(f));
  }

  const { programTemplateId, level } = trainingContext;

  if (SPECIALIZED_PROGRAMS.has(programTemplateId)) {
    return removeBenchesAndStairs(facilities);
  }

  const maxLevel = BENCH_ELIGIBLE_PROGRAMS[programTemplateId];
  if (maxLevel !== undefined && level <= maxLevel) {
    if (STAIRS_ELIGIBLE_PROGRAMS.has(programTemplateId)) {
      return facilities;
    }
    return facilities.filter(f => !isStairs(f));
  }

  return removeBenchesAndStairs(facilities);
}


// ══════════════════════════════════════════════════════════════════════
// FETCH NEARBY FACILITIES — with Ball Game Cluster Fix
// ══════════════════════════════════════════════════════════════════════

/**
 * Fetch nearby facilities (parks + curated routes) — filtered by sport context.
 *
 * FIX (Gym Bias — Ball Games): Added a dedicated Ball Game cluster filter
 * to ensure multi-court and ball_court facilities are included for ball sports.
 */
export async function fetchNearbyFacilities(
  userLat: number,
  userLng: number,
  maxRadiusMeters: number = 1600,
  selectedSport: string | null = null,
  curatedRoutes: RouteWithDistance[] = [],
  sportContext?: SportContext
): Promise<NearbyFacility[]> {
  try {
    const allParks = await getAllParks();

    const parkFacilities: NearbyFacility[] = allParks
      .filter((park) => {
        if (!park.location || !park.location.lat || !park.location.lng) return false;

        // ── Bench visibility rule ──
        const isBench = park.urbanType === 'bench' || park.courtType === 'bench';
        if (isBench) {
          if (!sportContext?.showBenches) return false;
        }

        // ── Climbing fallback ──
        if (sportContext?.climbingFallback) {
          const sportTypes = Array.isArray(park.sportTypes) ? park.sportTypes : [];
          const isFitnessRelevant =
            sportTypes.some((t: string) => ['calisthenics', 'functional', 'crossfit'].includes(t)) ||
            park.courtType === 'calisthenics' ||
            park.facilityType === 'gym_park';
          return isFitnessRelevant;
        }

        // ── Body & Mind — scenic focus (soft filter) ──
        if (sportContext?.isScenicFocus) {
          const EXCLUDED_COURT_TYPES = new Set(['basketball', 'football', 'tennis', 'padel', 'multi', 'ball_court']);
          if (park.courtType && EXCLUDED_COURT_TYPES.has(park.courtType)) return false;
          return true;
        }

        // ── Strength / Power Cluster ──
        const STRENGTH_IDS = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength']);
        if (selectedSport && STRENGTH_IDS.has(selectedSport)) {
          const sportTypes = Array.isArray(park.sportTypes) ? park.sportTypes : [];
          const isStrengthFacility =
            park.facilityType === 'gym_park' ||
            park.courtType === 'calisthenics' ||
            park.courtType === 'fitness_station' ||
            sportTypes.some((t: string) => ['calisthenics', 'functional', 'crossfit', 'movement', 'gym', 'strength'].includes(t));
          return isStrengthFacility;
        }

        // ── FIX: Ball Game Cluster — broadened court matching ──
        // Includes multi-court and ball_court facilities for ball sports
        if (selectedSport && BALL_GAME_SPORTS.has(selectedSport)) {
          const matchesCourt = park.courtType === selectedSport;
          const sportTypes = Array.isArray(park.sportTypes) ? park.sportTypes : [];
          const matchesSportTypes = sportTypes.includes(selectedSport as any);
          const isMultiCourt = park.courtType === 'multi' || park.courtType === 'ball_court';
          return matchesCourt || matchesSportTypes || isMultiCourt;
        }

        // ── Standard sport matching ──
        if (selectedSport) {
          const matchesSportTypes = Array.isArray(park.sportTypes) && park.sportTypes.includes(selectedSport as any);
          const matchesCourtType = park.courtType === selectedSport;
          if (!matchesSportTypes && !matchesCourtType) return false;
        }
        return true;
      })
      .map((park) => {
        const distanceMeters = calculateDistance(
          userLat, userLng, park.location.lat, park.location.lng
        );
        return {
          ...park,
          kind: 'park' as const,
          distanceMeters,
          formattedDistance: formatDistance(distanceMeters),
        };
      })
      .filter((p) => p.distanceMeters <= maxRadiusMeters);

    // ── No Zero-Results Fallback ──
    const STRENGTH_FALLBACK_BLOCK = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength']);
    let finalParks: NearbyFacility[];
    if (parkFacilities.length === 0 && selectedSport) {
      if (STRENGTH_FALLBACK_BLOCK.has(selectedSport)) {
        finalParks = [];
      } else {
        const generalParks: NearbyFacility[] = allParks
          .filter((park) => park.location?.lat && park.location?.lng)
          .map((park) => {
            const distanceMeters = calculateDistance(
              userLat, userLng, park.location.lat, park.location.lng
            );
            return { ...park, kind: 'park' as const, distanceMeters, formattedDistance: formatDistance(distanceMeters) };
          })
          .filter((p) => p.distanceMeters <= maxRadiusMeters);
        finalParks = generalParks;
      }
    } else {
      finalParks = parkFacilities;
    }

    // ── Curated Routes → NearbyFacility[] ─────────
    const routeFacilities: NearbyFacility[] = curatedRoutes
      .filter((route) => {
        if (!selectedSport) return true;
        const routeActivity = route.activityType || route.type;
        return routeActivity === selectedSport;
      })
      .map((route) => ({
        ...route,
        kind: 'route' as const,
      }));

    // ── Hard Block: untagged benches for scenic-focus ──
    const filteredParks = sportContext?.isScenicFocus
      ? finalParks.filter((p) => {
          if (p.kind !== 'park') return true;
          const isBenchType = p.urbanType === 'bench' || p.courtType === 'bench';
          if (!isBenchType) return true;
          const tags = Array.isArray(p.featureTags) ? p.featureTags : [];
          const hasQualityTag =
            tags.some((t: string) => ['beautiful_view', 'scenic_point', 'quiet_zone', 'zen'].includes(t)) ||
            p.environment === 'nature' || p.environment === 'park';
          return hasQualityTag;
        })
      : finalParks;

    // ── STRICT CONTENT MATCH — The Golden Rule ──
    const isSpotBased = selectedSport ? SPOT_BASED_SPORTS.has(selectedSport) : false;
    const isRouteBased = selectedSport ? ROUTE_BASED_SPORTS.has(selectedSport) : false;
    const forceSpotOnly = isSpotBased || sportContext?.isSpotFocus;
    const isHybridSelection = sportContext?.prefersHybrid || false;

    let combined: NearbyFacility[];

    if (forceSpotOnly && !isRouteBased && !isHybridSelection) {
      combined = [...filteredParks];
    } else if (isHybridSelection) {
      const hybridRoutes = routeFacilities.filter(r => r.kind === 'route' && (r as any).isHybrid);
      if (hybridRoutes.length > 0) {
        combined = [...hybridRoutes, ...filteredParks, ...routeFacilities.filter(r => !(r as any).isHybrid)];
      } else {
        combined = [...filteredParks, ...routeFacilities];
      }
    } else {
      combined = [...filteredParks, ...routeFacilities];
    }

    // ── Quality-First Sort ──
    const ctx = sportContext || classifySportContext([]);

    combined.sort((a, b) => {
      const scoreA = calculateQualityScore(a, ctx, selectedSport);
      const scoreB = calculateQualityScore(b, ctx, selectedSport);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.distanceMeters - b.distanceMeters;
    });

    return combined;
  } catch (error) {
    console.error('Error fetching nearby facilities:', error);
    return [];
  }
}


// ══════════════════════════════════════════════════════════════════════
// HERO ROUTE FETCHER
// ══════════════════════════════════════════════════════════════════════

export async function fetchHeroRoute(
  userLat: number,
  userLng: number,
  authorityId: string | null,
  sportContext: SportContext,
  selectedSportId?: string | null
): Promise<RouteWithDistance | null> {
  if (sportContext.isSpotFocus) return null;
  if (!authorityId) return null;
  try {
    const curatedRoutes = await InventoryService.fetchCuratedRoutesByAuthority(authorityId);

    const candidates = curatedRoutes
      .filter((route) => {
        if (!route.path || route.path.length < 2) return false;
        if (route.isInfrastructure) return false;
        return true;
      })
      .map((route) => {
        const startPoint = route.path[0];
        const distanceMeters = calculateDistance(
          userLat, userLng, startPoint[1], startPoint[0]
        );
        return {
          ...route,
          distance: typeof route.distance === 'number' && isFinite(route.distance) ? route.distance : 0,
          rating: typeof route.rating === 'number' && isFinite(route.rating) ? route.rating : 0,
          distanceMeters,
          formattedDistance: formatDistance(distanceMeters),
        };
      });

    const scored = candidates.map((route) => {
      let score = 0;
      const routeActivity = route.activityType || route.type;

      // STRICT: If a specific sport is selected, only match exact activity type.
      // A runner must never see a cycling route, and vice versa.
      if (selectedSportId && CARDIO_SPORTS.has(selectedSportId)) {
        const matchesExactSport = routeActivity === selectedSportId;
        if (!matchesExactSport) return { route, score: -1 }; // Disqualify
      }

      if (sportContext.activities.includes(routeActivity)) score += 100;
      if (sportContext.prefersHybrid && route.isHybrid) score += 50;
      if (!sportContext.prefersHybrid && route.isHybrid) score += 10;
      score += Math.max(0, 50 - route.distanceMeters / 200);
      return { route, score };
    });

    // Filter out disqualified routes (score < 0)
    const validScored = scored.filter(s => s.score >= 0);
    validScored.sort((a, b) => b.score - a.score || a.route.distanceMeters - b.route.distanceMeters);

    return validScored.length > 0 ? validScored[0].route : null;
  } catch (error) {
    console.error('[HeroRoute] Error fetching hero route:', error);
    return null;
  }
}


// ══════════════════════════════════════════════════════════════════════
// LOCATION FLATTENING
// ══════════════════════════════════════════════════════════════════════

export function flattenLocations(locations: IsraeliLocation[]): Array<{
  id: string;
  name: string;
  displayName: string;
  type: LocationType;
  population: number;
  parentId?: string;
  parentName?: string;
  coordinates?: { lat: number; lng: number };
}> {
  const flattened: Array<{
    id: string;
    name: string;
    displayName: string;
    type: LocationType;
    population: number;
    parentId?: string;
    parentName?: string;
    coordinates?: { lat: number; lng: number };
  }> = [];

  locations.forEach(location => {
    flattened.push({
      id: location.id,
      name: location.name,
      displayName: location.name,
      type: location.type,
      population: location.population,
    });

    if (location.subLocations && location.subLocations.length > 0) {
      location.subLocations.forEach(sub => {
        flattened.push({
          id: sub.id,
          name: sub.name,
          displayName: `${location.name} - ${sub.name}`,
          type: sub.type,
          population: location.population,
          parentId: location.id,
          parentName: location.name,
        });
      });
    }
  });

  return flattened;
}

export function getDefaultCoordinates(locationId: string, parentId?: string): { lat: number; lng: number } {
  if (DEFAULT_COORDINATES[locationId]) return DEFAULT_COORDINATES[locationId];
  if (parentId && DEFAULT_COORDINATES[parentId]) return DEFAULT_COORDINATES[parentId];
  return { lat: 32.0853, lng: 34.7818 }; // Default: Tel Aviv
}


// ══════════════════════════════════════════════════════════════════════
// PIONEER + PLAN B — Integrated Fallback Logic
// ══════════════════════════════════════════════════════════════════════

/** Hebrew sport names for the Plan B bridge sentence */
const SPORT_NAME_HE: Record<string, string> = {
  running: 'ריצה',
  walking: 'הליכה',
  cycling: 'רכיבה',
  basketball: 'כדורסל',
  football: 'כדורגל',
  tennis: 'טניס',
  padel: 'פאדל',
  yoga: 'יוגה',
  pilates: 'פילאטיס',
  stretching: 'מתיחות',
  climbing: 'טיפוס',
  skateboard: 'סקייטבורד',
  calisthenics: 'קליסטניקס',
  crossfit: 'קרוספיט',
  functional: 'אימון פונקציונלי',
  movement: 'תנועה',
  gym: 'אימון כוח',
  strength: 'אימון כוח',
  boxing: 'אגרוף',
  mma: 'MMA',
  self_defense: 'הגנה עצמית',
};

/**
 * Checks if a facility is a direct sport-specific match for the user's
 * selected sport (mirrors the +10,000 logic in calculateQualityScore).
 */
function isSportSpecificMatch(facility: NearbyFacility, selectedSportId: string): boolean {
  if (facility.kind === 'park') {
    const sportTypes = Array.isArray(facility.sportTypes) ? facility.sportTypes : [];
    const matchesSportTypes = sportTypes.includes(selectedSportId as any);
    const matchesCourtType = facility.courtType === selectedSportId;

    // Body & Mind → nature spots
    const BODY_MIND_IDS = new Set(['yoga', 'pilates', 'stretching']);
    const isBodyMindNatureMatch = BODY_MIND_IDS.has(selectedSportId) && (
      facility.facilityType === 'zen_spot' ||
      facility.natureType === 'spring' ||
      facility.natureType === 'observation_point'
    );

    // Strength → gym parks / fitness stations
    const STRENGTH_IDS = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength']);
    const isStrengthMatch = STRENGTH_IDS.has(selectedSportId) && (
      facility.facilityType === 'gym_park' ||
      facility.courtType === 'calisthenics' ||
      facility.courtType === 'fitness_station'
    );

    return matchesSportTypes || matchesCourtType || isBodyMindNatureMatch || isStrengthMatch;
  }

  if (facility.kind === 'route') {
    const routeActivity = facility.activityType || facility.type;
    return routeActivity === selectedSportId;
  }

  return false;
}

/**
 * Determines if an asset is suitable as a "Plan B" fallback for the user's sport.
 *
 * Rules:
 * - Ball Games: Only gym_park/calisthenics (for warm-up). NO benches/stairs/nature.
 * - Cardio: Only gym_park/calisthenics (for conditioning). NO benches/stairs.
 * - Strength: Respects BENCH_ELIGIBLE_PROGRAMS & user level. Too advanced → no benches.
 * - Body & Mind (nature): Gym parks OK, nature OK, but NO benches/stairs.
 * - General: gym parks only.
 */
function isAssetSuitableAsFallback(
  asset: NearbyFacility,
  selectedSportId: string,
  trainingContext: TrainingContext | null
): boolean {
  if (asset.kind !== 'park') return false;

  const category = classifyPioneerCategory(selectedSportId);

  // Detect "insulting" asset types
  const isBench = asset.urbanType === 'bench' || asset.courtType === 'bench';
  const isStairs = asset.urbanType === 'stairs' || asset.courtType === 'stairs' || asset.courtType === 'public_steps';
  const isNature = asset.facilityType === 'zen_spot' || !!asset.natureType;

  // High-quality alternative (always suitable)
  const isGymPark = asset.facilityType === 'gym_park' || asset.courtType === 'calisthenics' || asset.courtType === 'fitness_station';

  if (category === 'ball') {
    // Ball games: ONLY gym parks for warm-up. NO benches/stairs/nature.
    return isGymPark;
  }

  if (category === 'cardio') {
    // Cardio: ONLY gym parks for conditioning. NO benches/stairs.
    return isGymPark;
  }

  if (category === 'strength') {
    // Respect existing tier system
    if (isGymPark) return true;

    // Check if bench is appropriate for user's level
    if (isBench) {
      if (!trainingContext || !trainingContext.programTemplateId) return false;

      const { programTemplateId, level } = trainingContext;

      // Specialized programs: NEVER show benches
      if (SPECIALIZED_PROGRAMS.has(programTemplateId)) return false;

      // Check eligibility threshold
      const maxLevel = BENCH_ELIGIBLE_PROGRAMS[programTemplateId];
      if (maxLevel !== undefined && level <= maxLevel) {
        return true; // User is beginner enough for benches
      }
      return false; // Too advanced
    }

    // Stairs: check program eligibility
    if (isStairs) {
      if (!trainingContext || !trainingContext.programTemplateId) return false;
      const { programTemplateId, level } = trainingContext;

      if (SPECIALIZED_PROGRAMS.has(programTemplateId)) return false;

      const maxLevel = BENCH_ELIGIBLE_PROGRAMS[programTemplateId];
      if (maxLevel !== undefined && level <= maxLevel && STAIRS_ELIGIBLE_PROGRAMS.has(programTemplateId)) {
        return true;
      }
      return false;
    }

    return false; // Other park types not suitable for strength
  }

  if (category === 'nature') {
    // Body & Mind: Gym parks OK (for strength balance), nature OK, but NO benches/stairs
    if (isBench || isStairs) return false;
    return isGymPark || isNature;
  }

  // General: gym parks only
  return isGymPark;
}

type PioneerSportCategory = 'ball' | 'cardio' | 'nature' | 'strength' | 'general';

function classifyPioneerCategory(sportId: string): PioneerSportCategory {
  if (BALL_GAME_SPORTS.has(sportId)) return 'ball';
  if (CARDIO_SPORTS.has(sportId)) return 'cardio';
  if (BODY_MIND_SPORTS.has(sportId)) return 'nature';
  if (STRENGTH_SPORTS.has(sportId)) return 'strength';
  return 'general';
}

/**
 * Build the Pioneer + Plan B fallback result.
 *
 * Called from ConfirmationCard when the user has a selected sport but
 * NO facilities in the radius directly match that sport.
 *
 * Returns:
 *   - `showPioneer: false` if a sport-specific facility exists or no sport selected.
 *   - `showPioneer: true` with gender-accurate Pioneer copy + the best fallback asset.
 */
export function buildPioneerFallback(
  nearbyFacilities: NearbyFacility[],
  selectedSportId: string | null,
  gender: 'male' | 'female',
  detectedCity: string | null,
  sportContext: SportContext,
  heroRoute: { activityType?: string; type?: string } | null,
  trainingContext: TrainingContext | null = null
): PioneerFallbackResult {
  const empty: PioneerFallbackResult = {
    showPioneer: false,
    pioneerMessage: '',
    pioneerEmoji: '',
    planBBridge: '',
    fallbackAsset: null,
  };

  // No sport selected → no Pioneer scenario
  if (!selectedSportId) return empty;

  // Check if ANY facility in the list is a direct sport match
  const hasDirectMatch = nearbyFacilities.some(f => isSportSpecificMatch(f, selectedSportId));

  // Also check if the heroRoute matches a cardio sport
  if (!hasDirectMatch && heroRoute) {
    const routeActivity = heroRoute.activityType || heroRoute.type;
    if (routeActivity === selectedSportId) {
      return empty; // Route IS the match
    }
  }

  if (hasDirectMatch) return empty;

  // ── No match found → Pioneer mode ──────────────────────
  const isFemale = gender === 'female';
  const city = detectedCity || 'השכונה';
  const category = classifyPioneerCategory(selectedSportId);
  const sportNameHe = SPORT_NAME_HE[selectedSportId] || 'הספורט שלך';

  let pioneerMessage: string;
  let pioneerEmoji: string;

  switch (category) {
    case 'ball':
      pioneerMessage = isFemale
        ? `עוד לא מיפינו מגרש בשכונה שלך, בואי נהיה הראשונות שמתחילות את השינוי!`
        : `עוד לא מיפינו מגרש בשכונה שלך, בוא נהיה הראשונים שמתחילים את השינוי!`;
      pioneerEmoji = '🚩';
      break;

    case 'cardio':
      pioneerMessage = isFemale
        ? `המסלול האידיאלי ב${city} עוד מחכה להיכתב. בואי נהיה החלוצות שממפות אותו!`
        : `המסלול האידיאלי ב${city} עוד מחכה להיכתב. בוא נהיה החלוצים שממפים אותו!`;
      pioneerEmoji = '🏃‍♂️';
      break;

    case 'nature':
      pioneerMessage = isFemale
        ? `אנחנו עדיין בחיפוש אחר נקודת הטבע המושלמת פה. בואי נהיה הראשונות למצוא אותה!`
        : `אנחנו עדיין בחיפוש אחר נקודת הטבע המושלמת פה. בוא נהיה הראשונים למצוא אותה!`;
      pioneerEmoji = '🌳';
      break;

    case 'strength':
      pioneerMessage = isFemale
        ? `עוד לא מצאנו גינת כושר ייעודית בשכונה שלך, בואי נהיה הראשונות שמתחילות את השינוי!`
        : `עוד לא מצאנו גינת כושר ייעודית בשכונה שלך, בוא נהיה הראשונים שמתחילים את השינוי!`;
      pioneerEmoji = '💪';
      break;

    default:
      pioneerMessage = isFemale
        ? `נראה שגילינו אזור חדש! את הולכת להיות החלוצה הראשונה שתמפה את השכונה. בואי נהיה הראשונות!`
        : `נראה שגילינו אזור חדש! אתה הולך להיות החלוץ הראשון שימפה את השכונה. בוא נהיה הראשונים!`;
      pioneerEmoji = '🚩';
      break;
  }

  // Plan B Bridge — contextual per sport category
  let planBBridge: string;
  switch (category) {
    case 'ball':
      planBBridge = `עד שנמפה מגרש בסביבה, הנה הנקודה הכי טובה לחימום והכנה גופנית:`;
      break;
    case 'cardio':
      planBBridge = `עד שנמצא את המסלול המושלם ל${sportNameHe}, הנה הנקודה הכי טובה לחיזוק בינתיים:`;
      break;
    case 'strength':
      planBBridge = `עד שנמצא גינת כושר מלאה, הנה הנקודה הכי טובה להתחיל בה בינתיים:`;
      break;
    case 'nature':
      planBBridge = `עד שנמצא את הפינה השקטה המושלמת, הנה הנקודה הכי טובה לאימון בינתיים:`;
      break;
    default:
      planBBridge = `עד שנמצא את המקום המדויק ל${sportNameHe}, הנה הנקודה הכי טובה להתחיל בה בינתיים:`;
  }

  // Fallback asset — highest-rated SUITABLE facility in the radius
  const parkFacilities = nearbyFacilities.filter(f => f.kind === 'park');
  const suitableFacilities = parkFacilities.filter(f =>
    isAssetSuitableAsFallback(f, selectedSportId, trainingContext)
  );

  const fallbackAsset: NearbyFacility | null = suitableFacilities.length > 0
    ? suitableFacilities.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]
    : null; // No suitable fallback → Pure Pioneer mode (no Plan B section)

  return {
    showPioneer: true,
    pioneerMessage,
    pioneerEmoji,
    planBBridge,
    fallbackAsset,
  };
}
