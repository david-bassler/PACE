import { loadJSON, nowIso, saveJSON, uid } from '../core/storage.js';
import { $, announce, emptyMessage, openDialog } from '../core/ui.js';
import { loadTables, replaceTables } from '../core/google.js';
import { markDirty, registerSync } from '../core/sync.js';
import { mergeUpdatedById } from '../core/collections.js';
import {
  holdingSheetSpecs,
  holdingFromRow,
  situationFromRow,
  holdingTables
} from './holding-data.js';

export { holdingSheetSpecs };

const KEY = 'pace-holding-v1';

const EMPTY = { statements: [], points: [], links: [], situations: [] };
let data = { ...EMPTY, ...loadJSON(KEY, EMPTY) };
data.statements ||= [];
data.points ||= [];
data.links ||= [];
data.situations ||= [];

let currentStatementId = '';
let currentPointId = '';
let reviewSituationId = '';

function persist(sync = true) {
  saveJSON(KEY, data);
  if (sync) markDirty('holding');
  renderManager();
}

async function push() {
  await replaceTables(holdingTables(data));
}

export async function syncHolding() {
  const tables = await loadTables(holdingSheetSpecs);
  const records = (tables.Haltepunkte || []).map(holdingFromRow).filter(Boolean);

  // Aussagen, Haltepunkte und Zuordnungen werden im privaten Sheet gepflegt.
  // Bei einem vollständigen Sync ist das Sheet dafür die maßgebliche Quelle;
  // so bleiben manuelle Änderungen flexibel, ohne Aktualisiert-Zeitstempel
  // in Google Sheets nachpflegen zu müssen.
  data.statements = records.filter(item => item.type === 'statement');
  data.points = records.filter(item => item.type === 'point');
  data.links = records.filter(item => item.type === 'link');

  // Situationen können dagegen sowohl in der App als auch im Sheet verändert
  // werden und werden deshalb wie die übrigen PACE-Daten nach ID zusammengeführt.
  data.situations = mergeUpdatedById(data.situations, (tables.HaltepunktSituationen || []).map(situationFromRow));

  saveJSON(KEY, data);
  await push();
  renderManager();
}

function sortedStatements() {
  return data.statements
    .filter(item => item.active !== false && item.text)
    .sort((a,b) => Number(a.order || 0) - Number(b.order || 0) || a.text.localeCompare(b.text, 'de'));
}

function pointById(id) {
  return data.points.find(item => item.id === id && item.active !== false);
}

function statementById(id) {
  return data.statements.find(item => item.id === id);
}

function pointsForStatement(statementId) {
  const links = data.links
    .filter(item => item.active !== false && item.statementId === statementId)
    .sort((a,b) => Number(a.order || 0) - Number(b.order || 0));

  return links.map(link => pointById(link.pointId)).filter(Boolean);
}

function completedSituations(statementId) {
  return data.situations
    .filter(item => item.status === 'abgeschlossen' && item.statementId === statementId && item.text)
    .sort((a,b) => String(b.completedAt || b.updatedAt || '').localeCompare(String(a.completedAt || a.updatedAt || '')));
}

function chooseDifferent(items, currentId) {
  const options = items.filter(item => item.id !== currentId);
  const source = options.length ? options : items;
  return source.length ? source[Math.floor(Math.random() * source.length)] : null;
}

export function openHoldingChooser() {
  const box = $('holdingStatementList');
  box.innerHTML = '';
  const statements = sortedStatements();

  if (!statements.length) {
    box.appendChild(emptyMessage('Noch keine Haltepunkte geladen. Nach dem Import in das private Sheet erscheinen hier die Aussagen.'));
  }

  for (const statement of statements) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'holding-statement';
    button.textContent = statement.text;
    button.addEventListener('click', () => {
      $('holdingChooserDialog').close();
      openStatement(statement.id);
    });
    box.appendChild(button);
  }

  if (data.points.some(item => item.active !== false)) {
    const randomButton = document.createElement('button');
    randomButton.type = 'button';
    randomButton.className = 'quiet-button holding-random';
    randomButton.textContent = 'Nichts davon – irgendeinen Haltepunkt zeigen';
    randomButton.addEventListener('click', () => {
      $('holdingChooserDialog').close();
      const points = data.points.filter(item => item.active !== false);
      const point = points[Math.floor(Math.random() * points.length)];
      if (point) openPoint('', point.id);
    });
    box.appendChild(randomButton);
  }

  openDialog('holdingChooserDialog');
}

