/**
 * Shared Onboarding Locales
 * Centralized translations for all onboarding screens (Intro, Selection, Dynamic)
 */

export type OnboardingLanguage = 'he' | 'en' | 'ru';

export interface OnboardingLocales {
  // Intro Screen
  intro: {
    title: string;
    continue: string;
  };
  
  // Selection Screen
  selection: {
    googleButton: string;
    startButton: string;
    guestLink: string;
  };
  
  // Roadmap Screen (Step 1)
  roadmap: {
    title: string;
    description: string;
    steps: {
      personalDetails: string;
      fitnessLevel: string;
      goal: string;
    };
  };
  
  // Personal Details Screen (Step 2)
  details: {
    header: string;
    subheader: string;
    nameQuestion: string;
    namePlaceholder: string;
    genderQuestion: string;
    male: string;
    female: string;
  };
  
  // Common
  common: {
    runYourWorld: string;
    continue: string;
    continueFemale: string;
    ready: string;
    startAssessment: string;
    welcomeMessage: string;
    programReady: string;
  };
  
  // Loading AI Builder
  loading: {
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  };

  // Phase 2 Intro (Bridge Screen)
  phase2Intro: {
    title: string;
    subtitle: string;
    step1: string;
    step2: string;
    step3: string;
    continueButton: string;
  };

  // Equipment Step
  equipment: {
    title: string;
    noEquipment: string;
    hasEquipment: string;
    selectEquipment: string;
    moreEquipment: string;
    hasGym: string;
    searchPlaceholder: string;
    noResults: string;
  };

  // History Step
  history: {
    title: string;
    subtitle: string;
    frequencyQuestion: string;
    frequencyNone: string;
    frequency12: string;
    frequency3Plus: string;
    locationsQuestion: string;
    locationGym: string;
    locationStreet: string;
    locationStudio: string;
    locationHome: string;
    locationCardio: string;
  };
}

