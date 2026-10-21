/**
 * "קלי AI" action chips: every in-app link a chip opens must land on a real page (same idea
 * as functions/src/__tests__/pushDeepLinks.test.ts for push deep links), the query param
 * must be one the page actually handles, and the chat reducer must attach chips to the
 * live reply.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  AI_COACH_CHIP_LINKS,
  AI_COACH_RETURN_PATH,
  COACH_ACTIONS,
  MINI_ASSESSMENT_ROUTE,
  SCHEDULE_DEEP_LINK,
  isCheckLevelActionId,
} from '@/lib/ai/coach/action-chips';
import { ASSESS_CATEGORY_SLUGS, ASSESS_SKILL_SLUGS } from '@/lib/ai/coach/assessment-gaps';
import { SKILL_TO_FOUNDATION_DOMAIN } from '@/features/user/onboarding/constants/skill-foundation-domain.constants';
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

describe('level-check chips → the mini assessment', () => {
  const assessChips = Object.entries(COACH_ACTIONS).filter(([id]) => isCheckLevelActionId(id));
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

  it('every assessable program has a chip that starts the mini check and comes back to the chat', () => {
    expect(assessChips.length).toBe(ASSESS_CATEGORY_SLUGS.length + ASSESS_SKILL_SLUGS.length);
    for (const [, spec] of assessChips) {
      expect(spec.href).toBeUndefined();
      expect(spec.assess?.route).toBe(MINI_ASSESSMENT_ROUTE);
      expect(spec.assess?.returnTo).toBe(AI_COACH_RETURN_PATH);
      expect(spec.label).toMatch(/^בדוק רמה ב\S/);
    }
  });

  it('the assessment page exists and runs the mini branch (reads + consumes the seeded state)', () => {
    const page = pageFor(MINI_ASSESSMENT_ROUTE);
    expect(page, `no page for ${MINI_ASSESSMENT_ROUTE}`).not.toBeNull();
    const src = fs.readFileSync(page!, 'utf8');
    expect(src).toContain('isMiniAssessmentActive()');
    expect(src).toContain('consumeMiniAssessmentState()');
  });

  it('startMiniDomainAssessment navigates to that same page and stores the return path', () => {
    const src = read('src/features/user/onboarding/services/mini-domain-assessment.ts');
    expect(src).toContain(`'${MINI_ASSESSMENT_ROUTE}'`);
    expect(src).toMatch(/sessionStorage\.setItem\(MINI_ASSESSMENT_RETURN_TO_KEY, resolvedReturnTo\)/);
  });

  it('the return path is the chat page', () => {
    expect(pageFor(AI_COACH_RETURN_PATH)).not.toBeNull();
  });

  it('categories go to the body_focus path, skills to the skills path', () => {
    for (const [, spec] of assessChips) {
      const a = spec.assess!;
      if (a.domainType === 'category') expect(['push', 'pull', 'legs', 'core']).toContain(a.slug);
      else expect(Object.keys(SKILL_TO_FOUNDATION_DOMAIN)).toContain(a.slug);
    }
  });

  it('the chat screen wires the chip to startMiniDomainAssessment with the chip target', () => {
    const src = read('src/features/ai-coach/components/AiCoachChat.tsx');
    // i18n wave 2 batch w: the local was renamed `target` (`t` is the translator now).
    expect(src).toContain('onAssess={(target) => startMiniDomainAssessment(router, target.slug, target.returnTo, target.domainType)}');
  });
});

describe('chat reducer: workout build state (card skeleton / error)', () => {
  const base: ChatState = chatReducer({ ...initialChatState, phase: 'idle' }, { type: 'SEND', id: 'u1', text: 'אימון בטן' });
  const tool = { type: 'client_tool' as const, id: 't1', name: 'generate_workout', input: {} };
  const card = { type: 'workout' as const, workoutId: 'ai-abc-1234', title: 'אימון בטן בבית', minutes: 20, exerciseCount: 5, location: 'home' as const };

  it('building from the client tool until the card arrives', () => {
    let s = chatReducer(base, { type: 'EVENT', event: tool });
    expect(s.workoutBuild).toBe('building');
    s = chatReducer(s, { type: 'TOOL_POSTED', ok: true });
    expect(s.workoutBuild).toBe('building');
    s = chatReducer(s, { type: 'EVENT', event: { type: 'card', card } });
    expect(s.workoutBuild).toBe('idle');
  });

  it('failed when the device could not build it; cleared by the next message', () => {
    let s = chatReducer(base, { type: 'EVENT', event: tool });
    s = chatReducer(s, { type: 'TOOL_POSTED', ok: false });
    expect(s.workoutBuild).toBe('failed');
    s = chatReducer(s, { type: 'EVENT', event: { type: 'done', messageId: 'a1' } });
    expect(s.workoutBuild).toBe('failed');
    s = chatReducer(s, { type: 'SEND', id: 'u2', text: 'שוב' });
    expect(s.workoutBuild).toBe('idle');
  });

  it('a turn that ends without a card drops the skeleton', () => {
    let s = chatReducer(base, { type: 'EVENT', event: tool });
    s = chatReducer(s, { type: 'EVENT', event: { type: 'error', code: 'internal' } });
    expect(s.workoutBuild).toBe('idle');
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
