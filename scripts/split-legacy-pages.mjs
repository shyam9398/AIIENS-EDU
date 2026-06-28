import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve('src/legacy/markup.html');
const html = readFileSync(sourcePath, 'utf8');

const targets = [
  ['src/components/legacy-shell/loading-overlay.html', 'div', 'loading-overlay'],
  ['src/components/legacy-shell/toast.html', 'div', 'toast'],
  ['src/components/legacy-shell/logout-modal.html', 'div', 'logout-modal'],
  ['src/components/legacy-shell/admin-login-modal.html', 'div', 'admin-login-modal'],
  ['src/pages/google-auth/google-auth.html', 'div', 'screen-google-auth'],
  ['src/pages/admin/admin.html', 'div', 'screen-admin'],
  ['src/pages/subadmin/subadmin.html', 'div', 'screen-subadmin'],
  ['src/pages/landing/landing.html', 'div', 'screen-landing'],
  ['src/pages/teacher/teacher.html', 'div', 'screen-teacher'],
  ['src/pages/creator/creator.html', 'div', 'screen-creator'],
  ['src/pages/profile/profile.html', 'div', 'screen-profile'],
  ['src/pages/student-app/student-app.html', 'div', 'screen-app'],
  ['src/components/chat/chat-fab.html', 'button', 'chat-fab'],
  ['src/components/chat/chat-window.html', 'div', 'chat-window'],
  ['src/components/notes/note-preview-modal.html', 'div', 'note-preview-modal'],
  ['src/components/admin/create-subadmin-modal.html', 'div', 'create-subadmin-modal'],
];

function findElementStart(tagName, id) {
  const idPattern = new RegExp(`<${tagName}\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, 'i');
  const match = idPattern.exec(html);

  if (!match) {
    throw new Error(`Could not find <${tagName}> with id="${id}"`);
  }

  return { index: match.index, openTag: match[0] };
}

function extractElement(tagName, id) {
  const { index, openTag } = findElementStart(tagName, id);

  if (tagName === 'button') {
    const closeIndex = html.indexOf(`</${tagName}>`, index);
    if (closeIndex === -1) throw new Error(`Could not close <${tagName}> ${id}`);
    return html.slice(index, closeIndex + tagName.length + 3).trim();
  }

  let depth = 0;
  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = index;

  for (const token of html.matchAll(tokenPattern)) {
    const tokenText = token[0];
    if (token.index < index) continue;

    if (tokenText.startsWith(`</${tagName}`)) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(index, token.index + tokenText.length).trim();
      }
    } else if (!tokenText.endsWith('/>')) {
      depth += 1;
    }
  }

  throw new Error(`Could not close <${tagName}> ${id}: ${openTag}`);
}

for (const [filePath, tagName, id] of targets) {
  const content = extractElement(tagName, id);
  const absolutePath = resolve(filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${content}\n`, 'utf8');
}

console.log(`Split ${targets.length} legacy UI blocks into page/component files.`);
