/**
 * Persona follow-up-question taxonomy (Phase 3b — the generic drawer).
 * See docs/research/military-persona-unified-architecture.md §3ב.
 *
 * The reason a shared mechanism matters at all isn't the mechanism itself —
 * it's the promise that a future persona needing a follow-up question can
 * get one via CONFIG alone, without a second drawer component. That promise
 * only holds for a persona reusing an EXISTING question type below.
 * A genuinely new question type (bespoke UI + data source) is still real,
 * one-time code — the boundary is "we won't write a second component,"
 * not "we'll never write code again."
 *
 * 'choice' is fully generic (label + options), needs zero code ever, for
 * any future persona with a closed-answer-set question. 'hierarchy_search'
 * is bespoke (queries `unitDirectory`, built once for military) but reusable
 * by any future persona needing the same "search + drill into a directory"
 * capability against a similarly-shaped collection.
 *
 * 'location' is deliberately NOT included here (Phase 3b review, 02.09.2026):
 * a location-type question would write straight into `personas[].answers`,
 * which is exactly the field exposed to any authenticated user for any
 * `core.discoverable` profile (see the military_declarations/{uid} design
 * in firestore.rules for the full reasoning) — office_worker's
 * `officeLocation` carries the identical exposure profile `military`'s
 * self-declared unit data did before it got its own protected document, and
 * it has zero real consumers today. Add it — component, question type, AND
 * a storage-location decision matching military's — when it has one.
 */

export type PersonaQuestionType = 'choice' | 'hierarchy_search';

export interface ChoiceQuestionConfig {
  type: 'choice';
  /** Which key in the persona's answers object this question populates. */
  key: string;
  label: string;
  options: { value: string; label: string }[];
  skippable: boolean;
}

export interface HierarchySearchQuestionConfig {
  type: 'hierarchy_search';
  /**
   * Not a nesting prefix — hierarchy_search always writes the fixed
   * `orgId`/`unitId`/`unitPathIds` fields directly (matching
   * MilitaryPersonaAnswers' real shape). Kept as a display/identity key
   * for the question (step-dots, React key), same role as ChoiceQuestionConfig's.
   */
  key: string;
  label: string;
  /** Fixed today; kept as a field so a future persona can point at a
   *  differently-shaped directory collection without a new question type. */
  directoryCollection: 'unitDirectory';
  /**
   * Soft filter/sort hint, not validation (see MilitaryPersonaAnswers'
   * statusCategory-vs-MilitaryStatus distinction) — if the named prior
   * answer key is already set, prioritize/highlight directory entries
   * whose `statusCategory` matches. Never excludes a non-matching choice.
   */
  softFilterFromKey?: string;
  skippable: boolean;
}

export type PersonaQuestionConfig = ChoiceQuestionConfig | HierarchySearchQuestionConfig;

// The actual per-persona configuration. Adding a persona here that uses an
// EXISTING question type is the entire cost of the "config only" promise —
// no PERSONA_QUESTIONS entry at all means that persona has no follow-up
// drawer (the common case: parent/student/pupil/vatikim/pro_athlete today).
export const PERSONA_QUESTIONS: Partial<Record<
  import('./persona.types').PersonaId,
  PersonaQuestionConfig[]
>> = {
  military: [
    {
      type: 'choice',
      key: 'status',
      label: 'מה הסטטוס שלך?',
      skippable: true,
      options: [
        { value: 'regular', label: 'סדיר' },
        { value: 'career', label: 'קבע' },
        { value: 'reserve', label: 'מילואים' },
      ],
    },
    {
      type: 'hierarchy_search',
      key: 'unit',
      label: 'באיזו יחידה?',
      directoryCollection: 'unitDirectory',
      softFilterFromKey: 'status',
      skippable: true,
    },
  ],
};
