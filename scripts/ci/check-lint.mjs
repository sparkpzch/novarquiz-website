import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = JSON.parse(
  await readFile(new URL('./lint-baseline.json', import.meta.url), 'utf8'),
);
const eslint = new ESLint({ cwd: root });
const results = await eslint.lintFiles('.');
const errors = [];
const counts = new Map();

for (const result of results) {
  const file = path.relative(root, result.filePath).replaceAll(path.sep, '/');
  for (const message of result.messages) {
    if (message.severity !== 2) continue;
    const rule = message.ruleId ?? 'unknown';
    const key = `${file}\0${rule}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > (baseline[file]?.[rule] ?? 0)) {
      errors.push(`${file}:${message.line}:${message.column} ${rule}: ${message.message}`);
    }
  }
}

if (errors.length) {
  console.error(`New ESLint errors (${errors.length}):\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  const existing = [...counts.values()].reduce((sum, count) => sum + count, 0);
  console.log(`No new ESLint errors (${existing} existing errors in the baseline).`);
}
