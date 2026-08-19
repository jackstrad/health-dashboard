import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function runtimeSource() {
  const paths = ['index.html', 'README.md', 'src/app.js', 'src/health-model.js', 'src/health-coach.js', 'service-worker.js', 'manifest.webmanifest'];
  return (await Promise.all(paths.map((path) => readFile(new URL(path, root), 'utf8')))).join('\n');
}

test('public runtime contains no personal baseline, private path, credential, or remote model endpoint', async () => {
  const source = await runtimeSource();
  const prohibited = [
    /\/Users\/Steve/i,
    /Private Health Setup/i,
    /\b621\s*ng\/dL/i,
    /SHBG\s*37/i,
    /Vitamin D\s*53/i,
    /Zinc\s*82/i,
    /Magnesium\s*4\.9/i,
    /placeholder=["']175(?:\.0)?["']/i,
    /\b150\s*g protein/i,
    /openai|anthropic|gemini|chat\/completions|api[_-]?key|bearer\s+[A-Za-z0-9]/i,
  ];
  for (const marker of prohibited) assert.doesNotMatch(source, marker);
});

test('public first-run baseline remains empty', async () => {
  const app = await readFile(new URL('src/app.js', root), 'utf8');
  assert.match(app, /emptyBaseline = \{ profile: \{\}, labs: \{\} \}/);
});
