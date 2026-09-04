export const $ = id => document.getElementById(id);
export const $$ = selector => [...document.querySelectorAll(selector)];

export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

export function openDialog(id) {
  const dialog = $(id);
  if (dialog && !dialog.open) dialog.showModal();
}

export function closeDialog(id) {
  const dialog = $(id);
  if (dialog?.open) dialog.close();
}

export function option(value, label = value) {
  const el = document.createElement('option');
  el.value = value;
  el.textContent = label;
  return el;
}

export function button(label, className = 'secondary-button') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  return el;
}

export function emptyMessage(text) {
  const p = document.createElement('p');
  p.className = 'summary-empty';
  p.textContent = text;
  return p;
}

export function announce(text, kind = '') {
  const el = $('appNotice');
  if (!el) return;
  el.textContent = text;
  el.className = `app-notice${kind ? ` ${kind}` : ''}`;
  el.hidden = false;
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => { el.hidden = true; }, 4500);
}
