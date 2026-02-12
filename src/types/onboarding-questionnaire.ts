/**
 * Dynamic Onboarding Questionnaire Types
 * Used for Admin-managed branching questionnaire system
 */

export type QuestionType = 'choice' | 'input';
export type QuestionPart = 'assessment' | 'personal';
export type QuestionLayoutType = 'large-card' | 'horizontal-list';

/**
 * Multilingual text structure: Record<language, { neutral: string, female?: string }>
 * Example: { he: { neutral: "מה שלומך?", female: "מה שלומך?" }, ru: { neutral: "Как дела?" } }
 */
export type MultilingualText = Record<string, { neutral: string; female?: string }>;

export interface OnboardingQuestion {
  id: string;
  title: string | MultilingualText; // Support both old string format and new nested format
  description?: string | MultilingualText;
  type: QuestionType;
  part: QuestionPart;
  layoutType?: QuestionLayoutType; // Optional: 'large-card' (default) or 'horizontal-list'
  isFirstQuestion: boolean;
  order?: number; // Optional ordering for display
  color?: string; // Optional: hex color code for FlowView node customization (e.g., '#9333ea', '#3b82f6')
  progressIcon?: string; // Optional: icon name for progress bar display (e.g., 'Activity', 'Brain', 'Target')
  progressIconSvg?: string; // Optional: custom SVG icon content (overrides progressIcon if provided)
  language?: 'he' | 'en' | 'ru'; // Optional: language filter (legacy, for backwards compatibility)
  gender?: 'male' | 'female' | 'neutral'; // Optional: gender filter (legacy, for backwards compatibility)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Single result assignment (program + level combination)
 */
export interface AnswerResult {
  programId: string;
  levelId: string;
  // Dynamic sub-level mapping for Master Programs.
  // Keys are child programIds, values are initial levels.
  // Example: { "push": 3, "pull": 2, "legs": 4 }
  masterProgramSubLevels?: Record<string, number>;
  // Questionnaire chaining: ID of the next questionnaire to load after this result.
  // Enables flows like: Push Quiz → Pull Quiz → Master Result.
  nextQuestionnaireId?: string;
}

export interface OnboardingAnswer {
  id: string;
  questionId: string;
  text: string | MultilingualText; // Support both old string format and new nested format
  imageUrl?: string; // Optional image URL for visual answer cards
  nextQuestionId?: string | null; // null = terminates flow
  /**
   * Dynamic assignment (Admin-managed)
   * - assignedLevelId: document id from 'levels' collection (legacy, single assignment)
   * - assignedProgramId: document id from 'programs' collection (legacy, single assignment)
   * - assignedResults: NEW - array of program+level combinations for multiple results
   */
  assignedLevelId?: string | null; // Legacy: single level assignment
  assignedProgramId?: string | null; // Legacy: single program assignment
  assignedResults?: AnswerResult[]; // NEW: Multiple program+level assignments

  // Dynamic sub-level mapping for Master Programs (legacy, prefer assignedResults)
  masterProgramSubLevels?: Record<string, number>;

  // Legacy (backwards compatibility): numeric level (1-5)
  assignedLevel?: number | null;
  order?: number; // Display order within question
  language?: 'he' | 'en' | 'ru'; // Optional: language filter (legacy, for backwards compatibility)
  gender?: 'male' | 'female' | 'neutral'; // Optional: gender filter (legacy, for backwards compatibility)
  // Dashboard widget trigger for home screen
  widgetTrigger?: 'DEFAULT' | 'PERFORMANCE' | 'RUNNING';
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Represents a complete question with its answers
 */
export interface QuestionWithAnswers extends OnboardingQuestion {
  answers: OnboardingAnswer[];
}

/**
 * User's progress through the questionnaire
 */
export interface QuestionnaireProgress {
  currentQuestionId?: string;
  answers: Record<string, string>; // questionId -> answerId
  assignedLevel?: number;
  assignedLevelId?: string;
  assignedProgramId?: string;
  assignedResults?: AnswerResult[]; // NEW: Multiple program+level assignments
  masterProgramSubLevels?: Record<string, number>;
  isPart1Complete: boolean;
  isComplete: boolean;
}
