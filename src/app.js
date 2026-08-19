import {
  BACKUP_MAX_BYTES,
  HABITS,
  createInitialState,
  toggleHabit,
  updateDailyMetrics,
  calculateDailyScore,
  submitDay,
  getDailySubmission,
  getSleepTarget,
  getWeeklySummary,
  getRecommendedAction,
  saveWeeklyReview,
  setTheme,
  exportState,
  importState,
} from './health-model.js?v=health-public-v4';
import { answerHealthQuestion, getDailyHealthTip } from './health-coach.js?v=health-public-v4';

const STORAGE_KEY = 'health-dashboard.public.v1';
const RELEASE = 'health-public-v4';
const today = localDateKey(new Date());
const emptyBaseline = { profile: {}, labs: {} };

let storageLocked = false;
let state = loadState();

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOffset(dateKey, offset) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

function mondayFor(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  const delta = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - delta);
  return localDateKey(date);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialState(today, emptyBaseline);
      localStorage.setItem(STORAGE_KEY, exportState(initial));
      return initial;
    }
    return importState(raw);
  } catch {
    storageLocked = true;
    return createInitialState(today, emptyBaseline);
  }
}

function commit(next) {
  if (storageLocked) {
    showStorageAlert('Saved data is invalid or storage is unavailable. Export/clear browser data before making new entries.');
    return false;
  }
  try {
    const serialized = exportState(next);
    localStorage.setItem(STORAGE_KEY, serialized);
    state = next;
    flashSaved();
    return true;
  } catch (error) {
    showStorageAlert(`Unable to save locally: ${error.message}`);
    return false;
  }
}

function showStorageAlert(message) {
  const alert = document.querySelector('#storage-alert');
  alert.textContent = message;
  alert.hidden = false;
}

function flashSaved(label = 'Saved locally') {
  const status = document.querySelector('#save-status');
  status.textContent = label;
  status.classList.add('is-saved');
  window.clearTimeout(flashSaved.timer);
  flashSaved.timer = window.setTimeout(() => {
    status.textContent = 'Local only';
    status.classList.remove('is-saved');
  }, 1400);
}

function getTodayDay() {
  return state.days[today] ?? null;
}

function renderHeader() {
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  }).format(new Date(`${today}T12:00:00`));
}

function renderTodaySummary() {
  const score = calculateDailyScore(state, today);
  const target = getSleepTarget(today, state.startDate);
  document.querySelector('#daily-score').textContent = `${score} of 5`;
  document.querySelector('#score-ring-text').textContent = String(score);
  document.querySelector('#score-ring').style.setProperty('--ring', score / 5);
  document.querySelector('#score-message').textContent = score === 5
    ? 'Foundation complete. Recover and repeat.'
    : score >= 3 ? 'A strong day is taking shape.' : 'Build the day one decision at a time.';
  document.querySelector('#sleep-target-pill').textContent = `${target} h sleep`;
  document.querySelector('#recommended-action').textContent = getRecommendedAction(state, today);
}

function renderDailySubmission() {
  const receipt = getDailySubmission(state, today);
  const card = document.querySelector('#daily-submission');
  const status = document.querySelector('#submission-status');
  const gaps = document.querySelector('#submission-gaps');
  const button = document.querySelector('#submit-day');
  const labels = Object.fromEntries(HABITS.map(({ id, label }) => [id, label]));

  card.classList.toggle('is-submitted', receipt.submitted);
  button.disabled = receipt.submitted;
  button.textContent = receipt.submitted ? `Submitted · ${receipt.score}/5` : `Submit today · ${receipt.score}/5`;
  if (!receipt.submitted) {
    status.textContent = 'Not submitted yet';
    gaps.textContent = receipt.score === 5
      ? 'All five foundations are complete. Submit your daily receipt.'
      : `Still open: ${receipt.missedHabitIds.map((id) => labels[id]).join(', ')}.`;
    return;
  }

  const submittedTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(receipt.submittedAt));
  status.textContent = `Submitted at ${submittedTime}`;
  gaps.textContent = receipt.score === 5
    ? 'All five foundations completed.'
    : `Recorded ${receipt.score}/5. Missed: ${receipt.missedHabitIds.map((id) => labels[id]).join(', ')}.`;
}

function renderCoachTip() {
  const tip = getDailyHealthTip(state, today);
  const card = document.querySelector('#daily-health-tip');
  card.querySelector('h3').textContent = tip.title;
  card.querySelector('p').textContent = tip.body;
}

