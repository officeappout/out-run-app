import type { ProgramTrack } from '@/features/home/utils/program-start-cards';

/** Copy for canvas "שאלון לו״ז" row 7 (S-7b start cards, S-7c / S-7d add cards). */
export const PROGRAM_START_COPY: Record<ProgramTrack, {
  title: string;
  valueLine: string;
  chip: string;
  addTitle: string;
  addBody: string;
}> = {
  strength: {
    title: 'תוכנית כוח',
    valueLine: 'כוח, סקילים ויציבה — מותאם לרמה שלך',
    chip: 'שאלון · 2 דק׳',
    addTitle: 'רוצה להוסיף כוח?',
    addBody: '2 אימונים קצרים ישפרו את הריצה. הריצות נשארות.',
  },
  running: {
    title: 'תוכנית ריצה',
    valueLine: 'מ-0 ל-5 ק״מ או מהר יותר — תוכנית שבועית',
    chip: 'שאלון · 2 דק׳',
    addTitle: 'רוצה להוסיף ריצה?',
    addBody: '3 ריצות קצרות בשבוע, סביב הכוח. השבוע שלך נשאר.',
  },
};

export const PROGRAM_START_HINT = 'לא בטוח? אפשר את שניהם';
export const ADD_TRACK_CTA = 'בוא נוסיף · 2 דק׳';
export const ADD_TRACK_DISMISS = 'לא עכשיו';
/** The blurred week strip's label for a user with no program yet. */
export const PICK_PROGRAM_STRIP_HINT = 'בחר תוכנית למטה';
