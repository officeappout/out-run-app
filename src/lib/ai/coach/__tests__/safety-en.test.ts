/** English safety detection + English reply guards (Kelly server locale). Hebrew detection is covered by safety-persona-protocol.test.ts. */
import { describe, expect, it } from 'vitest';
import { detectSafetyTrigger, type SafetyTrigger } from '../safety';
import { checkReplyEn, findHandoffClaimEn, findSavedClaimEn, findUngroundedClaimsEn } from '../reply-guards-en';
import { factsFromEvidence } from '../reply-guards';

const POSITIVE: Array<[string, SafetyTrigger]> = [
  ['I think I broke my wrist', 'injury'],
  ['my ankle is broken', 'injury'],
  ['I fractured my arm yesterday', 'injury'],
  ['I tore my hamstring', 'injury'],
  ['I sprained my ankle', 'injury'],
  ['my knee is swollen', 'injury'],
  ['sharp pain in my shoulder', 'injury'],
  ['my chest hurts', 'chest'],
  ['I have a tight chest', 'chest'],
  ['chest pressure when I run', 'chest'],
  ['I get chest pain on the stairs', 'chest'],
  ['my left arm is numb', 'chest'],
  ['tingling in my arm', 'chest'],
  ['I passed out after the workout', 'dizziness'],
  ['I blacked out for a second', 'dizziness'],
  ['I feel lightheaded', 'dizziness'],
  ['I feel dizzy', 'dizziness'],
  ['I almost fainted', 'dizziness'],
  ["I can't catch my breath", 'breath'],
  ["I can't breathe", 'breath'],
  ['shortness of breath', 'breath'],
  ["I'm pregnant, can I train?", 'pregnancy'],
  ['I am 12 weeks pregnant', 'pregnancy'],
  ["we're expecting a baby", 'pregnancy'],
  ['I feel tight in the chest', 'chest'],
  ['it is tight in my chest', 'chest'],
  ['my chest feels heavy', 'chest'],
  ['chest is so heavy when I climb', 'chest'],
  ['heaviness in my chest', 'chest'],
  ['I broke my back yesterday', 'injury'],
];

const NEGATIVE = [
  'I have no chest pain',
  'no dizziness today',
  "I don't have chest pain",
  "I don't feel dizzy",
  'I did it without any sharp pain',
  'I am not pregnant',
  'my wife is pregnant',
  'my friend broke her ankle',
  'my son sprained his wrist last week',
  'my mom had chest pain once',
  'my chest muscles are sore from push-ups',
  'build me a chest workout',
  'my legs are sore',
  'what is on my schedule this week',
  'doc, how long is this workout?',
  'she is dizzy',
  'he feels dizzy',
  'they were dizzy after the run',
  'she is pregnant',
  'he broke his ankle',
  'I broke the back squat PR',
  'that was a dizzying climb',
  'the weights feel heavy today',
];

describe('detectSafetyTrigger (English)', () => {
  it.each(POSITIVE)('fires: %s', (text, trigger) => {
    expect(detectSafetyTrigger(text)).toBe(trigger);
  });
  it.each(NEGATIVE)('does not fire: %s', (text) => {
    expect(detectSafetyTrigger(text)).toBeNull();
  });
});

describe('English reply guards', () => {
  const facts = factsFromEvidence(null, [JSON.stringify({ entries: [{ date: '2026-10-19', startTime: '18:00', type: 'training' }] })], 2);
  it('flags ungrounded times, counts and weekdays, accepts grounded ones', () => {
    expect(findUngroundedClaimsEn('You have a workout Monday at 18:00.', facts)).toEqual([]);
    expect(findUngroundedClaimsEn('You have a workout Friday at 07:30.', facts)).toEqual(expect.arrayContaining(['time 07:30', 'weekday Friday']));
    expect(findUngroundedClaimsEn('You have 4 workouts planned this week.', facts)).toContain('4 workouts');
    expect(findUngroundedClaimsEn('Your level 9 is solid.', facts)).toContain('level 9');
  });
  it('false "passed to the team" claim', () => {
    expect(findHandoffClaimEn("I've passed your request to the team.", { toolNames: [] })).not.toBeNull();
    expect(findHandoffClaimEn('I sent it to our team.', { toolNames: [] })).not.toBeNull();
    expect(findHandoffClaimEn("I've passed your request to the team.", { toolNames: ['handoff_to_human'] })).toBeNull();
    expect(findHandoffClaimEn("I've passed your request to the team.", { toolNames: [], handoffOpen: true })).toBeNull();
    expect(findHandoffClaimEn('The team can help with that. Want me to pass it on?', { toolNames: [] })).toBeNull();
  });
  it('false "saved" claim only after propose_schedule_change', () => {
    expect(findSavedClaimEn("I've moved your run to Thursday.")).not.toBeNull();
    expect(findSavedClaimEn('Your schedule has been updated.')).not.toBeNull();
    expect(findSavedClaimEn("It's saved only after you tap approve.")).toBeNull();
    expect(findSavedClaimEn('I will move it once you approve.')).toBeNull();
    const issues = checkReplyEn("I've updated your week.", null, { userText: 'x', toolNames: ['propose_schedule_change'] });
    expect(issues.map((i) => i.kind)).toEqual(['unconfirmed_save']);
    expect(checkReplyEn("I've updated your week.", null, { userText: 'x', toolNames: [] })).toEqual([]);
  });
});
