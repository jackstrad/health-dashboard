import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/health-model.js';

const DATE = '2026-08-19';

test('submitting today records a dated receipt with current score and missed foundations', () => {
  assert.equal(typeof model.submitDay, 'function');
  assert.equal(typeof model.getDailySubmission, 'function');

  let state = model.createInitialState(DATE);
  state = model.toggleHabit(state, DATE, 'sleep', true);
  state = model.toggleHabit(state, DATE, 'morningLight', true);
  state = model.submitDay(state, DATE);

  const receipt = model.getDailySubmission(state, DATE);
  assert.equal(receipt.submitted, true);
  assert.equal(receipt.score, 2);
  assert.deepEqual(receipt.missedHabitIds, ['protein', 'training', 'creatine']);
  assert.match(receipt.submittedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(model.importState(model.exportState(state)).days[DATE].submittedAt, receipt.submittedAt);
});

test('editing a submitted day clears its receipt and legacy days remain importable', () => {
  let state = model.createInitialState(DATE);
  state = model.submitDay(state, DATE);
  assert.equal(model.getDailySubmission(state, DATE).submitted, true);

  state = model.toggleHabit(state, DATE, 'sleep', true);
  assert.equal(model.getDailySubmission(state, DATE).submitted, false);

  state = model.submitDay(state, DATE);
  state = model.updateDailyMetrics(state, DATE, { note: 'Changed after submitting' });
  assert.equal(model.getDailySubmission(state, DATE).submitted, false);

  const legacy = JSON.parse(model.exportState(state));
  delete legacy.days[DATE].submittedAt;
  assert.equal(model.importState(JSON.stringify(legacy)).days[DATE].submittedAt, undefined);
});

test('maximum canonical state with daily receipts remains export/import closed', () => {
  let state = model.createInitialState('2016-01-04', {
    profile: { age: 120, heightIn: 96, weightLb: 500, bodyFatRange: 'x'.repeat(32) },
    labs: Object.fromEntries(['totalTestosterone', 'shbg', 'vitaminD', 'zinc', 'magnesiumRbc'].map((key) => [key, {
      value: 99999, unit: 'x'.repeat(24), range: 'x'.repeat(64), date: DATE, status: 'x'.repeat(64),
    }])),
  });
  state = model.updateDailyMetrics(state, '2016-01-04', {
    sleepHours: 24, weightLb: 500, waistIn: 100, energy: 10, mood: 10,
    trainingType: 'strength', note: '😀'.repeat(250),
  });
  state = model.submitDay(state, '2016-01-04');
  const seed = structuredClone(state.days['2016-01-04']);
  state.days = {};
  const start = Date.parse('2016-01-04T00:00:00Z');
  for (let index = 0; index < 3660; index += 1) {
    const date = new Date(start + index * 86400000).toISOString().slice(0, 10);
    state.days[date] = structuredClone(seed);
  }
  state.weeklyReviews = Array.from({ length: 520 }, (_, index) => ({
    weekStart: new Date(start + index * 7 * 86400000).toISOString().slice(0, 10),
    wins: '😀'.repeat(250), adjustment: '😀'.repeat(250), createdAt: state.createdAt,
  }));

  const backup = model.exportState(state);
  assert.ok(backup.length <= model.BACKUP_MAX_CHARS);
  assert.ok(Buffer.byteLength(backup, 'utf8') <= model.BACKUP_MAX_BYTES);
  const restored = model.importState(backup);
  assert.equal(Object.keys(restored.days).length, 3660);
  assert.equal(restored.weeklyReviews.length, 520);
  assert.equal(restored.days['2016-01-04'].submittedAt, seed.submittedAt);
});

test('invalid submitted timestamps are rejected', () => {
  let state = model.createInitialState(DATE);
  state = model.submitDay(state, DATE);
  const malformed = JSON.parse(model.exportState(state));
  malformed.days[DATE].submittedAt = 'yesterday';
  assert.throws(() => model.importState(JSON.stringify(malformed)), /submittedAt|timestamp/i);
});
