/**
 * tools — the admin assistant's FIXED tool list (plan §3.4, §4). Read-only, no "run a query".
 * Every input is zod-validated again on the server (execute.server.ts) even though the
 * definitions are `strict`; a name not in this list is never executed.
 *
 * Wave 3: navigation + the operations numbers. Wave 4 adds the product-analytics tools.
 * The list order is STABLE (it is part of the cached prompt prefix) — append, never reorder.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export interface AdminToolSpec {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  zod: z.ZodTypeAny;
  /** 'root' = only a root admin may run it (others get an error result, zero reads) */
  minRole: 'super' | 'root';
  /** returns numbers → feeds the evidence card and the guard */
  dataTool: boolean;
}

const empty = { type: 'object' as const, properties: {}, required: [] as string[], additionalProperties: false };

export const ADMIN_TOOLS: AdminToolSpec[] = [
  {
    name: 'find_admin_page',
    description:
      'Search the admin panel pages the caller may open (titles, sidebar sections, synonyms). Returns up to 5 pages with pageId and title. Use when the user asks where something is and you need the page id for navigate.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Hebrew words describing the page' } },
      required: ['query'],
      additionalProperties: false,
    },
    zod: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
    minRole: 'super',
    dataTool: false,
  },
  {
    name: 'navigate',
    description:
      'Make a clickable button to an admin page. pageId must come from find_admin_page. id is required only for pages whose title says "· פרטים"/"· עריכה" (one record), else null. The button is the ONLY way to give a link — never write URLs in text.',
    input_schema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        id: { type: ['string', 'null'], description: 'record id for a detail page, else null' },
      },
      required: ['pageId', 'id'],
      additionalProperties: false,
    },
    zod: z.object({ pageId: z.string().trim().min(1).max(200), id: z.string().trim().max(128).nullable() }).strict(),
    minRole: 'super',
    dataTool: false,
  },
  {
    name: 'get_attention_queue',
    description:
      'What needs attention now on the panel home: pending parks, maintenance reports open >7 days, invoices waiting, signup failures this week (root only). definitionId attention_queue.',
    input_schema: empty,
    zod: z.object({}).strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_pending_approvals',
    description:
      'Items waiting in the approval center: totals by type (parks, routes, climbs, user contributions, units, amenities) and the top 5 authorities by parks+routes waiting. definitionId pending_approvals.',
    input_schema: empty,
    zod: z.object({}).strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_crm_pipeline',
    description:
      'Authorities by CRM pipeline status (draft, lead, meeting, quote, follow_up, closing, active, upsell), in-pipeline total, urgent (follow_up+closing). Read only. definitionId crm_pipeline.',
    input_schema: empty,
    zod: z.object({}).strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_ai_costs',
    description:
      'Estimated AI spend: today, the admin assistant today, last 7 days by day, month to date, and the configured daily budgets. definitionId ai_cost.',
    input_schema: empty,
    zod: z.object({}).strict(),
    minRole: 'super',
    dataTool: true,
  },
];

const BY_NAME = new Map(ADMIN_TOOLS.map((t) => [t.name, t]));

export function adminToolSpec(name: string): AdminToolSpec | null {
  return BY_NAME.get(name) ?? null;
}

/** Tool definitions for the API call (strict schemas). */
export function adminToolDefinitions(specs: AdminToolSpec[] = ADMIN_TOOLS): Anthropic.Tool[] {
  return specs.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, strict: true }));
}

export type AdminToolValidation = { ok: true; spec: AdminToolSpec; input: unknown } | { ok: false; error: string };

export function validateAdminToolInput(name: string, input: unknown): AdminToolValidation {
  const spec = adminToolSpec(name);
  if (!spec) return { ok: false, error: `unknown tool ${name}` };
  const parsed = spec.zod.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: `invalid input (${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')})` };
  }
  return { ok: true, spec, input: parsed.data };
}
