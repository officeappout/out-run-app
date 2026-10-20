/**
 * The live engine, social half (Firestore I/O), all inside the demo world:
 *   - replies: when a viewer or a tester wrote last in a demo chat, a demo member answers
 *     (LLM moment when allowed, else the tone's reply bank);
 *   - spontaneous group lines (bank) and "done!" lines after a shared workout;
 *   - kudos from groupmates on a finished workout;
 *   - now and then a persona joins another demo group of its own city / unit (member doc,
 *     user_memberships, the group chat — the profile's group list is only ever written by the
 *     app's group-membership routes, safety-check rule, so league group credit is unchanged);
 *   - park / app feedback moments → demo_registry/life/feedback (see the note there).
 * Every message id is deterministic and created with `create`, so a re-run never posts twice.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { LIFE_FEEDBACK_SUB, LIFE_STATE_DOC } from './config';
import { DEMO_REGISTRY_COLLECTION } from '../lib/demo-world';
import { moderateText, type LifeLlm, type LlmUsage, type MomentRequest } from './llm';
import { APP_FEEDBACK_LINES, bankLine, DONE_LINES, GROUP_LINES, PARK_FEEDBACK_LINES, REPLY_LINES } from './phrase-bank';
import type { LifePersona } from './persona';
import { pick, rngFrom, roll } from './rng';
import type { FinishedWorkout } from './activity';
import { isAlreadyExists, type GuardedWriter } from './writer';

export const SOCIAL_P = {
  spontaneousPerTick: 0.04,
  doneLine: 0.15,
  kudosPerMate: 0.12,
  maxKudosPerWorkout: 2,
  joinPerDay: 0.03,
  parkFeedback: 0.08,
  appFeedbackPerDay: 0.01,
  replyWithinMs: 6 * 3_600_000,
} as const;

/** The LLM, gated by the caps; tracks usage for demo_registry/usage. */
export class TextSource {
  calls = 0;
  fallbacks = 0;
  usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  private dead = false;

  constructor(
    readonly llm: LifeLlm | null,
    private readonly mayCall: (callsSoFar: number) => boolean,
    private readonly log: (msg: string, data?: Record<string, unknown>) => void = () => {},
  ) {}

  async text(req: MomentRequest, bank: string): Promise<{ text: string; generatedBy: 'llm' | 'bank' }> {
    if (!this.llm || this.dead || !this.mayCall(this.calls)) return { text: bank, generatedBy: 'bank' };
    try {
      const out = await this.llm.generate(req);
      this.calls++;
      this.usage.inputTokens += out.usage.inputTokens;
      this.usage.outputTokens += out.usage.outputTokens;
      this.usage.cachedTokens += out.usage.cachedTokens;
      const ok = moderateText(out.text);
      if (ok) return { text: ok, generatedBy: 'llm' };
      this.fallbacks++;
      return { text: bank, generatedBy: 'bank' };
    } catch (e) {
      // One failure (bad key, outage, refusal) ends LLM use for this tick — bank from here.
      this.dead = true;
      this.fallbacks++;
      this.log('[demoLife] llm call failed — sentence bank', { error: e instanceof Error ? e.name : 'unknown' });
      return { text: bank, generatedBy: 'bank' };
    }
  }
}

export interface ChatDoc {
  id: string;
  type: string | null;
  participants: string[];
  lastSenderId: string | null;
  lastMessageAtMs: number | null;
}

const millis = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | null;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  return v instanceof Date ? v.getTime() : typeof v === 'number' ? v : null;
};

export function parseChat(id: string, d: Record<string, unknown> | undefined): ChatDoc | null {
  if (!d) return null;
  return {
    id,
    type: typeof d.type === 'string' ? d.type : null,
    participants: Array.isArray(d.participants) ? d.participants.filter((u): u is string => typeof u === 'string') : [],
    lastSenderId: typeof d.lastSenderId === 'string' ? d.lastSenderId : null,
    lastMessageAtMs: millis(d.lastMessageAt),
  };
}

/** Writes one message + the chat summary (unread counters like the app). False when it already exists. */
async function postMessage(w: GuardedWriter, chat: ChatDoc, msgId: string, from: LifePersona, text: string, at: Date, generatedBy: 'llm' | 'bank'): Promise<boolean> {
  const batch = w.batch();
  w.add(batch, 'create', `chats/${chat.id}/messages/${msgId}`, {
    senderUid: from.uid,
    senderName: from.name,
    text,
    sentAt: at,
    readBy: [from.uid],
    type: 'text',
    isDemo: true,
    generatedBy,
  });
  const unread: Record<string, unknown> = {};
  for (const u of chat.participants) if (u !== from.uid) unread[`unreadCount.${u}`] = FieldValue.increment(1);
  w.add(batch, 'update', `chats/${chat.id}`, { lastMessage: text, lastMessageAt: at, lastSenderId: from.uid, ...unread });
  try {
    await batch.commit();
    return true;
  } catch (e) {
    if (isAlreadyExists(e)) return false;
    throw e;
  }
}

