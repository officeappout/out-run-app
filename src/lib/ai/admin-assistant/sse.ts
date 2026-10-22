/**
 * sse — the admin assistant's stream events (server route → drawer). Pure; shared by both sides.
 * The drawer makes a clickable link ONLY from a `link` event (built by navigate/find on the
 * server) — never from URLs inside the model's free text (plan §3.4).
 */
export interface QuickCardRow {
  label: string;
  value: string;
}

export interface QuickCard {
  metric: string;
  title: string;
  rows: QuickCardRow[];
  href: string | null;
  /** Israel date key the numbers are as of */
  asOf: string;
  caveats: string[];
  /** true when the numbers could not be computed (shown as "לא זמין", not 0) */
  unavailable?: boolean;
}

export interface EvidenceItem {
  tool: string;
  definitionId: string;
  period: { from: string | null; to: string; tz: string };
  n: number | null;
  belowThreshold: boolean;
  caveats: string[];
  /** every number in the tool result, for the "number not from a tool" guard */
  numbers: number[];
}

export type AdminAssistantEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; status: 'start' | 'done' | 'error' }
  | { type: 'link'; href: string; title: string; pageId: string }
  | { type: 'quick'; card: QuickCard }
  | { type: 'evidence'; items: EvidenceItem[] }
  | {
      type: 'done';
      route: 'router_nav' | 'router_quick' | 'out_of_scope' | 'model';
      auditId: string | null;
      costUsd: number;
      /** the evidence guard found a number that no tool returned this turn */
      unverified: boolean;
    }
  | { type: 'error'; code: string; message: string };

export function encodeSse(ev: AdminAssistantEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

/** Splits a buffer into complete `data:` events + the unfinished remainder. */
export function parseSseChunk(buffer: string): { events: AdminAssistantEvent[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: AdminAssistantEvent[] = [];
  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)) as AdminAssistantEvent);
    } catch {
      /* malformed event — skip */
    }
  }
  return { events, rest };
}
