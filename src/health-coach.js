import { HABITS, calculateDailyScore, getSleepTarget, getWeeklySummary } from './health-model.js';

const DISCLAIMER = 'General health education only—not diagnosis or individualized medical care. Use a qualified clinician for symptoms, conditions, medications, allergies, or major diet changes.';

const WEEKLY_MENU = Object.freeze([
  { day: 'Monday', meals: ['Greek yogurt, oats, berries, and nuts', 'Chicken or tofu grain bowl with vegetables', 'Salmon, potatoes, and a large salad', 'Fruit with cottage cheese or edamame'] },
  { day: 'Tuesday', meals: ['Eggs, whole-grain toast, and fruit', 'Turkey or tempeh wrap with crunchy vegetables', 'Lean beef or lentil chili with rice', 'Greek yogurt or a protein smoothie'] },
  { day: 'Wednesday', meals: ['Overnight oats with milk, chia, and berries', 'Tuna or chickpea salad with whole-grain crackers', 'Chicken or tofu stir-fry with rice', 'Fruit and a handful of nuts'] },
  { day: 'Thursday', meals: ['Egg-and-vegetable breakfast bowl with potatoes', 'Leftover stir-fry plus extra vegetables', 'Turkey meatballs or bean patties with pasta and greens', 'Cottage cheese, berries, or edamame'] },
  { day: 'Friday', meals: ['Greek yogurt parfait with oats and fruit', 'Chicken, tofu, or bean burrito bowl', 'White fish or lentil tacos with slaw and avocado', 'Protein smoothie or fruit with yogurt'] },
  { day: 'Saturday', meals: ['Eggs, oatmeal, and fruit before training', 'Rice bowl with lean protein and vegetables', 'Homemade burger or bean burger with potatoes and salad', 'Yogurt, milk, or soy milk with fruit'] },
  { day: 'Sunday', meals: ['Vegetable omelet with toast and fruit', 'Soup, whole-grain bread, and a protein-rich salad', 'Roast chicken or baked tofu with grains and vegetables', 'Prepare two proteins, a grain, and chopped produce for the week'] },
]);

function dateOffset(dateKey, offset) {
  const base = Date.parse(`${dateKey}T00:00:00Z`);
  return new Date(base + offset * 86400000).toISOString().slice(0, 10);
}

