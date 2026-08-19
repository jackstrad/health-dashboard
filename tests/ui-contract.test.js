import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('homepage exposes a daily submit receipt and local coach question flow', async () => {
  const [html, app, worker] = await Promise.all([
    read('index.html'), read('src/app.js'), read('service-worker.js'),
  ]);

  for (const id of ['submit-day', 'daily-submission', 'coach-form', 'coach-question', 'coach-answer', 'daily-health-tip']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /Submit today/i);
  assert.match(html, /Private Health Coach/i);
  assert.match(html, /No question or health context leaves this browser/i);
  assert.match(html, /weekly (nutrition )?menu/i);
  assert.match(html, /what.*avoid/i);

  assert.match(app, /submitDay/);
  assert.match(app, /getDailySubmission/);
  assert.match(app, /answerHealthQuestion/);
  assert.match(app, /getDailyHealthTip/);
  assert.match(app, /#submit-day/);
  assert.match(app, /#coach-form/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/, 'coach output must not use innerHTML');
  assert.match(worker, /src\/health-coach\.js/);
});

test('public source does not contain an AI credential, remote model endpoint, or misleading model claim', async () => {
  const [html, app, coach] = await Promise.all([read('index.html'), read('src/app.js'), read('src/health-coach.js')]);
  const source = `${html}\n${app}\n${coach}`;
  assert.doesNotMatch(source, /openai|anthropic|gemini|api[_-]?key|authorization|bearer|chat\/completions/i);
  assert.doesNotMatch(source, /can diagnose|provides a medical diagnosis|acts as your doctor/i);
  assert.match(source, /General health education only/i);
});

test('health-public-v4 release identity is coherent across the PWA shell', async () => {
  const [html, app, worker, manifestText, readme] = await Promise.all([
    read('index.html'), read('src/app.js'), read('service-worker.js'), read('manifest.webmanifest'), read('README.md'),
  ]);
  const manifest = JSON.parse(manifestText);
  for (const source of [html, app, worker, manifestText, readme]) {
    assert.match(source, /health-public-v4/);
    assert.doesNotMatch(source, /health-public-v3/);
  }
  assert.equal(manifest.start_url, './?v=health-public-v4');
  assert.equal(manifest.scope, './');
  assert.match(app, /health-coach\.js\?v=health-public-v4/);
  assert.match(worker, /src\/health-coach\.js\?v=health-public-v4/);
});