export interface SocialInput {
  nowMs: number;
  date: string;
  minuteOfDay: number;
  tickKey: string;
  personas: LifePersona[];
  personaByUid: Map<string, LifePersona>;
  /** Persona uids the registry knows (locked ones included) — a message from any of them is not a "visitor". */
  allPersonaUids: ReadonlySet<string>;
  chats: ChatDoc[];
  chatSeen: Record<string, number>;
  finished: FinishedWorkout[];
  groupsOf: (p: LifePersona) => string[];
  messageBudget: number;
  /** The noon tick: daily rolls (joins, app feedback) happen once a day. */
  dailyRollTick: boolean;
  text: TextSource;
}

export interface SocialResult {
  replies: number;
  messages: number;
  kudos: number;
  joins: Array<{ uid: string; groupId: string }>;
  feedback: number;
  chatSeen: Record<string, number>;
  messageCapHit: boolean;
}

const QUIET = (minute: number) => minute < 7 * 60 || minute >= 22 * 60;

export async function runSocial(w: GuardedWriter, input: SocialInput): Promise<SocialResult> {
  const res: SocialResult = { replies: 0, messages: 0, kudos: 0, joins: [], feedback: 0, chatSeen: { ...input.chatSeen }, messageCapHit: false };
  let budget = input.messageBudget;
  const spend = () => {
    if (budget <= 0) {
      res.messageCapHit = true;
      return false;
    }
    budget--;
    return true;
  };
  const now = new Date(input.nowMs);
  const membersOf = (chat: ChatDoc) => chat.participants.map((u) => input.personaByUid.get(u)).filter((p): p is LifePersona => !!p);

  // 1. Replies to a visitor (viewer / tester) — the newest message wasn't written by a persona.
  for (const chat of input.chats) {
    const at = chat.lastMessageAtMs;
    if (!at || !chat.lastSenderId || input.allPersonaUids.has(chat.lastSenderId)) continue;
    if (at <= (res.chatSeen[chat.id] ?? 0) || input.nowMs - at > SOCIAL_P.replyWithinMs) continue;
    const members = membersOf(chat);
    if (!members.length || !spend()) continue;
    const from = pick(rngFrom(`${chat.id}|${at}|who`), members);
    const recent = await w.db.collection(`chats/${chat.id}/messages`).orderBy('sentAt', 'desc').limit(6).get();
    const history = recent.docs.reverse().map((d) => ({ name: String(d.data().senderName ?? ''), text: String(d.data().text ?? '') }));
    const bank = bankLine(REPLY_LINES[from.tone], `${chat.id}|${at}|reply`);
    const t = await input.text.text({ kind: 'chat_reply', persona: from, chat: history }, bank);
    if (await postMessage(w, chat, `life_r_${at}`, from, t.text, now, t.generatedBy)) res.replies++;
    res.chatSeen[chat.id] = at;
  }

  // 2. A finished, shared workout: kudos from groupmates, sometimes a line in the group chat.
  for (const f of input.finished) {
    const p = f.persona;
    const wid = f.session.done!.workoutId!;
    const mates = input.personas.filter((m) => m.uid !== p.uid && input.groupsOf(m).some((g) => input.groupsOf(p).includes(g)));
    const givers = mates.filter((m) => roll(`${wid}|kudos|${m.uid}`) < SOCIAL_P.kudosPerMate).slice(0, SOCIAL_P.maxKudosPerWorkout);
    if (givers.length) {
      const batch = w.batch();
      for (const m of givers) {
        w.add(batch, 'set', `kudos/${p.uid}/inbox/life_${wid}_${m.uid}`, { fromUid: m.uid, fromName: m.name, type: 'high_five', sentAt: now, read: false, isDemo: true });
      }
      await batch.commit();
      res.kudos += givers.length;
    }
    if (f.session.done!.shared && !QUIET(input.minuteOfDay) && roll(`${wid}|doneLine`) < SOCIAL_P.doneLine) {
      const chat = input.chats.find((c) => c.type === 'group' && c.participants.includes(p.uid));
      if (chat && spend() && (await postMessage(w, chat, `life_d_${wid}`, p, bankLine(DONE_LINES, `${wid}|line`, { title: f.session.s.title }), now, 'bank'))) res.messages++;
    }
    if (f.session.s.kind === 'strength' && p.parkUser && p.park && roll(`${wid}|parkFeedback`) < SOCIAL_P.parkFeedback) {
      const bank = bankLine(PARK_FEEDBACK_LINES, `${wid}|park`, { park: p.park.name });
      const t = await input.text.text({ kind: 'park_feedback', persona: p, parkName: p.park.name }, bank);
      await writeFeedback(w, `park_${wid}`, { kind: 'park', uid: p.uid, parkId: p.park.id, parkName: p.park.name, authorityId: p.authorityId, text: t.text, generatedBy: t.generatedBy, createdAt: now });
      res.feedback++;
    }
  }

  // 3. Spontaneous group lines (bank), not at night.
  if (!QUIET(input.minuteOfDay)) {
    for (const chat of input.chats.filter((c) => c.type === 'group')) {
      if (roll(`${chat.id}|${input.tickKey}|spont`) >= SOCIAL_P.spontaneousPerTick) continue;
      const members = membersOf(chat);
      if (!members.length || !spend()) continue;
      const from = pick(rngFrom(`${chat.id}|${input.tickKey}|who`), members);
      if (await postMessage(w, chat, `life_s_${input.tickKey}`, from, bankLine(GROUP_LINES[from.tone], `${chat.id}|${input.tickKey}|line`), now, 'bank')) res.messages++;
    }
  }

  // 4. Once a day: a persona joins another demo group of its own city / unit; app feedback.
  if (input.dailyRollTick) {
    const joiners = input.personas.filter((p) => roll(`${p.uid}|${input.date}|join`) < SOCIAL_P.joinPerDay);
    if (joiners.length) res.joins = await joinGroups(w, joiners, input, now);
    for (const p of input.personas.filter((x) => roll(`${x.uid}|${input.date}|appFeedback`) < SOCIAL_P.appFeedbackPerDay)) {
      const t = await input.text.text({ kind: 'app_feedback', persona: p }, bankLine(APP_FEEDBACK_LINES, `${p.uid}|${input.date}|app`));
      await writeFeedback(w, `app_${p.uid}_${input.date}`, { kind: 'app', uid: p.uid, authorityId: p.authorityId, text: t.text, generatedBy: t.generatedBy, createdAt: now });
      res.feedback++;
    }
  }
  return res;
}

