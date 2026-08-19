export const BACKUP_MAX_CHARS = 5_000_000;
export const BACKUP_MAX_BYTES = 10_000_000;

export const HABITS = Object.freeze([
  { id: 'sleep', label: 'Sleep target', detail: 'Hit this week’s time-in-bed target' },
  { id: 'morningLight', label: 'Morning light', detail: '10 minutes outdoors after waking' },
  { id: 'protein', label: 'Nutrition', detail: 'Protein at each meal and mostly whole foods' },
  { id: 'training', label: 'Train or recover', detail: 'Follow the planned session or rest day' },
  { id: 'creatine', label: 'Daily basics', detail: 'Creatine 5 g, alcohol zero, wind-down on time' },
]);

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion', 'startDate', 'createdAt', 'updatedAt', 'profile', 'labs',
  'days', 'weeklyReviews', 'preferences',
]);
const PROFILE_KEYS = new Set(['age', 'heightIn', 'weightLb', 'bodyFatRange']);
const LAB_KEYS = new Set(['totalTestosterone', 'shbg', 'vitaminD', 'zinc', 'magnesiumRbc']);
const LAB_VALUE_KEYS = new Set(['value', 'unit', 'range', 'date', 'status']);
const DAY_KEYS = new Set(['habits', 'metrics', 'submittedAt', 'updatedAt']);
const REQUIRED_DAY_KEYS = new Set(['habits', 'metrics', 'updatedAt']);
const METRIC_KEYS = new Set(['sleepHours', 'weightLb', 'waistIn', 'energy', 'mood', 'trainingType', 'note']);
const REVIEW_KEYS = new Set(['weekStart', 'wins', 'adjustment', 'createdAt']);
const PREFERENCE_KEYS = new Set(['theme']);
const TRAINING_TYPES = new Set(['none', 'strength', 'zone2', 'rest', 'long']);
const SECRET_KEY = /(token|secret|password|api.?key|authorization|credential)/i;

function clone(value) {
  return structuredClone(value);
}

function nowIso() {
  return new Date().toISOString();
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertDate(value, field = 'date') {
  if (!isValidDateKey(value)) throw new Error(`${field} must be a valid YYYY-MM-DD date`);
}

function assertExactKeys(object, allowed, context) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new Error(`${context} must be an object`);
  }
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error(`unknown ${context} key: ${key}`);
  }
}

function assertRequiredKeys(object, required, context) {
  for (const key of required) {
    if (!Object.hasOwn(object, key)) throw new Error(`${context} requires ${key}`);
  }
}

function assertTimestamp(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
}

function assertOptionalString(value, field, maxLength) {
  if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) {
    throw new Error(`${field} must be a string no longer than ${maxLength} characters`);
  }
}

function rejectSecretKeys(value, path = 'state') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`secret-bearing key is not allowed: ${path}.${key}`);
    rejectSecretKeys(child, `${path}.${key}`);
  }
}

function emptyDay() {
  return {
    habits: Object.fromEntries(HABITS.map(({ id }) => [id, false])),
    metrics: {
      sleepHours: null,
      weightLb: null,
      waistIn: null,
      energy: null,
      mood: null,
      trainingType: 'none',
      note: '',
    },
    submittedAt: null,
    updatedAt: nowIso(),
  };
}

function ensureDay(state, date) {
  const next = clone(state);
  if (!next.days[date]) next.days[date] = emptyDay();
  return next;
}

export function createInitialState(startDate, baseline = {}) {
  assertDate(startDate, 'startDate');
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    startDate,
    createdAt: timestamp,
    updatedAt: timestamp,
    profile: clone(baseline.profile ?? {}),
    labs: clone(baseline.labs ?? {}),
    days: {},
    weeklyReviews: [],
    preferences: { theme: 'dark' },
  };
}

export function toggleHabit(state, date, habitId, done) {
  assertDate(date);
  if (!HABITS.some(({ id }) => id === habitId)) throw new Error(`unknown habit: ${habitId}`);
  if (typeof done !== 'boolean') throw new Error('habit completion must be boolean');
  const next = ensureDay(state, date);
  next.days[date].habits[habitId] = done;
  next.days[date].submittedAt = null;
  next.days[date].updatedAt = nowIso();
  next.updatedAt = nowIso();
  return next;
}

function validateMetric(key, value) {
  if (value === null) {
    if (['sleepHours', 'weightLb', 'waistIn', 'energy', 'mood'].includes(key)) return;
    throw new Error(`${key} cannot be null`);
  }
  if (key === 'sleepHours' && (!Number.isFinite(value) || value < 0 || value > 24)) {
    throw new Error('sleepHours must be between 0 and 24');
  }
  if (key === 'weightLb' && (!Number.isFinite(value) || value < 50 || value > 500)) {
    throw new Error('weightLb must be between 50 and 500');
  }
  if (key === 'waistIn' && (!Number.isFinite(value) || value < 10 || value > 100)) {
    throw new Error('waistIn must be between 10 and 100');
  }
  if ((key === 'energy' || key === 'mood') && (!Number.isInteger(value) || value < 1 || value > 10)) {
    throw new Error(`${key} must be an integer between 1 and 10`);
  }
  if (key === 'trainingType' && !TRAINING_TYPES.has(value)) {
    throw new Error('trainingType is invalid');
  }
  if (key === 'note' && (typeof value !== 'string' || value.length > 500)) {
    throw new Error('note must be no more than 500 characters');
  }
}