function renderCoachAnswer(answer) {
  const container = document.querySelector('#coach-answer');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'coach-answer-category';
  eyebrow.textContent = answer.category;
  const title = document.createElement('h3');
  title.textContent = answer.title;
  const summary = document.createElement('p');
  summary.textContent = answer.summary;
  const actions = document.createElement('ul');
  actions.className = 'coach-action-list';
  actions.replaceChildren(...answer.actions.map((action) => {
    const item = document.createElement('li');
    item.textContent = action;
    return item;
  }));
  const nodes = [eyebrow, title, summary, actions];

  if (answer.menu.length) {
    const menu = document.createElement('div');
    menu.className = 'coach-menu';
    menu.replaceChildren(...answer.menu.map((entry) => {
      const day = document.createElement('section');
      const heading = document.createElement('h4');
      heading.textContent = entry.day;
      const meals = document.createElement('ul');
      meals.replaceChildren(...entry.meals.map((meal) => {
        const item = document.createElement('li');
        item.textContent = meal;
        return item;
      }));
      day.append(heading, meals);
      return day;
    }));
    nodes.push(menu);
  }

  const disclaimer = document.createElement('small');
  disclaimer.textContent = answer.disclaimer;
  nodes.push(disclaimer);
  container.replaceChildren(...nodes);
  container.hidden = false;
}

function renderToday() {
  renderTodaySummary();
  renderHabits();
  renderCheckin();
  renderDailySubmission();
  renderCoachTip();
}

function renderHabits() {
  const container = document.querySelector('#habit-list');
  const current = getTodayDay()?.habits ?? {};
  container.replaceChildren(...HABITS.map((habit) => {
    const done = current[habit.id] === true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `habit${done ? ' is-done' : ''}`;
    button.dataset.habit = habit.id;
    button.setAttribute('aria-pressed', String(done));

    const check = document.createElement('span');
    check.className = 'habit-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';

    const copy = document.createElement('span');
    copy.className = 'habit-copy';
    const title = document.createElement('b');
    title.textContent = habit.label;
    const detail = document.createElement('small');
    detail.textContent = habit.id === 'sleep'
      ? `${getSleepTarget(today, state.startDate)} hours in bed this week`
      : habit.detail;
    copy.append(title, detail);

    const arrow = document.createElement('span');
    arrow.className = 'habit-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = done ? '✓' : '›';
    button.append(check, copy, arrow);
    return button;
  }));
}

function setInputValue(selector, value) {
  const input = document.querySelector(selector);
  input.value = value ?? '';
}

function renderCheckin() {
  const metrics = getTodayDay()?.metrics;
  setInputValue('#sleep-hours', metrics?.sleepHours);
  setInputValue('#weight-lb', metrics?.weightLb);
  setInputValue('#training-type', metrics?.trainingType ?? 'none');
  setInputValue('#daily-note', metrics?.note ?? '');
  const energy = metrics?.energy;
  const mood = metrics?.mood;
  document.querySelector('#energy').value = energy ?? 5;
  document.querySelector('#energy-output').textContent = energy ?? '—';
  document.querySelector('#mood').value = mood ?? 5;
  document.querySelector('#mood-output').textContent = mood ?? '—';
}

function renderLabs() {
  const labels = {
    totalTestosterone: ['Total testosterone', 'Primary baseline'],
    shbg: ['SHBG', 'Binding marker'],
    vitaminD: ['Vitamin D', 'Sufficient'],
    zinc: ['Zinc', 'No megadose needed'],
    magnesiumRbc: ['RBC magnesium', 'Optional sleep support'],
  };
  const grid = document.querySelector('#lab-grid');
  const entries = Object.entries(state.labs);
  if (!entries.length) {
    const card = document.createElement('article');
    card.className = 'lab-card';
    const status = document.createElement('span');
    status.className = 'lab-status';
    status.textContent = 'Private by default';
    const title = document.createElement('h3');
    title.textContent = 'No labs';
    const message = document.createElement('p');
    message.textContent = 'Import your private setup file from More.';
    card.append(status, title, message);
    grid.replaceChildren(card);
    return;
  }
  grid.replaceChildren(...entries.map(([key, lab]) => {
    const card = document.createElement('article');
    card.className = 'lab-card';
    const status = document.createElement('span');
    status.className = 'lab-status';
    status.textContent = lab.status || 'Recorded';
    const value = document.createElement('h3');
    value.textContent = String(lab.value);
    const unit = document.createElement('p');
    unit.textContent = lab.unit;
    const detail = document.createElement('small');
    const [label, note] = labels[key] ?? [key, 'Recorded'];
    detail.textContent = `${label}${lab.range ? ` · range ${lab.range}` : ''} · ${note}`;
    card.append(status, value, unit, detail);
    return card;
  }));
}

