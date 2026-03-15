/**
 * Dynamic Onboarding Engine
 * Loads questions from Firestore and handles branching logic.
 *
 * Supports:
 * - Static routing via `nextQuestionId` on each answer
 * - Conditional routing via `conditionalRoutes` — evaluated against all previous answers
 * - Assessment-aware visibility via `question.logic.visibility` conditions
 * - Rule-driven category skip / question injection via `AssessmentContext`
 * - Workflow chaining via `nextQuestionnaireId` — triggers the orchestrator to switch quiz
 */
import { 
  getFirstQuestion, 
  getQuestionWithAnswers, 
  getQuestion 
} from '@/features/admin/services/questionnaire.service';
import { 
  OnboardingQuestion, 
  QuestionnaireProgress,
  VisibilityCondition,
} from '@/types/onboarding-questionnaire';

import { AnswerResult } from '@/types/onboarding-questionnaire';
import type { AssessmentContext } from '@/features/user/onboarding/types/visual-assessment.types';

// ============================================================================
// CONDITIONAL ROUTING TYPES
// ============================================================================

/**
 * A single conditional route — evaluated top-to-bottom; first match wins.
 * If no route matches, falls back to the static `nextQuestionId`.
 */
export interface ConditionalRoute {
  /** The condition to evaluate against previous answers */
  condition: {
    /** Type of condition */
    type:
      | 'answer_equals'
      | 'answer_includes'
      | 'answer_count_gte'
      | 'assessment_level'
      | 'tier_equals';
    /** The questionId whose answer we check (or assessment field like 'push'). */
    questionId: string;
    /** The expected value (single string for equals, string for includes, number for count) */
    value: string | number;
    /** Operator for assessment_level conditions. Defaults to '==' if omitted. */
    operator?: '>' | '>=' | '<' | '<=' | '==' | '!=';
  };
  /** Where to route if the condition is true */
  targetQuestionId: string;
}

/**
 * Metadata that an answer can carry to signal the orchestrator to switch to a new questionnaire.
 */
export interface WorkflowChainTrigger {
  /** The ID of the next questionnaire to load */
  nextQuestionnaireId: string;
  /** Optional: which question to start from in the next questionnaire */
  startQuestionId?: string;
}

// ============================================================================
// QUESTION NODE
// ============================================================================

export interface DynamicQuestionNode {
  id: string;
  title: string;
  description?: string;
  type: 'choice' | 'input';
  part: 'assessment' | 'personal';
  layoutType?: 'large-card' | 'horizontal-list';
  progressIcon?: string;
  progressIconSvg?: string;
  /** Branching logic metadata (visibility conditions & category tag). */
  logic?: OnboardingQuestion['logic'];
  answers: Array<{
    id: string;
    text: string;
    imageUrl?: string;
    nextQuestionId?: string | null;
    conditionalRoutes?: ConditionalRoute[];
    chainTrigger?: WorkflowChainTrigger;
    assignedLevel?: number;
    assignedLevelId?: string | null;
    assignedProgramId?: string | null;
    assignedResults?: AnswerResult[];
    masterProgramSubLevels?: Record<string, number>;
    metadata?: Record<string, unknown>;
  }>;
}

// ============================================================================
// ENGINE
// ============================================================================

export class DynamicOnboardingEngine {
  private progress: QuestionnaireProgress;
  private currentQuestion: DynamicQuestionNode | null = null;
  private loadedQuestions: Map<string, DynamicQuestionNode> = new Map();
  private language: 'he' | 'en' | 'ru' = 'he';
  private gender: 'male' | 'female' | 'neutral' = 'neutral';

  /**
   * Visual-assessment context — populated via `setAssessmentContext()`.
   * Used by visibility conditions and rule-driven skip/inject logic.
   */
  private assessmentCtx: AssessmentContext | null = null;

  /** Question IDs injected by rules (shown in addition to normal flow). */
  private injectedQuestionIds: Set<string> = new Set();
  /** Category tags to skip (populated from rules or `assessmentCtx.skippedCategories`). */
  private skippedCategories: Set<string> = new Set();

  /** Maximum depth for auto-skipping invisible questions (prevents infinite loops). */
  private static readonly MAX_SKIP_DEPTH = 25;

  /** Prevents concurrent or duplicate initialize() calls. */
  private _initializing = false;
  private _initialized = false;

  constructor() {
    this.progress = {
      answers: {},
      isPart1Complete: false,
      isComplete: false,
    };
  }

