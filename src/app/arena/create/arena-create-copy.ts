/**
 * /arena/create copy — male / female / neutral (gender batch 2, owner decisions 21.10.2026;
 * src/lib/i18n/gender-copy.ts). Until 21.10 an unknown gender got the masculine form, and the
 * 'no code' WhatsApp text had a broken female branch ('אשמחי'; first person — now 'אשמח' for all).
 * Hebrew only: the page is not extracted yet; the extraction PR moves these as they are.
 */
import type { GenderedText } from '@/lib/i18n/gender-copy';

export const ARENA_CREATE_COPY = {
  titleFriends: { male: 'צור ליגת חברים', female: 'צורי ליגת חברות', other: 'ליגת חברים חדשה' },
  titleFamily: { male: 'צור ליגת משפחה', female: 'צורי ליגת משפחה', other: 'ליגת משפחה חדשה' },
  titleSchool: { male: 'הצטרף לבית ספר', female: 'הצטרפי לבית ספר', other: 'הצטרפות לבית ספר' },
  titleUnit: { male: 'הצטרף ליחידה', female: 'הצטרפי ליחידה', other: 'הצטרפות ליחידה' },
  titleNew: { male: 'צור ליגה חדשה', female: 'צורי ליגה חדשה', other: 'ליגה חדשה' },
  gpsLocked: { male: 'חבר GPS כדי להצטרף לעיר', female: 'חברי GPS כדי להצטרף לעיר', other: 'צריך GPS כדי להצטרף לעיר' },
  schoolCardDesc: { male: 'הצטרף לליגת בית הספר שלך', female: 'הצטרפי לליגת בית הספר שלך', other: 'הצטרפות לליגת בית הספר שלך' },
  unitCardDesc: { male: 'הצטרף לליגת היחידה שלך', female: 'הצטרפי לליגת היחידה שלך', other: 'הצטרפות לליגת היחידה שלך' },
  pickType: { male: 'בחר את סוג הקבוצה', female: 'בחרי את סוג הקבוצה', other: 'איזו קבוצה פותחים?' },
  descriptionPlaceholder: { male: 'ספר בקצרה על הקבוצה...', female: 'ספרי בקצרה על הקבוצה...', other: 'כמה מילים על הקבוצה...' },
  createError: { male: 'אירעה שגיאה ביצירת הקבוצה. נסה שוב.', female: 'אירעה שגיאה ביצירת הקבוצה. נסי שוב.', other: 'אירעה שגיאה ביצירת הקבוצה. נסו שוב.' },
  genericError: { male: 'אירעה שגיאה. נסה שוב.', female: 'אירעה שגיאה. נסי שוב.', other: 'אירעה שגיאה. נסו שוב.' },
  inviteOne: { male: 'הזמן לפחות שותף אחד', female: 'הזמיני לפחות שותף אחד', other: 'מזמינים לפחות שותף אחד' },
  shareAndOpen: { male: 'שתף ופתח קבוצה', female: 'שתפי ופתחי קבוצה', other: 'שיתוף ופתיחת קבוצה' },
  openWhatsapp: { male: 'פתח בוואטסאפ', female: 'פתחי בוואטסאפ', other: 'פתיחה בוואטסאפ' },
  skip: { male: 'דלג', female: 'דלגי', other: 'דילוג' },
  joinYourUnit: { male: 'הצטרף ליחידה שלך', female: 'הצטרפי ליחידה שלך', other: 'הצטרפות ליחידה שלך' },
  joinYourSchool: { male: 'הצטרף לבית הספר שלך', female: 'הצטרפי לבית הספר שלך', other: 'הצטרפות לבית הספר שלך' },
  getCodeUnit: { male: 'קבל קוד גישה ממפקד הכושר שלך', female: 'קבלי קוד גישה ממפקד הכושר שלך', other: 'מקבלים קוד גישה ממפקד הכושר' },
  enterCode: { male: 'הזן את הקוד כאן', female: 'הזיני את הקוד כאן', other: 'מזינים את הקוד כאן' },
  autoJoinUnit: { male: 'הצטרף אוטומטית לליגת היחידה שלך!', female: 'הצטרפי אוטומטית לליגת היחידה שלך!', other: 'מצטרפים אוטומטית לליגת היחידה!' },
  getCodeSchool: { male: 'קבל קוד גישה ממורה לחנ"ג / רכזת הספורט', female: 'קבלי קוד גישה ממורה לחנ"ג / רכזת הספורט', other: 'מקבלים קוד גישה ממורה לחנ"ג / רכזת הספורט' },
  autoJoinSchool: { male: 'הצטרף אוטומטית לליגת בית הספר שלך!', female: 'הצטרפי אוטומטית לליגת בית הספר שלך!', other: 'מצטרפים אוטומטית לליגת בית הספר!' },
  welcomeToLeague: { male: 'ברוך הבא לליגת:', female: 'ברוכה הבאה לליגת:', other: 'ברוכים הבאים לליגת:' },
  send: { male: 'שלח', female: 'שלחי', other: 'שליחת' },
  outreachIntro: { male: 'אני מתאמן עם Out ורוצה', female: 'אני מתאמנת עם Out ורוצה', other: 'אני באפליקציית Out ורוצה' },
} as const satisfies Record<string, GenderedText>;
