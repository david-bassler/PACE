import { insertQuickCaptureText } from './quick-capture-domain.js';

let textarea = null;
let toolbar = null;
let clockButton = null;
let semicolonButton = null;
let capturedCaret = null;

function formatCurrentTime(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} `;
}

function createClockIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '8');

  const hands = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hands.setAttribute('d', 'M12 7v5l3.5 2');

  svg.append(circle, hands);
  return svg;
}

function installStyles() {
  if (document.querySelector('style[data-pace-quick-capture-toolbar]')) return;

  const style = document.createElement('style');
  style.dataset.paceQuickCaptureToolbar = 'true';
  style.textContent = `
    .quick-capture-toolbar{
      min-height:46px;
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      gap:7px;
      margin:0 0 6px;
      padding:3px 5px;
      border:1px solid rgba(23,63,95,.13);
      border-radius:13px;
      background:rgba(255,255,255,.58);
    }
    .quick-capture-toolbar-button{
      width:40px;
      height:40px;
      flex:0 0 auto;
      display:grid;
      place-items:center;
      border:0;
      border-radius:10px;
      background:transparent;
      color:var(--ink);
      cursor:pointer;
    }
    .quick-capture-toolbar-button:hover,
    .quick-capture-toolbar-button:focus-visible{background:rgba(255,255,255,.9)}
    .quick-capture-toolbar-button svg{
      width:21px;
      height:21px;
      fill:none;
      stroke:currentColor;
      stroke-width:1.8;
      stroke-linecap:round;
      stroke-linejoin:round;
    }
    .quick-capture-toolbar-glyph{
      font-size:1.35rem;
      line-height:1;
      font-weight:650;
      transform:translateY(-1px);
    }
    .quick-capture-toolbar-digit{
      font-size:1rem;
      font-weight:720;
      line-height:1;
    }
  `;
  document.head.appendChild(style);
}

function captureCaret() {
  if (!textarea) return;
  capturedCaret = document.activeElement === textarea
    ? textarea.selectionStart
    : null;
}

function insertText(text) {
  if (!textarea) return;

  const result = insertQuickCaptureText(
    textarea.value,
    text,
    capturedCaret
  );

  textarea.value = result.text;
  textarea.focus();
  textarea.setSelectionRange(result.cursor, result.cursor);
  capturedCaret = result.cursor;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertTime() {
  insertText(formatCurrentTime());
}

function insertSemicolon() {
  insertText(';');
}

function createDigitButton(digit) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-capture-toolbar-button';
  button.title = `${digit} einfügen`;
  button.setAttribute('aria-label', `${digit} einfügen`);

  const label = document.createElement('span');
  label.className = 'quick-capture-toolbar-digit';
  label.setAttribute('aria-hidden', 'true');
  label.textContent = digit;
  button.appendChild(label);

  button.addEventListener('pointerdown', captureCaret);
  button.addEventListener('click', () => insertText(digit));
  return button;
}

function createToolbar() {
  textarea = document.querySelector('.quick-capture-textarea');
  const shell = document.querySelector('.quick-capture-shell');
  const editorWrap = document.querySelector('.quick-capture-editor-wrap');
  if (!textarea || !shell || !editorWrap || shell.querySelector('.quick-capture-toolbar')) return false;

  toolbar = document.createElement('div');
  toolbar.className = 'quick-capture-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Einfügehilfen für die Schnellerfassung');

  clockButton = document.createElement('button');
  clockButton.type = 'button';
  clockButton.className = 'quick-capture-toolbar-button';
  clockButton.title = 'Aktuelle Uhrzeit einfügen';
  clockButton.setAttribute('aria-label', 'Aktuelle Uhrzeit einfügen');
  clockButton.appendChild(createClockIcon());
  clockButton.addEventListener('pointerdown', captureCaret);
  clockButton.addEventListener('click', insertTime);

  semicolonButton = document.createElement('button');
  semicolonButton.type = 'button';
  semicolonButton.className = 'quick-capture-toolbar-button';
  semicolonButton.title = 'Semikolon einfügen';
  semicolonButton.setAttribute('aria-label', 'Semikolon einfügen');
  const semicolon = document.createElement('span');
  semicolon.className = 'quick-capture-toolbar-glyph';
  semicolon.setAttribute('aria-hidden', 'true');
  semicolon.textContent = ';';
  semicolonButton.appendChild(semicolon);
  semicolonButton.addEventListener('pointerdown', captureCaret);
  semicolonButton.addEventListener('click', insertSemicolon);

  const digitButtons = [...'0123456789'].map(createDigitButton);
  toolbar.append(clockButton, semicolonButton, ...digitButtons);
  shell.insertBefore(toolbar, editorWrap);
  return true;
}

export function initQuickCaptureToolbarFeature() {
  installStyles();
  createToolbar();
}