  /** True once initialize() has resolved at least once. */
  get initialized(): boolean {
    return this._initialized;
  }

  // ══════════════════════════════════════════════════════════════════
  // ASSESSMENT CONTEXT
  // ══════════════════════════════════════════════════════════════════

  /**
   * Feed the engine with visual-assessment results so that question
   * visibility and conditional routes can reference assessment levels.
   *
   * Also processes rule-driven skip/inject overrides from the context.
   */
  setAssessmentContext(ctx: AssessmentContext): void {
    this.assessmentCtx = ctx;

    // Populate rule-driven overrides
    if (ctx.skippedCategories) {
      for (const cat of ctx.skippedCategories) this.skippedCategories.add(cat);
    }
    if (ctx.injectedQuestionIds) {
      for (const qId of ctx.injectedQuestionIds) this.injectedQuestionIds.add(qId);
    }

    console.log('[Engine] Assessment context set:', {
      levels: ctx.levels,
      average: ctx.average,
      tier: ctx.tier,
      skippedCategories: [...this.skippedCategories],
      injectedQuestionIds: [...this.injectedQuestionIds],
    });
  }

  /** Returns the current assessment context (if set). */
  getAssessmentContext(): AssessmentContext | null {
    return this.assessmentCtx;
  }

  // ══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════

  /**
   * Initialize engine — load first question or specific question by ID.
   * Call `setAssessmentContext()` *before* initialize if assessment data is available.
   *
   * Guarded: silently returns if already initialized or if another
   * initialize() call is in-flight (prevents Strict Mode race conditions).
   */
  async initialize(
    part: 'assessment' | 'personal' = 'assessment', 
    startQuestionId?: string,
    language?: 'he' | 'en' | 'ru',
    gender?: 'male' | 'female' | 'neutral'
  ): Promise<void> {
    if (this._initialized || this._initializing) {
      console.log('[Engine] initialize() skipped — already initialized or in-flight');
      return;
    }
    this._initializing = true;

    if (language) this.language = language;
    if (gender) this.gender = gender;
    
    let questionToLoad;
    
    if (startQuestionId) {
      questionToLoad = await getQuestion(startQuestionId);
      if (!questionToLoad) {
        throw new Error(`Question ${startQuestionId} not found`);
      }
    } else {
      questionToLoad = await getFirstQuestion(part, this.language, this.gender);
      if (!questionToLoad) {
        throw new Error(
          `No first question found for part: "${part}". ` +
          `Make sure a question in the Admin Panel has the "שאלה ראשונה" (Entry Point) checkbox ` +
          `checked and part="${part}". Language=${this.language}, gender=${this.gender}.`
        );
      }
    }

    const firstNode = await this.loadQuestion(questionToLoad.id);

    // If the first question is invisible, fast-forward to the next visible one.
    if (!this.isQuestionVisible(firstNode)) {
      console.log(`[Engine] First question "${firstNode.id}" hidden by logic — skipping`);
      const visible = await this.findNextVisibleQuestion(firstNode);
      if (visible) {
        this.currentQuestion = visible;
        this.progress.currentQuestionId = visible.id;
      } else {
        this.progress.isPart1Complete = true;
        this.currentQuestion = null;
      }
    } else {
      this.progress.currentQuestionId = questionToLoad.id;
    }

    this._initialized = true;
    this._initializing = false;
  }

  // ══════════════════════════════════════════════════════════════════
  // QUESTION LOADING
  // ══════════════════════════════════════════════════════════════════

  private async loadQuestion(questionId: string): Promise<DynamicQuestionNode> {
    const questionData = await getQuestionWithAnswers(questionId, this.language, this.gender);
    if (!questionData) {
      throw new Error(`Question ${questionId} not found`);
    }

    console.log('DynamicOnboardingEngine :: Loaded question from Firestore:', {
      id: questionData.id,
      type: (questionData as any).type,
      layoutType: (questionData as any).layoutType,
      logic: (questionData as any).logic,
    });

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
      logic: (questionData as any).logic || undefined,
      answers: questionData.answers.map(a => ({
        id: a.id,
        text: a.text,
        imageUrl: (a as any).imageUrl,
        nextQuestionId: a.nextQuestionId || undefined,
        conditionalRoutes: (a as any).conditionalRoutes || undefined,
        chainTrigger: (a as any).chainTrigger || undefined,
        assignedLevel: a.assignedLevel,
        assignedLevelId: a.assignedLevelId || undefined,
        assignedProgramId: a.assignedProgramId || undefined,
        assignedResults: (a as any).assignedResults || undefined,
        masterProgramSubLevels: (a as any).masterProgramSubLevels || undefined,
        metadata: (a as any).metadata || undefined,
      })),
    };

