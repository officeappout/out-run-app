/**
 * Agents panel registry — the ONE list of agents the panel knows about.
 * Adding an agent = one entry here (plus its Cloud Function writing to
 * agents/{id}). The panel and the server routes both read this list: the
 * routes reject any agentId that isn't registered here.
 *
 * Each agent carries a persona (displayName / monogram / role / accent) used
 * by the agents network view. FUTURE_AGENTS are display-only "coming soon"
 * placeholders — deliberately NOT in AGENT_REGISTRY, so the routes never
 * accept their ids.
 *
 * Pure data (no React, no Firebase) so it is importable from both the
 * client panel and the server routes.
 */

export interface AgentPersona {
  /** Hebrew persona name, e.g. "רוני". */
  displayName: string;
  /** Single letter shown in the node (no emoji — monograms only). */
  monogram: string;
  /** Short role line under the name. */
  role: string;
  /** Hex accent for the node ring. */
  accent: string;
}

export interface AgentDefinition extends AgentPersona {
  /** Firestore doc id under agents/ — must match the routes' ID_PATTERN. */
  id: string;
  description: string;
}

export const AGENT_REGISTRY: readonly AgentDefinition[] = [
  {
    id: 'oncall',
    displayName: 'רוני',
    monogram: 'ר',
    role: 'תורן הקריסות (On-call)',
    accent: '#00baf7',
    description: 'סורק את Sentry כל שעה: issues חדשים / מזנקים / חוזרים, מוצלבים מול הדיפלוי וה-PR האחרונים. report-only.',
  },
] as const;

/** Display-only placeholders for agents that don't exist yet. */
export const FUTURE_AGENTS: readonly (AgentPersona & { key: string })[] = [
  { key: 'security', displayName: 'שומר', monogram: 'ש', role: 'אבטחה', accent: '#00baf7' },
] as const;

export function isRegisteredAgent(agentId: string): boolean {
  return AGENT_REGISTRY.some((a) => a.id === agentId);
}

/** "רוני — תורן הקריסות (On-call)" */
export function agentLabel(def: AgentPersona): string {
  return `${def.displayName} — ${def.role}`;
}