/**
 * Park / app feedback moments are kept inside demo_registry (server-only) for now: the
 * app's real inboxes for them (user_feedback, maintenance_reports) are read by global
 * admin screens and real park pages without a demo filter, so writing there would leak
 * the demo world. Routing them to a demo-aware surface is an owner decision.
 */
async function writeFeedback(w: GuardedWriter, id: string, data: Record<string, unknown>): Promise<void> {
  const batch = w.batch();
  w.add(batch, 'set', `${DEMO_REGISTRY_COLLECTION}/${LIFE_STATE_DOC}/${LIFE_FEEDBACK_SUB}/${id}`, { ...data, isDemo: true });
  await batch.commit();
}

async function joinGroups(w: GuardedWriter, joiners: LifePersona[], input: SocialInput, now: Date): Promise<Array<{ uid: string; groupId: string }>> {
  const groupIds = Array.from(w.reg.groupIds);
  const snaps = await w.db.getAll(...groupIds.map((g) => w.db.doc(`community_groups/${g}`)));
  const groups = snaps.filter((s) => s.exists && s.data()?.isDemo === true).map((s) => ({ id: s.id, authorityId: s.data()!.authorityId as unknown }));
  const out: Array<{ uid: string; groupId: string }> = [];
  for (const p of joiners) {
    const mine = input.groupsOf(p);
    const options = groups.filter((g) => g.authorityId === p.tenantId && !mine.includes(g.id));
    if (!options.length) continue;
    const g = pick(rngFrom(`${p.uid}|${input.date}|joinWhich`), options);
    const chat = input.chats.find((c) => c.type === 'group' && c.id === `group_${g.id}`);
    const batch = w.batch();
    w.add(batch, 'set', `community_groups/${g.id}/members/${p.uid}`, { uid: p.uid, name: p.name, joinedAt: now, role: 'member', isDemo: true });
    w.add(batch, 'merge', `user_memberships/${p.uid}`, { groupIds: FieldValue.arrayUnion(g.id), updatedAt: now, isDemo: true });
    if (chat) w.add(batch, 'update', `chats/${chat.id}`, { participants: FieldValue.arrayUnion(p.uid), [`participantNames.${p.uid}`]: p.name });
    await batch.commit();
    out.push({ uid: p.uid, groupId: g.id });
  }
  return out;
}
