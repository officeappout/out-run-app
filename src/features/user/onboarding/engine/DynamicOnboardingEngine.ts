/**
 * Dynamic Onboarding Engine
 * Loads questions from Firestore and handles branching logic
 */
import { 
  getFirstQuestion, 
  getQuestionWithAnswers, 
  getQuestion 
} from '@/features/admin/services/questionnaire.service';
import { 
  OnboardingQuestion, 
  OnboardingAnswer, 
  QuestionnaireProgress 
} from '@/types/onboarding-questionnaire';

import { AnswerResult } from '@/types/onboarding-questionnaire';

export interface DynamicQuestionNode {
  id: string;
  title: string;
  description?: string;
  type: 'choice' | 'input';
  part: 'assessment' | 'personal';
  layoutType?: 'large-card' | 'horizontal-list';
  progressIcon?: string; // Icon name for progress bar display
  progressIconSvg?: string; // Custom SVG icon content (overrides progressIcon)
  answers: Array<{
    id: string;
    text: string;
    imageUrl?: string; // Optional image URL for the answer
    nextQuestionId?: string | null;
    assignedLevel?: number;
    assignedLevelId?: string | null;
    assignedProgramId?: string | null;
    assignedResults?: AnswerResult[]; // NEW: Multiple program+level assignments
    masterProgramSubLevels?: {
      upper_body_level?: number;
      lower_body_level?: number;
      core_level?: number;
    };
  }>;
}

export class DynamicOnboardingEngine {
  private progress: QuestionnaireProgress;
  private currentQuestion: DynamicQuestionNode | null = null;
  private loadedQuestions: Map<string, DynamicQuestionNode> = new Map();
  private language: 'he' | 'en' | 'ru' = 'he';
  private gender: 'male' | 'female' | 'neutral' = 'neutral';

  constructor() {
    this.progress = {
      answers: {},
      isPart1Complete: false,
      isComplete: false,
    };
  }

  /**
   * Initialize engine - load first question or specific question by ID
   */
  async initialize(
    part: 'assessment' | 'personal' = 'assessment', 
    startQuestionId?: string,
    language?: 'he' | 'en' | 'ru',
    gender?: 'male' | 'female' | 'neutral'
  ): Promise<void> {
    // Store language and gender for subsequent question loads
    if (language) this.language = language;
    if (gender) this.gender = gender;
    
    let questionToLoad;
    
    if (startQuestionId) {
      // Load specific question by ID
      questionToLoad = await getQuestion(startQuestionId);
      if (!questionToLoad) {
        throw new Error(`Question ${startQuestionId} not found`);
      }
    } else {
      // Load first question for the part with language/gender filters
      questionToLoad = await getFirstQuestion(part, this.language, this.gender);
      if (!questionToLoad) {
        throw new Error(`No first question found for part: ${part}`);
      }
    }

    await this.loadQuestion(questionToLoad.id);
    this.progress.currentQuestionId = questionToLoad.id;
  }

  /**
   * Load a question with its answers from Firestore
   */
  private async loadQuestion(questionId: string): Promise<DynamicQuestionNode> {
    // Check cache (but note: cache doesn't account for language/gender, so we may need to reload)
    // For now, always reload to ensure correct language/gender
    // TODO: Implement proper cache key with language/gender

    const questionData = await getQuestionWithAnswers(questionId, this.language, this.gender);
    if (!questionData) {
      throw new Error(`Question ${questionId} not found`);
    }

    // 🔍 Debug: Inspect raw question from Firestore
    console.log('DynamicOnboardingEngine :: Loaded question from Firestore:', {
      id: questionData.id,
      type: (questionData as any).type,
      layoutType: (questionData as any).layoutType,
    });

    // ✅ Normalize layoutType coming from Admin / Firestore (support Hebrew labels if they slipped in)
    const rawLayoutType = (questionData as any).layoutType;
    let normalizedLayoutType: 'large-card' | 'horizontal-list' = 'large-card';
    if (rawLayoutType === 'horizontal-list' || rawLayoutType === 'רשימה אופקית') {
      normalizedLayoutType = 'horizontal-list';
    } else if (rawLayoutType === 'large-card' || rawLayoutType === 'כרטיס גדול') {
      normalizedLayoutType = 'large-card';
    }

    const node: DynamicQuestionNode = {
      id: questionData.id,
      title: questionData.title,
      description: questionData.description,
      type: questionData.type,
      part: questionData.part,
      layoutType: normalizedLayoutType,
      progressIcon: questionData.progressIcon,
      progressIconSvg: questionData.progressIconSvg,
      answers: questionData.answers.map(a => ({
        id: a.id,
        text: a.text,
        imageUrl: (a as any).imageUrl,
        nextQuestionId: a.nextQuestionId || undefined,
        assignedLevel: a.assignedLevel,
        assignedLevelId: a.assignedLevelId || undefined,
        assignedProgramId: a.assignedProgramId || undefined,
        assignedResults: (a as any).assignedResults || undefined, // NEW: Multiple results
        masterProgramSubLevels: (a as any).masterProgramSubLevels || undefined,
      })),
    };

    this.loadedQuestions.set(questionId, node);
    this.currentQuestion = node;
    return node;
  }