function mondayFor(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay();
  return dateOffset(dateKey, -((day + 6) % 7));
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function recentDays(state, date) {
  return Array.from({ length: 7 }, (_, index) => state.days[dateOffset(date, index - 6)]).filter(Boolean);
}

function proteinGuidance(state) {
  const weight = state.profile?.weightLb;
  if (!Number.isFinite(weight)) {
    return 'Include a meaningful protein source at each meal, then add carbohydrates and colorful produce around it.';
  }
  const lower = Math.round((weight * 0.8) / 5) * 5;
  const upper = Math.round(weight / 5) * 5;
  return `A practical daily protein range from the weight stored on this device is ${lower}–${upper} g, divided across three to five meals.`;
}

function priorityAnswer(state, date) {
  const days = recentDays(state, date);
  const averageSleep = average(days.map((day) => day.metrics.sleepHours));
  const averageEnergy = average(days.map((day) => day.metrics.energy));
  const target = getSleepTarget(date, state.startDate);
  const score = calculateDailyScore(state, date);
  const current = state.days[date];
  const missed = HABITS.filter(({ id }) => current?.habits?.[id] !== true);
  const week = getWeeklySummary(state, mondayFor(date));
  const actions = [];

  if (averageSleep === null || averageSleep < target) {
    actions.push(`Protect a ${target}-hour sleep opportunity and keep tomorrow’s wake time consistent.`);
  }
  if (missed.length) {
    actions.push(`Close the smallest foundation gap next: ${missed.slice(0, 2).map(({ label }) => label).join(' and ')}.`);
  }
  if (averageEnergy !== null && averageEnergy < 5) {
    actions.push('Treat low energy as a recovery signal: reduce optional intensity and verify that meals include enough carbohydrate and total food.');
  }
  if (week.strengthSessions < 2) {
    actions.push('Schedule the next progressive strength session while leaving one to three good repetitions in reserve.');
  }
  actions.push('Use one repeatable whole-food meal today rather than trying to perfect the entire week.');
  actions.push('Keep alcohol at zero and avoid adding several supplements at once.');

  return {
    category: 'priorities',
    title: averageSleep === null || averageSleep < target ? 'Start with sleep and recovery.' : 'Protect the foundations that are slipping.',
    summary: `Today is ${score}/5. This local review uses only the last seven days stored in this browser and prioritizes the clearest controllable bottleneck.`,
    actions: actions.slice(0, 5),
    menu: [],
  };
}

function nutritionAnswer(state) {
  return {
    category: 'nutrition',
    title: 'Build meals around recovery and consistency.',
    summary: proteinGuidance(state),
    actions: [
      'Choose minimally processed protein most meals: eggs, dairy, fish, poultry, lean meat, tofu, tempeh, beans, or lentils.',
      'Use oats, rice, potatoes, fruit, whole grains, and legumes to support training—especially before and after harder sessions.',
      'Include vegetables or fruit at most meals and use olive oil, nuts, seeds, avocado, eggs, and fatty fish for dietary fat.',
      'Hydrate across the day; add electrolytes when heat, sweat loss, or long endurance work makes plain water insufficient.',
      'Avoid aggressive calorie restriction while sleep, energy, recovery, or training quality are poor.',
    ],
    menu: [],
  };
}

function menuAnswer(state) {
  return {
    category: 'menu',
    title: 'A flexible seven-day whole-food menu.',
    summary: `${proteinGuidance(state)} Adjust portions to hunger, training load, body-composition goals, allergies, and clinician guidance. Swap animal and plant proteins freely.`,
    actions: [
      'Batch-cook two protein choices, one grain or potato, and two vegetables.',
      'Keep fruit, yogurt or soy yogurt, eggs, canned fish or beans, and frozen vegetables available for fast meals.',
      'Place the largest carbohydrate servings around demanding training rather than removing carbohydrates entirely.',
    ],
    menu: WEEKLY_MENU.map((entry) => ({ day: entry.day, meals: [...entry.meals] })),
  };
}

function avoidAnswer() {
  return {
    category: 'avoid',
    title: 'Avoid the habits that quietly erase recovery.',
    summary: 'The goal is not a perfect blacklist. Remove the highest-cost patterns first and keep the plan sustainable.',
    actions: [
      'Avoid alcohol while recovery, fertility, sleep, and body composition are priorities.',
      'Avoid aggressive calorie deficits or underfueling high-volume endurance and strength work.',
      'Avoid late caffeine, chronically short sleep, and stacking hard sessions when recovery markers are deteriorating.',
      'Avoid proprietary testosterone boosters, SARMs, prohormones, anabolic steroids, and unverified supplement blends.',
      'Avoid chronic megadoses of vitamin D, zinc, magnesium, or other nutrients without a demonstrated need and safety review.',
      'Limit ultra-processed foods that displace protein, produce, fiber, and adequate total nutrition; occasional use does not require guilt.',
    ],
    menu: [],
  };
}

function classifyQuestion(question) {
  const normalized = question.toLowerCase();
  if (/menu|meal plan|week.*eat|grocery/.test(normalized)) return 'menu';
  if (/avoid|limit|stop|cut out|shouldn.t/.test(normalized)) return 'avoid';
  if (/eat|food|nutrition|protein|carb|meal/.test(normalized)) return 'nutrition';
  return 'priorities';
}

export function answerHealthQuestion(state, date, question) {
  if (typeof question !== 'string' || !question.trim() || question.length > 500) {
    throw new Error('question must be between 1 and 500 characters');
  }
  const category = classifyQuestion(question);
  const base = category === 'menu'
    ? menuAnswer(state)
    : category === 'avoid'
      ? avoidAnswer()
      : category === 'nutrition'
        ? nutritionAnswer(state)
        : priorityAnswer(state, date);
  return { ...base, localOnly: true, disclaimer: DISCLAIMER };
}

export function getDailyHealthTip(state, date) {
  const answer = priorityAnswer(state, date);
  return { title: answer.title, body: answer.actions[0] };
}
