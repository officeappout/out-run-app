/**
 * Kelly phase 2 — propose_schedule_change on the server (READ-ONLY). Reads the advisor input
 * (the same reads as recommend_week), builds + verifies the proposal purely, and parks it on
 * the turn (ctx.turn.proposal); the chat route stores it on Kelly's reply and shows the
 * confirm card. Nothing here writes a schedule.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ServerToolContext } from '../server-tools.server';
import type { ToolExecResult } from '../turn-engine';
import { loadAdvisorInput } from '../schedule-advisor.server';
import { buildScheduleProposal, proposalToolResult } from './build-proposal';
import { scheduleFingerprint } from './fingerprint';
import { PROPOSAL_TTL_MS, type ProposeScheduleChangeInputT } from './types';

export async function proposeScheduleChange(ctx: ServerToolContext, input: ProposeScheduleChangeInputT): Promise<ToolExecResult> {
  if (ctx.turn.proposal) return { content: 'Only one schedule proposal per reply. Talk about the one already prepared.', isError: true };
  const advisorInput = await loadAdvisorInput(ctx);
  const built = buildScheduleProposal(advisorInput, input);
  if (built.ok) {
    const now = ctx.now.getTime();
    ctx.turn.proposal = {
      id: randomUUID(),
      status: 'pending',
      scope: built.proposal.scope,
      title: built.proposal.title,
      lines: built.proposal.lines,
      plan: built.proposal.plan,
      fingerprint: scheduleFingerprint(ctx.profile),
      createdAtMs: now,
      expiresAtMs: now + PROPOSAL_TTL_MS,
    };
  }
  return { content: JSON.stringify(proposalToolResult(built)) };
}
