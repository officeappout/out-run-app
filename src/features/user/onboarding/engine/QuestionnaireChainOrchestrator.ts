/**
 * Questionnaire Chain Orchestrator
 *
 * Manages sequential questionnaire flows (e.g., Push Quiz → Pull Quiz → Legs Quiz).
 * Each sub-questionnaire runs inside its own DynamicOnboardingEngine instance.
 * Results from all sub-quizzes are aggregated into a unified master-level result.
 *
 * Usage:
 *   const orchestrator = new QuestionnaireChainOrchestrator();
 *   const firstEngine = await orchestrator.startChain(chainDefinition);
 *   // ... user completes first quiz ...
 *   const { hasNext, nextEngine } = await orchestrator.completeCurrentQuestionnaire(firstEngine);
 *   if (hasNext) { /* render nextEngine */ }
 *   else { const results = orchestrator.aggregateResults(); }
 */

import { DynamicOnboardingEngine, DynamicQuestionNode, WorkflowChainTrigger } from './DynamicOnboardingEngine';
import { AnswerResult } from '@/types/onboarding-questionnaire';

// ============================================================================
// TYPES
// ============================================================================

/** Definition of a single step in a questionnaire chain */
export interface ChainStep {
  /** Firestore questionnaire/part identifier (e.g., 'push_assessment') */
  questionnaireId: string;
  /** Optional: specific question to start from */
  startQuestionId?: string;
  /** Human-readable label (for progress display) */
  label?: string;
  /** Optional condition: only run this step if a previous answer matches */
  condition?: {
    /** Which step index's result to check */
    stepIndex: number;
    /** The programId that must be present in that step's results */
    requiredProgramId: string;
  };
}

/** Full chain definition — loaded from Firestore or defined statically */
export interface QuestionnaireChainDefinition {
  id: string;
  name: string;
  steps: ChainStep[];
}

/** Result of a single completed sub-questionnaire */
export interface ChainStepResult {
  questionnaireId: string;
  assignedResults: AnswerResult[];
  answers: Record<string, string>;
  completedAt: Date;
}

