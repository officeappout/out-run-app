import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression guard for the "אימון מלא בפארק wins" design-unification
 * (05.08.2026): "הליכה+כוח" (composed.bolts undefined) must render the SAME
 * structural pattern as "אימון מלא בפארק" (composed.bolts set) — unified
 * header, "פירוט" collapsible instead of always-visible chips, and (via
 * HybridJourneyAxis's stationName) destination-based leg titles / collapsible
 * station header / sectioned exercise grouping. The interactive difficulty
 * carousel (composed.bolts.plans-driven) is DELIBERATELY held out of scope —
 * budget-split has no multi-plan trio to switch between (start-hybrid-session.ts's
 * budget-split tail returns a single `plan`, no `bolts`) — verified unchanged
 * below. Source-level, not a render test — no jsdom/component harness in this
 * repo (vitest.config.ts: "node" env only).
 */

const screenPath = fileURLToPath(new URL('../HybridOverviewScreen.tsx', import.meta.url));
const screenSrc = readFileSync(screenPath, 'utf8');
const axisPath = fileURLToPath(new URL('../HybridJourneyAxis.tsx', import.meta.url));
const axisSrc = readFileSync(axisPath, 'utf8');

describe('HybridOverviewScreen — header unified to a single row for every card', () => {
  it('renders ONE header block (no more composed.bolts ternary splitting two separate layouts)', () => {
    // The old two-branch header had a distinct "two-line" JSX block for budget-split
    // (a separate <div>...</div> pair) — that markup must be gone.
    expect(screenSrc).not.toMatch(/<div className="text-\[18px\] font-black" style=\{\{ color: '#111827' \}\}>אימון משולב<\/div>/);
  });

  it('the single header still preserves full-park\'s MAP_OVERVIEW_CHROME_V1-aware title text', () => {
    expect(screenSrc).toContain('אימון מלא בפארק · ${aerobicKind');
  });

  it('budget-split keeps its own title text ("אימון משולב"), just in the unified layout', () => {
    const match = screenSrc.match(/\{composed\.bolts\s*\n?\s*\?\s*\(MAP_OVERVIEW_CHROME_V1[\s\S]*?\)\s*\n?\s*:\s*'אימון משולב'\}/);
    expect(match, 'title ternary not found in the expected shape').toBeTruthy();
  });
});

describe('HybridOverviewScreen — "פירוט" collapsible is now used by every card', () => {
  it('no longer has a separate always-visible chip-row branch', () => {
    // The old budget-split branch rendered a Clock-icon duration chip inline — gone now
    // that duration lives only in the unified header (matches full-park).
    expect(screenSrc).not.toMatch(/<Chip icon=\{<Clock size=\{15\} \/>\}>\{totalMin\} דק׳<\/Chip>/);
  });

  it('the detailOpen collapsible section is unconditional (not gated by composed.bolts)', () => {
    const detailBlockMatch = screenSrc.match(/onClick=\{\(\) => setDetailOpen\(\(o\) => !o\)\}[\s\S]{0,40}/);
    expect(detailBlockMatch).toBeTruthy();
    // Confirm this button is NOT nested inside a `{composed.bolts ? (` branch anymore —
    // i.e. no `composed.bolts ? (` appears between the scroll-body opening and this button.
    const scrollBodyIdx = screenSrc.indexOf('ref={scrollBodyRef}');
    const detailButtonIdx = screenSrc.indexOf('setDetailOpen((o) => !o)');
    const between = screenSrc.slice(scrollBodyIdx, detailButtonIdx);
    expect(between).not.toContain('composed.bolts ? (');
  });
});

describe('HybridOverviewScreen — stationName passed unconditionally to HybridJourneyAxis', () => {
  it('no longer gates stationName on composed.bolts', () => {
    expect(screenSrc).not.toContain('stationName={composed.bolts ? composed.station?.name : undefined}');
    expect(screenSrc).toContain('stationName={composed.station?.name}');
  });
});

describe('HybridOverviewScreen — difficulty carousel intentionally UNCHANGED (held out of scope)', () => {
  it('still branches on composed.bolts — budget-split keeps the decorative, non-interactive pill', () => {
    const match = screenSrc.match(/\{composed\.bolts \? \(([\s\S]*?)\) : \(([\s\S]*?)\)\}\s*\n\s*<\/div>\s*\n\s*\n\s*\{\/\* axis \*\/\}/);
    expect(match, 'difficulty-carousel ternary not found — was it changed?').toBeTruthy();
    expect(match![1]).toContain('role="group"');
    expect(match![1]).toContain('selectBolt(i)');
    expect(match![2]).toContain('DifficultyBolts difficulty={2}');
  });
});

describe('HybridJourneyAxis — stationName doc comment reflects the unified wiring', () => {
  it('no longer claims "Full-park only" / "budget-split cards" omission', () => {
    expect(axisSrc).not.toContain('Full-park only: the destination park name');
    expect(axisSrc).not.toContain('Omitted for budget-split cards → legacy rendering unchanged');
  });
});