  /**
   * Get current question
   */
  getCurrentQuestion(): DynamicQuestionNode | null {
    return this.currentQuestion;
  }

  /**
   * Answer current question and move to next
   */
  async answer(answerId: string): Promise<{
    nextQuestion: DynamicQuestionNode | null;
    isPart1Complete: boolean;
    isComplete: boolean;
    assignedLevel?: number;
    assignedLevelId?: string;
    assignedProgramId?: string;
    assignedResults?: AnswerResult[]; // NEW: Multiple results
    masterProgramSubLevels?: {
      upper_body_level?: number;
      lower_body_level?: number;
      core_level?: number;
    };
  }> {
    if (!this.currentQuestion) {
      throw new Error('No current question');
    }

    const answer = this.currentQuestion.answers.find(a => a.id === answerId);
    if (!answer) {
      throw new Error(`Answer ${answerId} not found`);
    }

    // Save answer
    this.progress.answers[this.currentQuestion.id] = answerId;

    // Check if this answer terminates Part 1 (has assignedResults, assignedLevelId, or assignedLevel)
    const hasAssignedResults = answer.assignedResults && answer.assignedResults.length > 0;
    if (hasAssignedResults || answer.assignedLevelId || answer.assignedLevel) {
      // Use assignedResults if available, otherwise fall back to legacy single assignment
      if (hasAssignedResults) {
        // Store first result as primary (for backwards compatibility)
        const firstResult = answer.assignedResults[0];
        this.progress.assignedLevelId = firstResult.levelId;
        this.progress.assignedProgramId = firstResult.programId;
        if (firstResult.masterProgramSubLevels) {
          this.progress.masterProgramSubLevels = firstResult.masterProgramSubLevels;
        }
        // Store all results in progress (we'll need to extend QuestionnaireProgress type)
        (this.progress as any).assignedResults = answer.assignedResults;
      } else {
        // Legacy: single assignment
        this.progress.assignedLevel = answer.assignedLevel;
        this.progress.assignedLevelId = answer.assignedLevelId || undefined;
        this.progress.assignedProgramId = answer.assignedProgramId || undefined;
        if (answer.masterProgramSubLevels) {
          this.progress.masterProgramSubLevels = answer.masterProgramSubLevels;
        }
      }
      
      this.progress.isPart1Complete = true;
      this.currentQuestion = null;
      this.progress.currentQuestionId = undefined;

      return {
        nextQuestion: null,
        isPart1Complete: true,
        isComplete: false, // Part 2 still needs to run
        assignedLevel: answer.assignedLevel,
        assignedLevelId: answer.assignedLevelId || undefined,
        assignedProgramId: answer.assignedProgramId || undefined,
        assignedResults: answer.assignedResults || undefined, // NEW: Return all results
        masterProgramSubLevels: answer.masterProgramSubLevels || undefined,
      };
    }

    // Move to next question
    if (answer.nextQuestionId) {
      const nextQuestion = await this.loadQuestion(answer.nextQuestionId);
      this.progress.currentQuestionId = nextQuestion.id;

      return {
        nextQuestion,
        isPart1Complete: false,
        isComplete: false,
      };
    }

    // No next question - Part 1 complete without level assignment (shouldn't happen)
    this.progress.isPart1Complete = true;
    this.currentQuestion = null;
    this.progress.currentQuestionId = undefined;

    return {
      nextQuestion: null,
      isPart1Complete: true,
      isComplete: false,
    };
  }

  /**
   * Get current progress
   */
  getProgress(): QuestionnaireProgress {
    return { ...this.progress };
  }

  /**
   * Get all answers (for profile creation)
   */
  getAllAnswers(): Record<string, string> {
    return { ...this.progress.answers };
  }

  /**
   * Get assigned level and program
   */
  getAssignedValues(): {
    level?: number;
    levelId?: string;
    programId?: string;
    masterProgramSubLevels?: {
      upper_body_level?: number;
      lower_body_level?: number;
      core_level?: number;
    };
  } {
    return {
      level: this.progress.assignedLevel,
      levelId: this.progress.assignedLevelId,
      programId: this.progress.assignedProgramId,
      masterProgramSubLevels: this.progress.masterProgramSubLevels,
    };
  }

  /**
   * Mark Part 2 as complete
   */
  completePart2(): void {
    this.progress.isComplete = true;
  }

  /**
   * Go back to previous question (if possible)
   */
  async goBack(): Promise<DynamicQuestionNode | null> {
    // For now, we don't track previous questions in a stack
    // This can be enhanced later
    return this.currentQuestion;
  }

  /**
   * Reset engine
   */
  reset(): void {
    this.progress = {
      answers: {},
      isPart1Complete: false,
      isComplete: false,
    };
    this.currentQuestion = null;
    this.loadedQuestions.clear();
  }
}
