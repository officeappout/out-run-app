// סוגי הבלוקים האפשריים (חימום, ריצה, הליכה וכו')
export type RunBlockType = 'warmup' | 'run' | 'walk' | 'interval' | 'recovery' | 'cooldown';

export type RunBlock = {
  id: string;
  
  // סוג הבלוק - קובע את הלוגיקה הפנימית (למשל: חימום לא נחשב בקצב ממוצע)
  type: RunBlockType;
  
  // הכותרת שמוצגת למשתמש באפליקציה (למשל: "ריצה מהירה מאוד")
  label: string; 
  
  // אופציה א': משך הבלוק בשניות (למשל: 300 שניות ל-5 דקות חימום)
  durationSeconds?: number; 
  
  // אופציה ב': מרחק הבלוק במטרים (למשל: 400 מטר לאינטרוול)
  // הערה: חובה שאחד מהשדות (זמן או מרחק) יהיה מלא
  distanceMeters?: number;
  
  // טווח הקצב המבוקש באחוזים מקצב הבסיס (לפי טבלאות האפיון)
  // למשל: אינטרוול עצים יהיה בין 98% ל-102%
  targetPacePercentage?: {
    min: number;
    max: number;
  };
  
  // צבע הבר בגרף האימון (למשל: אדום למאמץ גבוה, ירוק למנוחה)
  colorHex: string;
};

export default RunBlock;