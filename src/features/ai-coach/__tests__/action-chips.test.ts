/**
 * "קלי AI" action chips: every in-app link a chip opens must land on a real page (same idea
 * as functions/src/__tests__/pushDeepLinks.test.ts for push deep links), the query param
 * must be one the page actually handles, and the chat reducer must attach chips to the
 * live reply.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AI_COACH_CHIP_LINKS, COACH_ACTIONS, SCHEDULE_DEEP_LINK } from '@/lib/ai/coach/action-chips';
import { chatReducer, initialChatState, LIVE_ID, type ChatState } from '../state/chat-machine';

const APP_DIR = path.resolve(process.cwd(), 'src/app');

/** The page file for `link` (path + optional query) in src/app, or null. */
function pageFor(link: string): string | null {
  const segments = link.split(/[?#]/)[0].split('/').filter(Boolean);
  const walk = (dir: string, i: number): string | null => {
    if (i === segments.length) {
      const f = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].map((x) => path.join(dir, x)).find((x) => fs.existsSync(x));
      return f ?? null;
    }
    if (!fs.existsSync(dir)) return null;
    const children = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const seg = segments[i];
    if (children.includes(seg)) {
      const hit = walk(path.join(dir, seg), i + 1);
      if (hit) return hit;
    }
    // Route groups "(main)" don't add a segment.
    for (const g of children.filter((c) => /^\(.+\)$/.test(c))) {
      const hit = walk(path.join(dir, g), i);
      if (hit) return hit;
    }
    for (const c of children.filter((c) => /^\[[^.]/.test(c))) {
      const hit = walk(path.join(dir, c), i + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(APP_DIR, 0);
}

describe('chip deep links', () => {
  it('there is at least one link, and the schedule chip uses it', () => {
    expect(AI_COACH_CHIP_LINKS.length).toBeGreaterThan(0);
    expect(COACH_ACTIONS.open_schedule.href).toBe(SCHEDULE_DEEP_LINK);
  });

  it.each(AI_COACH_CHIP_LINKS.map((l) => [l]))('%s lands on an existing page that reads its query params', (link) => {
    const page = pageFor(link);
    expect(page, `no page for ${link}`).not.toBeNull();
    const src = fs.readFileSync(page!, 'utf8');
    const params = Array.from(new URLSearchParams(link.split('?')[1] ?? '').keys());
    for (const p of params) expect(src, `${page} never reads ?${p}`).toContain(`params.get('${p}')`);
  });

  it('the schedule link opens the training planner on /home', () => {
    const src = fs.readFileSync(pageFor(SCHEDULE_DEEP_LINK)!, 'utf8');
    expect(src).toMatch(/params\.get\('openPlanner'\) === 'true'\)\s*\{[\s\S]{0,200}?setShowPlanner\(true\)/);
  });

  it('a missing route is caught', () => {
    expect(pageFor('/schedule')).toBeNull();
  });
});

describe('chat reducer: actions event', () => {
  const sending: ChatState = chatReducer({ ...initialChatState, phase: 'idle' }, { type: 'SEND', id: 'u1', text: 'מה מצפה לי השבוע?' });

  it('attaches the chips to the live reply, deduped, and keeps them after done', () => {
    let s = chatReducer(sending, { type: 'EVENT', event: { type: 'text', delta: 'יום שני 18:00, כוח' } });
    s = chatReducer(s, { type: 'EVENT', event: { type: 'actions', actions: ['open_schedule', 'build_today'] } });
    s = chatReducer(s, { type: 'EVENT', event: { type: 'actions', actions: ['open_schedule'] } });
    expect(s.messages.find((m) => m.id === LIVE_ID)?.actions).toEqual(['open_schedule', 'build_today']);
    s = chatReducer(s, { type: 'EVENT', event: { type: 'done', messageId: 'a1' } });
    expect(s.messages.find((m) => m.id === 'a1')?.actions).toEqual(['open_schedule', 'build_today']);
  });
});
