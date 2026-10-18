/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Firestore / SDK fakes */
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  GRADER_JSON_SCHEMA,
  ISSUE_CATEGORIES,
  ROOT_CAUSES,
  parseGraderOutput,
} from '../review-types';
import { GRADER_SYSTEM_PROMPT, buildGraderParams, buildGraderUserContent, gradeTurns } from '../grader';
import type { ReviewIssue, ReviewTurn } from '../review-types';

const VALID = {
  issues: [
    {
      turnIndex: 0,
      category: 'hallucination',
      severity: 3,
      evidence: 'יש לך אימון ביום שני',
      expected: 'Call get_schedule first',
      likelyRootCause: 'prompt',
      suggestedFix: 'Require get_schedule for plan questions',
    },
  ],
  score: 2,
  summary: 'Invented the schedule.',
};

function msg(text: string, stop: Anthropic.StopReason = 'end_turn'): Anthropic.Message {
  return {
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 3000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

const turn: ReviewTurn = {
  turnIndex: 0,
  userMessageId: 'u',
  assistantMessageId: 'a',
  userText: 'מה בתוכנית השבוע? המייל שלי a.b@example.com והטלפון 054-1234567',
  assistantText: 'יש לך אימון ביום שני.',
  createdAtMs: 0,
  cards: [],
  toolCalls: [],
  guards: [],
  model: null,
};

describe('parseGraderOutput (JSON schema validation)', () => {
  it('accepts a valid review', () => {
    const r = parseGraderOutput(JSON.stringify(VALID), 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.output.issues[0].category).toBe('hallucination');
  });

  it('rejects non-JSON, unknown enums, out-of-range severity / score, missing fields', () => {
    expect(parseGraderOutput('not json', 1)).toEqual({ ok: false, error: 'not_json' });
    const bad = (patch: Record<string, unknown>) => parseGraderOutput(JSON.stringify({ ...VALID, ...patch }), 1).ok;
    expect(bad({ score: 6 })).toBe(false);
    expect(bad({ score: 0 })).toBe(false);
    expect(bad({ summary: undefined })).toBe(false);
    expect(bad({ issues: [{ ...VALID.issues[0], category: 'rudeness' }] })).toBe(false);
    expect(bad({ issues: [{ ...VALID.issues[0], severity: 4 }] })).toBe(false);
    expect(bad({ issues: [{ ...VALID.issues[0], likelyRootCause: 'model' }] })).toBe(false);
    expect(bad({ issues: [{ ...VALID.issues[0], turnIndex: -1 }] })).toBe(false);
  });

  it('drops issues that point at turns that do not exist', () => {
    const r = parseGraderOutput(JSON.stringify({ ...VALID, issues: [VALID.issues[0], { ...VALID.issues[0], turnIndex: 5 }] }), 1);
    expect(r.ok && r.output.issues).toHaveLength(1);
  });

  it('the structured-output JSON schema mirrors the zod enums and closes every object', () => {
    const issue = (GRADER_JSON_SCHEMA.properties as any).issues.items;
    expect(issue.properties.category.enum).toEqual([...ISSUE_CATEGORIES]);
    expect(issue.properties.likelyRootCause.enum).toEqual([...ROOT_CAUSES]);
    expect(issue.properties.severity.enum).toEqual([1, 2, 3]);
    expect(GRADER_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(issue.additionalProperties).toBe(false);
    expect(issue.required).toEqual(Object.keys(issue.properties));
    // structured outputs reject numeric / length constraints
    expect(JSON.stringify(GRADER_JSON_SCHEMA)).not.toMatch(/minimum|maximum|minLength|maxLength/);
  });
});

describe('grader request', () => {
  it('uses structured outputs, no thinking field (Sonnet 5.5 rejects disabled), effort medium', () => {
    const p = buildGraderParams('claude-sonnet-5-5', [{ type: 'text', text: GRADER_SYSTEM_PROMPT }], 'x');
    expect(p.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: GRADER_JSON_SCHEMA } });
    expect('thinking' in p).toBe(false);
    expect(p.model).toBe('claude-sonnet-5-5');
  });

  it('the prompt says Kelly is male; the transcript masks email / phone and lists pre-check hints', () => {
    expect(GRADER_SYSTEM_PROMPT).toMatch(/MALE coach/);
    const pre: ReviewIssue[] = [
      { id: 'precheck-0', source: 'precheck', turnIndex: 0, category: 'hallucination', severity: 2, evidence: 'q', expected: 'e', likelyRootCause: 'prompt', suggestedFix: 'f' },
    ];
    const content = buildGraderUserContent([turn], { firstName: 'דוד', gender: 'male' }, pre);
    expect(content).toContain('[email]');
    expect(content).toContain('[phone]');
    expect(content).not.toContain('example.com');
    expect(content).not.toContain('1234567');
    expect(content).toContain('User first name: דוד');
    expect(content).toContain('TOOL CALLS: none');
    expect(content).toContain('turn 0: hallucination');
  });

  it('gradeTurns: ok / refusal / max_tokens / invalid JSON', async () => {
    const args = { model: 'claude-sonnet-5-5', system: [], turns: [turn], ctx: { firstName: 'דוד', gender: 'male' }, pre: [] };
    const ok = await gradeTurns(vi.fn().mockResolvedValue(msg(JSON.stringify(VALID))), args);
    expect(ok.ok).toBe(true);
    expect(await gradeTurns(vi.fn().mockResolvedValue(msg('', 'refusal')), args)).toMatchObject({ ok: false, error: 'refusal' });
    expect(await gradeTurns(vi.fn().mockResolvedValue(msg('{"iss', 'max_tokens')), args)).toMatchObject({ ok: false, error: 'max_tokens' });
    expect(await gradeTurns(vi.fn().mockResolvedValue(msg('{"issues": []}')), args)).toMatchObject({ ok: false });
  });
});
