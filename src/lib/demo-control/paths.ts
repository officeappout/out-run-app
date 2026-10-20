/**
 * Demo control center — where its state lives (owner, 20.10.2026: start/stop the demo
 * world live from /admin/demo and see live cost). Pure constants, no Firebase import.
 *
 * Everything sits under demo_registry, which firestore.rules keeps server-only
 * (`allow read, write: if false`). The panel reads and writes it ONLY through the
 * super-admin API routes under /api/admin/demo/** (Admin SDK) — never the client SDK.
 *
 *   demo_registry/config                 caps + price table (written by the panel)
 *     { caps: DemoCaps, prices: PriceTable, updatedAt, updatedBy,
 *       life?: { model, maxLlmCallsPerDay, maxWorkoutsPerDay, maxMessagesPerDay, maxWritesPerDay } }
 *       ← the life engine's own knobs (demoSimulatorTick); the panel keeps them when it saves
 *   demo_registry/control                run / stop handshake with the tester runner
 *     { testersStopRequested, stopRequestedAt, stopRequestedBy,
 *       lastDispatch: { at, by, workflow, ok, error? },
 *       testers: { state: 'running' | 'idle', lastSessionAt, findingsCount, runId },  ← runner writes `testers`
 *       locks?: { [uid]: { until, by?, runId? } } }  ← a tester session locks a persona; the life engine skips it until `until`
 *   demo_registry/life                   the life engine's state (last tick, presence pings, answered chats, joins)
 *   demo_registry/life/feedback/{id}     park / app feedback moments of the life engine
 *   demo_registry/usage/days/{YYYY-MM-DD}  one doc per Israel day (written by the engines)
 *     { llmCalls, inputTokens, outputTokens, cachedTokens, model, usdEstimate,
 *       testerSessions, firestoreWritesEst, updatedAt,
 *       bySource?: { kelly | life | testers: { llmCalls, inputTokens, outputTokens,
 *                    cachedTokens, model, usdEstimate } } }
 *     Several writers share one day doc, so EVERY writer uses FieldValue.increment (never
 *     set) on the top-level totals AND on its own bySource.<source>.* counters, with
 *     set(..., { merge: true }). Totals are the truth for counts; each source is priced
 *     with its own model, and any top-level remainder not attributed to a source is
 *     priced with the top-level model (see usage-cost.ts dayUsd).
 *
 *   demo_registry/qa_summary             the AI tester overseer's latest summary (scripts/qa/overseer.ts)
 *     { runId, generatedAt, findings, bySeverity, clusters[] } — parsed by ./qa-summary.ts
 *   demo_registry/testers                the AI tester roster { uids } (scripts/qa/register-testers.ts);
 *                                        mintDemoTesterToken signs only uids listed here
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
export const DEMO_QA_SUMMARY_DOC = 'qa_summary';
export const DEMO_TESTERS_DOC = 'testers';

/** One bounded query covers today + the 30 days before it (= any month to date). */
export const USAGE_WINDOW_DAYS = 31;

/** Known usage writers (bySource keys). Unknown keys are still read and priced. */
export const USAGE_SOURCES = ['life', 'kelly', 'testers'] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

/** Workflows the panel may dispatch (.github/workflows/<name>). The tester workflow lands in a later PR. */
export const DISPATCHABLE_WORKFLOWS = ['qa-testers.yml'] as const;
export type DispatchableWorkflow = (typeof DISPATCHABLE_WORKFLOWS)[number];
export const DEFAULT_TESTER_WORKFLOW: DispatchableWorkflow = 'qa-testers.yml';

/** The live switches on the page (system_config/feature_flags keys). */
export const DEMO_SWITCH_KEYS = ['enable_demo_users', 'demo_life_llm', 'enable_ai_testers', 'demo_kelly'] as const;
export type DemoSwitchKey = (typeof DEMO_SWITCH_KEYS)[number];
