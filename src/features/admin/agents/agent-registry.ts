/**
 * Agents panel registry — the ONE list of agents the panel knows about.
 * Adding an agent = one entry here (plus its Cloud Function writing to
 * agents/{id}). The panel tabs and the server routes both read this list:
 * the routes reject any agentId that isn't registered here.
 *
 * Pure data (no React, no Firebase) so it is importable from both the
 * client panel and the server routes.
 */

export interface AgentDefinition {
  /** Firestore doc id under agents/ — must match AGENT_ID_PATTERN. */
  id: string;
  label: string;
  description: string;
}

export const AGENT_REGISTRY: readonly AgentDefinition[] = [
  {
    id: 'oncall',
    label: 'On-call — קריסות',
    description: 'סורק את Sentry כל שעה: issues חדשים / מזנקים / חוזרים, מוצלבים מול הדיפלוי וה-PR האחרונים. report-only.',
  },
] as const;

export function isRegisteredAgent(agentId: string): boolean {
  return AGENT_REGISTRY.some((a) => a.id === agentId);
}