/** Aggregated result after the entire chain completes */
export interface ChainAggregatedResult {
  /** All assigned results from all steps (flattened) */
  allAssignedResults: AnswerResult[];
  /** Merged child-program levels across all steps */
  mergedChildLevels: Record<string, number>;
  /** All answers from all steps (namespaced by questionnaireId) */
  allAnswers: Record<string, string>;
  /** Number of steps completed */
  stepsCompleted: number;
  /** Total steps in the chain */
  totalSteps: number;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export class QuestionnaireChainOrchestrator {
  private chain: QuestionnaireChainDefinition | null = null;
  private currentStepIndex = 0;
  private stepResults: ChainStepResult[] = [];
  private language: 'he' | 'en' | 'ru' = 'he';
  private gender: 'male' | 'female' | 'neutral' = 'neutral';

  /**
   * Start a new questionnaire chain.
   * Returns the engine for the first step.
   */
  async startChain(
    chain: QuestionnaireChainDefinition,
    language?: 'he' | 'en' | 'ru',
    gender?: 'male' | 'female' | 'neutral',
  ): Promise<DynamicOnboardingEngine> {
    this.chain = chain;
    this.currentStepIndex = 0;
    this.stepResults = [];
    if (language) this.language = language;
    if (gender) this.gender = gender;

    return this.loadStepEngine(0);
  }

  /**
   * Handle a chain trigger from the engine.
   * Called when an answer has a `chainTrigger` instead of a `nextQuestionId`.
   */
  async handleChainTrigger(
    trigger: WorkflowChainTrigger,
    currentEngine: DynamicOnboardingEngine,
  ): Promise<{ engine: DynamicOnboardingEngine; stepLabel?: string }> {
    // Save current step results
    this.saveStepResults(currentEngine);

    // Dynamically add a new step to the chain
    if (this.chain) {
      const newStep: ChainStep = {
        questionnaireId: trigger.nextQuestionnaireId,
        startQuestionId: trigger.startQuestionId,
        label: trigger.nextQuestionnaireId.replace(/_/g, ' '),
      };

      // Insert after current step if not already in chain
      const existsAtIndex = this.chain.steps.findIndex(
        s => s.questionnaireId === trigger.nextQuestionnaireId,
      );
      if (existsAtIndex === -1) {
        this.chain.steps.splice(this.currentStepIndex + 1, 0, newStep);
      }
    }

    // Advance to next step
    this.currentStepIndex++;
    const engine = await this.loadStepEngine(this.currentStepIndex);
    const stepLabel = this.chain?.steps[this.currentStepIndex]?.label;
    return { engine, stepLabel };
  }

  /**
   * Complete the current sub-questionnaire and check for the next step.
   */
  async completeCurrentQuestionnaire(
    engine: DynamicOnboardingEngine,
  ): Promise<{
    hasNext: boolean;
    nextEngine?: DynamicOnboardingEngine;
    stepLabel?: string;
    aggregatedResult?: ChainAggregatedResult;
  }> {
    // Save results
    this.saveStepResults(engine);

    // Check for next step
    const nextIndex = this.findNextEligibleStep(this.currentStepIndex + 1);

    if (nextIndex !== null && this.chain) {
      this.currentStepIndex = nextIndex;
      const nextEngine = await this.loadStepEngine(nextIndex);
      return {
        hasNext: true,
        nextEngine,
        stepLabel: this.chain.steps[nextIndex]?.label,
      };
    }

    // Chain complete — aggregate all results
    return {
      hasNext: false,
      aggregatedResult: this.aggregateResults(),
    };
  }

  /**
   * Aggregate all step results into a unified result.
   */
  aggregateResults(): ChainAggregatedResult {
    const allAssignedResults: AnswerResult[] = [];
    const mergedChildLevels: Record<string, number> = {};
    const allAnswers: Record<string, string> = {};

    for (const step of this.stepResults) {
      // Collect all assigned results
      allAssignedResults.push(...step.assignedResults);

      // Merge child levels (higher level wins on conflict)
      for (const result of step.assignedResults) {
        if (result.masterProgramSubLevels) {
          for (const [childId, level] of Object.entries(result.masterProgramSubLevels)) {
            if (!mergedChildLevels[childId] || level > mergedChildLevels[childId]) {
              mergedChildLevels[childId] = level;
            }
          }
        }
      }

      // Namespace answers by questionnaireId to avoid collisions
      for (const [qId, aId] of Object.entries(step.answers)) {
        allAnswers[`${step.questionnaireId}__${qId}`] = aId;
      }
    }

    return {
      allAssignedResults,
      mergedChildLevels,
      allAnswers,
      stepsCompleted: this.stepResults.length,
      totalSteps: this.chain?.steps.length || 0,
    };
  }

  /**
   * Get current progress for UI display.
   */
  getChainProgress(): {
    currentStep: number;
    totalSteps: number;
    currentLabel?: string;
    completedLabels: string[];
  } {
    return {
      currentStep: this.currentStepIndex + 1,
      totalSteps: this.chain?.steps.length || 1,
      currentLabel: this.chain?.steps[this.currentStepIndex]?.label,
      completedLabels: this.stepResults.map(
        (_, i) => this.chain?.steps[i]?.label || `Step ${i + 1}`,
      ),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async loadStepEngine(stepIndex: number): Promise<DynamicOnboardingEngine> {
    if (!this.chain || stepIndex >= this.chain.steps.length) {
      throw new Error(`Chain step ${stepIndex} out of bounds`);
    }

    const step = this.chain.steps[stepIndex];
    const engine = new DynamicOnboardingEngine();
    await engine.initialize(
      'assessment',
      step.startQuestionId,
      this.language,
      this.gender,
    );
    return engine;
  }

  private saveStepResults(engine: DynamicOnboardingEngine): void {
    if (!this.chain) return;

    const step = this.chain.steps[this.currentStepIndex];
    const progress = engine.getProgress();

    this.stepResults.push({
      questionnaireId: step?.questionnaireId || 'unknown',
      assignedResults: (progress as any).assignedResults || [],
      answers: engine.getAllAnswers(),
      completedAt: new Date(),
    });
  }

  private findNextEligibleStep(fromIndex: number): number | null {
    if (!this.chain) return null;

    for (let i = fromIndex; i < this.chain.steps.length; i++) {
      const step = this.chain.steps[i];

      // Check condition
      if (step.condition) {
        const requiredResult = this.stepResults[step.condition.stepIndex];
        if (!requiredResult) continue;
        const hasProgramId = requiredResult.assignedResults.some(
          r => r.programId === step.condition!.requiredProgramId,
        );
        if (!hasProgramId) continue; // Skip this step
      }

      return i;
    }

    return null; // No more eligible steps
  }
}
