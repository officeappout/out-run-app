/**
 * Engine-generated workout titles ("אימון יומי בבית", "אימון התאוששות ל... בבית"). The Hebrew result is what the generator
 * stores with the workout and what logic matches on; other languages are a DISPLAY mapping (engine-title-display.ts), never stored.
 * Pure: no React, no Firebase. Moved out of WorkoutGenerator unchanged (Hebrew output byte-identical, see en-content-4-parity.test.ts).
 */
import type { IntentMode } from './ContextualEngine';
import type { DifficultyLevel } from './workout-generator.types';

export interface EngineTitleLexicon {
  templates: Record<string, Record<string, string>>;
  prefixes: Record<number, string>;
  personas: Record<string, string>;
  locations: Record<string, string>;
  /** "ל" + label (he) / "for " + label (en). */
  forPersona: (label: string) => string;
}

export const ENGINE_TITLE_LEXICON_HE: EngineTitleLexicon = {
  templates: {
    normal: {
      home: 'אימון יומי בבית', // i18n-allow-hebrew: data (engine title stored with the workout)
      park: 'אימון בפארק', // i18n-allow-hebrew: data (engine title stored with the workout)
      office: 'מיני-אימון במשרד', // i18n-allow-hebrew: data (engine title stored with the workout)
      street: 'אימון רחוב', // i18n-allow-hebrew: data (engine title stored with the workout)
      gym: 'אימון חדר כושר', // i18n-allow-hebrew: data (engine title stored with the workout)
      airport: 'אימון מהיר בשדה תעופה', // i18n-allow-hebrew: data (engine title stored with the workout)
      school: 'אימון בהפסקה', // i18n-allow-hebrew: data (engine title stored with the workout)
      default: 'אימון יומי', // i18n-allow-hebrew: data (engine title stored with the workout)
    },
    blast: {
      home: 'Blast בבית! 🔥', // i18n-allow-hebrew: data (engine title stored with the workout)
      park: 'Park Blast Session 🔥',
      office: 'Office Blast 🔥',
      street: 'Street Blast 🔥',
      gym: 'Gym Blast 🔥',
      default: 'Blast Session! 🔥',
    },
    on_the_way: {
      home: 'אימון בוקר מהיר', // i18n-allow-hebrew: data (engine title stored with the workout)
      office: 'Quick Office Pump',
      default: 'אימון בדרך 🚗', // i18n-allow-hebrew: data (engine title stored with the workout)
    },
    field: {
      default: 'אימון שטח 🎖️', // i18n-allow-hebrew: data (engine title stored with the workout)
    },
  },
  prefixes: {
    1: 'אימון התאוששות', // i18n-allow-hebrew: data (engine title stored with the workout)
    2: '',
    3: 'אימון כוח עצים 💪', // i18n-allow-hebrew: data (engine title stored with the workout)
  },
  personas: {
    parent: 'הורים עסוקים', // i18n-allow-hebrew: data (engine title stored with the workout)
    student: 'סטודנטים', // i18n-allow-hebrew: data (engine title stored with the workout)
    pupil: 'תלמידים', // i18n-allow-hebrew: data (engine title stored with the workout)
    office_worker: 'עובדי משרד', // i18n-allow-hebrew: data (engine title stored with the workout)
    military: 'אנשי צה"ל', // i18n-allow-hebrew: data (engine title stored with the workout)
    vatikim: 'בני גיל הזהב', // i18n-allow-hebrew: data (engine title stored with the workout)
    pro_athlete: 'ספורטאי קצה', // i18n-allow-hebrew: data (engine title stored with the workout)
    default: '',
  },
  locations: {
    home: 'בבית', // i18n-allow-hebrew: data (engine title stored with the workout)
    park: 'בפארק', // i18n-allow-hebrew: data (engine title stored with the workout)
    office: 'במשרד', // i18n-allow-hebrew: data (engine title stored with the workout)
    street: 'ברחוב', // i18n-allow-hebrew: data (engine title stored with the workout)
    gym: 'בחדר כושר', // i18n-allow-hebrew: data (engine title stored with the workout)
    airport: 'בשדה תעופה', // i18n-allow-hebrew: data (engine title stored with the workout)
    school: 'בבית ספר', // i18n-allow-hebrew: data (engine title stored with the workout)
    default: '',
  },
  forPersona: (label) => `ל${label}`, // i18n-allow-hebrew: data (engine title stored with the workout)
};

export interface EngineTitleInput {
  intentMode: IntentMode | string;
  difficulty: DifficultyLevel | number;
  location?: string;
  persona?: string;
}

/** Same composition as the generator always had: a template per intent/location, or a difficulty prefix plus persona and place. */
export function composeEngineTitle(lex: EngineTitleLexicon, input: EngineTitleInput): string {
  const parts: string[] = [];
  const difficultyPrefix = lex.prefixes[input.difficulty];
  if (difficultyPrefix) {
    parts.push(difficultyPrefix);
  } else {
    const templates = lex.templates[input.intentMode] || lex.templates.normal;
    parts.push(templates[input.location ?? ''] || templates.default || lex.templates.normal.default);
  }
  if (input.persona && !difficultyPrefix) {
    const personaLabel = lex.personas[input.persona];
    if (personaLabel) parts[0] = `${parts[0]} ${lex.forPersona(personaLabel)}`;
  }
  if (difficultyPrefix && input.location) {
    const locationLabel = lex.locations[input.location];
    if (locationLabel) {
      if (input.persona) {
        const personaLabel = lex.personas[input.persona];
        if (personaLabel) parts.push(lex.forPersona(personaLabel));
      }
      parts.push(locationLabel);
    }
  }
  return parts.join(' ');
}
