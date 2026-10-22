/**
 * tools — the admin assistant's FIXED tool list (plan §3.4, §4). Read-only, no "run a query".
 * Every input is zod-validated again on the server (execute.server.ts) even though the
 * definitions are `strict`; a name not in this list is never executed.
 *
 * Wave 3: navigation + the operations numbers. Wave 4: the product-analytics batch 1 (the
 * existing /admin/journey computations — product-metrics.server.ts).
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
  // ── wave 4: product advisor, batch 1 (existing computations of /admin/journey) ──
  {
    name: 'get_north_star',
    description:
      'WAE (weekly active exercisers), workouts per active user, DAU, MAU, stickiness, and the last 30 days of daily actives in weekly buckets. Optional segment filters (null = all): cityAuthorityId (an authorities id from another tool), source/campaign (marketing attribution), sex, level, program (strength program slug, running, map_only), ageFrom/ageTo. definitionId wae.',
    input_schema: {
      type: 'object',
      properties: {
        cityAuthorityId: { type: ['string', 'null'] },
        source: { type: ['string', 'null'] },
        campaign: { type: ['string', 'null'] },
        sex: { type: ['string', 'null'], enum: ['male', 'female', 'other', null] },
        level: { type: ['string', 'null'], enum: ['beginner', 'intermediate', 'advanced', null] },
        program: { type: ['string', 'null'] },
        ageFrom: { type: ['integer', 'null'] },
        ageTo: { type: ['integer', 'null'] },
      },
      required: ['cityAuthorityId', 'source', 'campaign', 'sex', 'level', 'program', 'ageFrom', 'ageTo'],
      additionalProperties: false,
    },
    zod: z
      .object({
        cityAuthorityId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).nullable(),
        source: z.string().trim().max(80).nullable(),
        campaign: z.string().trim().max(120).nullable(),
        sex: z.enum(['male', 'female', 'other']).nullable(),
        level: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
        program: z.string().trim().max(80).nullable(),
        ageFrom: z.number().int().min(10).max(100).nullable(),
        ageTo: z.number().int().min(10).max(100).nullable(),
      })
      .strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_retention_cohorts',
    description:
      'Weekly signup cohorts (newest 8): size and % active on day 1/7/14/30; overall D7 retention; resurrected users. Cohorts under 50 users have no percentages. Not segmented. definitionId cohort_dN.',
    input_schema: empty,
    zod: z.object({}).strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_retention_drivers',
    description:
      'Which first-week behaviours go with staying (≥1 real workout on days 14-28): per behaviour, retained % with vs without and the lift. Correlation, not cause. definitionId retained_14_28.',
    input_schema: empty,
    zod: z.object({}).strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_onboarding_stall',
    description:
      'For users who signed up in the last N days (default 30, 7-90): where they are stuck in onboarding now (a snapshot by step, not a funnel), the road to the first workout within 7 days, location permission answers, and how many finished onboarding but never trained. definitionId onboarding_stall / first_workout_road.',
    input_schema: {
      type: 'object',
      properties: { days: { type: ['integer', 'null'], description: '7-90, null = 30' } },
      required: ['days'],
      additionalProperties: false,
    },
    zod: z.object({ days: z.number().int().min(7).max(90).nullable() }).strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_push_performance',
    description:
      'Push notifications by type × copy variant (top 10 by volume): sent, delivered %, opened %, acted %, average minutes to action; plus the push types that are NOT measured. Optional channel and last-N-days filter. definitionId push_delivered_opened_acted.',
    input_schema: {
      type: 'object',
      properties: {
        channel: {
          type: ['string', 'null'],
          enum: ['progression', 'retention', 'onboarding_dropoff', 'training_reminder', 'encouragement', 'social', 'chat', 'health_milestone', 'community', 'contribution_status', 'week_start', 'coach', null],
        },
        days: { type: ['integer', 'null'], description: '1-180, null = all time' },
      },
      required: ['channel', 'days'],
      additionalProperties: false,
    },
    zod: z
      .object({
        channel: z
          .enum(['progression', 'retention', 'onboarding_dropoff', 'training_reminder', 'encouragement', 'social', 'chat', 'health_milestone', 'community', 'contribution_status', 'week_start', 'coach'])
          .nullable(),
        days: z.number().int().min(1).max(180).nullable(),
      })
      .strict(),
    minRole: 'super',
    dataTool: true,
  },
  {
    name: 'get_push_funnel',
    description:
      'Push → workout funnel, all time: sent → delivered → opened → started a workout, overall and per measured category. definitionId push_started_workout.',
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