function openStatement(statementId) {
  const points = pointsForStatement(statementId);
  if (!points.length) {
    announce('Für diese Aussage ist noch kein Haltepunkt zugeordnet.', '');
    return;
  }
  const point = points[Math.floor(Math.random() * points.length)];
  openPoint(statementId, point.id);
}

function safeImageUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https:\/\//i.test(url) || /^data:image\//i.test(url) || /^blob:/i.test(url)) return url;
  return '';
}

function renderPoint() {
  const statement = statementById(currentStatementId);
  const point = pointById(currentPointId);
  if (!point) return;

  $('holdingSelectedStatement').textContent = statement?.text || 'Ein Haltepunkt';
  $('holdingPointTitle').textContent = point.title || 'Haltepunkt';
  $('holdingPointKind').textContent = point.kind || '';

  const content = $('holdingPointContent');
  content.textContent = point.content || '';
  content.hidden = !point.content;

  const image = $('holdingPointImage');
  const imageUrl = safeImageUrl(point.imageUrl);
  if (imageUrl) {
    image.src = imageUrl;
    image.alt = point.title || 'Bild-Haltepunkt';
    image.hidden = false;
  } else {
    image.removeAttribute('src');
    image.hidden = true;
  }

  const meaning = $('holdingPointMeaning');
  meaning.textContent = point.personalMeaning || '';
  $('holdingMeaningWrap').hidden = !point.personalMeaning;

  const keywords = $('holdingPointKeywords');
  keywords.textContent = (point.keywords || []).join(' · ');
  keywords.hidden = !(point.keywords || []).length;

  const options = currentStatementId ? pointsForStatement(currentStatementId) : [];
  $('holdingAnotherPoint').hidden = options.length < 2;

  const past = currentStatementId ? completedSituations(currentStatementId) : [];
  $('holdingPastSituation').hidden = !past.length;
  $('holdingPastCard').hidden = true;
  $('holdingSituationText').value = '';
  $('holdingSituationSaved').hidden = true;
}

function openPoint(statementId, pointId) {
  currentStatementId = statementId;
  currentPointId = pointId;
  renderPoint();
  openDialog('holdingPointDialog');
}

function showAnotherPoint() {
  if (!currentStatementId) return;
  const point = chooseDifferent(pointsForStatement(currentStatementId), currentPointId);
  if (!point) return;
  currentPointId = point.id;
  renderPoint();
}

function showPastSituation() {
  const situations = completedSituations(currentStatementId);
  const item = situations[Math.floor(Math.random() * situations.length)];
  if (!item) return;

  const card = $('holdingPastCard');
  card.innerHTML = '';

  const label = document.createElement('p');
  label.className = 'micro';
  label.textContent = 'DAS LIEGT HINTER DIR';

  const text = document.createElement('p');
  text.className = 'holding-past-text';
  text.textContent = item.text;

  card.append(label, text);

  if (item.review) {
    const review = document.createElement('p');
    review.className = 'holding-past-review';
    review.textContent = item.review;
    card.appendChild(review);
  }

  if (item.completedAt) {
    const date = document.createElement('small');
    date.textContent = new Date(item.completedAt).toLocaleDateString('de-DE');
    card.appendChild(date);
  }

  card.hidden = false;
}

