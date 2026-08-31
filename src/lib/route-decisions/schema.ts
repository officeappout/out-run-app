/**
 * src/lib/route-decisions/schema.ts — zod shape for the route_decisions
 * append-only log (Stage 2 of the accuracy-agent plan,
 * .claude/plans/vectorized-twirling-tiger.md). Mirrors the RouteDecision
 * shape from that plan, with one deliberate change: `initiatedBy` is
 * dropped in favor of `agentSuggestion` — under the "agent proposes, never
 * decides" core principle, the agent never writes a decision row itself,
 * so `decidedBy` is always a real human uid and there's no "who initiated
 * this" ambiguity to record. `agentSuggestion` instead captures what the
 * agent would have said, on the same row, so a mining pass can compare
 * "agent said X, human decided Y" without a join.
 *
 * Deliberately NOT part of RouteCollectionName / the buildValidatedDoc
 * chokepoint (src/lib/route-collections/) — that registry's authority-
 * locking machinery (create/update modes, "locked once set" fields) exists
 * for MUTABLE entity collections. route_decisions is create-only, never
 * updated, unbounded — a log about routes, not a route-like collection
 * itself. See validate.ts for the (separate, simpler) chokepoint this
 * schema backs.
 */
import { z } from 'zod';

export const RouteDecisionTypeSchema = z.enum(['approve', 'edit', 'drop']);

const CompositionSnapshotSchema = z.object({
  genuinePct: z.number(),
  sidewalkPct: z.number(),
  ordinaryPct: z.number(),
  otherPct: z.number(),
  lengthM: z.number(),
});

const LightingSnapshotSchema = z.object({
  status: z.enum(['computed', 'unknown']),
  litCoveragePct: z.number().nullable(),
  isLit: z.boolean().nullable(),
});

const AgentSuggestionSchema = z.object({
  verdict: z.enum(['approve', 'edit', 'drop']),
  confidence: z.number(),
  reason: z.string(),
  proposedAt: z.unknown(), // FieldValue.serverTimestamp() at write time — same convention as decidedAt
});

const EditDetailSchema = z.object({
  removedRanges: z.array(z.object({
    startIdx: z.number(),
    endIdx: z.number(),
    lengthM: z.number(),
  })),
  editKind: z.enum(['trim-start', 'trim-end', 'delete-inset', 'delete-point']),
  reasonCategory: z.string().optional(),
  reasonNote: z.string().optional(),
});

const DropDetailSchema = z.object({
  reasonCategory: z.string().optional(),
  reasonNote: z.string().optional(),
});

export const RouteDecisionFieldsSchema = z.object({
  routeId: z.string().min(1),
  routeName: z.string(),
  // Both optional — mirrors the route-collection grandfather clause
  // (axioms.md §23): plenty of legacy official_routes docs have no city or
  // authorityId at all, and a decision about one of those routes is still
  // worth logging. Fabricating a fallback string ('unknown') here would be
  // the same dishonesty the composition/lighting honesty fixes deliberately
  // avoided — absence of data stays absent, not a fake value.
  city: z.string().optional(),
  authorityId: z.string().optional(),
  decisionType: RouteDecisionTypeSchema,
  decidedBy: z.string().min(1),
  decidedAt: z.unknown(), // FieldValue.serverTimestamp()
  compositionSnapshot: CompositionSnapshotSchema,
  lightingSnapshot: LightingSnapshotSchema.optional(),
  agentSuggestion: AgentSuggestionSchema.optional(),
  editDetail: EditDetailSchema.optional(),
  dropDetail: DropDetailSchema.optional(),
});

export type RouteDecisionFields = z.infer<typeof RouteDecisionFieldsSchema>;
