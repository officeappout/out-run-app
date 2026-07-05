// ==========================================
// מילון תרגומים (i18n)
// כל הטקסטים באפליקציה - ללא Hardcoding
// ==========================================

export type DictionaryKey =
  // Onboarding - כללי
  | 'onboarding.welcome.title'
  | 'onboarding.welcome.subtitle'
  | 'onboarding.continue'
  | 'onboarding.skip'
  | 'onboarding.back'

  // פרטים אישיים
  | 'onboarding.personal.title'
  | 'onboarding.personal.name.question'
  | 'onboarding.personal.name.placeholder'
  | 'onboarding.personal.birthdate.question'
  | 'onboarding.personal.birthdate.minAge'
  | 'onboarding.personal.gender.question'
  | 'onboarding.personal.gender.male'
  | 'onboarding.personal.gender.female'
  | 'onboarding.personal.gender.other'

  // מטרה
  | 'onboarding.goal.title'
  | 'onboarding.goal.subtitle'
  | 'onboarding.goal.healthy_lifestyle'
  | 'onboarding.goal.performance_boost'
  | 'onboarding.goal.weight_loss'
  | 'onboarding.goal.skill_mastery'

  // רמת כושר
  | 'onboarding.fitness.title'
  | 'onboarding.fitness.subtitle'
  | 'onboarding.fitness.beginner.title'
  | 'onboarding.fitness.beginner.description'
  | 'onboarding.fitness.intermediate.title'
  | 'onboarding.fitness.intermediate.description'
  | 'onboarding.fitness.advanced.title'
  | 'onboarding.fitness.advanced.description'

  // ימי אימון
  | 'onboarding.schedule.frequency.question'
  | 'onboarding.schedule.frequency.subtitle'
  | 'onboarding.schedule.days.question'
  | 'onboarding.schedule.days.restRecommendation'
  | 'onboarding.schedule.time.question'
  | 'onboarding.schedule.location.additional'

  // ציוד
  | 'onboarding.equipment.title'
  | 'onboarding.equipment.none'
  | 'onboarding.equipment.home'
  | 'onboarding.equipment.gym'
  | 'onboarding.equipment.selectItems'
  | 'onboarding.equipment.pullUpBar'
  | 'onboarding.equipment.parallelBars'
  | 'onboarding.equipment.resistanceBand'
  | 'onboarding.equipment.weights'
  | 'onboarding.equipment.trx'
  | 'onboarding.equipment.rings'

  // הצהרת בריאות
  | 'onboarding.health.title'
  | 'onboarding.health.disclaimer'
  | 'onboarding.health.medicalWarning'
  | 'onboarding.health.consultDoctor'
  | 'onboarding.health.defaultNo'
  | 'onboarding.health.heartDisease'
  | 'onboarding.health.chestPainRest'
  | 'onboarding.health.chestPainActivity'
  | 'onboarding.health.approve'
  | 'onboarding.health.strictTerms'

  | 'onboarding.personal.weight.title'
  | 'onboarding.personal.weight.question'

  // תנאי שימוש
  | 'onboarding.terms.title'

  // מיקום
  | 'onboarding.location.title'
  | 'onboarding.location.question'
  | 'onboarding.location.description'
  | 'onboarding.location.placeholder'
  | 'onboarding.location.findPark.title'
  | 'onboarding.location.findPark.description'
  | 'onboarding.location.findPark.search'

  // OTP
  | 'onboarding.otp.title'
  | 'onboarding.otp.description'
  | 'onboarding.otp.placeholder'
  | 'onboarding.otp.sendCode'
  | 'onboarding.otp.verify'
  | 'onboarding.otp.codePlaceholder'

  // סיכום
  | 'onboarding.summary.loading'
  | 'onboarding.summary.welcome'
  | 'onboarding.summary.greeting'
  | 'onboarding.summary.trainingDays'
  | 'onboarding.summary.myLevel'
  | 'onboarding.summary.persistentTrainees'
  | 'onboarding.summary.persistentTrainees.description'
  | 'onboarding.summary.myChallenge'
  | 'onboarding.summary.myChallenge.instruction'
  | 'onboarding.summary.startButton'

  // שמירת התקדמות
  | 'onboarding.saveProgress.title'
  | 'onboarding.saveProgress.description'
  | 'onboarding.saveProgress.continue'

  // Exercise / Workout
  | 'exercise.instructionalVideo.button'
  | 'exercise.loggingMode.reps'
  | 'exercise.loggingMode.completion'
  | 'exercise.loggingMode.reps.description'
  | 'exercise.loggingMode.completion.description'

  // Challenge booth — landing
  | 'challenge.landing.badge'
  | 'challenge.landing.howItWorks'
  | 'challenge.landing.step1.title'
  | 'challenge.landing.step1.desc'
  | 'challenge.landing.step2.title'
  | 'challenge.landing.step2.desc'
  | 'challenge.landing.step3.title'
  | 'challenge.landing.step3.desc'
  | 'challenge.landing.cta'
  | 'challenge.landing.ctaNote'
  | 'challenge.landing.notFound'
  | 'challenge.landing.notFoundDesc'
  | 'challenge.stats.participants'
  | 'challenge.stats.topScore'
  | 'challenge.stats.average'

  // Challenge booth — join form
  | 'challenge.join.title'
  | 'challenge.join.subtitle'
  | 'challenge.join.nameLabel'
  | 'challenge.join.namePlaceholder'
  | 'challenge.join.ageLabel'
  | 'challenge.join.agePlaceholder'
  | 'challenge.join.genderLabel'
  | 'challenge.join.gender.male'
  | 'challenge.join.gender.female'
  | 'challenge.join.gender.other'
  | 'challenge.join.submit'
  | 'challenge.join.note'
  | 'challenge.join.error.invalidCode'
  | 'challenge.join.error.general'

  // Challenge booth — timer
  | 'challenge.timer.instruction'
  | 'challenge.timer.exerciseName'

  // Challenge booth — done
  | 'challenge.done.congrats'
  | 'challenge.done.seconds'
  | 'challenge.done.minutes'
  | 'challenge.done.rank.place'
  | 'challenge.done.rank.of'
  | 'challenge.done.rank.men'
  | 'challenge.done.rank.women'
  | 'challenge.done.rank.overall'
  | 'challenge.done.saveTitle'
  | 'challenge.done.saveDesc'
  | 'challenge.done.googleBtn'
  | 'challenge.done.appleBtn'
  | 'challenge.done.free'
  | 'challenge.done.saved'
  | 'challenge.done.savedDesc'
  | 'challenge.done.qrLabel'
  | 'challenge.done.error.accountExists'
  | 'challenge.done.error.generic'
  | 'challenge.done.error.general'
  | 'challenge.done.existingAccount'
  | 'challenge.done.signin'
  | 'challenge.done.download.title'
  | 'challenge.done.download.ios'
  | 'challenge.done.download.android'

  // Challenge booth — plasma display
  | 'challenge.booth.participants'
  | 'challenge.booth.men'
  | 'challenge.booth.women'
  | 'challenge.booth.overall'
  | 'challenge.booth.waiting'
  | 'challenge.booth.newEntry.suffix'
  | 'challenge.booth.refresh'
  | 'challenge.booth.error';