function renderPlan() {
  const days = Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86400000));
  const week = Math.min(12, Math.floor(days / 7) + 1);
  const target = getSleepTarget(today, state.startDate);
  document.querySelector('#week-number').textContent = `Week ${week}`;
  document.querySelector('#plan-sleep').textContent = `${target} hours in bed this week. Keep the wake time consistent.`;
  if (week === 1) {
    document.querySelector('#week-focus').textContent = 'Recovery reset';
    document.querySelector('#week-description').textContent = 'Build a consistent sleep window before adding intensity or a calorie deficit.';
  } else if (week === 2) {
    document.querySelector('#week-focus').textContent = 'Protect the rhythm';
    document.querySelector('#week-description').textContent = 'Reach seven hours, train with restraint, and make whole-food protein automatic.';
  } else {
    document.querySelector('#week-focus').textContent = 'Strength-biased recomposition';
    document.querySelector('#week-description').textContent = 'Hold 7.5+ hours, progress strength, and use only a modest deficit if body fat is closer to 20%.';
  }
}

function renderTrends() {
  const weekStart = mondayFor(today);
  const summary = getWeeklySummary(state, weekStart);
  const cards = [
    ['Weekly score', `${summary.totalScore}/35`],
    ['Average sleep', summary.averageSleepHours === null ? '—' : `${summary.averageSleepHours} h`],
    ['Strength', String(summary.strengthSessions)],
    ['Energy', summary.averageEnergy === null ? '—' : `${summary.averageEnergy}/10`],
  ];
  const container = document.querySelector('#weekly-summary');
  container.replaceChildren(...cards.map(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'summary-card';
    const small = document.createElement('small');
    small.textContent = label;
    const bold = document.createElement('b');
    bold.textContent = value;
    card.append(small, bold);
    return card;
  }));
  renderTrendChart();
  const review = state.weeklyReviews.find((item) => item.weekStart === weekStart);
  document.querySelector('#weekly-wins').value = review?.wins ?? '';
  document.querySelector('#weekly-adjustment').value = review?.adjustment ?? '';
}

function renderTrendChart() {
  const svg = document.querySelector('#trend-chart');
  const namespace = 'http://www.w3.org/2000/svg';
  const dates = Array.from({ length: 14 }, (_, index) => dayOffset(today, index - 13));
  const make = (tag, attributes = {}) => {
    const node = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const nodes = [];
  nodes.push(make('line', { x1: 32, y1: 260, x2: 680, y2: 260, stroke: '#2c2c2e', 'stroke-width': 1 }));
  dates.forEach((date, index) => {
    const x = 42 + index * 48;
    const score = calculateDailyScore(state, date);
    const sleep = state.days[date]?.metrics.sleepHours;
    const barHeight = score * 36;
    nodes.push(make('rect', {
      x, y: 260 - barHeight, width: 23, height: Math.max(2, barHeight), rx: 8,
      fill: score ? '#2997ff' : '#2c2c2e', opacity: score ? 1 : .65,
    }));
    if (Number.isFinite(sleep)) {
      const y = 260 - Math.min(9, sleep) / 9 * 205;
      nodes.push(make('circle', { cx: x + 11.5, cy: y, r: 5, fill: '#30d158' }));
      if (index > 0) {
        const prior = state.days[dates[index - 1]]?.metrics.sleepHours;
        if (Number.isFinite(prior)) {
          const priorY = 260 - Math.min(9, prior) / 9 * 205;
          nodes.push(make('line', { x1: x - 36.5, y1: priorY, x2: x + 11.5, y2: y, stroke: '#30d158', 'stroke-width': 3, 'stroke-linecap': 'round' }));
        }
      }
    }
    if ([0, 6, 13].includes(index)) {
      const label = make('text', { x: x + 11, y: 284, 'text-anchor': 'middle', fill: '#8e8e93', 'font-size': 12 });
      label.textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
      nodes.push(label);
    }
  });
  svg.replaceChildren(...nodes);
}

function renderTheme() {
  document.body.dataset.theme = state.preferences.theme;
  document.querySelector('#theme-label').textContent = state.preferences.theme === 'dark' ? 'Dark' : 'Light';
  document.querySelector('meta[name="theme-color"]').content = state.preferences.theme === 'dark' ? '#000000' : '#f5f5f7';
}

function renderAll() {
  renderHeader();
  renderTheme();
  renderToday();
  renderTrends();
  renderLabs();
  renderPlan();
  if (storageLocked) showStorageAlert('Stored data could not be validated. The dashboard is read-only until local data is reset or replaced by a valid backup.');
}

function numberOrNull(value) {
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

document.querySelector('#habit-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-habit]');
  if (!button) return;
  const current = getTodayDay()?.habits?.[button.dataset.habit] === true;
  if (commit(toggleHabit(state, today, button.dataset.habit, !current))) renderToday();
});