export function updateDailyMetrics(state, date, patch) {
  assertDate(date);
  assertExactKeys(patch, METRIC_KEYS, 'metrics');
  const next = ensureDay(state, date);
  for (const [key, value] of Object.entries(patch)) {
    validateMetric(key, value);
    next.days[date].metrics[key] = value;
  }
  next.days[date].submittedAt = null;
  next.days[date].updatedAt = nowIso();
  next.updatedAt = nowIso();
  return next;
}

export function calculateDailyScore(state, date) {
  const habits = state.days[date]?.habits;
  if (!habits) return 0;
  return HABITS.reduce((score, { id }) => score + (habits[id] === true ? 1 : 0), 0);
}

export function submitDay(state, date) {
  assertDate(date);
  const next = ensureDay(state, date);
  next.days[date].submittedAt = nowIso();
  next.days[date].updatedAt = nowIso();
  next.updatedAt = nowIso();
  return next;
}

export function getDailySubmission(state, date) {
  assertDate(date);
  const day = state.days[date];
  const submittedAt = day?.submittedAt ?? null;
  return {
    submitted: typeof submittedAt === 'string',
    submittedAt,
    score: calculateDailyScore(state, date),
    missedHabitIds: HABITS.filter(({ id }) => day?.habits?.[id] !== true).map(({ id }) => id),
  };
}

export function getSleepTarget(date, startDate) {
  assertDate(date);
  assertDate(startDate, 'startDate');
  const days = Math.max(0, Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000));
  if (days < 7) return 6.5;
  if (days < 14) return 7;
  return 7.5;
}