// ==========================================
// מילון עברית (ברירת מחדל)
// ==========================================
export const he: Record<DictionaryKey, string> = {
  // Onboarding - כללי
  'onboarding.welcome.title': 'כאן מתחיל המסע האישי שלך לכושר.',
  'onboarding.welcome.subtitle': 'אפליקציית OUT יוצרת עבורך תוכנית חכמה ומותאמת אישית לפי הרמה, היעדים והציוד שיש לך – עכשיו אפשר להתאמן בכל מקום! הכנו שאלון קצר להכיר אותך ולהתאים לך את החוויה.',
  'onboarding.continue': 'המשך',
  'onboarding.skip': 'לדלג',
  'onboarding.back': 'חזרה',

  // פרטים אישיים
  'onboarding.personal.title': 'פרטים אישיים',
  'onboarding.personal.name.question': 'מה השם שלך?',
  'onboarding.personal.name.placeholder': 'הכניסו את השם כאן',
  'onboarding.personal.birthdate.question': 'מתי נולדת?',
  'onboarding.personal.birthdate.minAge': 'ניתן להצטרף מגיל 14 ומעלה.',
  'onboarding.personal.gender.question': 'מה המגדר שלך?',
  'onboarding.personal.gender.male': 'זכר',
  'onboarding.personal.gender.female': 'נקבה',
  'onboarding.personal.gender.other': 'אחר',

  // מטרה
  'onboarding.goal.title': 'מה המטרה שלך?',
  'onboarding.goal.subtitle': 'יש לנו מגוון תוכניות, ממליצים להתחיל מתוכנית אחת.',
  'onboarding.goal.healthy_lifestyle': 'אורח חיים בריא',
  'onboarding.goal.performance_boost': 'שיפור ביצועים',
  'onboarding.goal.weight_loss': 'ירידה במשקל',
  'onboarding.goal.skill_mastery': 'שליטה במיומנויות',

  // רמת כושר
  'onboarding.fitness.title': 'מהם הרגלי האימון שלך כיום?',
  'onboarding.fitness.subtitle': '(יש לבחור את מה שהכי קרוב אליך)',
  'onboarding.fitness.beginner.title': 'מתחילים',
  'onboarding.fitness.beginner.description': 'כמעט ולא יוצא לי להתאמן. זה מרגיש לי קשה או מסובך, אבל אני רוצה להתחיל.',
  'onboarding.fitness.intermediate.title': 'מתקדמים',
  'onboarding.fitness.intermediate.description': 'יוצא לי להתאמן מדי פעם, קשה לי לשמור על שגרה מסודרת. אני רוצה לבנות הרגלים ולהשתפר.',
  'onboarding.fitness.advanced.title': 'מקצוענים',
  'onboarding.fitness.advanced.description': 'יש לי שגרת אימונים קבועה ואני רוצה להשתפר בתרגילי קליסטניקס ספציפיים, לעבוד על מטרות.',

  // ימי אימון
  'onboarding.schedule.frequency.question': 'כמה פעמים בשבוע נוח לך להתאמן?',
  'onboarding.schedule.frequency.subtitle': 'ניתן לבחור מטרה אחת',
  'onboarding.schedule.days.question': 'באילו ימים?',
  'onboarding.schedule.days.restRecommendation': 'מומלץ לנוח בין 24-48 שעות בין האימונים.',
  'onboarding.schedule.time.question': 'באיזו שעה את/ה מתאמן/ת בדרך כלל?',
  'onboarding.schedule.location.additional': 'אני מתאמן/ת גם במקום נוסף',

  // ציוד
  'onboarding.equipment.title': 'מה הציוד שיש לך?',
  'onboarding.equipment.none': 'אין לי ציוד – מתאמן/ת בבית בלי אביזרים',
  'onboarding.equipment.home': 'יש לי ציוד אישי בבית',
  'onboarding.equipment.gym': 'אני מתאמן/ת גם בחדר כושר עם ציוד',
  'onboarding.equipment.selectItems': 'יש לסמן איזה ציוד יש ברשותך',
  'onboarding.equipment.pullUpBar': 'מתח',
  'onboarding.equipment.parallelBars': 'מקבילים',
  'onboarding.equipment.resistanceBand': 'גומיית התנגדות',
  'onboarding.equipment.weights': 'משקולות',
  'onboarding.equipment.trx': 'TRX',
  'onboarding.equipment.rings': 'טבעות',

  // הצהרת בריאות
  'onboarding.health.title': 'הצהרת בריאות ותנאי שימוש',
  'onboarding.health.strictTerms': 'אני מצהיר/ה כי קראתי ואני מסכימ/ה לתנאי השימוש ומדיניות הפרטיות, וכי מצבי הבריאותי מאפשר לי להשתתף בפעילות גופנית.',
  'onboarding.health.disclaimer': 'כל המידע שתמלא נשמר באופן פרטי ומאובטח, ומשמש רק לצורך התאמת התוכנית עבורך.',
  'onboarding.health.medicalWarning': 'אם התשובה לאחת השאלות תצביע על בעיה רפואית, לא תוכל להירשם לאפליקציה.',
  'onboarding.health.consultDoctor': 'בכל מקרה של שינוי במצב הבריאותי שלך יש להתייעץ עם רופא לגבי המשך הפעילות הגופנית שלך.',
  'onboarding.health.defaultNo': 'שימו לב, התשובות מסומנות ב"לא" כברירת מחדל.',
  'onboarding.health.heartDisease': 'האם הרופא שלך אמר לך שאת/ה סובל/ת ממחלות לב?',
  'onboarding.health.chestPainRest': 'האם את/ה חש כאבים בחזה בזמן מנוחה?',
  'onboarding.health.chestPainActivity': 'האם את/ה חש כאבים בחזה במהלך פעילויות שיגרה ביום-יום?',
  'onboarding.health.approve': 'מאשר.ת',

  // משקל (חסר בקובץ המקורי)
  'onboarding.personal.weight.title': 'פרטים אישיים',
  'onboarding.personal.weight.question': 'מה המשקל שלך?',

  // תנאי שימוש
  'onboarding.terms.title': 'תנאי שימוש',

  // מיקום
  'onboarding.location.title': 'מיקום',
  'onboarding.location.question': 'איפה את/ה גר?',
  'onboarding.location.description': 'המידע נאסף כדי לעזור לך להצטרף לקהילה המקומית, למצוא פארקי כושר קרובים ולבדוק הטבות עירוניות. המידע האישי שלך נשמר פרטי.',
  'onboarding.location.placeholder': 'הכניסו עיר כאן',
  'onboarding.location.findPark.title': 'רוצה למצוא את הפארק הקרוב אליך?',
  'onboarding.location.findPark.description': 'פארקי כושר ציבוריים זמינים ברחבי הארץ עם מתקנים לאימוני OUT. אמת את המיקום שלך כדי למצוא את הפארק הקרוב ביותר.',
  'onboarding.location.findPark.search': 'חיפוש...',

  // OTP
  'onboarding.otp.title': 'מה המספר טלפון שלך?',
  'onboarding.otp.description': 'זה החלק שבו אנחנו שולחים לך קוד אימות. אל דאגה, אנחנו לא מציקים.',
  'onboarding.otp.placeholder': 'הכניסו את המספר כאן',
  'onboarding.otp.sendCode': 'שלחו לי קוד',
  'onboarding.otp.verify': 'אימות',
  'onboarding.otp.codePlaceholder': 'הכניסו את הקוד כאן',

  // סיכום
  'onboarding.summary.loading': 'מחשבים לך את התוכנית...',
  'onboarding.summary.welcome': 'בואו נתחיל!',
  'onboarding.summary.greeting': 'איזה כיף שבחרת להשקיע בעצמך.',
  'onboarding.summary.trainingDays': 'ימי האימון שלי',
  'onboarding.summary.myLevel': 'הרמה שלי',
  'onboarding.summary.persistentTrainees': 'מתאמנים מתמידים',
  'onboarding.summary.persistentTrainees.description': 'כ-1,280 משתמשים התחילו כאן - רובם הגיעו לרמה 6 תוך חודש! המשיכו להתקדם וצברו אחוזים לרמה הבאה!',
  'onboarding.summary.myChallenge': 'האתגר שלי',
  'onboarding.summary.myChallenge.instruction': 'ניתן להחליף אתגר בכל שלב דרך עמוד ה\'הישגים שלי\'.',
  'onboarding.summary.startButton': 'בואו נתחיל!',

  // שמירת התקדמות
  'onboarding.saveProgress.title': 'שמירת התקדמות',
  'onboarding.saveProgress.description': 'כדי שלא תאבד את הדירוג שלך ונוכל לשלוח לך את התוכנית, בוא נבצע אימות קצר.',
  'onboarding.saveProgress.continue': 'המשך לאימות',

  // Exercise / Workout
  'exercise.instructionalVideo.button': 'הסבר על התרגיל',
  'exercise.loggingMode.reps': 'מעקב חזרות',
  'exercise.loggingMode.completion': 'סימון בוצע בלבד',
  'exercise.loggingMode.reps.description': 'קלט מספרים (חזרות, זמן וכו\')',
  'exercise.loggingMode.completion.description': 'לחימום/מתיחות ללא מספרים',

  // Challenge booth — landing
  'challenge.landing.badge': 'אתגר מכביה 2026',
  'challenge.landing.howItWorks': 'איך זה עובד',
  'challenge.landing.step1.title': 'הירשם',
  'challenge.landing.step1.desc': 'שם, גיל ומין. 20 שניות, בלי אפליקציה.',
  'challenge.landing.step2.title': 'החזק L-sit',
  'challenge.landing.step2.desc': 'הטיימר מודד — שחרר כשאתה חייב.',
  'challenge.landing.step3.title': 'ראה את הדירוג שלך',
  'challenge.landing.step3.desc': 'בליגת האתגר, בזמן אמת.',
  'challenge.landing.cta': 'הצטרף לאתגר',
  'challenge.landing.ctaNote': 'ללא הורדת אפליקציה · נכנסים ישר',
  'challenge.landing.notFound': 'הקישור לא תקין',
  'challenge.landing.notFoundDesc': 'לא נמצא אתגר פעיל בקישור זה.',
  'challenge.stats.participants': 'משתתפים',
  'challenge.stats.topScore': 'שיא נוכחי',
  'challenge.stats.average': 'ממוצע',

  // Challenge booth — join form
  'challenge.join.title': 'אתגר ה-L-Sit',
  'challenge.join.subtitle': 'כמה שניות תחזיק?',
  'challenge.join.nameLabel': 'שם',
  'challenge.join.namePlaceholder': 'הכנס שם',
  'challenge.join.ageLabel': 'גיל',
  'challenge.join.agePlaceholder': 'גיל',
  'challenge.join.genderLabel': 'מין',
  'challenge.join.gender.male': 'גבר',
  'challenge.join.gender.female': 'אישה',
  'challenge.join.gender.other': 'אחר',
  'challenge.join.submit': 'התחל אתגר',
  'challenge.join.note': 'בלי הרשמה · נכנסים ישר',
  'challenge.join.error.invalidCode': 'קישור לא תקין. אנא נסה שוב.',
  'challenge.join.error.general': 'שגיאה — אנא נסה שוב.',

  // Challenge booth — timer
  'challenge.timer.instruction': 'החזק כמה שיותר זמן. שחרר כשאתה חייב.',
  'challenge.timer.exerciseName': 'ישיבת L',

  // Challenge booth — done
  'challenge.done.congrats': 'כל הכבוד',
  'challenge.done.seconds': 'שנ׳',
  'challenge.done.minutes': 'דק׳',
  'challenge.done.rank.place': 'מקום',
  'challenge.done.rank.of': 'מתוך',
  'challenge.done.rank.men': 'גברים',
  'challenge.done.rank.women': 'נשים',
  'challenge.done.rank.overall': 'כללי',
  'challenge.done.saveTitle': 'שמור את התוצאה שלך',
  'challenge.done.saveDesc': 'הירשם עם Google או Apple כדי לראות את הדירוג שלך שוב ולהתאמן עם OUT',
  'challenge.done.googleBtn': 'המשך עם Google',
  'challenge.done.appleBtn': 'המשך עם Apple',
  'challenge.done.free': 'אין צורך בכרטיס אשראי · בחינם לנצח',
  'challenge.done.saved': 'החשבון נשמר!',
  'challenge.done.savedDesc': 'התוצאה שלך מקושרת לחשבון — תמצא אותה בליגת האתגר.',
  'challenge.done.qrLabel': 'סרוק להורדת אפליקציית OUT',
  'challenge.done.error.accountExists': 'חשבון Google זה כבר משויך לפרופיל אחר.',
  'challenge.done.error.generic': 'שגיאת חיבור. אנא ודא שהכתובת הוסמכה ב-Firebase Console.',
  'challenge.done.error.general': 'שגיאה — אנא נסה שוב.',
  'challenge.done.existingAccount': 'כבר יש לך חשבון OUT',
  'challenge.done.signin': 'התחבר',
  'challenge.done.download.title': 'הורד את OUT',
  'challenge.done.download.ios': 'הורד לאייפון',
  'challenge.done.download.android': 'הורד לאנדרואד',

  // Challenge booth — plasma display
  'challenge.booth.participants': 'משתתפים',
  'challenge.booth.men': 'גברים 👦',
  'challenge.booth.women': 'נשים 👧',
  'challenge.booth.overall': 'דירוג כללי',
  'challenge.booth.waiting': 'ממתין למשתתפים...',
  'challenge.booth.newEntry.suffix': 'נכנס לדירוג!',
  'challenge.booth.refresh': 'מתרענן כל 8 שניות',
  'challenge.booth.error': 'שגיאת חיבור — מנסה שוב...',
};