function saveCurrentSituation(event) {
  event.preventDefault();
  const text = $('holdingSituationText').value.trim();
  if (!text) return;

  data.situations.push({
    id: uid('holding-situation'),
    createdAt: nowIso(),
    statementId: currentStatementId,
    pointId: currentPointId,
    text,
    status: 'offen',
    completedAt: '',
    review: '',
    updatedAt: nowIso()
  });

  $('holdingSituationText').value = '';
  $('holdingSituationSaved').hidden = false;
  persist();
  announce('Situation privat festgehalten.', 'good');
}

function renderSituationCard(item, completed) {
  const card = document.createElement('article');
  card.className = 'holding-situation-card';

  const copy = document.createElement('div');
  const statement = document.createElement('small');
  statement.textContent = statementById(item.statementId)?.text || 'Ohne zugeordnete Aussage';

  const text = document.createElement('p');
  text.textContent = item.text;

  copy.append(statement, text);

  if (item.review) {
    const review = document.createElement('p');
    review.className = 'holding-situation-review';
    review.textContent = item.review;
    copy.appendChild(review);
  }

  const meta = document.createElement('small');
  const date = new Date(item.createdAt);
  meta.textContent = Number.isNaN(date.getTime()) ? item.createdAt : date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  copy.appendChild(meta);

  card.appendChild(copy);

  if (!completed) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tiny-button';
    button.textContent = 'Liegt hinter mir';
    button.addEventListener('click', () => startReview(item.id));
    card.appendChild(button);
  }

  return card;
}

function renderManager() {
  if (!$('holdingManagerSummary')) return;

  const statements = sortedStatements();
  const points = data.points.filter(item => item.active !== false);
  const open = data.situations
    .filter(item => item.status !== 'abgeschlossen')
    .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const completed = data.situations
    .filter(item => item.status === 'abgeschlossen')
    .sort((a,b) => String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt)));

  $('holdingManagerSummary').textContent = `${statements.length} Aussagen · ${points.length} Haltepunkte · ${completed.length} Situationen liegen hinter dir`;

  const openBox = $('holdingOpenSituations');
  openBox.innerHTML = '';
  if (!open.length) openBox.appendChild(emptyMessage('Keine offenen Situationen festgehalten.'));
  for (const item of open) openBox.appendChild(renderSituationCard(item, false));

  const completedBox = $('holdingCompletedSituations');
  completedBox.innerHTML = '';
  if (!completed.length) completedBox.appendChild(emptyMessage('Noch keine frühere Situation als „liegt hinter mir“ markiert.'));
  for (const item of completed) completedBox.appendChild(renderSituationCard(item, true));
}

function openManager() {
  renderManager();
  openDialog('holdingManagerDialog');
}

function startReview(id) {
  const item = data.situations.find(entry => entry.id === id);
  if (!item) return;
  reviewSituationId = id;
  $('holdingReviewSituation').textContent = item.text;
  $('holdingReviewText').value = item.review || '';
  openDialog('holdingReviewDialog');
}

function completeSituation(event) {
  event.preventDefault();
  const item = data.situations.find(entry => entry.id === reviewSituationId);
  if (!item) return;

  item.status = 'abgeschlossen';
  item.completedAt = nowIso();
  item.review = $('holdingReviewText').value.trim();
  item.updatedAt = nowIso();

  reviewSituationId = '';
  $('holdingReviewDialog').close();
  persist();
  announce('Diese Situation ist jetzt als vergangen markiert.', 'good');
}

export function initHoldingFeature() {
  registerSync('holding', { push, full: syncHolding });
  renderManager();

  $('openHoldingChooser').addEventListener('click', openHoldingChooser);
  $('openHoldingManager').addEventListener('click', openManager);
  $('openPerspectiveHolding').addEventListener('click', () => {
    $('perspectiveDialog').close();
    openHoldingChooser();
  });

  $('holdingAnotherPoint').addEventListener('click', showAnotherPoint);
  $('holdingPastSituation').addEventListener('click', showPastSituation);
  $('holdingSituationForm').addEventListener('submit', saveCurrentSituation);
  $('holdingReviewForm').addEventListener('submit', completeSituation);
}

export function getHoldingData() {
  return structuredClone(data);
}
