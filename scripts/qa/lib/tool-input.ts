/**
 * Validates a tool call's input before the runner acts on it (the model's JSON is not trusted:
 * no strict schemas on this loop). Pure; a bad call becomes an is_error tool_result.
 */
import { isCategory, isSeverity, type FindingCategory, type Severity } from './findings';
import { RULE_IDS } from './checklist';
import { HARD_CAPS } from './config';

export type ToolCall =
  | { name: 'observe' }
  | { name: 'tap'; ref?: string; x?: number; y?: number }
  | { name: 'long_press'; ref?: string; x?: number; y?: number; ms: number }
  | { name: 'type'; ref: string; text: string; submit: boolean }
  | { name: 'scroll'; direction: 'up' | 'down'; amount: number; x?: number; y?: number }
  | { name: 'drag'; from_x: number; from_y: number; to_x: number; to_y: number }
  | { name: 'back' }
  | { name: 'background_app'; seconds: number }
  | { name: 'gps'; action: 'start' | 'lose_signal' | 'poor_accuracy'; seconds: number }
  | { name: 'network'; mode: 'online' | 'offline' }
  | { name: 'wait'; seconds: number }
  | {
      name: 'report_finding';
      category: FindingCategory;
      severity: Severity;
      rule: string | null;
      title: string;
      element: string;
      expected: string;
      actual: string;
      confidence: number;
    }
  | { name: 'end_mission'; outcome: 'success' | 'blocked' | 'gave_up'; summary: string };

export type Parsed = { ok: true; call: ToolCall } | { ok: false; error: string };

const REF = /^e\d{1,4}$/;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

function target(i: Record<string, unknown>): { ref?: string; x?: number; y?: number } | null {
  if (typeof i.ref === 'string' && REF.test(i.ref)) return { ref: i.ref };
  if (num(i.x) && num(i.y)) return { x: clamp(i.x as number, 0, 2000), y: clamp(i.y as number, 0, 3000) };
  return null;
}

export function parseToolCall(name: string, input: unknown): Parsed {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const bad = (error: string): Parsed => ({ ok: false, error });
  switch (name) {
    case 'observe':
    case 'back':
      return { ok: true, call: { name } };
    case 'tap': {
      const t = target(i);
      return t ? { ok: true, call: { name, ...t } } : bad('tap needs a ref (eN) or x+y');
    }
    case 'long_press': {
      const t = target(i);
      return t ? { ok: true, call: { name, ...t, ms: clamp(num(i.ms) ? (i.ms as number) : 800, 500, 3000) } } : bad('long_press needs a ref or x+y');
    }
    case 'type':
      if (typeof i.ref !== 'string' || !REF.test(i.ref) || typeof i.text !== 'string') return bad('type needs ref and text');
      return { ok: true, call: { name, ref: i.ref, text: i.text.slice(0, 500), submit: i.submit === true } };
    case 'scroll': {
      if (i.direction !== 'up' && i.direction !== 'down') return bad('scroll direction is up|down');
      const amount = clamp(num(i.amount) ? (i.amount as number) : 500, 50, 3000);
      const at = num(i.x) && num(i.y) ? { x: i.x as number, y: i.y as number } : {};
      return { ok: true, call: { name, direction: i.direction, amount, ...at } };
    }
    case 'drag':
      if (![i.from_x, i.from_y, i.to_x, i.to_y].every(num)) return bad('drag needs from_x, from_y, to_x, to_y');
      return { ok: true, call: { name, from_x: i.from_x as number, from_y: i.from_y as number, to_x: i.to_x as number, to_y: i.to_y as number } };
    case 'background_app':
      return { ok: true, call: { name, seconds: clamp(num(i.seconds) ? (i.seconds as number) : 5, 2, 60) } };
    case 'gps':
      if (!['start', 'lose_signal', 'poor_accuracy'].includes(i.action as string)) return bad('gps action is start|lose_signal|poor_accuracy');
      return { ok: true, call: { name, action: i.action as 'start', seconds: clamp(num(i.seconds) ? (i.seconds as number) : 20, 1, 120) } };
    case 'network':
      if (i.mode !== 'online' && i.mode !== 'offline') return bad('network mode is online|offline');
      return { ok: true, call: { name, mode: i.mode } };
    case 'wait':
      return { ok: true, call: { name, seconds: clamp(num(i.seconds) ? (i.seconds as number) : 2, 0.5, HARD_CAPS.maxWaitSec) } };
    case 'report_finding': {
      if (!isCategory(i.category) || !isSeverity(i.severity)) return bad('report_finding needs a valid category and severity');
      if (typeof i.title !== 'string' || !i.title.trim()) return bad('report_finding needs a title');
      const rule = typeof i.rule === 'string' && RULE_IDS.has(i.rule) ? i.rule : null;
      const confidence = clamp(num(i.confidence) ? (i.confidence as number) : 0.5, 0, 1);
      return {
        ok: true,
        call: { name, category: i.category, severity: i.severity, rule, title: str(i.title, 140), element: str(i.element, 80), expected: str(i.expected, 400), actual: str(i.actual, 400), confidence },
      };
    }
    case 'end_mission':
      if (!['success', 'blocked', 'gave_up'].includes(i.outcome as string)) return bad('end_mission outcome is success|blocked|gave_up');
      return { ok: true, call: { name, outcome: i.outcome as 'success', summary: str(i.summary, 2000) } };
    default:
      return bad(`unknown tool ${name}`);
  }
}
