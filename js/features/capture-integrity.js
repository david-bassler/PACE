import { loadJSON } from '../core/storage.js';
import { markDirty } from '../core/sync.js';

const QUICK_CAPTURE_QUEUE_KEY = 'pace-quick-capture-queue-v1';

function pendingEntries() {
  const parsed = loadJSON(QUICK_CAPTURE_QUEUE_KEY, []);
  return Array.isArray(parsed)
    ? parsed.filter(entry => entry?.id && entry?.plan && entry?.createdAt)
    : [];
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function installStyles() {
  if (document.querySelector('style[data-pace-capture-integrity]')) return;

  const style = document.createElement('style');
  style.dataset.paceCaptureIntegrity = 'true';
  style.textContent = `
    .capture-pending{margin:7px 3px 0;border:1px solid rgba(181,127,38,.24);border-radius:12px;background:rgba(255,248,229,.72);overflow:hidden}
    .capture-pending[hidden]{display:none!important}
    .capture-pending summary{cursor:pointer;padding:8px 10px;color:#6b5a35;font-size:.8rem;font-weight:750}
    .capture-pending-list{display:grid;gap:1px;border-top:1px solid rgba(181,127,38,.16)}
    .capture-pending-item{display:grid;grid-template-columns:auto 1fr;gap:3px 9px;padding:8px 10px;background:rgba(255,255,255,.62)}
    .capture-pending-time{grid-row:1/3;color:#8a7650;font-size:.75rem;font-variant-numeric:tabular-nums}
    .capture-pending-title{min-width:0;color:var(--ink);font-size:.8rem;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .capture-pending-value{min-width:0;color:#5e6f75;font-size:.78rem;overflow-wrap:anywhere;white-space:pre-wrap}
  `;
  document.head.appendChild(style);
}

function createPanel() {
  const shell = document.querySelector('.quick-capture-shell');
  if (!shell) return null;
  const existing = shell.querySelector('.capture-pending');
  if (existing) return existing;

  const details = document.createElement('details');
  details.className = 'capture-pending';
  details.hidden = true;

  const summary = document.createElement('summary');
  const list = document.createElement('div');
  list.className = 'capture-pending-list';
  details.append(summary, list);
  shell.appendChild(details);
  return details;
}

function renderPanel(panel) {
  const entries = pendingEntries();
  panel.hidden = entries.length === 0;
  if (!entries.length) return;

  const summary = panel.querySelector('summary');
  const list = panel.querySelector('.capture-pending-list');
  summary.textContent = `${entries.length} ${entries.length === 1 ? 'Eintrag lokal gesichert' : 'Einträge lokal gesichert'} · noch nicht bestätigt`;
  list.innerHTML = '';

  for (const entry of entries.slice().reverse()) {
    const item = document.createElement('div');
    item.className = 'capture-pending-item';

    const time = document.createElement('span');
    time.className = 'capture-pending-time';
    time.textContent = formatTime(entry.createdAt);

    const title = document.createElement('span');
    title.className = 'capture-pending-title';
    title.textContent = `${entry.icon ? `${entry.icon} ` : ''}${entry.fieldTitle || entry.plan?.title || 'Eintrag'}`;

    const value = document.createElement('span');
    value.className = 'capture-pending-value';
    value.textContent = String(entry.plan?.value ?? '');

    item.append(time, title, value);
    list.appendChild(item);
  }
}

export function initCaptureIntegrityFeature() {
  installStyles();
  const panel = createPanel();
  if (!panel) return;

  const initial = pendingEntries();
  renderPanel(panel);

  // Nach einem Reload kennt der Sync-Core die persistierte Queue noch nicht als
  // "dirty". Sie wird deshalb bewusst erneut vorgemerkt. Dadurch bleibt ein
  // lokal gesicherter Eintrag nicht unbemerkt liegen.
  if (initial.length) markDirty('quick-capture');

  // Die Queue wird von quick-capture.js verwaltet. Ein kleines lokales Polling
  // hält die Wiederherstellungsanzeige ohne zusätzliche Kopplung aktuell.
  setInterval(() => renderPanel(panel), 1000);
}
