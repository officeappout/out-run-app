import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import he from '@/messages/he/home.json';

/** Copy for canvas "שאלון לו״ז" row 7 (S-7b start cards, S-7c / S-7d add cards) — catalog keys (src/messages/he/home.json). */
export const PROGRAM_START_KEYS = {
  strength: {
    title: 'programStart.strength.title',
    valueLine: 'programStart.strength.valueLine',
    chip: 'programStart.strength.chip',
    addTitle: 'programStart.strength.addTitle',
    addBody: 'programStart.strength.addBody',
  },
  running: {
    title: 'programStart.running.title',
    valueLine: 'programStart.running.valueLine',
    chip: 'programStart.running.chip',
    addTitle: 'programStart.running.addTitle',
    addBody: 'programStart.running.addBody',
  },
} as const satisfies Record<ProgramTrack, Record<'title' | 'valueLine' | 'chip' | 'addTitle' | 'addBody', keyof typeof he>>;

export const PROGRAM_START_HINT_KEY = 'programStart.hint' as const;
export const ADD_TRACK_CTA_KEY = 'programStart.addCta' as const;
export const ADD_TRACK_DISMISS_KEY = 'programStart.addDismiss' as const;
export const PICK_PROGRAM_STRIP_HINT_KEY = 'programStart.pickStripHint' as const;

/**
 * The same copy as Hebrew strings, read from the he catalog, for the callers outside the migrated files
 * (home/page.tsx's strip hint, AddTrackCard, start-cards-look.test). They switch to the *_KEY / PROGRAM_START_KEYS
 * exports above (rendered with useT(home)) when their files migrate; until then they show the Hebrew source text.
 */
const heCopy = (keys: (typeof PROGRAM_START_KEYS)[ProgramTrack]) => ({
  title: he[keys.title],
  valueLine: he[keys.valueLine],
  chip: he[keys.chip],
  addTitle: he[keys.addTitle],
  addBody: he[keys.addBody],
});

export const PROGRAM_START_COPY: Record<ProgramTrack, {
  title: string;
  valueLine: string;
  chip: string;
  addTitle: string;
  addBody: string;
}> = {
  strength: heCopy(PROGRAM_START_KEYS.strength),
  running: heCopy(PROGRAM_START_KEYS.running),
};

export const PROGRAM_START_HINT = he[PROGRAM_START_HINT_KEY];
export const ADD_TRACK_CTA = he[ADD_TRACK_CTA_KEY];
export const ADD_TRACK_DISMISS = he[ADD_TRACK_DISMISS_KEY];
/** The blurred week strip's label for a user with no program yet. */
export const PICK_PROGRAM_STRIP_HINT = he[PICK_PROGRAM_STRIP_HINT_KEY];
