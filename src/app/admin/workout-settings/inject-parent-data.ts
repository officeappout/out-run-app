/**
 * Bulk Data Injection Script for Parent Persona
 * Run this script to inject Parent persona content into Firestore
 * 
 * Usage: Import and call injectParentPersonaData() from admin panel or console
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';

interface ParentNotification {
  triggerType: 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance';
  daysInactive?: 1 | 2 | 7 | 30;
  persona: 'parent';
  gender: 'male' | 'female' | 'both';
  psychologicalTrigger: 'FOMO' | 'Challenge' | 'Support' | 'Reward';
  text: string;
}

interface ParentDescription {
  location: 'home' | 'park' | 'office' | 'gym' | 'street';
  persona: 'parent';
  gender: 'male' | 'female' | 'both';
  description: string;
}

interface ParentPhrase {
  location: 'home' | 'park' | 'office' | 'gym' | 'street';
  persona: 'parent';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'any';
  gender: 'male' | 'female' | 'both';
  phrase: string;
}

// Parent Persona Notifications Data
const PARENT_NOTIFICATIONS: ParentNotification[] = [
  // Day 0 - Welcome back
  {
    triggerType: 'Inactivity',
    daysInactive: 1,
    persona: 'parent',
    gender: 'both',
    psychologicalTrigger: 'Support',
    text: 'שלום @שם! בוא/י נחזור לשגרה. גם 5 דקות זה כל מה שצריך 💪',
  },
  {
    triggerType: 'Inactivity',
    daysInactive: 1,
    persona: 'parent',
    gender: 'male',
    psychologicalTrigger: 'Support',
    text: 'שלום @שם! אתה יכול לעשות את זה. בוא נתחיל עם אימון קצר',
  },
  {
    triggerType: 'Inactivity',
    daysInactive: 1,
    persona: 'parent',
    gender: 'female',
    psychologicalTrigger: 'Support',
    text: 'שלום @שם! את יכולה לעשות את זה. בואי נתחיל עם אימון קצר',
  },
  
  // Day 2 - Gentle reminder
  {
    triggerType: 'Inactivity',
    daysInactive: 2,
    persona: 'parent',
    gender: 'both',
    psychologicalTrigger: 'FOMO',
    text: 'כבר @ימי_אי_פעילות ימים שלא ראינו אותך, @שם. הילדים שלך רואים אותך - בוא/י נראה דוגמה טובה!',
  },
  
  // Day 7 - Week milestone
  {
    triggerType: 'Inactivity',
    daysInactive: 7,
    persona: 'parent',
    gender: 'both',
    psychologicalTrigger: 'Challenge',
    text: 'שבוע שלם עבר, @שם. בוא/י נחזור למסלול! אימון קצר ב-@מיקום מחכה לך',
  },
  
  // Day 30 - Monthly check-in
  {
    triggerType: 'Inactivity',
    daysInactive: 30,
    persona: 'parent',
    gender: 'both',
    psychologicalTrigger: 'Support',
    text: '@שם, אנחנו כאן בשבילך. בוא/י נתחיל מחדש, צעד אחר צעד',
  },
  
  // Scheduled - Evening (Parent time)
  {
    triggerType: 'Scheduled',
    persona: 'parent',
    gender: 'both',
    psychologicalTrigger: 'Reward',
    text: 'השעה @שעה - זמן מושלם לאימון קצר! @בוא/י נשחרר לחץ מהעבודה',
  },
  
  // Location-based - Park
  {
    triggerType: 'Location_Based',
    persona: 'parent',
    gender: 'both',
    psychologicalTrigger: 'Challenge',
    text: 'את/ה ב-@שם_הפארק! אימון מושלם ל-@שם עם הילדים. בוא/י נתחיל!',
  },
];

// Parent Persona Smart Descriptions
const PARENT_DESCRIPTIONS: ParentDescription[] = [
  {
    location: 'home',
    persona: 'parent',
    gender: 'both',
    description: 'אימון מושלם ל-@שם ב-@מיקום. מתאים להורה עסוק שרוצה להישאר פעיל/ה',
  },
  {
    location: 'park',
    persona: 'parent',
    gender: 'both',
    description: 'אימון משפחתי ב-@מיקום! @שם, תוכל/י לעשות את זה עם הילדים מסביב',
  },
  {
    location: 'office',
    persona: 'parent',
    gender: 'both',
    description: 'אימון קצר במשרד ל-@שם. מושלם להפסקת צהריים או אחרי העבודה',
  },
  {
    location: 'home',
    persona: 'parent',
    gender: 'male',
    description: 'אימון ביתי מושלם ל-@שם. אתה יכול לעשות את זה גם עם הילדים בבית',
  },
  {
    location: 'home',
    persona: 'parent',
    gender: 'female',
    description: 'אימון ביתי מושלם ל-@שם. את יכולה לעשות את זה גם עם הילדים בבית',
  },
];

// Parent Persona Motivational Phrases
const PARENT_PHRASES: ParentPhrase[] = [
  {
    location: 'home',
    persona: 'parent',
    timeOfDay: 'morning',
    gender: 'both',
    phrase: 'גם ביום עמוס, 5 דקות זה כל מה שצריך. @שם, את/ה יכול/ה!',
  },
  {
    location: 'park',
    persona: 'parent',
    timeOfDay: 'any',
    gender: 'both',
    phrase: 'אימון בפארק עם הילדים - דרך מעולה להתחיל את היום!',
  },
  {
    location: 'home',
    persona: 'parent',
    timeOfDay: 'evening',
    gender: 'both',
    phrase: 'אחרי יום ארוך, אימון קצר משחרר לחץ. @בוא/י נתחיל!',
  },
  {
    location: 'office',
    persona: 'parent',
    timeOfDay: 'afternoon',
    gender: 'both',
    phrase: 'הפסקת צהריים מושלמת לאימון קצר. @שם, את/ה מוכן/ה?',
  },
];

/**
 * Inject Parent Persona data into Firestore
 */
export async function injectParentPersonaData(): Promise<{
  notifications: number;
  descriptions: number;
  phrases: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let notificationsCount = 0;
  let descriptionsCount = 0;
  let phrasesCount = 0;

  try {
    // Inject Notifications
    for (const notification of PARENT_NOTIFICATIONS) {
      try {
        const notificationsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`);
        await addDoc(notificationsRef, {
          ...notification,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        notificationsCount++;
      } catch (error: any) {
        errors.push(`Notification error: ${error.message}`);
      }
    }

    // Inject Smart Descriptions
    for (const description of PARENT_DESCRIPTIONS) {
      try {
        const descriptionsRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`);
        await addDoc(descriptionsRef, {
          ...description,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        descriptionsCount++;
      } catch (error: any) {
        errors.push(`Description error: ${error.message}`);
      }
    }

    // Inject Motivational Phrases
    for (const phrase of PARENT_PHRASES) {
      try {
        const phrasesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`);
        await addDoc(phrasesRef, {
          ...phrase,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        phrasesCount++;
      } catch (error: any) {
        errors.push(`Phrase error: ${error.message}`);
      }
    }

    return {
      notifications: notificationsCount,
      descriptions: descriptionsCount,
      phrases: phrasesCount,
      errors,
    };
  } catch (error: any) {
    errors.push(`General error: ${error.message}`);
    return {
      notifications: notificationsCount,
      descriptions: descriptionsCount,
      phrases: phrasesCount,
      errors,
    };
  }
}
