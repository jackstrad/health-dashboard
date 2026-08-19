import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, updateDailyMetrics, toggleHabit } from '../src/health-model.js';
import * as coach from '../src/health-coach.js';

const DATE = '2026-08-19';

function recoveryState() {
  let state = createInitialState('2026-08-13');
  state = updateDailyMetrics(state, '2026-08-18', { sleepHours: 5.5, energy: 4 });
  state = updateDailyMetrics(state, DATE, { sleepHours: 5.75, energy: 4 });
  state = toggleHabit(state, DATE, 'morningLight', true);
  return state;
}

test('local coach prioritizes the clearest recent bottleneck without mutating state', () => {
  assert.equal(typeof coach.answerHealthQuestion, 'function');
  const state = recoveryState();
  const before = JSON.stringify(state);
  const answer = coach.answerHealthQuestion(state, DATE, 'What else should I work on or improve?');

  assert.equal(answer.category, 'priorities');
  assert.equal(answer.localOnly, true);
  assert.match(`${answer.title} ${answer.summary} ${answer.actions.join(' ')}`, /sleep|recovery/i);
  assert.ok(answer.actions.length >= 3);
  assert.match(answer.disclaimer, /education|clinician|medical/i);
  assert.equal(JSON.stringify(state), before);
});

test('nutrition answer derives a protein range only from a local profile', () => {
  const state = createInitialState(DATE, { profile: { weightLb: 200 } });
  const answer = coach.answerHealthQuestion(state, DATE, 'What should I eat and prioritize?');
  assert.equal(answer.category, 'nutrition');
  assert.match(`${answer.summary} ${answer.actions.join(' ')}`, /160[–-]200 g/i);

  const baselineFree = coach.answerHealthQuestion(createInitialState(DATE), DATE, 'What should I eat?');
  assert.doesNotMatch(`${baselineFree.summary} ${baselineFree.actions.join(' ')}`, /160[–-]200 g/i);
  assert.match(`${baselineFree.summary} ${baselineFree.actions.join(' ')}`, /protein source|protein/i);
});

test('weekly menu and avoidance answers are complete, bounded, and educational', () => {
  const state = createInitialState(DATE);
  const menu = coach.answerHealthQuestion(state, DATE, 'Build me a weekly nutrition menu');
  assert.equal(menu.category, 'menu');
  assert.equal(menu.menu.length, 7);
  assert.ok(menu.menu.every((day) => day.meals.length >= 3));
  assert.ok(menu.menu.every((day) => day.day.length > 0));

  const avoid = coach.answerHealthQuestion(state, DATE, 'What things should I avoid?');
  assert.equal(avoid.category, 'avoid');
  assert.match(avoid.actions.join(' '), /alcohol/i);
  assert.match(avoid.actions.join(' '), /deficit|underfuel/i);
  assert.match(avoid.actions.join(' '), /booster|sarm|prohormone/i);
});

test('daily tip is deterministic for the same date and local state', () => {
  const state = recoveryState();
  const first = coach.getDailyHealthTip(state, DATE);
  const second = coach.getDailyHealthTip(state, DATE);
  assert.deepEqual(first, second);
  assert.match(`${first.title} ${first.body}`, /sleep|recovery/i);
});