    this.loadedQuestions.set(questionId, node);
    this.currentQuestion = node;
    return node;
  }

  // ══════════════════════════════════════════════════════════════════
  // VISIBILITY EVALUATION
  // ══════════════════════════════════════════════════════════════════

  /**
   * Evaluate whether a question should be visible given the current
   * assessment context, previous answers, and rule-driven overrides.
   */
  isQuestionVisible(question: DynamicQuestionNode): boolean {
    // Rule-driven category skip
    if (question.logic?.category && this.skippedCategories.has(question.logic.category)) {
      console.log(`[Engine] Question "${question.id}" hidden: category "${question.logic.category}" skipped by rule`);
      return false;
    }

    // Logic visibility conditions (all must pass — AND)
    const conditions = question.logic?.visibility;
    if (!conditions || conditions.length === 0) return true;

    return conditions.every(cond => this.evaluateVisibilityCondition(cond));
  }

  /**
   * Evaluate a single VisibilityCondition against the engine's state.
   */
  private evaluateVisibilityCondition(cond: VisibilityCondition): boolean {
    const { type, field, operator, value } = cond;

    switch (type) {
      case 'assessment_level': {
        if (!this.assessmentCtx) return true; // No context → don't block
        const actual: number =
          field === 'average'
            ? this.assessmentCtx.average
            : this.assessmentCtx.levels[field] ?? 0;
        return this.compareValues(actual, operator, value);
      }
      case 'tier_equals': {
        if (!this.assessmentCtx) return true;
        const tierValue = this.assessmentCtx.tier;
        return this.compareValues(tierValue, operator, value);
      }
      case 'answer_equals': {
        const answerId = this.progress.answers[field];
        if (!answerId) return false;
        return this.compareValues(answerId, operator, value);
      }
      case 'answer_not_equals': {
        const answerId = this.progress.answers[field];
        if (!answerId) return true; // Not answered yet → not equal
        return answerId !== String(value);
      }
      default:
        return true;
    }
  }

  /** Generic comparison helper (works with numbers and strings). */
  private compareValues(
    actual: string | number,
    operator: string,
    expected: string | number,
  ): boolean {
    const numActual = typeof actual === 'number' ? actual : parseFloat(actual);
    const numExpected = typeof expected === 'number' ? expected : parseFloat(String(expected));
    const canCompareNumeric = !isNaN(numActual) && !isNaN(numExpected);

    switch (operator) {
      case '>':  return canCompareNumeric && numActual > numExpected;
      case '>=': return canCompareNumeric && numActual >= numExpected;
      case '<':  return canCompareNumeric && numActual < numExpected;
      case '<=': return canCompareNumeric && numActual <= numExpected;
      case '==': return String(actual) === String(expected);
      case '!=': return String(actual) !== String(expected);
      default:   return true;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // CONDITIONAL ROUTING
  // ══════════════════════════════════════════════════════════════════

  /**
   * Evaluate conditional routes against previous answers AND assessment data.
   * Returns the targetQuestionId of the first matching route, or null.
   */
  private evaluateConditionalRoutes(routes: ConditionalRoute[]): string | null {
    for (const route of routes) {
      const { type, questionId, value, operator } = route.condition;
      const previousAnswerId = this.progress.answers[questionId];

      switch (type) {
        case 'answer_equals':
          if (previousAnswerId === value) return route.targetQuestionId;
          break;
        case 'answer_includes':
          if (previousAnswerId && typeof value === 'string' && previousAnswerId.includes(value)) {
            return route.targetQuestionId;
          }
          break;
        case 'answer_count_gte':
          if (Object.keys(this.progress.answers).length >= (value as number)) {
            return route.targetQuestionId;
          }
          break;
        case 'assessment_level': {
          if (!this.assessmentCtx) break;
          const fieldVal =
            questionId === 'average'
              ? this.assessmentCtx.average
              : this.assessmentCtx.levels[questionId] ?? 0;
          if (this.compareValues(fieldVal, operator || '>', value)) {
            return route.targetQuestionId;
          }
          break;
        }
        case 'tier_equals': {
          if (this.assessmentCtx && this.assessmentCtx.tier === value) {
            return route.targetQuestionId;
          }
          break;
        }
      }
    }
    return null;
  }

  /**
   * Resolve the next question ID for an answer:
   * 1. Conditional routes (first match wins)
   * 2. Static nextQuestionId (fallback)
   */
  private resolveNextQuestionId(answer: DynamicQuestionNode['answers'][0]): string | null {
    if (answer.conditionalRoutes && answer.conditionalRoutes.length > 0) {
      const conditionalTarget = this.evaluateConditionalRoutes(answer.conditionalRoutes);
      if (conditionalTarget) {
        console.log(`[Engine] Conditional route matched → ${conditionalTarget}`);
        return conditionalTarget;
      }
    }
    return answer.nextQuestionId || null;
  }

  /**
   * Walk the question chain starting from `startNode` and return the first
   * question whose visibility conditions pass. Skips up to MAX_SKIP_DEPTH
   * invisible questions. Returns null if no visible question is found.
   */
  private async findNextVisibleQuestion(
    startNode: DynamicQuestionNode,
    depth: number = 0,
  ): Promise<DynamicQuestionNode | null> {
    if (depth >= DynamicOnboardingEngine.MAX_SKIP_DEPTH) {
      console.warn('[Engine] Max skip depth reached — stopping auto-skip');
      return null;
    }

    // Look at the first answer's routing to find the next candidate
    const firstAnswer = startNode.answers[0];
    if (!firstAnswer) return null;

    const nextId = this.resolveNextQuestionId(firstAnswer);
    if (!nextId) return null;

    const candidate = await this.loadQuestion(nextId);
    if (this.isQuestionVisible(candidate)) return candidate;

    console.log(`[Engine] Question "${candidate.id}" hidden — skipping (depth=${depth + 1})`);
    return this.findNextVisibleQuestion(candidate, depth + 1);
  }

  // ══════════════════════════════════════════════════════════════════
  // ANSWERING
  // ══════════════════════════════════════════════════════════════════

  getCurrentQuestion(): DynamicQuestionNode | null {
    return this.currentQuestion;
  }

  /**
   * Answer current question and move to the next *visible* question.
   * Invisible questions (hidden by logic or skipped categories) are auto-skipped.
   */
  async answer(answerId: string): Promise<{
    nextQuestion: DynamicQuestionNode | null;
    isPart1Complete: boolean;
    isComplete: boolean;
    assignedLevel?: number;
    assignedLevelId?: string;
    assignedProgramId?: string;
    assignedResults?: AnswerResult[];
    masterProgramSubLevels?: Record<string, number>;
    chainTrigger?: WorkflowChainTrigger;
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

    // Check if this answer terminates the flow (assignedResults / assignedLevelId)
    const hasAssignedResults = answer.assignedResults && answer.assignedResults.length > 0;
    if (hasAssignedResults || answer.assignedLevelId || answer.assignedLevel) {
      if (hasAssignedResults) {
        const firstResult = answer.assignedResults![0];
        this.progress.assignedLevelId = firstResult.levelId;
        this.progress.assignedProgramId = firstResult.programId;
        if (firstResult.masterProgramSubLevels) {
          this.progress.masterProgramSubLevels = firstResult.masterProgramSubLevels;
        }
        (this.progress as any).assignedResults = answer.assignedResults;
      } else {
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
        isComplete: false,
        assignedLevel: answer.assignedLevel,
        assignedLevelId: answer.assignedLevelId || undefined,
        assignedProgramId: answer.assignedProgramId || undefined,
        assignedResults: answer.assignedResults || undefined,
        masterProgramSubLevels: answer.masterProgramSubLevels || undefined,
      };
    }

    // Workflow chain trigger
    if (answer.chainTrigger) {
      return {
        nextQuestion: null,
        isPart1Complete: false,
        isComplete: false,
        chainTrigger: answer.chainTrigger,
      };
    }

    // ── Navigate to next visible question ──
    const resolvedNextId = this.resolveNextQuestionId(answer);

    // Check injected questions first: if there are injected questions
    // that haven't been answered yet, surface them before continuing the normal chain.
    const nextInjected = this.popNextInjectedQuestion();
    if (nextInjected) {
      const injectedNode = await this.loadQuestion(nextInjected);
      if (this.isQuestionVisible(injectedNode)) {
        this.progress.currentQuestionId = injectedNode.id;
        return { nextQuestion: injectedNode, isPart1Complete: false, isComplete: false };
      }
    }

    if (resolvedNextId) {
      const nextNode = await this.loadQuestion(resolvedNextId);

      // Auto-skip hidden questions
      if (!this.isQuestionVisible(nextNode)) {
        console.log(`[Engine] Question "${nextNode.id}" hidden — auto-skipping`);
        const visible = await this.findNextVisibleQuestion(nextNode);
        if (visible) {
          this.progress.currentQuestionId = visible.id;
          return { nextQuestion: visible, isPart1Complete: false, isComplete: false };
        }
        // No more visible questions
        this.progress.isPart1Complete = true;
        this.currentQuestion = null;
        this.progress.currentQuestionId = undefined;
        return { nextQuestion: null, isPart1Complete: true, isComplete: false };
      }

      this.progress.currentQuestionId = nextNode.id;
      return { nextQuestion: nextNode, isPart1Complete: false, isComplete: false };
    }

    // No next question
    this.progress.isPart1Complete = true;
    this.currentQuestion = null;
    this.progress.currentQuestionId = undefined;
    return { nextQuestion: null, isPart1Complete: true, isComplete: false };
  }

  // ══════════════════════════════════════════════════════════════════
  // FREE-FORM INPUT ANSWERING
  // ══════════════════════════════════════════════════════════════════

  /**
   * Answer a free-form input question (type: 'input') that has no
   * predefined answer objects. Saves the raw value and navigates
   * to the specified next question.
   */
  async answerInputQuestion(
    value: string,
    nextQuestionId: string,
  ): Promise<{
    nextQuestion: DynamicQuestionNode | null;
    isPart1Complete: boolean;
    isComplete: boolean;
  }> {
    if (!this.currentQuestion) {
      throw new Error('No current question');
    }

    this.progress.answers[this.currentQuestion.id] = value;

    if (nextQuestionId) {
      const nextNode = await this.loadQuestion(nextQuestionId);

      if (!this.isQuestionVisible(nextNode)) {
        const visible = await this.findNextVisibleQuestion(nextNode);
        if (visible) {
          this.progress.currentQuestionId = visible.id;
          return { nextQuestion: visible, isPart1Complete: false, isComplete: false };
        }
        this.progress.isPart1Complete = true;
        this.currentQuestion = null;
        this.progress.currentQuestionId = undefined;
        return { nextQuestion: null, isPart1Complete: true, isComplete: false };
      }

      this.progress.currentQuestionId = nextNode.id;
      return { nextQuestion: nextNode, isPart1Complete: false, isComplete: false };
    }

    this.progress.isPart1Complete = true;
    this.currentQuestion = null;
    this.progress.currentQuestionId = undefined;
    return { nextQuestion: null, isPart1Complete: true, isComplete: false };
  }

  // ══════════════════════════════════════════════════════════════════
  // INJECTED QUESTIONS QUEUE
  // ══════════════════════════════════════════════════════════════════

  /**
   * Pop the next un-answered injected question from the queue.
   * Returns null if all injected questions have been answered.
   */
  private popNextInjectedQuestion(): string | null {
    for (const qId of this.injectedQuestionIds) {
      if (!this.progress.answers[qId]) {
        this.injectedQuestionIds.delete(qId);
        return qId;
      }
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC ACCESSORS
  // ══════════════════════════════════════════════════════════════════

  getProgress(): QuestionnaireProgress {
    return { ...this.progress };
  }

  getAllAnswers(): Record<string, string> {
    return { ...this.progress.answers };
  }

  getAssignedValues(): {
    level?: number;
    levelId?: string;
    programId?: string;
    masterProgramSubLevels?: Record<string, number>;
  } {
    return {
      level: this.progress.assignedLevel,
      levelId: this.progress.assignedLevelId,
      programId: this.progress.assignedProgramId,
      masterProgramSubLevels: this.progress.masterProgramSubLevels,
    };
  }

  completePart2(): void {
    this.progress.isComplete = true;
  }

  async goBack(): Promise<DynamicQuestionNode | null> {
    return this.currentQuestion;
  }

  reset(): void {
    this.progress = {
      answers: {},
      isPart1Complete: false,
      isComplete: false,
    };
    this.currentQuestion = null;
    this.loadedQuestions.clear();
    this.assessmentCtx = null;
    this.injectedQuestionIds.clear();
    this.skippedCategories.clear();
    this._initialized = false;
    this._initializing = false;
  }
}