// ==========================================
// מילון אנגלית (לעתיד)
// ==========================================
export const en: Record<DictionaryKey, string> = {
  // Placeholder - ניתן להשלים בעתיד
  ...Object.keys(he).reduce((acc, key) => {
    acc[key as DictionaryKey] = key; // זמני - מחזיר את המפתח
    return acc;
  }, {} as Record<DictionaryKey, string>),
  
  // Exercise / Workout
  'exercise.instructionalVideo.button': 'How to perform',
  'exercise.loggingMode.reps': 'Reps Tracking',
  'exercise.loggingMode.completion': 'Simple Check',
  'exercise.loggingMode.reps.description': 'Number input (reps, time, etc.)',
  'exercise.loggingMode.completion.description': 'For warmups/stretches without numbers',

  // Challenge booth — landing
  'challenge.landing.badge': 'Maccabiah 2026 Challenge',
  'challenge.landing.howItWorks': 'How it works',
  'challenge.landing.step1.title': 'Register',
  'challenge.landing.step1.desc': 'Name, age & gender. 20 seconds, no app.',
  'challenge.landing.step2.title': 'Hold the L-sit',
  'challenge.landing.step2.desc': 'The timer counts — release when you must.',
  'challenge.landing.step3.title': 'See your rank',
  'challenge.landing.step3.desc': 'In the challenge league, live.',
  'challenge.landing.cta': 'Join the Challenge',
  'challenge.landing.ctaNote': 'No app download · Jump right in',
  'challenge.landing.notFound': 'Invalid link',
  'challenge.landing.notFoundDesc': 'No active challenge found at this link.',
  'challenge.stats.participants': 'Participants',
  'challenge.stats.topScore': 'Current record',
  'challenge.stats.average': 'Average',

  // Challenge booth — join form
  'challenge.join.title': 'The L-Sit Challenge',
  'challenge.join.subtitle': 'How long can you hold?',
  'challenge.join.nameLabel': 'Name',
  'challenge.join.namePlaceholder': 'Enter name',
  'challenge.join.ageLabel': 'Age',
  'challenge.join.agePlaceholder': 'Age',
  'challenge.join.genderLabel': 'Gender',
  'challenge.join.gender.male': 'Male',
  'challenge.join.gender.female': 'Female',
  'challenge.join.gender.other': 'Other',
  'challenge.join.submit': 'Start Challenge',
  'challenge.join.note': 'No signup · Jump right in',
  'challenge.join.error.invalidCode': 'Invalid link. Please try again.',
  'challenge.join.error.general': 'Error — please try again.',

  // Challenge booth — timer
  'challenge.timer.instruction': 'Hold as long as you can. Release when you must.',
  'challenge.timer.exerciseName': 'L-Sit',

  // Challenge booth — done
  'challenge.done.congrats': 'Well done',
  'challenge.done.seconds': 'sec',
  'challenge.done.minutes': 'min',
  'challenge.done.rank.place': 'Rank',
  'challenge.done.rank.of': 'of',
  'challenge.done.rank.men': 'Men',
  'challenge.done.rank.women': 'Women',
  'challenge.done.rank.overall': 'Overall',
  'challenge.done.saveTitle': 'Save your result',
  'challenge.done.saveDesc': 'Sign up with Google or Apple to track your ranking and train with OUT',
  'challenge.done.googleBtn': 'Continue with Google',
  'challenge.done.appleBtn': 'Continue with Apple',
  'challenge.done.free': 'No credit card · Free forever',
  'challenge.done.saved': 'Account saved!',
  'challenge.done.savedDesc': 'Your result is linked to your account — find it in the challenge league.',
  'challenge.done.qrLabel': 'Scan to download the OUT app',
  'challenge.done.error.accountExists': 'This Google account is linked to another profile.',
  'challenge.done.error.generic': 'Connection error. Verify the domain is authorized in Firebase Console.',
  'challenge.done.error.general': 'Error — please try again.',
  'challenge.done.existingAccount': 'You already have an OUT account',
  'challenge.done.signin': 'Sign in',
  'challenge.done.download.title': 'Download OUT',
  'challenge.done.download.ios': 'Download for iPhone',
  'challenge.done.download.android': 'Download for Android',

  // Challenge booth — plasma display
  'challenge.booth.participants': 'Participants',
  'challenge.booth.men': 'Men 👦',
  'challenge.booth.women': 'Women 👧',
  'challenge.booth.overall': 'Overall Ranking',
  'challenge.booth.waiting': 'Waiting for participants...',
  'challenge.booth.newEntry.suffix': 'joined the rankings!',
  'challenge.booth.refresh': 'Refreshing every 8 seconds',
  'challenge.booth.error': 'Connection error — retrying...',
};

// ==========================================
// פונקציית עזר לקבלת תרגום
// ==========================================
export function getTranslation(
  key: DictionaryKey,
  language: 'he' | 'en' = 'he'
): string {
  const dict = language === 'he' ? he : en;
  return dict[key] || key;
}
