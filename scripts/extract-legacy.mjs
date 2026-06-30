import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = process.argv[2];

if (!sourcePath) {
  throw new Error('Usage: node scripts/extract-legacy.mjs <source-html-path>');
}

const html = readFileSync(sourcePath, 'utf8');

const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
const bodyMatch = html.match(/<body>([\s\S]*?)<script>/i);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1].trim());

if (!styleMatch || !bodyMatch || scripts.length < 2) {
  throw new Error(`Could not extract expected style/body/scripts from ${sourcePath}`);
}

const files = new Map([
  ['src/styles/global.css', styleMatch[1].trimStart()],
  ['src/legacy/markup.html', bodyMatch[1].trim()],
  ['src/legacy/legacy-app.js', scripts[0]],
  ['src/legacy/legacy-patches.js', scripts.slice(1).join('\n\n')],
]);

for (const [file, content] of files) {
  const fullPath = resolve(file);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

console.log(`Extracted ${files.size} files from ${sourcePath}`);
