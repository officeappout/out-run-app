import { describe, it, expect } from 'vitest';
import {
  AGENT_REGISTRY,
  AUTOMATION_KIND_LABEL,
  AUTOMATION_REGISTRY,
  AUTOMATION_TOPICS,
  groupAutomationsByTopic,
  isRegisteredAgent,
} from '../agent-registry';
import { describeLastRun, describeStatusToken } from '../agents-panel.logic';

describe('automation registry', () => {
  it('ids are unique and URL/doc-id safe', () => {
    const ids = AUTOMATION_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  });

  it('every entry has a known topic and kind, and Hebrew name + description + schedule', () => {
    const topics = new Set(AUTOMATION_TOPICS.map((t) => t.id));
    for (const a of AUTOMATION_REGISTRY) {
      expect(topics.has(a.topic)).toBe(true);
      expect(AUTOMATION_KIND_LABEL[a.kind]).toBeTruthy();
      expect(a.name.trim()).not.toBe('');
      expect(a.description.trim()).not.toBe('');
      expect(a.schedule.trim()).not.toBe('');
      if (a.adminHref) expect(a.adminHref.startsWith('/admin')).toBe(true);
    }
  });

  it('findings allowlist stays exactly the agents with findings (oncall only today)', () => {
    expect(AGENT_REGISTRY.map((a) => a.id)).toEqual(['oncall']);
    expect(isRegisteredAgent('oncall')).toBe(true);
    // A display-only automation must never be accepted by the findings routes.
    expect(isRegisteredAgent('crm-agent')).toBe(false);
    expect(isRegisteredAgent('geo-discovery')).toBe(false);
  });

  it('oncall is planned (no implementation)', () => {
    expect(AUTOMATION_REGISTRY.find((a) => a.id === 'oncall')?.lifecycle).toBe('planned');
  });

  it('latestDoc sources name a collection and a timestamp field', () => {
    for (const a of AUTOMATION_REGISTRY) {
      const s = a.statusSource;
      if (s?.kind !== 'latestDoc') continue;
      expect(s.collection).toMatch(/^[A-Za-z_]+$/);
      expect(s.orderByField).toMatch(/^[A-Za-z_]+$/);
      expect(s.label.trim()).not.toBe('');
    }
  });

  it('groups in topic order, all six topics present, nothing lost', () => {
    const groups = groupAutomationsByTopic();
    expect(groups.map((g) => g.topic)).toEqual(AUTOMATION_TOPICS.map((t) => t.id));
    expect(groups.reduce((n, g) => n + g.automations.length, 0)).toBe(AUTOMATION_REGISTRY.length);
  });
});

describe('last-run display', () => {
  it('no status source → "אין דיווח סטטוס עדיין"', () => {
    expect(describeLastRun(false, undefined)).toEqual({ text: 'אין דיווח סטטוס עדיין', known: false });
  });
  it('loading / failed / empty / known', () => {
    expect(describeLastRun(true, undefined).text).toBe('טוען…');
    expect(describeLastRun(true, { lastAt: null, error: 'unavailable' }).text).toBe('הסטטוס לא זמין כרגע');
    expect(describeLastRun(true, { lastAt: null, error: null }).text).toBe('עוד אין רשומה');
    expect(describeLastRun(true, { lastAt: '2026-10-14T10:50:00.000Z', error: null }).known).toBe(true);
  });
  it('status tokens map to Hebrew + tone; unknown tokens pass through neutral', () => {
    expect(describeStatusToken('failed')).toEqual({ label: 'נכשל', tone: 'fail' });
    expect(describeStatusToken('succeeded')?.tone).toBe('ok');
    expect(describeStatusToken('approve')).toEqual({ label: 'approve', tone: 'neutral' });
    expect(describeStatusToken(null)).toBeNull();
  });
});
