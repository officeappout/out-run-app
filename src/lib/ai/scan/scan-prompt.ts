/**
 * Camera scan: system prompt + the forced tool the model answers with. Pure.
 *
 * Cache layout: tools → system (instructions + the candidate list) are stable for a given
 * catalog, so withPromptCaching puts the breakpoint after them; the per-request parts (the
 * park's known items, the photo) go in the user message.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { candidateLines } from './scan-candidates';
import type { ScanCandidate, ScanMode } from './scan-types';

export const SCAN_TOOL_NAME = 'report_equipment';

const BOX = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
  required: ['x', 'y', 'w', 'h'],
} as const;

export const SCAN_TOOL: Anthropic.Tool = {
  name: SCAN_TOOL_NAME,
  description: 'Report which listed equipment is visible in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      quality: { type: 'string', enum: ['ok', 'dark', 'blurry', 'too_far', 'too_close', 'no_equipment'] },
      has_people: { type: 'boolean', description: 'true if any person or part of a person is visible' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'an id from the list, exactly as written' },
            brand: { type: 'string', description: "the item's brand from its `brands:` list, exactly as written; omit if you cannot tell" },
            confidence: { type: 'number', description: '0..1, how sure this listed item is the one in the photo' },
            count: { type: 'integer', description: 'how many of this item are visible' },
            box: { ...BOX, description: 'normalized 0..1 box around it' },
          },
          required: ['id', 'confidence'],
        },
      },
      unknown: {
        type: 'array',
        description: 'outdoor workout equipment that is visible but matches nothing in the list',
        items: {
          type: 'object',
          properties: { description: { type: 'string', description: 'short neutral English description of the object' }, box: BOX },
          required: ['description'],
        },
      },
    },
    required: ['quality', 'has_people', 'items', 'unknown'],
  },
};

export function scanSystemPrompt(candidates: readonly ScanCandidate[]): string {
  return [
    'You identify outdoor fitness equipment in a photo taken by a user of a workout app.',
    'Choose ONLY from the list below (format: id | Hebrew name | English name | hint | brands: name (look); …). Never invent ids.',
    'Rules:',
    '- Report each distinct listed item you can see, with an honest confidence. Similar-looking items (high vs low bar, parallel bars vs dip station) deserve lower confidence when the photo cannot tell them apart.',
    '- Visible workout equipment that is not on the list goes to `unknown` with a short neutral description.',
    '- `has_people`: true if any person is visible. Never describe people in any field.',
    '- `quality`: "dark" or "blurry" when you cannot judge, "too_far" when equipment is tiny, "too_close" when it is cut off, "no_equipment" when there is none.',
    '- Benches and stairs are listed as urban:bench and urban:stairs.',
    '- Most items come in a few brands that look different (frame shape, colors, joints). When you can tell which one it is, set `brand` to that name from the item\'s `brands:` list.',
    '',
    'LIST:',
    candidateLines(candidates),
  ].join('\n');
}

export function scanUserText(mode: ScanMode, candidates: readonly ScanCandidate[]): string {
  const atPark = candidates.filter((c) => c.atPark).map((c) => c.id);
  const lines = [
    mode === 'single'
      ? 'The user aimed the camera at ONE piece of equipment. Report it (and anything else clearly visible).'
      : 'The user is mapping a whole park. Report every listed item you can see.',
  ];
  if (atPark.length) lines.push(`Items already recorded at this park (prefer them when the photo fits): ${atPark.join(', ')}`);
  lines.push(`Answer with the ${SCAN_TOOL_NAME} tool.`);
  return lines.join('\n');
}

/** One label per catalog photo, in the order the images follow the user's photo. */
export function compareUserText(labels: ReadonlyArray<{ id: string; brand: string }>): string {
  const list = labels.map((l, i) => `image ${i + 2}: ${l.id} by ${l.brand}`).join('; ');
  return `The first image is the user's photo. The next images are catalog photos (${list}). Which item and which brand is in the user's photo? Answer with the ${SCAN_TOOL_NAME} tool: ids and brands from this set only.`;
}