export const onboardingLocales: Record<OnboardingLanguage, OnboardingLocales> = {
  he: {
    intro: {
      title: 'הגיע הזמן לגלות מה הרמה שלך',
      continue: 'המשך',
    },
    selection: {
      googleButton: 'המשך באמצעות Google',
      startButton: 'התחלת תהליך',
      guestLink: 'המשך כאורח',
    },
    roadmap: {
      title: 'בואו נתאים לך את החוויה',
      description: 'אפליקציית OUT יוצרת עבורך תוכנית חכמה ומותאמת אישית לפי הרמה, היעדים והציוד שיש לך — עכשיו אפשר להתאמן בכל מקום!',
      steps: {
        personalDetails: 'התאמת החוויה שלך',
        fitnessLevel: 'דיוק היכולות שלך',
        goal: 'הגדרות אישיות ומטרות',
      },
    },
    details: {
      header: 'נעים להכיר!',
      subheader: 'כדי שנוכל להתאים לך הכל, איך לקרוא לך?',
      nameQuestion: '',
      namePlaceholder: 'הכניסו את שמכם המלא',
      genderQuestion: 'ואיך תרצו שנפנה אליכם?',
      male: 'זכר',
      female: 'נקבה',
    },
    common: {
      runYourWorld: 'RUN YOUR WORLD',
      continue: 'המשך',
      continueFemale: 'המשיכי',
      ready: 'אני מוכן/ה',
      startAssessment: 'בואו נתחיל באבחון',
      welcomeMessage: 'מעולה {name}, בואו נתחיל לדייק את רמת הכושר שלך',
      programReady: 'התוכנית שלך מוכנה, {name}!',
    },
    loading: {
      step1: 'נעים להכיר, {name}! המערכת מתכוננת...',
      step2: 'מגדירים את סביבת השאלון המותאם שלך...',
      step3: 'טוענים את השאלות המדויקות עבורך...',
      step4: 'מיד מתחילים.',
    },
    phase2Intro: {
      title: 'השלב הראשון הושלם בהצלחה!',
      subtitle: 'עכשיו נתאים את האימונים לסביבה ולציוד שלך.',
      step1: 'אבחון ורמה',
      step2: 'התאמת סביבה',
      step3: 'מוכנים לצאת',
      continueButton: 'בואו נמשיך',
    },
    equipment: {
      title: 'מה הציוד שיש לך?',
      noEquipment: 'אין לי ציוד — מתאמן/ת בבית בלי אביזרים',
      hasEquipment: 'יש לי ציוד אישי בבית',
      selectEquipment: 'יש לסמן איזה ציוד יש ברשותך',
      moreEquipment: 'עוד ציוד...',
      hasGym: 'אני מתאמן/ת גם בחדר כושר עם ציוד',
      searchPlaceholder: 'חפש ציוד...',
      noResults: 'לא נמצאו תוצאות',
    },
    history: {
      title: 'הניסיון שלך',
      subtitle: 'כדי שהתוכנית תהיה בול, אנחנו צריכים להבין מאיפה אנחנו מתחילים.',
      frequencyQuestion: 'איך נראתה שגרת האימונים שלך בחודש האחרון?',
      frequencyNone: 'לא יצא לי להתאמן / הייתי בהפסקה',
      frequency12: 'מתאמן/ת פעם-פעמיים בשבוע',
      frequency3Plus: 'נותן/ת בראש (3 אימונים ומעלה)',
      locationsQuestion: 'ואיפה בדרך כלל התאמנת עד היום?',
      locationGym: 'חדר כושר',
      locationStreet: 'גינות כושר ציבוריות',
      locationStudio: 'סטודיו / חוגים',
      locationHome: 'אימון ביתי',
      locationCardio: 'ריצה / אירובי בחוץ',
    },
  },
  en: {
    intro: {
      title: "It's time to discover your level",
      continue: 'Continue',
    },
    selection: {
      googleButton: 'Continue with Google',
      startButton: 'Start Process',
      guestLink: 'Continue as Guest',
    },
    roadmap: {
      title: "Let's tailor the experience for you",
      description: 'The OUT app creates a smart, personalized plan tailored to your level, goals, and available equipment — now you can train anywhere!',
      steps: {
        personalDetails: 'Tailoring your experience',
        fitnessLevel: 'Refining your abilities',
        goal: 'Personal settings & goals',
      },
    },
    details: {
      header: 'Nice to meet you!',
      subheader: "To customize everything, what's your name?",
      nameQuestion: '',
      namePlaceholder: 'Enter your full name',
      genderQuestion: 'And how should we address you?',
      male: 'Male',
      female: 'Female',
    },
    common: {
      runYourWorld: 'RUN YOUR WORLD',
      continue: 'Continue',
      continueFemale: 'Continue',
      ready: "I'm ready",
      startAssessment: "Let's start the assessment",
      welcomeMessage: 'Great {name}, let\'s start refining your fitness level',
      programReady: 'Your program is ready, {name}!',
    },
    loading: {
      step1: 'Nice to meet you, {name}! System preparing...',
      step2: 'Setting up your custom questionnaire environment...',
      step3: 'Loading the precise questions for you...',
      step4: 'Starting in a moment.',
    },
    phase2Intro: {
      title: 'Phase 1 Completed Successfully!',
      subtitle: 'Now let\'s match your training to your environment and equipment.',
      step1: 'Assessment & Level',
      step2: 'Environment Setup',
      step3: 'Ready to Go',
      continueButton: "Let's Continue",
    },
    equipment: {
      title: 'What equipment do you have?',
      noEquipment: 'No equipment — training at home without accessories',
      hasEquipment: 'I have personal equipment at home',
      selectEquipment: 'Please mark which equipment you own',
      moreEquipment: 'More equipment...',
      hasGym: 'I also train at a gym with equipment',
      searchPlaceholder: 'Search equipment...',
      noResults: 'No results found',
    },
    history: {
      title: 'Your Experience',
      subtitle: 'To make the program perfect, we need to understand where you\'re starting from.',
      frequencyQuestion: 'What did your workout routine look like last month?',
      frequencyNone: 'I didn\'t get to train / I was on a break',
      frequency12: 'Training 1-2 times a week',
      frequency3Plus: 'Going hard (3+ workouts)',
      locationsQuestion: 'And where have you usually trained until now?',
      locationGym: 'Gym',
      locationStreet: 'Public workout parks',
      locationStudio: 'Studio / Classes',
      locationHome: 'Home training',
      locationCardio: 'Running / Outdoor cardio',
    },
  },
  ru: {
    intro: {
      title: 'Пришло время узнать свой уровень',
      continue: 'Продолжить',
    },
    selection: {
      googleButton: 'Продолжить с Google',
      startButton: 'Начать процесс',
      guestLink: 'Продолжить как гость',
    },
    roadmap: {
      title: 'Давайте настроим опыт для вас',
      description: 'Приложение OUT создает умный, персонализированный план, адаптированный к вашему уровню, целям и доступному оборудованию — теперь вы можете тренироваться где угодно!',
      steps: {
        personalDetails: 'Настройка вашего опыта',
        fitnessLevel: 'Уточнение ваших способностей',
        goal: 'Личные настройки и цели',
      },
    },
    details: {
      header: 'Приятно познакомиться!',
      subheader: 'Чтобы всё настроить, как вас зовут?',
      nameQuestion: '',
      namePlaceholder: 'Введите ваше полное имя',
      genderQuestion: 'И как к вам обращаться?',
      male: 'Мужской',
      female: 'Женский',
    },
    common: {
      runYourWorld: 'RUN YOUR WORLD',
      continue: 'Продолжить',
      continueFemale: 'Продолжить',
      ready: 'Я готов/а',
      startAssessment: 'Давайте начнем оценку',
      welcomeMessage: 'Отлично {name}, давайте начнем уточнять ваш уровень физической подготовки',
      programReady: 'Ваша программа готова, {name}!',
    },
    loading: {
      step1: 'Приятно познакомиться, {name}! Система готовится...',
      step2: 'Настройка среды вашего персонализированного опросника...',
      step3: 'Загрузка точных вопросов для вас...',
      step4: 'Начинаем через мгновение.',
    },
    phase2Intro: {
      title: 'Первый этап успешно завершен!',
      subtitle: 'Теперь подберем тренировки под ваше окружение и оборудование.',
      step1: 'Оценка и уровень',
      step2: 'Настройка окружения',
      step3: 'Готовы к старту',
      continueButton: 'Давайте продолжим',
    },
    equipment: {
      title: 'Какое у вас оборудование?',
      noEquipment: 'Нет оборудования — тренировки дома без аксессуаров',
      hasEquipment: 'У меня есть личное оборудование дома',
      selectEquipment: 'Пожалуйста, отметьте какое оборудование у вас есть',
      moreEquipment: 'Еще оборудование...',
      hasGym: 'Я также тренируюсь в спортзале с оборудованием',
      searchPlaceholder: 'Поиск оборудования...',
      noResults: 'Результатов не найдено',
    },
    history: {
      title: 'Ваш опыт',
      subtitle: 'Чтобы программа была идеальной, нам нужно понять, с чего вы начинаете.',
      frequencyQuestion: 'Как выглядела ваша тренировочная рутина в прошлом месяце?',
      frequencyNone: 'Мне не удалось тренироваться / Я был на перерыве',
      frequency12: 'Тренируюсь 1-2 раза в неделю',
      frequency3Plus: 'Выкладываюсь (3+ тренировки)',
      locationsQuestion: 'И где вы обычно тренировались до сих пор?',
      locationGym: 'Спортзал',
      locationStreet: 'Публичные парки для тренировок',
      locationStudio: 'Студия / Классы',
      locationHome: 'Домашние тренировки',
      locationCardio: 'Бег / Кардио на улице',
    },
  },
};

/**
 * Get onboarding locale for a specific language
 */
export function getOnboardingLocale(language: OnboardingLanguage = 'he'): OnboardingLocales {
  return onboardingLocales[language] || onboardingLocales.he;
}
