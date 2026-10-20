/**
 * The tester's tools (design §3.2). Every browser action returns a fresh observation
 * (screenshot + interactive elements by ref + the linters' results), so the model always judges
 * what is on screen now. The tools can only touch the tester's own browser and the report —
 * nothing outside it (prompt-injection safety, design §6).
 */
import type Anthropic from '@anthropic-ai/sdk';

type Tool = Anthropic.Beta.BetaTool;

const target = {
  ref: { type: 'string', description: 'Element ref from the latest observation, e.g. "e12". Preferred.' },
  x: { type: 'number', description: 'CSS px from the left, only when no ref fits.' },
  y: { type: 'number', description: 'CSS px from the top, only when no ref fits.' },
} as const;

export const TOOLS: Tool[] = [
  {
    name: 'observe',
    description: 'Look at the screen again without acting (screenshot, elements, linter results).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'tap',
    description: 'Tap an element (by ref) or a point.',
    input_schema: { type: 'object', properties: { ...target }, additionalProperties: false },
  },
  {
    name: 'long_press',
    description: 'Press and hold an element or point.',
    input_schema: { type: 'object', properties: { ...target, ms: { type: 'number', description: 'Hold time, 500–3000 ms.' } }, additionalProperties: false },
  },
  {
    name: 'type',
    description: 'Type text into an input (by ref). Replaces its content.',
    input_schema: {
      type: 'object',
      properties: { ref: target.ref, text: { type: 'string' }, submit: { type: 'boolean', description: 'Press Enter afterwards.' } },
      required: ['ref', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page or the element under a point.',
    input_schema: {
      type: 'object',
      properties: { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number', description: 'Pixels, default 500.' }, x: target.x, y: target.y },
      required: ['direction'],
      additionalProperties: false,
    },
  },
  {
    name: 'drag',
    description: 'Drag with one finger from a point to a point (e.g. pull the player down to a mini-player).',
    input_schema: {
      type: 'object',
      properties: { from_x: { type: 'number' }, from_y: { type: 'number' }, to_x: { type: 'number' }, to_y: { type: 'number' } },
      required: ['from_x', 'from_y', 'to_x', 'to_y'],
      additionalProperties: false,
    },
  },
  {
    name: 'back',
    description: 'The phone back gesture (browser back).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'background_app',
    description: 'Leave the app for some seconds and come back (like switching apps mid-workout).',
    input_schema: { type: 'object', properties: { seconds: { type: 'number', description: '2–60' } }, required: ['seconds'], additionalProperties: false },
  },
  {
    name: 'gps',
    description: "Control the simulated GPS of this mission's route: start moving, lose the signal, or get poor accuracy for some seconds.",
    input_schema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['start', 'lose_signal', 'poor_accuracy'] }, seconds: { type: 'number' } },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'network',
    description: 'Go offline or back online.',
    input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['online', 'offline'] } }, required: ['mode'], additionalProperties: false },
  },
  {
    name: 'wait',
    description: 'Let real time pass (a running timer, the GPS moving). Max 60 s.',
    input_schema: { type: 'object', properties: { seconds: { type: 'number' } }, required: ['seconds'], additionalProperties: false },
  },
  {
    name: 'report_finding',
    description:
      'Record ONE problem you saw in the screenshot or element list (not a guess). Cite a rule id when one applies. Low confidence when unsure.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['broken', 'ux', 'design-rule', 'copy', 'perf', 'a11y'] },
        severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        rule: { type: 'string', description: 'Rule id from the checklist, or empty.' },
        title: { type: 'string', description: 'Short, Hebrew.' },
        element: { type: 'string', description: 'The element label it is about, if any.' },
        expected: { type: 'string', description: 'Hebrew.' },
        actual: { type: 'string', description: 'Hebrew.' },
        confidence: { type: 'number', description: '0–1' },
      },
      required: ['category', 'severity', 'title', 'expected', 'actual', 'confidence'],
      additionalProperties: false,
    },
  },
  {
    name: 'end_mission',
    description: 'Finish: success, blocked (the app stopped you), or gave_up (too confusing). Summarise as the persona, in Hebrew.',
    input_schema: {
      type: 'object',
      properties: { outcome: { type: 'string', enum: ['success', 'blocked', 'gave_up'] }, summary: { type: 'string' } },
      required: ['outcome', 'summary'],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.map((t) => t.name));
