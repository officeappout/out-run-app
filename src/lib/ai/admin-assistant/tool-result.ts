/**
 * tool-result — how a tool's output is handed to the model (plan §2.6, §6.3). Pure.
 *   capToolResult(obj)      JSON ≤ ~800 tokens; long arrays cut first, then a hard cut,
 *                           always marked `truncated: true`
 *   wrapToolData(json)      <tool_data>…</tool_data> — data, never instructions
 *   numbersIn(obj)          every finite number in a value (for the evidence guard)
 */
import { ADMIN_AI_TOOL_RESULT_MAX_TOKENS } from './limits';

/** ~4 characters per token for JSON (Hebrew labels make it closer to 3 — we stay conservative). */
export const TOOL_RESULT_MAX_CHARS = ADMIN_AI_TOOL_RESULT_MAX_TOKENS * 3;

function shrinkArrays(v: unknown, max: number): unknown {
  if (Array.isArray(v)) return v.slice(0, max).map((x) => shrinkArrays(x, max));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shrinkArrays(x, max)]));
  return v;
}

export function capToolResult(obj: unknown): { json: string; truncated: boolean } {
  let json = JSON.stringify(obj);
  if (json.length <= TOOL_RESULT_MAX_CHARS) return { json, truncated: false };
  for (const max of [5, 3, 1]) {
    const shrunk = shrinkArrays(obj, max);
    json = JSON.stringify(shrunk && typeof shrunk === 'object' && !Array.isArray(shrunk) ? { ...(shrunk as object), truncated: true } : { value: shrunk, truncated: true });
    if (json.length <= TOOL_RESULT_MAX_CHARS) return { json, truncated: true };
  }
  return { json: JSON.stringify({ truncated: true, partial: json.slice(0, TOOL_RESULT_MAX_CHARS - 60) }), truncated: true };
}

export function wrapToolData(json: string): string {
  return `<tool_data>${json}</tool_data>`;
}

export function numbersIn(v: unknown, out: number[] = []): number[] {
  if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
}