for (const [selector, metric] of [['#sleep-hours', 'sleepHours'], ['#weight-lb', 'weightLb']]) {
  document.querySelector(selector).addEventListener('change', (event) => {
    if (commit(updateDailyMetrics(state, today, { [metric]: numberOrNull(event.target.value) }))) {
      renderTodaySummary();
      renderDailySubmission();
      renderCoachTip();
    }
  });
}

for (const [selector, metric, output] of [['#energy', 'energy', '#energy-output'], ['#mood', 'mood', '#mood-output']]) {
  document.querySelector(selector).addEventListener('input', (event) => {
    const value = Number(event.target.value);
    document.querySelector(output).textContent = String(value);
    if (commit(updateDailyMetrics(state, today, { [metric]: value }))) {
      renderTrends();
      renderDailySubmission();
      renderCoachTip();
    }
  });
}

document.querySelector('#training-type').addEventListener('change', (event) => {
  if (commit(updateDailyMetrics(state, today, { trainingType: event.target.value }))) {
    renderTrends();
    renderDailySubmission();
    renderCoachTip();
  }
});

document.querySelector('#daily-note').addEventListener('change', (event) => {
  if (commit(updateDailyMetrics(state, today, { note: event.target.value.trim() }))) renderDailySubmission();
});

document.querySelector('#submit-day').addEventListener('click', () => {
  if (commit(submitDay(state, today))) {
    renderDailySubmission();
    flashSaved('Daily check-in submitted');
  }
});

function askCoach(question) {
  try {
    renderCoachAnswer(answerHealthQuestion(state, today, question));
  } catch (error) {
    showStorageAlert(`Unable to answer locally: ${error.message}`);
  }
}

document.querySelector('#coach-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#coach-question');
  const question = input.value.trim();
  if (!question) return;
  askCoach(question);
  input.value = '';
});

document.querySelectorAll('[data-coach-question]').forEach((button) => {
  button.addEventListener('click', () => askCoach(button.dataset.coachQuestion));
});

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('is-active', item === button));
    document.querySelectorAll('[data-view]').forEach((view) => {
      const active = view.dataset.view === target;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
    if (target === 'trends') renderTrends();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

document.querySelector('#save-weekly-review').addEventListener('click', () => {
  const weekStart = mondayFor(today);
  const wins = document.querySelector('#weekly-wins').value.trim();
  const adjustment = document.querySelector('#weekly-adjustment').value.trim();
  if (commit(saveWeeklyReview(state, weekStart, wins, adjustment))) flashSaved('Review saved');
});

document.querySelector('#export-data').addEventListener('click', () => {
  const blob = new Blob([exportState(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `private-health-dashboard-${today}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  flashSaved('Backup exported');
});

document.querySelector('#import-data').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (!file || file.size > BACKUP_MAX_BYTES) {
    showStorageAlert('Choose a JSON backup smaller than 10 MB.');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const imported = importState(String(reader.result));
      storageLocked = false;
      if (commit(imported)) {
        renderAll();
        flashSaved('Backup imported');
      }
    } catch (error) {
      showStorageAlert(`Backup rejected: ${error.message}`);
    }
  });
  reader.readAsText(file);
  event.target.value = '';
});

document.querySelector('#theme-toggle').addEventListener('click', () => {
  const theme = state.preferences.theme === 'dark' ? 'light' : 'dark';
  if (commit(setTheme(state, theme))) renderTheme();
});

document.querySelector('#delete-data').addEventListener('click', () => {
  if (!window.confirm('Delete all tracked entries and reset this private dashboard? This cannot be undone without an exported backup.')) return;
  try {
    const reset = createInitialState(today, emptyBaseline);
    localStorage.setItem(STORAGE_KEY, exportState(reset));
    state = reset;
    storageLocked = false;
    renderAll();
    flashSaved('Tracked data reset');
  } catch (error) {
    storageLocked = true;
    showStorageAlert(`Unable to reset local data: ${error.message}`);
  }
});

const privacyDialog = document.querySelector('#privacy-dialog');
document.querySelector('#privacy-details').addEventListener('click', () => privacyDialog.showModal());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}), { once: true });
}

window.__HEALTH_DASHBOARD__ = Object.freeze({
  release: RELEASE,
  today,
  readState: () => JSON.parse(exportState(state)),
  score: () => calculateDailyScore(state, today),
});

renderAll();