function datesFrom(startDate, count) {
  const base = Date.parse(`${startDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(base + index * 86400000).toISOString().slice(0, 10));
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return Math.round((finite.reduce((sum, value) => sum + value, 0) / finite.length) * 10) / 10;
}

export function getWeeklySummary(state, weekStart) {
  assertDate(weekStart, 'weekStart');
  const dates = datesFrom(weekStart, 7);
  const days = dates.map((date) => state.days[date]).filter(Boolean);
  return {
    weekStart,
    totalScore: dates.reduce((sum, date) => sum + calculateDailyScore(state, date), 0),
    possibleScore: 35,
    averageSleepHours: average(days.map((day) => day.metrics.sleepHours)),
    averageWeightLb: average(days.map((day) => day.metrics.weightLb)),
    averageEnergy: average(days.map((day) => day.metrics.energy)),
    averageMood: average(days.map((day) => day.metrics.mood)),
    strengthSessions: days.filter((day) => day.metrics.trainingType === 'strength').length,
    zone2Sessions: days.filter((day) => day.metrics.trainingType === 'zone2').length,
  };
}

export function getRecommendedAction(state, date) {
  assertDate(date);
  const day = state.days[date];
  const target = getSleepTarget(date, state.startDate);
  if (!day || !Number.isFinite(day.metrics.sleepHours) || day.metrics.sleepHours < target || !day.habits.sleep) {
    return `Protect tonight’s ${target}-hour sleep window.`;
  }
  if (!day.habits.protein) return 'Finish the day with a protein-rich whole-food meal.';
  if (!day.habits.training) return 'Complete the planned training or recovery session.';
  if (!day.habits.morningLight) return 'Get 10 minutes of outdoor light after waking.';
  if (!day.habits.creatine) return 'Take creatine 5 g and start wind-down on time.';
  return 'All five foundations are complete. Recover and repeat tomorrow.';
}

export function saveWeeklyReview(state, weekStart, wins, adjustment) {
  assertDate(weekStart, 'weekStart');
  if (typeof wins !== 'string' || typeof adjustment !== 'string' || wins.length > 500 || adjustment.length > 500) {
    throw new Error('weekly review fields must be strings no longer than 500 characters');
  }
  const next = clone(state);
  const review = { weekStart, wins, adjustment, createdAt: nowIso() };
  const index = next.weeklyReviews.findIndex((item) => item.weekStart === weekStart);
  if (index >= 0) next.weeklyReviews[index] = review;
  else next.weeklyReviews.push(review);
  next.weeklyReviews.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  next.updatedAt = nowIso();
  return next;
}

export function setTheme(state, theme) {
  if (!['dark', 'light'].includes(theme)) throw new Error('theme must be dark or light');
  const next = clone(state);
  next.preferences.theme = theme;
  next.updatedAt = nowIso();
  return next;
}

function validateImportedState(state) {
  rejectSecretKeys(state);
  assertExactKeys(state, TOP_LEVEL_KEYS, 'state');
  assertRequiredKeys(state, TOP_LEVEL_KEYS, 'state');
  if (state.schemaVersion !== 1) throw new Error('unsupported schemaVersion');
  assertDate(state.startDate, 'startDate');
  assertTimestamp(state.createdAt, 'createdAt');
  assertTimestamp(state.updatedAt, 'updatedAt');

  assertExactKeys(state.profile, PROFILE_KEYS, 'profile');
  if (Object.hasOwn(state.profile, 'age') && (!Number.isInteger(state.profile.age) || state.profile.age < 0 || state.profile.age > 120)) {
    throw new Error('profile age is invalid');
  }
  if (Object.hasOwn(state.profile, 'heightIn') && (!Number.isFinite(state.profile.heightIn) || state.profile.heightIn < 24 || state.profile.heightIn > 96)) {
    throw new Error('profile heightIn is invalid');
  }
  if (Object.hasOwn(state.profile, 'weightLb') && (!Number.isFinite(state.profile.weightLb) || state.profile.weightLb < 50 || state.profile.weightLb > 500)) {
    throw new Error('profile weightLb is invalid');
  }
  assertOptionalString(state.profile.bodyFatRange, 'profile bodyFatRange', 32);

  assertExactKeys(state.labs, LAB_KEYS, 'labs');
  for (const [name, lab] of Object.entries(state.labs)) {
    assertExactKeys(lab, LAB_VALUE_KEYS, `lab ${name}`);
    assertRequiredKeys(lab, new Set(['value', 'unit']), `lab ${name}`);
    if (!Number.isFinite(lab.value) || typeof lab.unit !== 'string' || lab.unit.length < 1 || lab.unit.length > 24) {
      throw new Error(`lab ${name} is invalid`);
    }
    assertOptionalString(lab.range, `lab ${name} range`, 64);
    assertOptionalString(lab.date, `lab ${name} date`, 32);
    if (lab.date !== undefined && !isValidDateKey(lab.date)) throw new Error(`lab ${name} date must be YYYY-MM-DD`);
    assertOptionalString(lab.status, `lab ${name} status`, 64);
  }

  assertExactKeys(state.days, new Set(Object.keys(state.days)), 'days');
  if (Object.keys(state.days).length > 3660) throw new Error('days exceeds the supported history limit');
  for (const [date, day] of Object.entries(state.days)) {
    assertDate(date);
    assertExactKeys(day, DAY_KEYS, `day ${date}`);
    assertRequiredKeys(day, REQUIRED_DAY_KEYS, `day ${date}`);
    assertTimestamp(day.updatedAt, `day ${date} updatedAt`);
    if (day.submittedAt !== undefined && day.submittedAt !== null) {
      assertTimestamp(day.submittedAt, `day ${date} submittedAt`);
    }
    const habitKeys = new Set(HABITS.map(({ id }) => id));
    assertExactKeys(day.habits, habitKeys, `day ${date} habits`);
    assertRequiredKeys(day.habits, habitKeys, `day ${date} habits`);
    for (const { id } of HABITS) if (typeof day.habits[id] !== 'boolean') throw new Error(`habit ${id} is invalid`);
    assertExactKeys(day.metrics, METRIC_KEYS, `day ${date} metrics`);
    assertRequiredKeys(day.metrics, METRIC_KEYS, `day ${date} metrics`);
    for (const [key, value] of Object.entries(day.metrics)) validateMetric(key, value);
  }

  if (!Array.isArray(state.weeklyReviews) || state.weeklyReviews.length > 520) {
    throw new Error('weeklyReviews must be an array with at most 520 entries');
  }
  const reviewWeeks = new Set();
  for (const review of state.weeklyReviews) {
    assertExactKeys(review, REVIEW_KEYS, 'weekly review');
    assertRequiredKeys(review, REVIEW_KEYS, 'weekly review');
    assertDate(review.weekStart, 'weekStart');
    if (reviewWeeks.has(review.weekStart)) throw new Error(`duplicate weekly review: ${review.weekStart}`);
    reviewWeeks.add(review.weekStart);
    if (typeof review.wins !== 'string' || typeof review.adjustment !== 'string' || review.wins.length > 500 || review.adjustment.length > 500) {
      throw new Error('weekly review text is invalid');
    }
    assertTimestamp(review.createdAt, 'weekly review createdAt');
  }
  assertExactKeys(state.preferences, PREFERENCE_KEYS, 'preferences');
  assertRequiredKeys(state.preferences, PREFERENCE_KEYS, 'preferences');
  if (!['dark', 'light'].includes(state.preferences.theme)) throw new Error('theme is invalid');
  return clone(state);
}

export function exportState(state) {
  validateImportedState(state);
  const serialized = JSON.stringify(state, null, 2);
  if (serialized.length > BACKUP_MAX_CHARS) throw new Error('backup exceeds the supported character limit');
  return serialized;
}

export function importState(serialized) {
  if (typeof serialized !== 'string' || serialized.length > BACKUP_MAX_CHARS) throw new Error('backup must be a bounded JSON string');
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('backup is not valid JSON');
  }
  return validateImportedState(parsed);
}
