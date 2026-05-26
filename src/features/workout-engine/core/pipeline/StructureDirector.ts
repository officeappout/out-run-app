/**
 * StructureDirector — Declarative Session Topology Builder
 *
 * Responsible for a single, well-defined transformation:
 *
 *   WorkoutGenerationContext  →  WorkoutBlueprint
 *     (session strategy detected, slot topology declared, hints compiled)
 *
 * The Director answers exactly one question per call:
 *   "Given these domains and difficulty, what is the full session shape?"
 *
 * It does NOT touch exercises, pools, or scores.  It produces a typed blueprint
 * that downstream modules (PoolFactory, BudgetDistributor, ProtocolInjector)
 * consume independently.
 *
 * Strategy dispatch table:
 * ───────────────────────────────────────────────────────────────────
 * requiredDomains.length  │ push + pull present? │ Strategy
 * ───────────────────────────────────────────────────────────────────
 * 0 or undefined           │ —                    │ full_body (default)
 * 1                        │ —                    │ single_domain
 * 2                        │ yes                  │ antagonist_split
 * 2                        │ no                   │ single_domain (fallback)
 * ≥ 3                      │ —                    │ full_body
 * ───────────────────────────────────────────────────────────────────
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type {
  DifficultyLevel,
  WorkoutGenerationContext,
  ExercisePriority,
} from '../../logic/workout-generator.types';
import type {
  BlockToken,
  BudgetConstraints,
  ProtocolHints,
  SessionStrategy,
  WorkoutBlueprint,
} from './pipeline.types';

// ============================================================================
// HORIZONTAL BALANCE MOVEMENT GROUPS
// Used by PoolFactory to know which slots need progressive-radius candidate
// search (findLevelAppropriateSubstitute) instead of plain score-ranking.
// ============================================================================

const HORIZONTAL_BALANCE_MG: Record<string, string> = {
  pull:       'horizontal_pull',
  push:       'horizontal_push',
  // legs / core have no horizontal complement — no entry
};

// ============================================================================
// STRUCTURE DIRECTOR
// ============================================================================

export class StructureDirector {
  /**
   * Primary entry point.  Call once per generation slot (trio option) to get
   * a clean, isolated blueprint.
   */
  plan(
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel,
  ): WorkoutBlueprint {
    const domains: string[] = context.requiredDomains ?? [];
    const strategy = this._detectStrategy(domains);
    const blocks   = this._buildBlocks(strategy, domains, context);

    const mainBlockCount = blocks.filter(b => b.role === 'main').length;

    const protocolHints    = this._buildProtocolHints(context, difficulty, strategy);
    const budgetConstraints = this._buildBudgetConstraints(context, mainBlockCount, strategy);

    return { strategy, blocks, protocolHints, budgetConstraints };
  }

  // ── Strategy detection ─────────────────────────────────────────────────────

  /**
   * Classifies the session topology from the domain list.
   * This is the AUTHORITATIVE strategy gate — replaces all hardcoded
   * `requiredDomains.length >= 3` conditions scattered in WorkoutGenerator.ts.
   */
  _detectStrategy(domains: string[]): SessionStrategy {
    if (domains.length === 0 || domains.length >= 3) return 'full_body';
    if (domains.length === 1) return 'single_domain';

    // Exactly 2 domains
    const hasPush = domains.includes('push');
    const hasPull = domains.includes('pull');
    if (hasPush && hasPull) return 'antagonist_split';

    // 2-domain combo that isn't push+pull (e.g. legs+core) — treat as single-focus
    return 'single_domain';
  }

  // ── Block topology builders ────────────────────────────────────────────────

  private _buildBlocks(
    strategy: SessionStrategy,
    domains: string[],
    context: WorkoutGenerationContext,
  ): BlockToken[] {
    switch (strategy) {
      case 'full_body':      return this._fullBodyBlocks(domains, context);
      case 'single_domain':  return this._singleDomainBlocks(domains, context);
      case 'antagonist_split': return this._antagonistSplitBlocks();
    }
  }

  /**
   * FullBodyStrategy — push + pull + legs [+ core]
   *
   * Declares the canonical full-body slot topology:
   *   • 1 vertical_pull foundation slot  (pull-ups / muscle-up)
   *   • 1 horizontal_pull balance slot   (rows)
   *   • 1 vertical_push foundation slot  (dips / HSPU)
   *   • 1 horizontal_push balance slot   (push-up variation)
   *   • 1 primary legs slot              (squat / hinge)
   *   • 1 secondary legs slot (accessory)
   *   • 1 core accessory slot            (if core is in domains)
   *
   * This directly encodes the guarantees previously scattered as:
   *   HorizontalGuarantee   (Step 5d, guarded by length >= 3)
   *   FullBodyDomainGuarantee (Step 5e, guarded by length >= 3)
   *   LegsCap               (Step 5e-bis, isFullBodySession = length >= 3)
   */
  private _fullBodyBlocks(domains: string[], _context: WorkoutGenerationContext): BlockToken[] {
    const blocks: BlockToken[] = [];
    let idx = 0;

    const activePush = domains.length === 0 || domains.includes('push');
    const activePull = domains.length === 0 || domains.includes('pull');
    const activeLegs = domains.length === 0 || domains.includes('legs');
    const activeCore = domains.includes('core');

    if (activePull) {
      blocks.push({
        id: `main_${idx++}_vertical_pull`,
        role: 'main',
        domain: 'pull',
        movementGroup: 'vertical_pull',
        requiredPriority: 'foundation' as ExercisePriority,
      });
      blocks.push({
        id: `main_${idx++}_horizontal_pull`,
        role: 'main',
        domain: 'pull',
        movementGroup: 'horizontal_pull',
        isHorizontalBalance: true,
      });
    }

    if (activePush) {
      blocks.push({
        id: `main_${idx++}_vertical_push`,
        role: 'main',
        domain: 'push',
        movementGroup: 'vertical_push',
        requiredPriority: 'foundation' as ExercisePriority,
      });
      blocks.push({
        id: `main_${idx++}_horizontal_push`,
        role: 'main',
        domain: 'push',
        movementGroup: 'horizontal_push',
        isHorizontalBalance: true,
      });
    }

    if (activeLegs) {
      // Primary leg compound (squat pattern)
      blocks.push({
        id: `main_${idx++}_legs_squat`,
        role: 'main',
        domain: 'legs',
        movementGroup: 'squat',
      });
      // Secondary leg slot (hinge / lunge — accessory tier to enforce LegsCap ≤ 2)
      blocks.push({
        id: `main_${idx++}_legs_hinge`,
        role: 'main',
        domain: 'legs',
        movementGroup: 'hinge',
        isAccessorySlot: true,
      });
    }

    if (activeCore) {
      blocks.push({
        id: `main_${idx++}_core`,
        role: 'main',
        domain: 'core',
        isAccessorySlot: true,
      });
    }

    return blocks;
  }

  /**
   * SingleDomainStrategy — exactly 1 domain (Pull-only, Push-only, Legs-only)
   *
   * Auto-injects exactly 1 functional horizontal balance complement slot so the
   * session maintains biomechanical balance despite the narrow domain focus:
   *   Pull-only → adds 1 horizontal_pull (row) block
   *   Push-only → adds 1 horizontal_push block
   *   Legs-only → squat + hinge + lunge topology (no horizontal complement)
   *
   * The horizontal balance slot uses `isHorizontalBalance: true` so PoolFactory
   * (Phase 5) knows to use findLevelAppropriateSubstitute (progressive ±2→±4→±6
   * radius search) rather than plain score-ranking.
   */
  private _singleDomainBlocks(domains: string[], _context: WorkoutGenerationContext): BlockToken[] {
    const domain = domains[0] ?? 'pull';
    const blocks: BlockToken[] = [];
    let idx = 0;

    if (domain === 'pull') {
      // Foundation slot — must be a vertical pull compound (pull-up / muscle-up)
      blocks.push({
        id: `main_${idx++}_vertical_pull_foundation`,
        role: 'main',
        domain: 'pull',
        movementGroup: 'vertical_pull',
        requiredPriority: 'foundation' as ExercisePriority,
      });
      // Second vertical pull slot — compound/skill variants
      blocks.push({
        id: `main_${idx++}_vertical_pull_2`,
        role: 'main',
        domain: 'pull',
        movementGroup: 'vertical_pull',
      });
      // Horizontal balance complement (rows) — biomechanical balance injection
      blocks.push({
        id: `main_${idx++}_horizontal_pull_balance`,
        role: 'main',
        domain: 'pull',
        movementGroup: HORIZONTAL_BALANCE_MG['pull'],
        isHorizontalBalance: true,
      });
      // Accessory isolation slot
      blocks.push({
        id: `main_${idx++}_pull_accessory`,
        role: 'main',
        domain: 'pull',
        isAccessorySlot: true,
      });
    } else if (domain === 'push') {
      blocks.push({
        id: `main_${idx++}_vertical_push_foundation`,
        role: 'main',
        domain: 'push',
        movementGroup: 'vertical_push',
        requiredPriority: 'foundation' as ExercisePriority,
      });
      blocks.push({
        id: `main_${idx++}_vertical_push_2`,
        role: 'main',
        domain: 'push',
        movementGroup: 'vertical_push',
      });
      // Horizontal balance complement (push-up row variations)
      blocks.push({
        id: `main_${idx++}_horizontal_push_balance`,
        role: 'main',
        domain: 'push',
        movementGroup: HORIZONTAL_BALANCE_MG['push'],
        isHorizontalBalance: true,
      });
      blocks.push({
        id: `main_${idx++}_push_accessory`,
        role: 'main',
        domain: 'push',
        isAccessorySlot: true,
      });
    } else if (domain === 'legs') {
      // Legs gets a 3-pattern topology: squat + hinge + lunge
      blocks.push({ id: `main_${idx++}_squat`, role: 'main', domain: 'legs', movementGroup: 'squat' });
      blocks.push({ id: `main_${idx++}_hinge`,  role: 'main', domain: 'legs', movementGroup: 'hinge' });
      blocks.push({ id: `main_${idx++}_lunge`,  role: 'main', domain: 'legs', movementGroup: 'lunge' });
      blocks.push({ id: `main_${idx++}_legs_accessory`, role: 'main', domain: 'legs', isAccessorySlot: true });
    } else {
      // Generic single-domain fallback (e.g. core-only)
      blocks.push({ id: `main_${idx++}_${domain}_primary`,   role: 'main', domain });
      blocks.push({ id: `main_${idx++}_${domain}_secondary`, role: 'main', domain });
      blocks.push({ id: `main_${idx++}_${domain}_accessory`, role: 'main', domain, isAccessorySlot: true });
    }

    return blocks;
  }

  /**
   * AntagonistSplitStrategy — push + pull only, NO legs
   *
   * Declares interleaved push+pull compound pairs to prime the antagonist
   * superset processor.  Slot order is intentional — PoolFactory will respect
   * the pair ordering when building candidates:
   *
   *   Pair 1: vertical_pull  ↔ vertical_push  (vertical plane compound)
   *   Pair 2: horizontal_pull ↔ horizontal_push (horizontal plane, balance)
   *   Pair 3: pull accessory  ↔ push accessory  (isolation / skill finish)
   */
  private _antagonistSplitBlocks(): BlockToken[] {
    return [
      // Pair 1 — Vertical compounds
      {
        id: 'main_0_vertical_pull',
        role: 'main',
        domain: 'pull',
        movementGroup: 'vertical_pull',
        requiredPriority: 'foundation' as ExercisePriority,
      },
      {
        id: 'main_1_vertical_push',
        role: 'main',
        domain: 'push',
        movementGroup: 'vertical_push',
        requiredPriority: 'foundation' as ExercisePriority,
      },
      // Pair 2 — Horizontal balance
      {
        id: 'main_2_horizontal_pull',
        role: 'main',
        domain: 'pull',
        movementGroup: 'horizontal_pull',
        isHorizontalBalance: true,
      },
      {
        id: 'main_3_horizontal_push',
        role: 'main',
        domain: 'push',
        movementGroup: 'horizontal_push',
        isHorizontalBalance: true,
      },
      // Pair 3 — Accessory
      {
        id: 'main_4_pull_accessory',
        role: 'main',
        domain: 'pull',
        isAccessorySlot: true,
      },
      {
        id: 'main_5_push_accessory',
        role: 'main',
        domain: 'push',
        isAccessorySlot: true,
      },
    ];
  }

  // ── Protocol hints ─────────────────────────────────────────────────────────

  /**
   * Distills Firestore protocol config + native overrides into ProtocolHints.
   *
   * Native single-domain D3 override:
   *   When difficulty === 3 AND strategy === 'single_domain', raise the pyramid
   *   probability floor to 0.6 so peak sessions reliably trigger a pyramid even
   *   when Firestore probability is low or not set.
   *   ProtocolInjector reads `forcePyramidOnSingleDomainIntense` to apply this.
   */
  private _buildProtocolHints(
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel,
    strategy: SessionStrategy,
  ): ProtocolHints {
    const forcePyramidOnSingleDomainIntense =
      strategy === 'single_domain' && difficulty === 3;

    return {
      preferredProtocols: context.preferredProtocols
        ? [...context.preferredProtocols]
        : undefined,
      protocolProbability:    context.protocolProbability,
      forcePyramidOnSingleDomainIntense,
      tempoModifiers: [],
    };
  }

  // ── Budget constraints ─────────────────────────────────────────────────────

  private _buildBudgetConstraints(
    context: WorkoutGenerationContext,
    mainBlockCount: number,
    strategy: SessionStrategy,
  ): BudgetConstraints {
    const isSingleDomain = strategy === 'single_domain';

    return {
      dailySetBudget:         context.dailySetBudget,
      maxSets:                context.maxSets,
      remainingWeeklyBudget:  context.remainingWeeklyBudget,
      isSingleDomain,
      exerciseSlotCount:      mainBlockCount,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Returns a fresh StructureDirector instance.
 * Stateless factory pattern — each call produces an isolated instance so
 * concurrent trio-option generation cannot share any mutable state.
 */
export function createStructureDirector(): StructureDirector {
  return new StructureDirector();
}
