/**
 * Camera scan: the model calls. The photo lives only in this request's memory: it is never
 * written to Storage, Firestore or a log (tech plan §5).
 *
 *   1. identify  fast tier (Haiku), photo + the candidate list (cached), forced tool.
 *   2. compare   only when the top two are near-tied or the brand is unknown (needsCompare): smart
 *                tier, the photo next to each top item's brand photos (owner 31.10: brand-aware).
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { createAiMessage, getAiModel, withPromptCaching } from '@/lib/ai/anthropic.server';
import { SCAN_TOOL, SCAN_TOOL_NAME, compareUserText, scanSystemPrompt, scanUserText } from './scan-prompt';
import { needsCompare, parseScanToolInput } from './scan-result';
import type { ScanCandidate, ScanMode, ScanPhotoResult } from './scan-types';

export const SCAN_FEATURE = 'equipment_scan';
const MAX_TOKENS = 800;

export interface ScanImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** base64, no data: prefix. */
  data: string;
}

function toolInput(message: Anthropic.Message): unknown {
  const block = message.content.find((b) => b.type === 'tool_use' && b.name === SCAN_TOOL_NAME);
  return block && block.type === 'tool_use' ? block.input : null;
}

function imageBlock(image: ScanImage): Anthropic.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } };
}

export async function identifyEquipment(
  uid: string,
  image: ScanImage,
  candidates: readonly ScanCandidate[],
  mode: ScanMode,
): Promise<ScanPhotoResult> {
  const cached = withPromptCaching({ system: scanSystemPrompt(candidates), tools: [SCAN_TOOL] });
  const message = await createAiMessage(uid, SCAN_FEATURE, {
    model: getAiModel('fast'),
    max_tokens: MAX_TOKENS,
    ...cached,
    tool_choice: { type: 'tool', name: SCAN_TOOL_NAME },
    messages: [{ role: 'user', content: [imageBlock(image), { type: 'text', text: scanUserText(mode, candidates) }] }],
  });
  const result = parseScanToolInput(toolInput(message), candidates);
  if (mode !== 'single' || result.hasPeople || !needsCompare(result, candidates)) return result;
  return compareTopCandidates(uid, image, candidates, result);
}

/** Max catalog photos in one compare call (each costs image tokens). */
const MAX_COMPARE_IMAGES = 6;

/**
 * Re-ranks the top items against their brands' catalog photos (one image per (item, brand)), so
 * the answer carries the brand too. Falls back to the first answer.
 */
async function compareTopCandidates(
  uid: string,
  image: ScanImage,
  candidates: readonly ScanCandidate[],
  first: ScanPhotoResult,
): Promise<ScanPhotoResult> {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const top = first.items.slice(0, 3).map((i) => byId.get(i.candidateId)).filter((c): c is ScanCandidate => !!c);
  const shots: Array<{ id: string; brand: string; url: string }> = [];
  for (const c of top) {
    for (const b of c.brands ?? []) {
      if (b.imageUrl && shots.length < MAX_COMPARE_IMAGES) shots.push({ id: c.id, brand: b.name, url: b.imageUrl });
    }
  }
  if (shots.length < 2) return first;
  try {
    const message = await createAiMessage(uid, SCAN_FEATURE, {
      model: getAiModel('smart'),
      max_tokens: MAX_TOKENS,
      tools: [SCAN_TOOL],
      tool_choice: { type: 'tool', name: SCAN_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            imageBlock(image),
            ...shots.map((s): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'url', url: s.url } })),
            { type: 'text', text: compareUserText(shots) },
          ],
        },
      ],
    });
    const second = parseScanToolInput(toolInput(message), top);
    if (second.items.length === 0) return first;
    // Keep the first pass's photo verdicts (people / quality / unknown); take the re-ranked items.
    const rest = first.items.filter((i) => !top.some((c) => c.id === i.candidateId));
    return { ...first, items: [...second.items, ...rest].sort((a, b) => b.confidence - a.confidence) };
  } catch (err) {
    console.warn('[scan] compare call failed, keeping the first answer', err);
    return first;
  }
}
