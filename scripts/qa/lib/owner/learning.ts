/**
 * What the testers learn from the owner's triage (pure). A finding marked "לא רלוונטי" in
 * /admin/demo becomes a dismissal row (rule + screen + optional reason). Grouped here:
 *   - the same rule dismissed ≥ SUPPRESS_AFTER times on the same screen → SUPPRESSED there:
 *     the prompt tells the tester not to report it, and the runner drops such findings
 *     (lint included) before they are written;
 *   - dismissed once → a CLARIFICATION: the prompt quotes the owner's reason so the tester
 *     judges that rule on that screen the owner's way (reported only if clearly different).
 * "טופל" never creates a row, so a handled finding keeps its rule active.
 */
import { groupDismissals, type Dismissal, type DismissalGroup } from '@/lib/demo-control/owner-rules-model';

export interface Learning {
  suppressed: DismissalGroup[];
  clarifications: DismissalGroup[];
}

export const MAX_SUPPRESSED_IN_PROMPT = 30;
export const MAX_CLARIFICATIONS_IN_PROMPT = 20;

export function buildLearning(dismissals: readonly Dismissal[]): Learning {
  const groups = groupDismissals(dismissals);
  return { suppressed: groups.filter((g) => g.suppressed), clarifications: groups.filter((g) => !g.suppressed) };
}

export const EMPTY_LEARNING: Learning = { suppressed: [], clarifications: [] };

/**
 * Whether a finding (rule on a screen key — the checkpoint id, else the route pattern) is
 * suppressed. A finding with both a screen id and a route matches either.
 */
export function isSuppressed(learning: Learning, rule: string | null, keys: ReadonlyArray<string | null>): boolean {
  if (!rule) return false;
  const ks = new Set(keys.filter((k): k is string => !!k));
  return learning.suppressed.some((g) => g.rule === rule && ks.has(g.screen));
}
