/**
 * Demo control center — where its state lives (owner, 20.10.2026: start/stop the demo
 * world live from /admin/demo and see live cost). Pure constants, no Firebase import.
 *
 * Everything sits under demo_registry, which firestore.rules keeps server-only
 * (`allow read, write: if false`). The panel reads and writes it ONLY through the
 * super-admin API routes under /api/admin/demo/** (Admin SDK) — never the client SDK.
 *
 *   demo_registry/config                 caps + price table (written by the panel)
 *     { caps: DemoCaps, prices: PriceTable, updatedAt, updatedBy }
 *   demo_registry/control                run / stop handshake with the tester runner
 *     { testersStopRequested, stopRequestedAt, stopRequestedBy,
 *       lastDispatch: { at, by, workflow, ok, error? },
 *       testers: { state: 'running' | 'idle', lastSessionAt, findingsCount, runId } }  ← runner writes `testers`
 *   demo_registry/usage/days/{YYYY-MM-DD}  one doc per Israel day (written by the engines)
 *     { llmCalls, inputTokens, outputTokens, cachedTokens, model, usdEstimate,
 *       testerSessions, firestoreWritesEst, updatedAt }
 *
 * Usage docs are one level deeper than "demo_registry/usage/{day}" because a Firestore
 * document path needs an even number of segments (usage = doc, days = subcollection).
 * The purge script removes all of demo_registry recursively, usage included.
 */
export const DEMO_REGISTRY = 'demo_registry';
export const DEMO_CONFIG_DOC = 'config';
export const DEMO_CONTROL_DOC = 'control';
export const DEMO_USAGE_DOC = 'usage';
export const DEMO_USAGE_DAYS = 'days';

/** One bounded query covers today + the 30 days before it (= any month to date). */
export const USAGE_WINDOW_DAYS = 31;

/** Workflows the panel may dispatch (.github/workflows/<name>). The tester workflow lands in a later PR. */
export const DISPATCHABLE_WORKFLOWS = ['qa-testers.yml'] as const;
export type DispatchableWorkflow = (typeof DISPATCHABLE_WORKFLOWS)[number];
export const DEFAULT_TESTER_WORKFLOW: DispatchableWorkflow = 'qa-testers.yml';

/** The three live switches on the page (system_config/feature_flags keys). */
export const DEMO_SWITCH_KEYS = ['enable_demo_users', 'demo_life_llm', 'enable_ai_testers'] as const;
export type DemoSwitchKey = (typeof DEMO_SWITCH_KEYS)[number];
