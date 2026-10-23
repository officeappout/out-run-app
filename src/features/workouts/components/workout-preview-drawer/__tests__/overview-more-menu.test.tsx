// @vitest-environment jsdom
/**
 * enable_overview_more_menu_v1 — the single ⋯ menu (canvas W-17 B): open/close, keyboard, each row calls its
 * handler once, the big-screen row only with enable_tv_mode_v1, and the list swaps the icon row only when given `menu`.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
const flags = vi.hoisted(() => ({ tv: false }));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableTvModeV1: flags.tv }, loading: false }),
}));
vi.mock('@/features/tv-mode/phone/TvLargeScreenLauncher', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="tv-sheet" /> : null),
}));
vi.mock('@/features/workout-engine/components/CoachNoteBlock', () => ({ default: () => null, useCoachNote: () => '' }));
vi.mock('@/features/favorites/hooks/useCachedMedia', () => ({
  useCachedMediaMap: () => new Map<string, string>(),
  useCachedMediaUrl: (u: string | null) => u,
}));

import OverviewMoreMenu from '../components/OverviewMoreMenu';
import OverviewActionsMenu from '../components/OverviewActionsMenu';
import GeneratedWorkoutExerciseList from '../components/exercise-list/GeneratedWorkoutExerciseList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  isFav: false, isFavToggling: false, isFavDownloading: false, isFavDownloaded: false,
  downloadProgress: 0, isSharing: false,
};
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
}
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  root = host = null;
  flags.tv = false;
});

const handlers = () => ({ onToggleFavorite: vi.fn(), onShare: vi.fn(), onDownload: vi.fn() });
const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const rows = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
const click = (el: Element) => act(async () => { (el as HTMLElement).click(); });
const key = (k: string) => act(async () => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
});

describe('OverviewMoreMenu', () => {
  it('is closed by default; the trigger announces a menu and is a 44px target', async () => {
    await mount(<OverviewMoreMenu actions={{ ...base, ...handlers() }} />);
    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-label')).toBe('עוד פעולות');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().className).toContain('h-11');
    expect(trigger().className).toContain('w-11');
  });

  it('opens with the three rows + hints, focus on the first, no big-screen row or divider', async () => {
    await mount(<OverviewMoreMenu actions={{ ...base, ...handlers() }} />);
    await click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(rows().map((r) => r.textContent)).toEqual(['הורדה לטלפוןלאימון בלי רשת', 'אהבתילמועדפים', 'שיתוףשליחה בקישור']);
    expect(document.activeElement).toBe(rows()[0]);
    expect(document.querySelector('[role="separator"]')).toBeNull();
    expect(rows().every((r) => r.className.includes('min-h-[44px]'))).toBe(true);
  });

  it('Escape closes and returns focus to the trigger; an outside press closes; the trigger toggles', async () => {
    await mount(<OverviewMoreMenu actions={{ ...base, ...handlers() }} />);
    await click(trigger());
    await key('Escape');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    await click(trigger());
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(menu()).toBeNull();
    await click(trigger());
    await click(trigger());
    expect(menu()).toBeNull();
  });

  it('arrow keys / Home / End move between rows and wrap; Tab closes', async () => {
    await mount(<OverviewMoreMenu actions={{ ...base, ...handlers() }} />);
    await click(trigger());
    const r = rows();
    await key('ArrowDown'); expect(document.activeElement).toBe(r[1]);
    await key('End'); expect(document.activeElement).toBe(r[2]);
    await key('ArrowDown'); expect(document.activeElement).toBe(r[0]);
    await key('ArrowUp'); expect(document.activeElement).toBe(r[2]);
    await key('Home'); expect(document.activeElement).toBe(r[0]);
    await key('Tab');
    expect(menu()).toBeNull();
  });

  it.each([
    ['הורדה לטלפון', 'onDownload'],
    ['אהבתי', 'onToggleFavorite'],
    ['שיתוף', 'onShare'],
  ] as const)('%s calls its own handler exactly once and closes', async (label, name) => {
    const h = handlers();
    await mount(<OverviewMoreMenu actions={{ ...base, ...h }} />);
    await click(trigger());
    await click(rows().find((r) => r.textContent!.startsWith(label))!);
    for (const k of Object.keys(h) as (keyof typeof h)[]) expect(h[k]).toHaveBeenCalledTimes(k === name ? 1 : 0);
    expect(menu()).toBeNull();
  });

  it('busy / done states disable the matching rows and change the hint', async () => {
    await mount(<OverviewMoreMenu actions={{ ...base, ...handlers(), isSharing: true, isFavDownloading: true, downloadProgress: 40, isFav: true }} />);
    await click(trigger());
    const [dl, fav, share] = rows();
    expect(dl.disabled).toBe(true);
    expect(dl.textContent).toContain('40%');
    expect(fav.disabled).toBe(false);
    expect(fav.textContent).toContain('במועדפים');
    expect(share.disabled).toBe(true);
  });
});

describe('OverviewActionsMenu (enable_tv_mode_v1)', () => {
  const props = () => ({ actions: { ...base, ...handlers() }, workout: {} as never, onStart: vi.fn() });
  it('tv flag off: no big-screen row', async () => {
    await mount(<OverviewActionsMenu {...props()} />);
    await click(trigger());
    expect(rows()).toHaveLength(3);
    expect(document.body.textContent).not.toContain('הצגה על מסך גדול');
  });
  it('tv flag on: divider + big-screen row that opens the W-18 sheet', async () => {
    flags.tv = true;
    await mount(<OverviewActionsMenu {...props()} />);
    await click(trigger());
    expect(rows()).toHaveLength(4);
    expect(document.querySelector('[role="separator"]')).not.toBeNull();
    expect(rows()[3].textContent).toBe('הצגה על מסך גדוללפני ההתחלה');
    expect(document.querySelector('[data-testid="tv-sheet"]')).toBeNull();
    await click(rows()[3]);
    expect(menu()).toBeNull();
    expect(document.querySelector('[data-testid="tv-sheet"]')).not.toBeNull();
  });
});

describe('GeneratedWorkoutExerciseList action row', () => {
  const gw = { exercises: [], difficulty: 2, estimatedDuration: 30 } as never;
  const listProps = (actions: Record<string, unknown>) => ({
    generatedWorkout: gw, exercisePool: [], isWarmupExpanded: false, isWarmupActive: false,
    onToggleWarmupExpanded: () => {}, onToggleWarmupActive: () => {}, actions: actions as never,
  });
  const icons = { ...base, onToggleFavorite: () => {}, onShare: () => {}, onDownload: () => {} };
  it('flag off (no menu): the three icon buttons render, no ⋯', () => {
    const html = renderToStaticMarkup(createElement(GeneratedWorkoutExerciseList, listProps(icons)));
    expect(html).toContain('aria-label="שתף"');
    expect(html).toContain('aria-label="הורדה לאופליין"');
    expect(html).not.toContain('aria-haspopup');
  });
  it('flag on (menu given): the icons and trailing are replaced by the menu', () => {
    const html = renderToStaticMarkup(createElement(GeneratedWorkoutExerciseList, listProps({
      ...icons, trailing: createElement('i', { id: 'old-tv' }), menu: createElement('b', { id: 'one-menu' }),
    })));
    expect(html).toContain('id="one-menu"');
    expect(html).not.toContain('old-tv');
    expect(html).not.toContain('aria-label="שתף"');
  });
});
