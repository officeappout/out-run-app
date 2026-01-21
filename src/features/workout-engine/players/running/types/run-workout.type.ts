// src/features/run/types/run-workout.type.ts

import RunBlock from './run-block.type';

// הגדרת אימון ריצה שלם
export type RunWorkout = {
  id: string;
  title: string;       // למשל: "אימון אינטרוולים"
  description?: string; // תיאור קצר למשתמש
  
  // האם זה אימון שמשפיע על חישוב קצב הבסיס? 
  isQualityWorkout: boolean;
  
  // רשימת הבלוקים שמרכיבים את האימון (חימום -> אינטרוול -> מנוחה -> שחרור)
  blocks: RunBlock[]; 
  
  // סרטון אופציונלי להדרכה לפני/אחרי
  videoUrl?: string;
};

export default RunWorkout;